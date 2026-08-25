#!/usr/bin/env python3
"""Cross-platform one-shot See-through layer generation entry point."""

from __future__ import annotations

import argparse
import json
import os
import platform
import socket
import subprocess
import sys
import time
import urllib.request
import zipfile
from pathlib import Path


SCRIPT_ROOT = Path(__file__).resolve().parent
CONFIG_PATH = SCRIPT_ROOT / "config.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Start the isolated ComfyUI runtime, generate See-through parts, and export them to a directory."
    )
    parser.add_argument("--comfy-root", type=Path)
    parser.add_argument("--venv-root", type=Path)
    parser.add_argument("--input", type=Path, required=True, help="Source artwork PNG/JPEG/WebP")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--output-prefix", default="seethrough")
    parser.add_argument("--archive", type=Path, help="Optional exact .zip output path")
    parser.add_argument("--resolution", type=int, default=1024)
    parser.add_argument("--depth-resolution", type=int, default=720)
    parser.add_argument("--steps", type=int, default=30)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--alpha-mode", choices=["preserve", "opaque"], default="preserve")
    parser.add_argument("--quant-mode", choices=["none", "nf4"], default="none")
    parser.add_argument("--group-offload", choices=["auto", "on", "off"], default="auto")
    parser.add_argument("--tblr-split", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--use-lama", action=argparse.BooleanOptionalAction, default=False)
    parser.add_argument("--port", type=int, default=8188)
    parser.add_argument("--inference-timeout", type=int, default=3600)
    parser.add_argument("--server-timeout", type=int, default=240)
    parser.add_argument("--offline", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--keep-server", action="store_true")
    parser.add_argument("--ignore-vram-guard", action="store_true")
    parser.add_argument("--skip-diagnose", action="store_true")
    return parser.parse_args()


def runtime_python(venv_root: Path) -> Path:
    relative = Path("Scripts/python.exe") if platform.system() == "Windows" else Path("bin/python")
    return venv_root / relative


def validate_args(args: argparse.Namespace) -> None:
    if not 512 <= args.resolution <= 2048:
        raise ValueError("--resolution must be between 512 and 2048")
    if args.depth_resolution != -1 and not 64 <= args.depth_resolution <= 2048:
        raise ValueError("--depth-resolution must be -1 or between 64 and 2048")
    if not 1 <= args.steps <= 100:
        raise ValueError("--steps must be between 1 and 100")
    if not 0 <= args.seed <= 2**32 - 1:
        raise ValueError("--seed must be between 0 and 4294967295")
    if not 1 <= args.port <= 65535:
        raise ValueError("--port must be between 1 and 65535")
    if args.inference_timeout < 60:
        raise ValueError("--inference-timeout must be at least 60 seconds")


def detect_accelerator(python: Path) -> str:
    code = (
        "import torch; "
        "print('cuda' if torch.cuda.is_available() else "
        "'mps' if bool(getattr(torch.backends, 'mps', None) and torch.backends.mps.is_available()) else 'cpu')"
    )
    return subprocess.check_output([str(python), "-c", code], text=True).strip()


def free_vram_mib() -> int | None:
    try:
        output = subprocess.check_output(
            [
                "nvidia-smi",
                "--query-gpu=memory.free",
                "--format=csv,noheader,nounits",
            ],
            text=True,
            stderr=subprocess.DEVNULL,
        )
        return int(output.splitlines()[0].strip())
    except (OSError, subprocess.CalledProcessError, ValueError, IndexError):
        return None


def server_ready(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/system_stats", timeout=2) as response:
            return response.status == 200
    except Exception:
        return False


def port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as client:
        client.settimeout(0.5)
        return client.connect_ex(("127.0.0.1", port)) == 0


def wait_for_server(port: int, timeout: int, process: subprocess.Popen[str] | None) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if server_ready(port):
            return
        if process is not None and process.poll() is not None:
            raise RuntimeError(f"ComfyUI exited before becoming ready (exit {process.returncode})")
        time.sleep(2)
    raise TimeoutError(f"ComfyUI did not become ready within {timeout} seconds")


def main() -> int:
    args = parse_args()
    validate_args(args)
    config = json.loads(CONFIG_PATH.read_text("utf-8"))
    comfy_root = (args.comfy_root or Path(os.environ.get("COMFYUI_ROOT", Path.home() / "ComfyUI"))).expanduser().resolve()
    venv_root = (args.venv_root or (comfy_root / ".venv-seethrough")).expanduser().resolve()
    input_path = args.input.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    python = runtime_python(venv_root)
    plugin_root = comfy_root / "custom_nodes" / config["plugin"]["directoryName"]

    if not (comfy_root / "main.py").is_file():
        raise FileNotFoundError(f"ComfyUI is missing: {comfy_root}. Run the installer first.")
    if not (plugin_root / "nodes.py").is_file():
        raise FileNotFoundError(f"ComfyUI-See-through is missing: {plugin_root}. Run the installer first.")
    if not python.is_file():
        raise FileNotFoundError(f"See-through runtime is missing: {python}. Run the installer first.")
    if not input_path.is_file():
        raise FileNotFoundError(input_path)
    output_dir.mkdir(parents=True, exist_ok=True)

    accelerator = detect_accelerator(python)
    if accelerator == "cpu":
        raise RuntimeError("No CUDA or Apple MPS accelerator is available; CPU inference is not supported by this launcher")
    if args.quant_mode == "nf4" and accelerator != "cuda":
        raise RuntimeError("NF4 requires CUDA/bitsandbytes and is not available on Apple MPS")
    group_offload = accelerator == "cuda" if args.group_offload == "auto" else args.group_offload == "on"
    if group_offload and accelerator != "cuda":
        raise RuntimeError("group-offload currently targets CUDA and must be off on Apple MPS")

    if accelerator == "cuda" and not args.ignore_vram_guard:
        free_vram = free_vram_mib()
        pilot = args.resolution <= 512 and args.depth_resolution <= 384
        required = int(
            config["minimumFreeVramMiBForPilotInference"]
            if pilot
            else config["minimumFreeVramMiBForInference"]
        )
        if free_vram is not None and free_vram < required:
            raise RuntimeError(
                f"Only {free_vram} MiB VRAM is free; this run requires {required} MiB. "
                "Close GPU-heavy apps or pass --ignore-vram-guard."
            )

    if not args.skip_diagnose:
        subprocess.run(
            [
                str(python),
                str(SCRIPT_ROOT / "verify_environment.py"),
                "--config",
                str(CONFIG_PATH),
                "--comfy-root",
                str(comfy_root),
                "--plugin-root",
                str(plugin_root),
                "--hub-cache",
                str(venv_root / "hf-hub-cache"),
                "--json-out",
                str(output_dir / "environment.json"),
                "--require-models",
            ],
            check=True,
        )

    process: subprocess.Popen[str] | None = None
    stdout_handle = None
    stderr_handle = None
    if not server_ready(args.port):
        if port_in_use(args.port):
            raise RuntimeError(f"Port {args.port} is occupied by a non-ComfyUI process")
        log_dir = output_dir / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        stdout_handle = (log_dir / "comfyui.out.log").open("w", encoding="utf-8")
        stderr_handle = (log_dir / "comfyui.err.log").open("w", encoding="utf-8")
        environment = os.environ.copy()
        environment["HF_HUB_CACHE"] = str(venv_root / "hf-hub-cache")
        if args.offline:
            environment["HF_HUB_OFFLINE"] = "1"
            environment["TRANSFORMERS_OFFLINE"] = "1"
        if accelerator == "cuda":
            environment["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
        if accelerator == "mps":
            environment["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"
        creation_flags = subprocess.CREATE_NO_WINDOW if platform.system() == "Windows" else 0
        process = subprocess.Popen(
            [
                str(python),
                str(comfy_root / "main.py"),
                "--listen",
                "127.0.0.1",
                "--port",
                str(args.port),
                "--user-directory",
                str(venv_root / "user"),
                "--disable-auto-launch",
            ],
            cwd=str(comfy_root),
            env=environment,
            stdout=stdout_handle,
            stderr=stderr_handle,
            text=True,
            creationflags=creation_flags,
        )
        print(f"Started temporary ComfyUI PID {process.pid}")
        wait_for_server(args.port, args.server_timeout, process)
    else:
        print(f"Reusing ComfyUI at http://127.0.0.1:{args.port}")

    try:
        command = [
            str(python),
            str(SCRIPT_ROOT / "smoke_test.py"),
            "--server",
            f"http://127.0.0.1:{args.port}",
            "--comfy-root",
            str(comfy_root),
            "--input",
            str(input_path),
            "--output-dir",
            str(output_dir),
            "--output-prefix",
            args.output_prefix,
            "--resolution",
            str(args.resolution),
            "--depth-resolution",
            str(args.depth_resolution),
            "--steps",
            str(args.steps),
            "--seed",
            str(args.seed),
            "--alpha-mode",
            args.alpha_mode,
            "--quant-mode",
            args.quant_mode,
            "--group-offload",
            "on" if group_offload else "off",
            "--tblr-split" if args.tblr_split else "--no-tblr-split",
            "--use-lama" if args.use_lama else "--no-use-lama",
            "--timeout",
            str(args.inference_timeout),
            "--report",
            str(output_dir / "run_report.json"),
        ]
        subprocess.run(command, check=True)
    finally:
        if process is not None and not args.keep_server:
            process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)
            print(f"Stopped temporary ComfyUI PID {process.pid}")
        if stdout_handle:
            stdout_handle.close()
        if stderr_handle:
            stderr_handle.close()

    if args.archive:
        archive_path = args.archive.expanduser().resolve()
        if archive_path.suffix.lower() != ".zip":
            raise ValueError("--archive must end with .zip")
        archive_path.parent.mkdir(parents=True, exist_ok=True)
        report_path = output_dir / "run_report.json"
        report = json.loads(report_path.read_text("utf-8"))
        archive_files = {Path(path).resolve() for path in report.get("files", [])}
        archive_files.update({report_path.resolve(), (output_dir / "environment.json").resolve()})
        log_root = output_dir / "logs"
        if log_root.is_dir():
            archive_files.update(path.resolve() for path in log_root.rglob("*") if path.is_file())
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for file_path in sorted(archive_files):
                if file_path.is_file() and file_path != archive_path:
                    archive.write(file_path, file_path.relative_to(output_dir))
        print(f"Archive: {archive_path}")
    print(f"See-through export completed: {output_dir}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (FileNotFoundError, RuntimeError, ValueError, TimeoutError, subprocess.CalledProcessError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)

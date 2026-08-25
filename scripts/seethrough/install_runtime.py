#!/usr/bin/env python3
"""Install or repair the pinned local ComfyUI + See-through runtime."""

from __future__ import annotations

import argparse
import json
import os
import platform
import shlex
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


SCRIPT_ROOT = Path(__file__).resolve().parent
CONFIG_PATH = SCRIPT_ROOT / "config.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check and install pinned ComfyUI, See-through, Python dependencies, and optional models."
    )
    parser.add_argument("--comfy-root", type=Path)
    parser.add_argument("--venv-root", type=Path)
    parser.add_argument("--platform", choices=["auto", "windows", "macos"], default="auto")
    parser.add_argument("--uv-bin", default="uv")
    parser.add_argument("--download-models", action="store_true")
    parser.add_argument("--hf-endpoint", default="")
    parser.add_argument("--force-models", action="store_true")
    parser.add_argument("--skip-plugin-checkout", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text("utf-8"))


def platform_key(requested: str) -> str:
    if requested != "auto":
        return requested
    system = platform.system()
    if system == "Windows":
        return "windows"
    if system == "Darwin":
        return "macos"
    raise RuntimeError(f"Unsupported operating system: {system}. Use Windows or macOS.")


def quote_command(command: list[str]) -> str:
    return " ".join(shlex.quote(str(part)) for part in command)


def run(
    command: list[str | Path],
    *,
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
    dry_run: bool = False,
    capture: bool = False,
) -> str:
    normalized = [str(part) for part in command]
    print(f"[run] {quote_command(normalized)}", flush=True)
    if dry_run:
        return ""
    completed = subprocess.run(
        normalized,
        cwd=str(cwd) if cwd else None,
        env=env,
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture else None,
    )
    return completed.stdout.strip() if capture and completed.stdout else ""


def git_head(root: Path) -> str | None:
    if not (root / ".git").exists():
        return None
    try:
        return subprocess.check_output(
            ["git", "-C", str(root), "rev-parse", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def ensure_comfyui(target: Path, config: dict, *, dry_run: bool) -> None:
    main_py = target / "main.py"
    if main_py.is_file():
        print(f"[found] ComfyUI: {target} ({git_head(target) or 'non-git install'})", flush=True)
        return
    if target.exists() and any(target.iterdir()):
        raise RuntimeError(f"ComfyUI target exists but is not a valid installation: {target}")
    print(f"[install] ComfyUI -> {target}", flush=True)
    if not dry_run:
        target.parent.mkdir(parents=True, exist_ok=True)
    run(["git", "clone", config["comfyUi"]["repository"], target], dry_run=dry_run)
    run(
        ["git", "-C", target, "checkout", "--detach", config["comfyUi"]["testedCommit"]],
        dry_run=dry_run,
    )


def ensure_plugin(
    target: Path,
    config: dict,
    *,
    skip_checkout: bool,
    dry_run: bool,
) -> None:
    plugin = config["plugin"]
    nodes_py = target / "nodes.py"
    if not nodes_py.is_file():
        if target.exists() and any(target.iterdir()):
            raise RuntimeError(f"See-through target exists but is not a valid plugin: {target}")
        print(f"[install] ComfyUI-See-through -> {target}", flush=True)
        if not dry_run:
            target.parent.mkdir(parents=True, exist_ok=True)
        run(["git", "clone", plugin["repository"], target], dry_run=dry_run)
    else:
        print(f"[found] ComfyUI-See-through: {target}", flush=True)

    if skip_checkout:
        print("[skip] Plugin revision checkout was disabled", flush=True)
        return
    current = git_head(target)
    if current == plugin["commit"]:
        print(f"[ready] Plugin revision: {current}", flush=True)
        return
    if not dry_run:
        dirty = run(["git", "-C", target, "status", "--porcelain"], capture=True)
        if dirty:
            raise RuntimeError(f"Plugin repository has local changes: {target}")
    run(["git", "-C", target, "fetch", "origin", plugin["commit"]], dry_run=dry_run)
    run(["git", "-C", target, "checkout", "--detach", plugin["commit"]], dry_run=dry_run)


def venv_python(venv_root: Path, target_platform: str) -> Path:
    return venv_root / ("Scripts/python.exe" if target_platform == "windows" else "bin/python")


def uv_pip_install(
    uv_bin: str,
    python: Path,
    arguments: list[str | Path],
    *,
    constraints: Path | None,
    dry_run: bool,
) -> None:
    command: list[str | Path] = [uv_bin, "pip", "install", "--python", python, *arguments]
    if constraints:
        command.extend(["-c", constraints])
    run(command, dry_run=dry_run)


def write_manager_config(venv_root: Path, *, dry_run: bool) -> tuple[Path, Path]:
    runtime_user_root = venv_root / "user"
    manager_config = runtime_user_root / "__manager" / "config.ini"
    if not dry_run:
        manager_config.parent.mkdir(parents=True, exist_ok=True)
        if not manager_config.exists():
            manager_config.write_text(
                "[default]\nnetwork_mode = offline\nuse_uv = true\nfile_logging = true\n",
                encoding="utf-8",
            )
    return runtime_user_root, manager_config


def main() -> int:
    args = parse_args()
    config = load_config()
    target_platform = platform_key(args.platform)
    actual_platform = platform_key("auto")
    if target_platform != actual_platform and not args.dry_run:
        raise RuntimeError(
            f"Requested platform {target_platform}, but this host is {actual_platform}. "
            "Cross-platform selection is only allowed with --dry-run."
        )
    if shutil.which("git") is None and not args.dry_run:
        raise RuntimeError("git is required but was not found in PATH")
    if shutil.which(args.uv_bin) is None and not args.dry_run:
        raise RuntimeError("uv is required but was not found in PATH")
    if target_platform == "windows":
        os.environ.setdefault("UV_LINK_MODE", "copy")

    comfy_root = (args.comfy_root or Path(os.environ.get("COMFYUI_ROOT", Path.home() / "ComfyUI"))).expanduser().resolve()
    venv_root = (args.venv_root or (comfy_root / ".venv-seethrough")).expanduser().resolve()
    plugin_root = comfy_root / "custom_nodes" / config["plugin"]["directoryName"]
    platform_config = config["platforms"][target_platform]
    constraints_name = platform_config.get("constraints")
    constraints = SCRIPT_ROOT / constraints_name if constraints_name else None
    plugin_requirements_name = platform_config.get("pluginRequirements")

    print(f"Platform      : {target_platform}")
    print(f"ComfyUI root  : {comfy_root}")
    print(f"Runtime venv  : {venv_root}")
    print(f"Plugin root   : {plugin_root}")
    print(f"Models        : {'download' if args.download_models else 'check only'}")

    ensure_comfyui(comfy_root, config, dry_run=args.dry_run)
    run([args.uv_bin, "python", "install", config["pythonVersion"]], dry_run=args.dry_run)
    python = venv_python(venv_root, target_platform)
    if not python.is_file():
        run(
            [args.uv_bin, "venv", "--python", config["pythonVersion"], venv_root],
            dry_run=args.dry_run,
        )
    runtime_user_root, manager_config = write_manager_config(venv_root, dry_run=args.dry_run)

    torch_arguments: list[str | Path] = [*platform_config["torchPackages"]]
    torch_index = platform_config.get("torchIndexUrl")
    if torch_index:
        torch_arguments.extend(["--index-url", torch_index])
    uv_pip_install(
        args.uv_bin,
        python,
        torch_arguments,
        constraints=None,
        dry_run=args.dry_run,
    )
    uv_pip_install(
        args.uv_bin,
        python,
        ["-r", comfy_root / "requirements.txt"],
        constraints=constraints,
        dry_run=args.dry_run,
    )

    ensure_plugin(
        plugin_root,
        config,
        skip_checkout=args.skip_plugin_checkout,
        dry_run=args.dry_run,
    )
    plugin_requirements = (
        SCRIPT_ROOT / plugin_requirements_name
        if plugin_requirements_name
        else plugin_root / "requirements.txt"
    )
    uv_pip_install(
        args.uv_bin,
        python,
        ["-r", plugin_requirements],
        constraints=constraints,
        dry_run=args.dry_run,
    )
    uv_pip_install(
        args.uv_bin,
        python,
        ["huggingface-hub>=0.34,<2", "psd-tools>=1.10,<2", "requests>=2.32,<3"],
        constraints=constraints,
        dry_run=args.dry_run,
    )

    if args.dry_run:
        print("[dry-run] Installation plan completed without filesystem or package changes.")
        return 0

    accelerator = subprocess.check_output(
        [
            str(python),
            "-c",
            (
                "import json, torch; "
                "print(json.dumps({'cuda': torch.cuda.is_available(), "
                "'mps': bool(getattr(torch.backends, 'mps', None) and torch.backends.mps.is_available()), "
                "'torch': torch.__version__, 'cudaVersion': torch.version.cuda}))"
            ),
        ],
        text=True,
    ).strip()
    accelerator_info = json.loads(accelerator)
    manifest = {
        "schemaVersion": 2,
        "installedAt": datetime.now(timezone.utc).isoformat(),
        "platform": target_platform,
        "comfyRoot": str(comfy_root),
        "comfyCommit": git_head(comfy_root),
        "venvRoot": str(venv_root),
        "runtimeUserRoot": str(runtime_user_root),
        "managerConfig": str(manager_config),
        "pluginRoot": str(plugin_root),
        "pluginCommit": git_head(plugin_root),
        "pythonVersion": subprocess.check_output(
            [str(python), "-c", "import platform; print(platform.python_version())"], text=True
        ).strip(),
        "torch": accelerator_info,
        "torchIndexUrl": torch_index,
    }
    manifest_path = venv_root / "seethrough-runtime.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"Runtime manifest: {manifest_path}")

    if args.download_models:
        command: list[str | Path] = [
            python,
            SCRIPT_ROOT / "download_models.py",
            "--config",
            CONFIG_PATH,
            "--model-root",
            comfy_root / "models" / "SeeThrough",
            "--hub-cache",
            venv_root / "hf-hub-cache",
        ]
        if args.hf_endpoint:
            command.extend(["--endpoint", args.hf_endpoint])
        if args.force_models:
            command.append("--force")
        run(command)

    diagnose_command: list[str | Path] = [
        python,
        SCRIPT_ROOT / "verify_environment.py",
        "--config",
        CONFIG_PATH,
        "--comfy-root",
        comfy_root,
        "--plugin-root",
        plugin_root,
        "--hub-cache",
        venv_root / "hf-hub-cache",
        "--json-out",
        venv_root / "seethrough-diagnose.json",
    ]
    if args.download_models:
        diagnose_command.append("--require-models")
    run(diagnose_command)
    print("See-through runtime installation completed.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, subprocess.CalledProcessError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)

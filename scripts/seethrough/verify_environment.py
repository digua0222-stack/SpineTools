from __future__ import annotations

import argparse
import importlib.metadata
import json
import platform
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def git_head(root: Path) -> str | None:
    try:
        return subprocess.check_output(
            ["git", "-C", str(root), "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def package_version(name: str) -> str | None:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Diagnose the isolated See-through runtime.")
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--comfy-root", type=Path, required=True)
    parser.add_argument("--plugin-root", type=Path, required=True)
    parser.add_argument("--json-out", type=Path, required=True)
    parser.add_argument("--require-models", action="store_true")
    args = parser.parse_args()

    config = json.loads(args.config.read_text("utf-8"))
    errors: list[str] = []
    warnings: list[str] = []

    try:
        import torch

        cuda_available = torch.cuda.is_available()
        gpu = torch.cuda.get_device_name(0) if cuda_available else None
        vram = round(torch.cuda.get_device_properties(0).total_memory / 1024**2) if cuda_available else None
        torch_version = torch.__version__
        torch_cuda = torch.version.cuda
        if not cuda_available:
            errors.append("CUDA PyTorch is not available")
    except Exception as exc:  # pragma: no cover - diagnostic boundary
        cuda_available = False
        gpu = None
        vram = None
        torch_version = None
        torch_cuda = None
        errors.append(f"Unable to import torch: {exc}")

    if not (args.comfy_root / "main.py").is_file():
        errors.append(f"ComfyUI main.py is missing: {args.comfy_root}")
    if not (args.plugin_root / "nodes.py").is_file():
        errors.append(f"See-through plugin is missing: {args.plugin_root}")

    models = []
    model_root = args.comfy_root / "models" / "SeeThrough"
    for spec in config["models"]:
        path = model_root / spec["directoryName"]
        ready = (path / "model_index.json").is_file()
        marker_revision = None
        marker = path / ".seethrough-model.json"
        if marker.is_file():
            try:
                marker_revision = json.loads(marker.read_text("utf-8")).get("revision")
            except (OSError, json.JSONDecodeError):
                warnings.append(f"Invalid model marker: {marker}")
        if args.require_models and not ready:
            errors.append(f"Model is missing: {spec['repository']}")
        if ready and marker_revision != spec["revision"]:
            warnings.append(f"Model revision marker does not match the pin: {path}")
        models.append({**spec, "path": str(path), "ready": ready, "markerRevision": marker_revision})

    plugin_head = git_head(args.plugin_root)
    if plugin_head != config["plugin"]["commit"]:
        errors.append(f"Plugin revision mismatch: expected {config['plugin']['commit']}, got {plugin_head}")
    comfy_head = git_head(args.comfy_root)
    if comfy_head != config["comfyUi"]["testedCommit"]:
        warnings.append(
            f"ComfyUI commit differs from the tested revision: {comfy_head} != {config['comfyUi']['testedCommit']}"
        )

    report = {
        "schemaVersion": 1,
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "ok": not errors,
        "python": {"version": platform.python_version(), "executable": sys.executable},
        "torch": {"version": torch_version, "cudaVersion": torch_cuda, "cudaAvailable": cuda_available},
        "gpu": {"name": gpu, "vramMiB": vram},
        "packages": {
            name: package_version(name)
            for name in ["diffusers", "accelerate", "opencv-python", "scikit-learn", "huggingface-hub", "psd-tools"]
        },
        "comfyUi": {"path": str(args.comfy_root), "commit": comfy_head},
        "plugin": {"path": str(args.plugin_root), "commit": plugin_head},
        "models": models,
        "warnings": warnings,
        "errors": errors,
    }
    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", "utf-8")

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())

from __future__ import annotations

import argparse
import importlib.metadata
import json
import platform
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from huggingface_hub import try_to_load_from_cache


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
    parser.add_argument("--hub-cache", type=Path, required=True)
    parser.add_argument("--json-out", type=Path, required=True)
    parser.add_argument("--require-models", action="store_true")
    args = parser.parse_args()

    config = json.loads(args.config.read_text("utf-8"))
    errors: list[str] = []
    warnings: list[str] = []

    try:
        import torch

        cuda_available = torch.cuda.is_available()
        mps_backend = getattr(torch.backends, "mps", None)
        mps_available = bool(mps_backend and mps_backend.is_available())
        accelerator = "cuda" if cuda_available else "mps" if mps_available else "cpu"
        gpu = (
            torch.cuda.get_device_name(0)
            if cuda_available
            else f"Apple {platform.machine()} MPS"
            if mps_available
            else None
        )
        vram = round(torch.cuda.get_device_properties(0).total_memory / 1024**2) if cuda_available else None
        torch_version = torch.__version__
        torch_cuda = torch.version.cuda
        if accelerator == "cpu":
            errors.append("Neither CUDA nor Apple MPS acceleration is available")
    except Exception as exc:  # pragma: no cover - diagnostic boundary
        cuda_available = False
        mps_available = False
        accelerator = "unavailable"
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

    auxiliary_hub_files = []
    for spec in config.get("auxiliaryHubFiles", []):
        cached = try_to_load_from_cache(
            spec["repository"], spec["filename"], revision=spec["revision"], cache_dir=args.hub_cache
        )
        ready = isinstance(cached, str) and Path(cached).is_file()
        cache_ref = spec.get("cacheRef")
        ref_cached = (
            try_to_load_from_cache(
                spec["repository"], spec["filename"], revision=cache_ref, cache_dir=args.hub_cache
            )
            if cache_ref
            else cached
        )
        ref_ready = isinstance(ref_cached, str) and Path(ref_cached).is_file()
        if args.require_models and not ready:
            errors.append(f"Auxiliary Hub file is missing: {spec['repository']}/{spec['filename']}")
        if args.require_models and not ref_ready:
            errors.append(f"Auxiliary Hub cache ref is missing: {spec['repository']}@{cache_ref}")
        auxiliary_hub_files.append(
            {**spec, "path": cached if ready else None, "ready": ready and ref_ready}
        )

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
        "torch": {
            "version": torch_version,
            "cudaVersion": torch_cuda,
            "cudaAvailable": cuda_available,
            "mpsAvailable": mps_available,
            "accelerator": accelerator,
        },
        "gpu": {"name": gpu, "vramMiB": vram},
        "packages": {
            name: package_version(name)
            for name in ["diffusers", "accelerate", "opencv-python", "scikit-learn", "huggingface-hub", "psd-tools"]
        },
        "comfyUi": {"path": str(args.comfy_root), "commit": comfy_head},
        "plugin": {"path": str(args.plugin_root), "commit": plugin_head},
        "models": models,
        "auxiliaryHubFiles": auxiliary_hub_files,
        "warnings": warnings,
        "errors": errors,
    }
    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", "utf-8")

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())

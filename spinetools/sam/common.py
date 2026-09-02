"""Shared helpers for the SAM stage: hashing, image loading, environment info.

Coordinate contract (docs/SAM_SPINE_ANIMATION_PIPELINE_DESIGN.zh-CN.md section 6):
- source: top-left (0, 0), x right, y down, unit = source image pixel.
- sourceBBox: [left, top, right, bottom), bottom-right exclusive.
"""

from __future__ import annotations

import hashlib
import json
import os
from typing import Any, Dict, Tuple

import numpy as np
from PIL import Image

INFER_MIN_SHORT_SIDE = 512
INFER_SCALE = 2


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_array(arr: np.ndarray) -> str:
    return hashlib.sha256(arr.tobytes()).hexdigest()


def load_rgba(path: str) -> np.ndarray:
    img = Image.open(path)
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    return np.array(img)


def validate_source(arr: np.ndarray) -> Dict[str, Any]:
    """Source validator per design section 5/7.1."""
    h, w = arr.shape[:2]
    alpha = arr[..., 3]
    report: Dict[str, Any] = {
        "size": [w, h],
        "mode": "RGBA",
        "errors": [],
        "warnings": [],
    }
    if (alpha > 0).all():
        report["errors"].append("alpha is a fully opaque rectangle")
    opaque_ratio = float((alpha > 128).mean())
    report["opaqueRatio"] = round(opaque_ratio, 4)
    if opaque_ratio < 0.01:
        report["errors"].append("subject occupies less than 1% of the canvas")
    short = min(w, h)
    if short < INFER_MIN_SHORT_SIDE:
        report["warnings"].append(
            f"short side {short} < {INFER_MIN_SHORT_SIDE}; using {INFER_SCALE}x inference copy"
        )
        report["inferenceScale"] = INFER_SCALE
    else:
        report["inferenceScale"] = 1
    return report


def make_inference_rgb(arr: np.ndarray, scale: int) -> np.ndarray:
    """Composite onto white, upscale NEAREST for pixel-art inference."""
    img = Image.fromarray(arr)
    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    bg.alpha_composite(img)
    rgb = bg.convert("RGB")
    if scale > 1:
        rgb = rgb.resize((img.width * scale, img.height * scale), Image.NEAREST)
    return np.array(rgb)


def env_report(model_path: str, device: str) -> Dict[str, Any]:
    import platform

    import torch

    info: Dict[str, Any] = {
        "python": platform.python_version(),
        "torch": torch.__version__,
        "cudaAvailable": torch.cuda.is_available(),
        "device": device,
        "modelPath": model_path,
        "modelSha256": sha256_file(model_path),
    }
    if torch.cuda.is_available():
        info["gpu"] = torch.cuda.get_device_name(0)
        info["vramTotalMiB"] = torch.cuda.get_device_properties(0).total_memory >> 20
    return info


def write_json(path: str, data: Any) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def mask_to_source(mask_infer: np.ndarray, src_hw: Tuple[int, int]) -> np.ndarray:
    """Map an inference-space boolean mask back to source resolution."""
    h, w = src_hw
    m = Image.fromarray(mask_infer.astype(np.uint8) * 255)
    m = m.resize((w, h), Image.NEAREST)
    return np.array(m) > 127

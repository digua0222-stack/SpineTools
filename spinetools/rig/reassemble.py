"""Setup Pose reassembly and pixel comparison (design doc V3 + 13.2).

Parts are pasted back at their ``sourceBBox`` in draw order; because every
part's RGBA is sampled from the same source image, overlap zones are
identical across parts and draw order never changes the result.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List

import numpy as np


def composite(
    canvas_hw: tuple[int, int],
    parts: Dict[str, np.ndarray],
    components: List[Dict[str, Any]],
    draw_order: List[str],
) -> np.ndarray:
    """Paste parts at sourceBBox onto a transparent canvas (overwrite).

    Overwrite semantics are exact here: joint overlap zones are sampled from
    the same source image, so every part carries identical RGBA there and
    paste order cannot change the result. Alpha blending would corrupt the
    source-sampled colors in those zones.
    """
    h, w = canvas_hw
    canvas = np.zeros((h, w, 4), np.uint8)
    by_name = {c["name"]: c for c in components}
    for name in draw_order:
        comp = by_name[name]
        l, t, r, b = comp["sourceBBox"]
        part = parts[name]
        ph, pw = part.shape[:2]
        if (pw, ph) != (r - l, b - t):
            raise ValueError(f"{name}: part size {pw}x{ph} != bbox {r - l}x{b - t}")
        visible = part[..., 3] > 0
        region = canvas[t:b, l:r]
        region[visible] = part[visible]
    return canvas


def metrics(source: np.ndarray, reassembled: np.ndarray) -> Dict[str, Any]:
    src_alpha = source[..., 3] > 0
    out_alpha = reassembled[..., 3] > 0
    total = int(src_alpha.sum())
    covered = int((src_alpha & out_alpha).sum())
    recall = covered / max(total, 1)

    changed_mask = src_alpha & (
        np.any(source[..., :3] != reassembled[..., :3], axis=-1) | ~out_alpha
    )
    changed = int(changed_mask.sum())
    changed_pct = changed / max(total, 1)

    # PSNR measures pixel fidelity only (doc 13.2: "仅作为像素保真指标"):
    # it is computed over pixels visible in both images. Coverage gaps are
    # captured by recall/changedPixels above, not folded into PSNR.
    both = src_alpha & out_alpha
    if both.any():
        s = source[..., :3].astype(np.float64)
        r = reassembled[..., :3].astype(np.float64)
        mse = float(((s[both] - r[both]) ** 2).mean())
        psnr = math.inf if mse == 0 else 10.0 * math.log10((255.0**2) / mse)
    else:
        psnr = math.inf
    return {
        "sourceAlphaPixels": total,
        "recall": round(recall, 6),
        "changedPixels": changed,
        "changedPixelsPct": round(changed_pct, 6),
        "psnrDb": ("inf" if psnr == math.inf else round(psnr, 4)),
    }


def comparison_image(source: np.ndarray, reassembled: np.ndarray) -> np.ndarray:
    """Side-by-side: source | reassembled | amplified diff (red = alpha diff)."""
    h, w = source.shape[:2]
    out = np.zeros((h, w * 3, 4), np.uint8)
    white = np.full((h, w, 4), 255, np.uint8)

    def on_white(arr: np.ndarray) -> np.ndarray:
        a = arr[..., 3:4].astype(np.float32) / 255.0
        rgb = arr[..., :3].astype(np.float32) * a + white[..., :3].astype(np.float32) * (1 - a)
        return np.dstack([rgb, np.full((h, w), 255, np.float32)]).astype(np.uint8)

    diff = np.zeros((h, w, 4), np.uint8)
    rgb_delta = np.abs(source[..., :3].astype(np.int16) - reassembled[..., :3].astype(np.int16))
    delta_mag = np.clip(rgb_delta.max(axis=-1) * 4, 0, 255).astype(np.uint8)
    alpha_diff = (source[..., 3] > 0) != (reassembled[..., 3] > 0)
    diff[..., 0] = np.where(alpha_diff, 255, delta_mag)
    diff[..., 1] = np.where(alpha_diff, 0, delta_mag)
    diff[..., 2] = np.where(alpha_diff, 0, delta_mag)
    diff[..., 3] = np.where((delta_mag > 0) | alpha_diff, 255, 40)

    out[:, 0:w] = on_white(source)
    out[:, w : 2 * w] = on_white(reassembled)
    out[:, 2 * w :] = diff
    return out

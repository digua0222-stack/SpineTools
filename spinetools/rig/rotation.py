"""Joint rotation validation (design doc V3 + section 13.1/13.2).

Every movable limb/head joint is rendered at -15/0/+15 degrees around its
pivot (the part's ``pivotSource``). Two defect classes are measured inside a
joint window:

- ``crackPixels``: interior transparent holes (transparent pixels ringed by
  opaque pixels) - the "transparent crack" hard-fail symptom.
- ``revealedPixels``: pixels covered in the 0-degree pose but uncovered after
  rotation - hidden texture the source image cannot provide; these are
  reported as missing texture regions, never silently accepted (doc 8.3).
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Sequence, Tuple

import numpy as np
from PIL import Image

from .reassemble import composite
from .skeleton import Bone

TEST_ANGLES = (-15, 0, 15)
GIF_WINDOW_RADIUS = 42
GIF_SCALE = 3
REVEALED_FLAG_THRESHOLD = 12


def subtree_part_names(bone_name: str, bones: List[Bone]) -> List[str]:
    children: Dict[str, List[str]] = {}
    for bone in bones:
        if bone.parent is not None:
            children.setdefault(bone.parent, []).append(bone.name)
    by_name = {b.name: b for b in bones}
    names: List[str] = []
    stack = [bone_name]
    while stack:
        cur = stack.pop()
        bone = by_name[cur]
        if bone.part_name is not None:
            names.append(bone.part_name)
        stack.extend(children.get(cur, []))
    return names


def _rotate_part(
    part: np.ndarray, pivot_local: Sequence[float], angle: float
) -> Tuple[np.ndarray, Tuple[int, int]]:
    """Rotate around ``pivot_local`` without clipping the swept area.

    Returns (image, offset): the rotated image on an expanded canvas and the
    offset to subtract from the part's bbox origin when pasting, so the pivot
    stays fixed in source coordinates. ``expand=False`` would crop anything
    rotating outside the original bbox (e.g. a spear sweeps far beyond it).
    """
    h, w = part.shape[:2]
    pad = int(math.ceil(math.hypot(w, h)))
    canvas = np.zeros((h + 2 * pad, w + 2 * pad, 4), np.uint8)
    canvas[pad : pad + h, pad : pad + w] = part
    img = Image.fromarray(canvas)
    rotated = img.rotate(
        angle,
        resample=Image.BILINEAR,
        center=(pad + float(pivot_local[0]), pad + float(pivot_local[1])),
        expand=False,
        fillcolor=(0, 0, 0, 0),
    )
    return np.array(rotated), (pad, pad)


def paste_over(canvas: np.ndarray, img: np.ndarray, ox: int, oy: int) -> None:
    """Alpha-over ``img`` onto ``canvas`` at (ox, oy), clipped to the canvas."""
    h, w = canvas.shape[:2]
    ph, pw = img.shape[:2]
    x0, y0 = max(0, ox), max(0, oy)
    x1, y1 = min(w, ox + pw), min(h, oy + ph)
    if x1 <= x0 or y1 <= y0:
        return
    src = img[y0 - oy : y1 - oy, x0 - ox : x1 - ox].astype(np.float32)
    dst = canvas[y0:y1, x0:x1].astype(np.float32)
    a_s = src[..., 3:4] / 255.0
    a_d = dst[..., 3:4] / 255.0
    out_a = a_s + a_d * (1.0 - a_s)
    safe = np.where(out_a == 0, 1.0, out_a)
    out_rgb = (src[..., :3] * a_s + dst[..., :3] * a_d * (1.0 - a_s)) / safe
    canvas[y0:y1, x0:x1] = np.round(
        np.dstack([out_rgb, out_a[..., 0] * 255.0])
    ).astype(np.uint8)


def render_pose(
    canvas_hw: Tuple[int, int],
    parts: Dict[str, np.ndarray],
    components: List[Dict[str, Any]],
    draw_order: List[str],
    rotated_parts: Dict[str, Tuple[float, Sequence[float]]],
) -> np.ndarray:
    """Composite with given parts rotated ``angle`` deg around a shared pivot.

    All rotated parts turn around the same joint pivot (rigid subtree
    rotation). Positive angle = counter-clockwise (spine convention); PIL
    rotates counter-clockwise for positive angles, so the sign passes
    through. Rendering uses alpha-over blending for a truthful preview;
    coverage metrics only depend on alpha, never on blend colors.
    """
    if not rotated_parts:
        return composite(canvas_hw, parts, components, draw_order)
    comp_by_name = {c["name"]: c for c in components}
    canvas = np.zeros((canvas_hw[0], canvas_hw[1], 4), np.uint8)
    for name in draw_order:
        comp = comp_by_name[name]
        l, t = comp["sourceBBox"][0], comp["sourceBBox"][1]
        if name in rotated_parts:
            angle, pivot_source = rotated_parts[name]
            pivot_local = (pivot_source[0] - l, pivot_source[1] - t)
            rotated, (dx, dy) = _rotate_part(parts[name], pivot_local, angle)
            paste_over(canvas, rotated, l - dx, t - dy)
        else:
            paste_over(canvas, parts[name], l, t)
    return canvas


def _window_mask(hw: Tuple[int, int], center: Sequence[float], radius: int) -> np.ndarray:
    h, w = hw
    yy, xx = np.mgrid[0:h, 0:w]
    return (yy - center[1]) ** 2 + (xx - center[0]) ** 2 <= radius**2


def _interior_transparent(alpha: np.ndarray) -> np.ndarray:
    opaque = alpha > 0
    count = np.zeros(alpha.shape, np.int32)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            shifted = np.zeros_like(opaque)
            ys = slice(max(0, dy), min(alpha.shape[0], alpha.shape[0] + dy))
            xs = slice(max(0, dx), min(alpha.shape[1], alpha.shape[1] + dx))
            shifted[ys, xs] = opaque[
                max(0, -dy) : alpha.shape[0] - max(0, dy),
                max(0, -dx) : alpha.shape[1] - max(0, dx),
            ]
            count += shifted
    return ~opaque & (count >= 5)


def evaluate_rotation(
    canvas_hw: Tuple[int, int],
    parts: Dict[str, np.ndarray],
    components: List[Dict[str, Any]],
    draw_order: List[str],
    bone: Bone,
    bones: List[Bone],
    pivot_source: Sequence[float],
    radius: int,
) -> Dict[str, Any]:
    names = subtree_part_names(bone.name, bones)

    base = render_pose(canvas_hw, parts, components, draw_order, {})
    base_alpha = base[..., 3] > 0
    window = _window_mask(canvas_hw, pivot_source, radius)

    results: Dict[str, Any] = {"joint": bone.name, "windowRadius": radius, "angles": {}}
    for angle in TEST_ANGLES:
        # Rigid subtree rotation: every descendant turns around the joint.
        rotated = {n: (angle, pivot_source) for n in names}
        pose = render_pose(canvas_hw, parts, components, draw_order, rotated)
        alpha = pose[..., 3] > 0
        cracks = int((_interior_transparent(pose[..., 3]) & window).sum())
        revealed = int((base_alpha & ~alpha & window).sum())
        results["angles"][str(angle)] = {
            "crackPixels": cracks,
            "revealedPixels": revealed,
            "pose": pose,
        }
    return results


def missing_texture_regions(rotation_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    regions: List[Dict[str, Any]] = []
    for res in rotation_results:
        for angle, data in res["angles"].items():
            if angle == "0":
                continue
            if data["revealedPixels"] > REVEALED_FLAG_THRESHOLD:
                regions.append(
                    {
                        "joint": res["joint"],
                        "angle": int(angle),
                        "revealedPixels": data["revealedPixels"],
                        "note": "rotation reveals texture not present in the source image; human completion required",
                    }
                )
    return regions


def rotation_gif_frames(
    canvas_hw: Tuple[int, int],
    rotation_results: List[Dict[str, Any]],
    pivots: Dict[str, Sequence[float]],
) -> List[Image.Image]:
    """Zoomed (3x nearest) window around each joint at -15/0/+15 degrees."""
    h, w = canvas_hw
    r = GIF_WINDOW_RADIUS
    frames: List[Image.Image] = []
    for res in rotation_results:
        cx, cy = float(pivots[res["joint"]][0]), float(pivots[res["joint"]][1])
        for angle in TEST_ANGLES:
            pose = rotation_result_pose(res, angle)
            x0, y0 = int(round(cx)) - r, int(round(cy)) - r
            canvas = np.zeros((2 * r, 2 * r, 4), np.uint8)
            sx0, sy0 = max(0, x0), max(0, y0)
            sx1, sy1 = min(w, x0 + 2 * r), min(h, y0 + 2 * r)
            if sx1 > sx0 and sy1 > sy0:
                canvas[sy0 - y0 : sy1 - y0, sx0 - x0 : sx1 - x0] = pose[sy0:sy1, sx0:sx1]
            px, py = int(round(cx)) - x0, int(round(cy)) - y0
            canvas[max(0, py - 1) : py + 2, max(0, px - 1) : px + 2] = (255, 32, 32, 255)
            img = Image.fromarray(canvas)
            frames.append(img.resize((2 * r * GIF_SCALE, 2 * r * GIF_SCALE), Image.NEAREST))
    return frames


def rotation_result_pose(res: Dict[str, Any], angle: float) -> np.ndarray:
    return res["angles"][str(angle)]["pose"]


def strip_poses(rotation_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Drop rendered pose arrays so the report stays JSON-serializable."""
    stripped: List[Dict[str, Any]] = []
    for res in rotation_results:
        stripped.append(
            {
                "joint": res["joint"],
                "windowRadius": res["windowRadius"],
                "angles": {
                    angle: {k: v for k, v in data.items() if k != "pose"}
                    for angle, data in res["angles"].items()
                },
            }
        )
    return stripped

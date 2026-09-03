"""Completion contracts (AC-02, task doc section 6).

Coordinate and mask responsibilities:

- ``sourceBBox``: the input visible crop box, in source image coordinates.
  It is evidence and is never overwritten by completion outputs.
- ``completedBBox``: the crop box of the completed part, in source
  coordinates. It MAY extend beyond the source image (negative left/top or
  right/bottom past the canvas); the offset is part of the contract so the
  transform stays lossless.
- ``pivotSource``: joint anchor in source coordinates (immutable).
  ``pivotLocal = pivotSource - completedBBox[:2]``.
- Mask canvases (``visibleMask/fullMask/repairMask/protectedMask``) all live
  on the same completedBBox canvas with the same source transform:
  ``canvas = source - completedBBox[:2]``.
- ``repairMask``: the only domain new content may appear in; it must not
  intersect ``protectedMask``. Alpha-transition exceptions must be declared
  explicitly in the contract, not improvised by a backend.
- ``provenance``: per-pixel origin of the final RGBA, one of
  ``source/reference/geometric/generated/transparent``.
"""

from __future__ import annotations

from typing import Any, Dict, List, Sequence, Tuple

import numpy as np

MASK_KINDS = ("visibleMask", "fullMask", "repairMask", "protectedMask")
PROVENANCE_KINDS = ("source", "reference", "geometric", "generated", "transparent")

# Hard gate (task doc section 7): protected RGBA changes allowed = 0.
PROTECTED_RGBA_CHANGE_BUDGET = 0


class ContractError(ValueError):
    """A completion contract violation; always a hard failure."""


def pivot_local(pivot_source: Sequence[float], completed_bbox: Sequence[int]) -> List[float]:
    return [
        round(float(pivot_source[0]) - completed_bbox[0], 4),
        round(float(pivot_source[1]) - completed_bbox[1], 4),
    ]


def source_to_canvas(point: Sequence[float], completed_bbox: Sequence[int]) -> Tuple[float, float]:
    return (float(point[0]) - completed_bbox[0], float(point[1]) - completed_bbox[1])


def canvas_to_source(point: Sequence[float], completed_bbox: Sequence[int]) -> Tuple[float, float]:
    return (float(point[0]) + completed_bbox[0], float(point[1]) + completed_bbox[1])


def make_completed_bbox(
    source_bbox: Sequence[int],
    repair_mask_source: np.ndarray | None = None,
    margin: int = 2,
) -> List[int]:
    """Expand sourceBBox to cover the repair domain plus ``margin``.

    The result is deliberately NOT clipped to the source canvas: hidden
    texture may legitimately live outside the photographed frame, and the
    contract records the offset instead of clipping it away.
    """
    l, t, r, b = (int(v) for v in source_bbox)
    if repair_mask_source is not None and repair_mask_source.any():
        ys, xs = np.where(repair_mask_source)
        l = min(l, int(xs.min()))
        t = min(t, int(ys.min()))
        r = max(r, int(xs.max()) + 1)
        b = max(b, int(ys.max()) + 1)
    return [l - margin, t - margin, r + margin, b + margin]


def validate_mask_set(
    masks: Dict[str, np.ndarray], completed_bbox: Sequence[int]
) -> List[str]:
    """Validate a part's mask canvases against the contract."""
    errors: List[str] = []
    l, t, r, b = (int(v) for v in completed_bbox)
    if r <= l or b <= t:
        errors.append(f"completedBBox {list(completed_bbox)} is empty")
        return errors
    expected_shape = (b - t, r - l)
    for kind in MASK_KINDS:
        if kind not in masks:
            errors.append(f"missing mask: {kind}")
            continue
        if masks[kind].shape != expected_shape:
            errors.append(
                f"{kind} shape {masks[kind].shape} != completedBBox canvas {expected_shape}"
            )
    if errors:
        # Intersection/subset checks are only meaningful on aligned canvases.
        return errors
    if "repairMask" in masks and "protectedMask" in masks:
        inter = int((masks["repairMask"] & masks["protectedMask"]).sum())
        if inter:
            errors.append(f"repairMask intersects protectedMask on {inter} px")
    if "visibleMask" in masks and "protectedMask" in masks:
        if int((masks["visibleMask"] & ~masks["protectedMask"]).sum()):
            errors.append("visibleMask must be a subset of protectedMask")
    if "repairMask" in masks and "fullMask" in masks:
        if int((masks["repairMask"] & ~masks["fullMask"]).sum()):
            errors.append("repairMask must be a subset of fullMask")
    if "visibleMask" in masks and "fullMask" in masks:
        if int((masks["visibleMask"] & ~masks["fullMask"]).sum()):
            errors.append("visibleMask must be a subset of fullMask")
    return errors


def validate_provenance(provenance: np.ndarray) -> List[str]:
    unknown = set(np.unique(provenance).tolist()) - set(PROVENANCE_KINDS)
    if unknown:
        return [f"unknown provenance kinds: {sorted(unknown)}"]
    return []


def detect_transparent_rgb_pollution(part_rgba: np.ndarray, visible_mask: np.ndarray) -> int:
    """Count pixels that are invisible but still carry scene RGB.

    SAM exports keep the original scene color under alpha=0 pixels (another
    object may live there). Feeding that RGB to a model leaks the occluder;
    the count is reported and the pixels must be sanitized before use.
    """
    invisible = ~visible_mask
    polluted = invisible & np.any(part_rgba[..., :3] != 0, axis=-1)
    return int(polluted.sum())


def build_model_input_rgb(
    part_rgba: np.ndarray,
    visible_mask: np.ndarray,
    background: Tuple[int, int, int] = (255, 255, 255),
) -> np.ndarray:
    """Alpha-correct RGB model input with zero occluder leakage.

    Visible pixels are composited over the declared background by their own
    alpha; every invisible pixel becomes exactly ``background`` - the RGB an
    occluder left under alpha=0 never reaches a backend.
    """
    if part_rgba.shape[:2] != visible_mask.shape:
        raise ContractError(
            f"part shape {part_rgba.shape[:2]} != visibleMask shape {visible_mask.shape}"
        )
    alpha = part_rgba[..., 3:4].astype(np.float32) / 255.0
    bg = np.array(background, dtype=np.float32)
    composited = part_rgba[..., :3].astype(np.float32) * alpha + bg * (1.0 - alpha)
    out = np.broadcast_to(bg, part_rgba[..., :3].shape).copy()
    out[visible_mask] = composited[visible_mask]
    return np.round(out).astype(np.uint8)


def check_protected_pixels(
    before_rgba: np.ndarray, after_rgba: np.ndarray, protected_mask: np.ndarray
) -> int:
    """Hard gate: count protected RGBA values a backend changed (must be 0)."""
    changed = protected_mask & np.any(before_rgba != after_rgba, axis=-1)
    return int(changed.sum())

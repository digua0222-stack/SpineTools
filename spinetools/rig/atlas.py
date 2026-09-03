"""Deterministic atlas packing (design doc section 10.2).

- Full RGBA regions, 2 px padding with edge extrusion (replicated edge
  pixels) so linear sampling does not bleed transparency into the region.
- Deterministic: identical inputs and config produce an identical atlas
  (regions are sorted by (height desc, width desc, name) and shelf-packed).
- Every region's original hash, atlas coordinates and pixel-exact
  verification are reported.
"""

from __future__ import annotations

import hashlib
from typing import Any, Dict, List, Tuple

import numpy as np
from PIL import Image

PADDING = 2
EXTRUDE = 2


def _extrude(arr: np.ndarray, extrude: int) -> np.ndarray:
    """Replicate edge pixels ``extrude`` px outward on all four sides."""
    out = np.pad(arr, ((extrude, extrude), (extrude, extrude), (0, 0)), mode="edge")
    # Corners from edge replication are already correct via np.pad edge mode.
    return out


def pack_atlas(
    parts: Dict[str, np.ndarray],
    padding: int = PADDING,
    extrude: int = EXTRUDE,
    max_width: int = 2048,
) -> Tuple[np.ndarray, List[Dict[str, Any]]]:
    """Shelf-pack part RGBA arrays. Returns (atlas array, region records)."""
    if not parts:
        raise ValueError("no parts to pack")
    order = sorted(parts, key=lambda n: (-parts[n].shape[0], -parts[n].shape[1], n))

    cell = padding + extrude
    placements: Dict[str, Tuple[int, int]] = {}
    shelf_y = cell
    shelf_height = 0
    cursor_x = cell
    atlas_width = cell
    for name in order:
        h, w = parts[name].shape[:2]
        region_w, region_h = w, h
        if cursor_x > cell and cursor_x + region_w + cell > max_width:
            shelf_y += shelf_height + 2 * cell
            cursor_x = cell
            shelf_height = 0
        placements[name] = (cursor_x, shelf_y)
        cursor_x += region_w + 2 * cell
        shelf_height = max(shelf_height, region_h)
        atlas_width = max(atlas_width, cursor_x)
    atlas_height = shelf_y + shelf_height + cell

    atlas = np.zeros((atlas_height, atlas_width, 4), np.uint8)
    regions: List[Dict[str, Any]] = []
    for name in order:
        arr = parts[name]
        h, w = arr.shape[:2]
        x, y = placements[name]
        if extrude:
            block = _extrude(arr, extrude)
            # Fully transparent padding pixels must stay transparent in RGBA;
            # np.pad edge mode also replicates RGB which is exactly what we
            # want for bleed protection, alpha is replicated too.
            atlas[y - extrude : y - extrude + block.shape[0],
                  x - extrude : x - extrude + block.shape[1]] = block
        else:
            atlas[y : y + h, x : x + w] = arr
        regions.append(
            {
                "name": name,
                "x": x,
                "y": y,
                "width": w,
                "height": h,
                "rgbaSha256": hashlib.sha256(arr.tobytes()).hexdigest(),
            }
        )
    regions.sort(key=lambda r: r["name"])
    return atlas, regions


def make_atlas_text(regions: List[Dict[str, Any]], width: int, height: int, name: str) -> str:
    text = (
        f"\n{name}.png\n"
        f"size: {width},{height}\n"
        "format: RGBA8888\n"
        "filter: Linear,Linear\n"
        "repeat: none\n"
    )
    for region in regions:
        text += (
            f"{region['name']}\n"
            "  rotate: false\n"
            f"  xy: {region['x']}, {region['y']}\n"
            f"  size: {region['width']}, {region['height']}\n"
            f"  orig: {region['width']}, {region['height']}\n"
            "  offset: 0, 0\n"
            "  index: -1\n"
        )
    return text


def verify_regions(atlas: np.ndarray, parts: Dict[str, np.ndarray], regions: List[Dict[str, Any]]) -> Dict[str, bool]:
    """Crop each region back from the atlas and compare pixel-exact."""
    result: Dict[str, bool] = {}
    for region in regions:
        name = region["name"]
        x, y, w, h = region["x"], region["y"], region["width"], region["height"]
        crop = atlas[y : y + h, x : x + w]
        result[name] = bool(np.array_equal(crop, parts[name]))
    return result


def load_parts(parts_dir: str, names: List[str]) -> Dict[str, np.ndarray]:
    import os

    parts: Dict[str, np.ndarray] = {}
    for name in names:
        path = os.path.join(parts_dir, f"{name}.png")
        with Image.open(path) as img:
            parts[name] = np.array(img.convert("RGBA"))
    return parts

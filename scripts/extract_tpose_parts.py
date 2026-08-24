#!/usr/bin/env python3
"""Recover deterministic transparent parts from the baked-checker Zhao Yun sheet.

The supplied image is RGB, not RGBA: its checkerboard is part of the pixels.
This tool therefore reconstructs a binary alpha mask from dark/colored outline
seeds and spatially enclosed interiors.  It keeps that limitation explicit in
the component manifest instead of claiming that the original alpha was found.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import cv2
import numpy as np


SCHEMA_VERSION = "motion-rig/tpose-components-v1"
TOOL_VERSION = "0.1.0"
SOURCE_NAME = "tpose_detailed_checkerboard_source.png"
DEFAULT_MIN_AREA = 80
DEFAULT_DARK_THRESHOLD = 225
DEFAULT_CHROMA_THRESHOLD = 8


@dataclass(frozen=True)
class Slot:
    id: str
    anchor_x: float
    anchor_y: float
    semantic_status: str
    screen_side: str
    proposed_role: str | None = None


# Screen-relative anchors make filenames stable for this separated-parts layout.
# Limb depth names follow the established Zhao Yun rig convention.  They remain
# layout heuristics in the manifest and must be confirmed by a human binder.
LAYOUT_SLOTS: tuple[Slot, ...] = (
    Slot("weapon", 0.222, 0.230, "obvious", "left", "weapon"),
    Slot("helmet", 0.475, 0.106, "obvious", "center", "head-accessory"),
    Slot("cape", 0.724, 0.182, "obvious", "right", "cape"),
    Slot("head", 0.448, 0.247, "obvious", "center", "head"),
    Slot("shoulder_back", 0.322, 0.385, "layout-heuristic", "left", "shoulder-back"),
    Slot("shoulder_front", 0.682, 0.385, "layout-heuristic", "right", "shoulder-front"),
    Slot("torso", 0.494, 0.463, "obvious", "center", "torso"),
    Slot("upper_arm_back", 0.318, 0.466, "layout-heuristic", "left", "upper-arm-back"),
    Slot("upper_arm_front", 0.680, 0.466, "layout-heuristic", "right", "upper-arm-front"),
    Slot("forearm_back", 0.307, 0.559, "layout-heuristic", "left", "forearm-back"),
    Slot("forearm_front", 0.689, 0.559, "layout-heuristic", "right", "forearm-front"),
    Slot("hip_cover_back", 0.429, 0.639, "layout-heuristic", "left", "hip-cover-back"),
    Slot("hip_cover_front", 0.559, 0.639, "layout-heuristic", "right", "hip-cover-front"),
    Slot("hand_back", 0.303, 0.631, "layout-heuristic", "left", "hand-back"),
    Slot("hand_front", 0.693, 0.631, "layout-heuristic", "right", "hand-front"),
    Slot("thigh_back", 0.309, 0.729, "layout-heuristic", "left", "thigh-back"),
    Slot("thigh_front", 0.688, 0.729, "layout-heuristic", "right", "thigh-front"),
    Slot("knee_cover_back", 0.429, 0.754, "layout-heuristic", "left", "knee-cover-back"),
    Slot("knee_cover_front", 0.559, 0.754, "layout-heuristic", "right", "knee-cover-front"),
    Slot("shin_back", 0.314, 0.859, "layout-heuristic", "left", "shin-back"),
    Slot("shin_front", 0.683, 0.859, "layout-heuristic", "right", "shin-front"),
    Slot("foot_back", 0.300, 0.963, "layout-heuristic", "left", "foot-back"),
    Slot("foot_front", 0.699, 0.963, "layout-heuristic", "right", "foot-front"),
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_image(path: Path) -> np.ndarray:
    image = cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_UNCHANGED)
    if image is None:
        raise RuntimeError(f"Cannot decode image: {path}")
    if image.ndim == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    return image


def write_png(path: Path, image: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    ok, encoded = cv2.imencode(".png", image, [cv2.IMWRITE_PNG_COMPRESSION, 9])
    if not ok:
        raise RuntimeError(f"Cannot encode PNG: {path}")
    encoded.tofile(str(path))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
    )


def prune_stale_payload_files(directory: Path, component_ids: set[str]) -> None:
    """Remove only obsolete files inside this generator's dedicated payload."""
    parts_dir = directory / "parts"
    if parts_dir.is_dir():
        expected_names = {f"{component_id}.png" for component_id in component_ids}
        for candidate in parts_dir.glob("*.png"):
            if candidate.name not in expected_names and candidate.is_file():
                candidate.unlink()
    legacy_manifest = directory / "components.json"
    if legacy_manifest.is_file():
        legacy_manifest.unlink()


def source_transparency(image: np.ndarray) -> dict[str, Any]:
    has_alpha = image.shape[2] == 4
    if has_alpha:
        alpha = image[:, :, 3]
        alpha_min, alpha_max = int(alpha.min()), int(alpha.max())
    else:
        # RGB images are rendered as if alpha were 255 everywhere.
        alpha_min = alpha_max = 255
    return {
        "hasAlphaChannel": has_alpha,
        "effectiveAlphaMin": alpha_min,
        "effectiveAlphaMax": alpha_max,
        "effectiveOpaque": alpha_min == 255 and alpha_max == 255,
    }


def checkerboard_evidence(bgr: np.ndarray, transparency: dict[str, Any]) -> dict[str, Any]:
    rgb = cv2.cvtColor(bgr[:, :, :3], cv2.COLOR_BGR2RGB)
    channel_range = rgb.max(axis=2).astype(np.int16) - rgb.min(axis=2).astype(np.int16)
    neutral_bright = (channel_range <= 4) & (rgb.min(axis=2) >= 240)
    gray = np.rint(rgb.mean(axis=2)).astype(np.uint8)
    samples = gray[neutral_bright]
    histogram = np.bincount(samples, minlength=256) if samples.size else np.zeros(256, dtype=int)
    low_count = int(histogram[244:250].sum())
    high_count = int(histogram[252:256].sum())
    pixel_count = int(gray.size)
    likely = bool(
        not transparency["hasAlphaChannel"]
        and float(neutral_bright.mean()) > 0.5
        and low_count / pixel_count > 0.1
        and high_count / pixel_count > 0.1
    )
    return {
        "likelyBakedCheckerboard": likely,
        "neutralBrightPixelRatio": round(float(neutral_bright.mean()), 6),
        "lowTonePixelRatio": round(low_count / pixel_count, 6),
        "highTonePixelRatio": round(high_count / pixel_count, 6),
        "evidence": "alternating-near-white-tones-without-alpha" if likely else "inconclusive",
    }


def reconstruct_mask(
    bgr: np.ndarray,
    dark_threshold: int = DEFAULT_DARK_THRESHOLD,
    chroma_threshold: int = DEFAULT_CHROMA_THRESHOLD,
    min_area: int = DEFAULT_MIN_AREA,
) -> tuple[np.ndarray, list[dict[str, Any]]]:
    gray = cv2.cvtColor(bgr[:, :, :3], cv2.COLOR_BGR2GRAY)
    channel_range = (
        bgr[:, :, :3].max(axis=2).astype(np.int16)
        - bgr[:, :, :3].min(axis=2).astype(np.int16)
    )
    seed = ((gray < dark_threshold) | (channel_range > chroma_threshold)).astype(np.uint8)
    seed = cv2.morphologyEx(seed, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    seed = cv2.morphologyEx(seed, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))

    # Everything bright/neutral and reachable from the image border is known
    # background.  Enclosed bright interiors are retained as part pixels.
    passable = (1 - seed).astype(np.uint8) * 255
    flood = passable.copy()
    flood_mask = np.zeros((flood.shape[0] + 2, flood.shape[1] + 2), np.uint8)
    cv2.floodFill(flood, flood_mask, (0, 0), 128)
    foreground = ((seed > 0) | (flood == 255)).astype(np.uint8)

    # Strip only near-white neutral pixels on the *outer* one-pixel boundary.
    # These are checkerboard remnants pulled in by morphological closing.  Dark
    # pixel-art outlines and enclosed light material remain untouched.
    eroded = cv2.erode(foreground, np.ones((3, 3), np.uint8))
    outer_boundary = (foreground > 0) & (eroded == 0)
    checker_like = (bgr[:, :, :3].min(axis=2) >= 235) & (channel_range <= 8)
    foreground[outer_boundary & checker_like] = 0

    count, labels, stats, centroids = cv2.connectedComponentsWithStats(foreground, 8)
    components: list[dict[str, Any]] = []
    kept_mask = np.zeros_like(foreground)
    for label in range(1, count):
        x, y, width, height, area = (int(value) for value in stats[label])
        if area < min_area:
            continue
        kept_mask[labels == label] = len(components) + 1
        components.append(
            {
                "componentLabel": len(components) + 1,
                "bbox": {"x": x, "y": y, "width": width, "height": height},
                "center": {
                    "x": round(float(centroids[label][0]), 3),
                    "y": round(float(centroids[label][1]), 3),
                },
                "maskArea": area,
            }
        )
    return kept_mask, components


def assign_names(
    components: list[dict[str, Any]], width: int, height: int
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if len(components) != len(LAYOUT_SLOTS):
        ordered = sorted(
            components,
            key=lambda item: (item["center"]["y"], item["center"]["x"]),
        )
        for index, component in enumerate(ordered, 1):
            component.update(
                {
                    "id": f"spatial_component_{index:02d}",
                    "semanticStatus": "spatial-only",
                    "screenSide": "unknown",
                    "proposedRole": None,
                    "matchDistanceNormalized": None,
                }
            )
        return ordered, {
            "mode": "top-left-spatial-fallback",
            "expectedComponentCount": len(LAYOUT_SLOTS),
            "semanticGuarantee": "none",
        }

    pairs: list[tuple[float, int, int]] = []
    for component_index, component in enumerate(components):
        center_x = component["center"]["x"] / width
        center_y = component["center"]["y"] / height
        for slot_index, slot in enumerate(LAYOUT_SLOTS):
            distance = float(np.hypot(center_x - slot.anchor_x, center_y - slot.anchor_y))
            pairs.append((distance, component_index, slot_index))
    pairs.sort(key=lambda item: (item[0], item[1], item[2]))

    matched_components: set[int] = set()
    matched_slots: set[int] = set()
    for distance, component_index, slot_index in pairs:
        if component_index in matched_components or slot_index in matched_slots:
            continue
        slot = LAYOUT_SLOTS[slot_index]
        components[component_index].update(
            {
                "id": slot.id,
                "semanticStatus": slot.semantic_status,
                "screenSide": slot.screen_side,
                "proposedRole": slot.proposed_role,
                "matchDistanceNormalized": round(distance, 6),
            }
        )
        matched_components.add(component_index)
        matched_slots.add(slot_index)
    components.sort(key=lambda item: item["id"])
    return components, {
        "mode": "normalized-spatial-anchor-matching",
        "expectedComponentCount": len(LAYOUT_SLOTS),
        "semanticGuarantee": "obvious-or-layout-heuristic-only",
        "screenSideConvention": "viewer/screen relative, never character anatomical left/right",
        "unresolvedIds": sorted(
            component["id"]
            for component in components
            if component["semanticStatus"] == "spatial-only"
        ),
        "requiresHumanConfirmationIds": sorted(
            component["id"]
            for component in components
            if component["semanticStatus"] != "obvious"
        ),
    }


def build_spine_atlas(page_name: str, width: int, height: int, components: list[dict[str, Any]]) -> str:
    lines = [
        page_name,
        f"size: {width},{height}",
        "format: RGBA8888",
        "filter: Linear,Linear",
        "repeat: none",
    ]
    for component in components:
        bbox = component["bbox"]
        lines.extend(
            [
                component["id"],
                "  rotate: false",
                f"  xy: {bbox['x']}, {bbox['y']}",
                f"  size: {bbox['width']}, {bbox['height']}",
                f"  orig: {bbox['width']}, {bbox['height']}",
                "  offset: 0, 0",
                "  index: -1",
            ]
        )
    return "\n".join(lines) + "\n"


def extract(
    source: Path,
    output_dir: Path,
    public_dir: Path | None = None,
    min_area: int = DEFAULT_MIN_AREA,
) -> dict[str, Any]:
    unchanged = read_image(source)
    bgr = unchanged[:, :, :3]
    height, width = bgr.shape[:2]
    transparency = source_transparency(unchanged)
    checker = checkerboard_evidence(bgr, transparency)
    labels, raw_components = reconstruct_mask(bgr, min_area=min_area)
    components, naming = assign_names(raw_components, width, height)

    output_dir.mkdir(parents=True, exist_ok=True)
    component_ids = {component["id"] for component in components}
    prune_stale_payload_files(output_dir, component_ids)
    atlas_name = "atlas.png"
    atlas_path = output_dir / atlas_name
    rgba_atlas = np.dstack((bgr, np.where(labels > 0, 255, 0).astype(np.uint8)))
    rgba_atlas[labels == 0, :3] = 0
    write_png(atlas_path, rgba_atlas)

    label_by_id: dict[str, int] = {
        component["id"]: int(component["componentLabel"]) for component in components
    }
    for index, component in enumerate(components, 1):
        bbox = component["bbox"]
        x, y, crop_width, crop_height = (
            bbox["x"],
            bbox["y"],
            bbox["width"],
            bbox["height"],
        )
        component_mask = labels == label_by_id[component["id"]]
        crop = np.dstack((bgr[y : y + crop_height, x : x + crop_width], component_mask[y : y + crop_height, x : x + crop_width].astype(np.uint8) * 255))
        crop[crop[:, :, 3] == 0, :3] = 0
        relative_file = f"parts/{component['id']}.png"
        part_path = output_dir / relative_file
        write_png(part_path, crop)
        component.update(
            {
                "index": index,
                "file": relative_file,
                "fileBytes": part_path.stat().st_size,
                "fileSha256": sha256(part_path),
                "alpha": {
                    "min": int(crop[:, :, 3].min()),
                    "max": int(crop[:, :, 3].max()),
                    "nonZeroPixels": int(np.count_nonzero(crop[:, :, 3])),
                    "mode": "binary-reconstructed",
                },
                "atlasRegion": {
                    "page": atlas_name,
                    "x": x,
                    "y": y,
                    "width": crop_width,
                    "height": crop_height,
                },
            }
        )

    atlas_text = build_spine_atlas(atlas_name, width, height, components)
    (output_dir / "spine.atlas").write_text(atlas_text, encoding="utf-8")
    manifest: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "source": {
            "file": f"../assets/{source.name}",
            "sha256": sha256(source),
            "bytes": source.stat().st_size,
            "width": width,
            "height": height,
            "channels": int(unchanged.shape[2]),
            "transparency": transparency,
            "checkerboard": checker,
        },
        "extraction": {
            "tool": "Motion Rig Lab T-Pose component extractor",
            "version": TOOL_VERSION,
            "deterministic": True,
            "method": "dark-or-chroma-seeds-plus-border-flood-fill",
            "seedFormula": f"gray<{DEFAULT_DARK_THRESHOLD} OR channelRange>{DEFAULT_CHROMA_THRESHOLD}",
            "morphology": ["2x2-open", "5x5-close", "neutral-outer-boundary-cleanup"],
            "minimumSeedArea": min_area,
            "alphaRecovery": "binary-estimate-from-baked-checkerboard",
            "limitations": [
                "The source has no alpha channel; original subpixel alpha cannot be recovered exactly.",
                "RGB at anti-aliased boundaries may retain contamination from the baked checkerboard.",
                "Enclosed bright regions are treated as foreground; true enclosed transparent holes may be filled.",
            ],
        },
        "atlas": {
            "image": atlas_name,
            "imageBytes": atlas_path.stat().st_size,
            "imageSha256": sha256(atlas_path),
            "spineAtlas": "spine.atlas",
            "spineAtlasBytes": (output_dir / "spine.atlas").stat().st_size,
            "spineAtlasSha256": sha256(output_dir / "spine.atlas"),
            "width": width,
            "height": height,
            "alpha": {
                "min": int(rgba_atlas[:, :, 3].min()),
                "max": int(rgba_atlas[:, :, 3].max()),
                "nonZeroPixels": int(np.count_nonzero(rgba_atlas[:, :, 3])),
                "uniqueValues": [int(value) for value in np.unique(rgba_atlas[:, :, 3])],
            },
        },
        "naming": naming,
        "componentCount": len(components),
        "components": components,
    }
    write_json(output_dir / "manifest.json", manifest)

    if public_dir is not None:
        public_dir.mkdir(parents=True, exist_ok=True)
        prune_stale_payload_files(public_dir, component_ids)
        public_source = public_dir.parent / "assets" / source.name
        public_source.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, public_source)
        shutil.copyfile(atlas_path, public_dir / atlas_name)
        shutil.copyfile(output_dir / "spine.atlas", public_dir / "spine.atlas")
        shutil.copyfile(output_dir / "manifest.json", public_dir / "manifest.json")
        for component in components:
            target = public_dir / component["file"]
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(output_dir / component["file"], target)
    return manifest


def update_asset_manifest(assets_dir: Path) -> None:
    candidates = [
        assets_dir / "银枪三连刺.mp4",
        assets_dir / "tpos分离部件.png",
        assets_dir / "角色立绘拆分_1.png",
        assets_dir / SOURCE_NAME,
    ]
    document = {
        "algorithm": "sha256",
        "files": [
            {"path": path.name, "bytes": path.stat().st_size, "sha256": sha256(path)}
            for path in candidates
            if path.is_file()
        ],
    }
    write_json(assets_dir / "SHA256SUMS.json", document)


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    repository_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=repository_root / "demo" / "zhaoyun" / "assets" / SOURCE_NAME,
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=repository_root / "demo" / "zhaoyun" / "tpose-detailed",
    )
    parser.add_argument(
        "--public-dir",
        type=Path,
        default=repository_root / "public" / "demo" / "zhaoyun" / "tpose-detailed",
    )
    parser.add_argument("--skip-public", action="store_true")
    parser.add_argument("--min-area", type=int, default=DEFAULT_MIN_AREA)
    return parser.parse_args(list(argv))


def main(argv: Iterable[str] = ()) -> int:
    args = parse_args(argv)
    source = args.source.resolve()
    output_dir = args.output_dir.resolve()
    public_dir = None if args.skip_public else args.public_dir.resolve()
    manifest = extract(source, output_dir, public_dir, args.min_area)
    update_asset_manifest(source.parent)
    transparency = manifest["source"]["transparency"]
    checker = manifest["source"]["checkerboard"]
    print(f"Source: {source}")
    print(
        f"Source alpha channel={transparency['hasAlphaChannel']}; "
        f"effective alpha={transparency['effectiveAlphaMin']}..{transparency['effectiveAlphaMax']}; "
        f"baked checkerboard={checker['likelyBakedCheckerboard']}"
    )
    print(
        f"Extracted {manifest['componentCount']} components; "
        f"atlas alpha={manifest['atlas']['alpha']['min']}..{manifest['atlas']['alpha']['max']}; "
        f"foreground pixels={manifest['atlas']['alpha']['nonZeroPixels']}"
    )
    print(f"Output: {output_dir}")
    if public_dir is not None:
        print(f"Web assets: {public_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

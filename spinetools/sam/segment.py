"""V1+ headless segmentation from a standing image and saved prompts.

Implements the contracts in docs/SAM_SPINE_ANIMATION_PIPELINE_DESIGN.zh-CN.md:
- input: standing.png + prompts.json (section 7)
- output: masks/, parts/, rig/component-manifest.json, reports/ (section 9)
- RGBA is always sampled from the original image, never from the
  upscaled inference copy (section 7.1).

Usage:
    python -m spinetools.sam.segment \
        --input standing.png \
        --prompts prompts.json \
        --output output/<run-id>/segments \
        --checkpoint /opt/spinetools/models/sam2.1_hiera_large.pt \
        --device cuda --offline
"""

from __future__ import annotations

import argparse
import json
import os
import time
from typing import Any, Dict, List

import numpy as np
from PIL import Image

from .common import (
    load_rgba,
    make_inference_rgb,
    mask_to_source,
    sha256_array,
    sha256_file,
    validate_source,
    write_json,
)
from .probe import build_predictor

REQUIRED_PROMPT_KEYS = ("name", "box", "positivePoints")


def load_prompts(path: str, source_path: str) -> Dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if data.get("schemaVersion") != 1:
        raise ValueError("prompts.json schemaVersion must be 1")
    actual = sha256_file(source_path)
    expected = data.get("sourceSha256")
    stale = expected is not None and expected != actual
    for part in data["parts"]:
        missing = [k for k in REQUIRED_PROMPT_KEYS if k not in part]
        if missing:
            raise ValueError(f"part {part.get('name')!r} missing keys: {missing}")
    data["_stale"] = stale
    return data


def segment_part(
    predictor,
    part: Dict[str, Any],
    scale: int,
    src_hw,
) -> Dict[str, Any]:
    box = np.array(part["box"], dtype=float) * scale
    pos = np.array(part.get("positivePoints", []), dtype=float).reshape(-1, 2) * scale
    neg = np.array(part.get("negativePoints", []), dtype=float).reshape(-1, 2) * scale
    coords = np.vstack([pos, neg]) if len(neg) else pos
    labels = np.array([1] * len(pos) + [0] * len(neg))
    masks, scores, _ = predictor.predict(
        point_coords=coords if len(coords) else None,
        point_labels=labels if len(coords) else None,
        box=box,
        multimask_output=True,
    )
    idx = int(part.get("candidateIndex", np.argmax(scores)))
    if not 0 <= idx < len(masks):
        raise ValueError(f"{part['name']}: candidateIndex {idx} out of range")
    mask_src = mask_to_source(masks[idx], src_hw)
    return {
        "mask": mask_src,
        "candidateScores": [round(float(s), 4) for s in scores],
        "selectedCandidate": idx,
    }


def remove_small_components(mask: np.ndarray, min_pixels: int = 10) -> np.ndarray:
    """Denoise: drop connected components smaller than min_pixels.

    Keeps legitimately disconnected pieces (e.g. an occluded spear shaft)
    as long as each piece is large enough.
    """
    lbl = np.zeros(mask.shape, np.int32)
    cur = 0
    sizes: Dict[int, int] = {}
    for y0 in range(mask.shape[0]):
        for x0 in np.where(mask[y0] & (lbl[y0] == 0))[0]:
            cur += 1
            stack = [(int(y0), int(x0))]
            lbl[y0, x0] = cur
            sz = 0
            while stack:
                y, x = stack.pop()
                sz += 1
                for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                    if (0 <= ny < mask.shape[0] and 0 <= nx < mask.shape[1]
                            and mask[ny, nx] and lbl[ny, nx] == 0):
                        lbl[ny, nx] = cur
                        stack.append((ny, nx))
            sizes[cur] = sz
    keep = [c for c, s in sizes.items() if s >= min_pixels]
    return np.isin(lbl, keep)


def export_part(
    src: np.ndarray, mask: np.ndarray, name: str, out_masks: str, out_parts: str
) -> Dict[str, Any]:
    """Constrain to source alpha, denoise, crop to sourceBBox, export."""
    mask = mask & (src[..., 3] > 0)
    mask = remove_small_components(mask)
    ys, xs = np.where(mask)
    if len(ys) == 0:
        raise ValueError(f"{name}: empty mask after alpha constraint")
    l, t, r, b = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    mask_img = Image.fromarray(mask.astype(np.uint8) * 255)
    mask_img.save(os.path.join(out_masks, f"{name}.png"))
    rgba = src.copy()
    rgba[..., 3] = np.where(mask, src[..., 3], 0)
    Image.fromarray(rgba[t:b, l:r]).save(os.path.join(out_parts, f"{name}.png"))
    return {
        "sourceBBox": [l, t, r, b],
        "pixelCount": int(mask.sum()),
        "maskSha256": sha256_array(mask.astype(np.uint8)),
        "rgbaSha256": sha256_array(rgba[t:b, l:r]),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="SAM V1 headless segmentation")
    ap.add_argument("--input", required=True)
    ap.add_argument("--prompts", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--model-config", default="configs/sam2.1/sam2.1_hiera_l.yaml")
    ap.add_argument("--device", default="cuda")
    ap.add_argument("--offline", action="store_true")
    args = ap.parse_args()

    if args.offline:
        os.environ.setdefault("HF_HUB_OFFLINE", "1")

    out_masks = os.path.join(args.output, "masks")
    out_parts = os.path.join(args.output, "parts")
    out_rig = os.path.join(args.output, "rig")
    out_reports = os.path.join(args.output, "reports")
    out_source = os.path.join(args.output, "source")
    out_prompts = os.path.join(args.output, "prompts")
    for d in (out_masks, out_parts, out_rig, out_reports, out_source, out_prompts):
        os.makedirs(d, exist_ok=True)

    t0 = time.time()
    prompts = load_prompts(args.prompts, args.input)
    src = load_rgba(args.input)
    src_report = validate_source(src)
    scale = src_report.get("inferenceScale", 1)
    infer = make_inference_rgb(src, scale)

    predictor = build_predictor(args.checkpoint, args.model_config, args.device)
    predictor.set_image(infer)

    src_alpha = src[..., 3] > 0
    components: List[Dict[str, Any]] = []
    masks_by_name: Dict[str, np.ndarray] = {}
    failures = []

    # Pass 1: raw masks for every part.
    raw_masks: Dict[str, np.ndarray] = {}
    seg_info: Dict[str, Dict[str, Any]] = {}
    for part in prompts["parts"]:
        name = part["name"]
        try:
            res = segment_part(predictor, part, scale, src.shape[:2])
            raw_masks[name] = res["mask"]
            seg_info[name] = res
        except Exception as exc:  # noqa: BLE001 - record and continue per-part
            failures.append({"part": name, "error": str(exc)})
            print(f"[v1] {name}: FAILED {exc}")

    # Pass 2: mask refinement - child parts win over parents in overlap zones
    # ("subtract" lists in prompts.json, design doc section 8.3 joint rules).
    for part in prompts["parts"]:
        name = part["name"]
        if name not in raw_masks:
            continue
        mask = raw_masks[name]
        for other in part.get("subtract", []):
            if other in raw_masks:
                mask = mask & ~raw_masks[other]
        masks_by_name[name] = mask & src_alpha

    # Pass 3: export.
    for i, part in enumerate(prompts["parts"]):
        name = part["name"]
        if name not in masks_by_name:
            continue
        try:
            res = seg_info[name]
            meta = export_part(src, masks_by_name[name], name, out_masks, out_parts)
            pivot = part.get("pivotSource")
            comp = {
                "name": name,
                "file": f"../parts/{name}.png",
                "mask": f"../masks/{name}.png",
                "sourceBBox": meta["sourceBBox"],
                "pivotSource": pivot,
                "pivotLocal": (
                    [round(pivot[0] - meta["sourceBBox"][0], 4),
                     round(pivot[1] - meta["sourceBBox"][1], 4)] if pivot else None
                ),
                "parentBone": part.get("parentBone"),
                "zIndex": part.get("zIndex", i),
                "drawGroup": part.get("drawGroup"),
                "reviewStatus": "stale" if prompts["_stale"] else part.get("reviewStatus", "draft"),
                "missingTextureRegions": [],
            }
            components.append(comp)
            print(f"[v1] {name}: {meta['pixelCount']} px, bbox {meta['sourceBBox']}, "
                  f"candidate {res['selectedCandidate']} scores {res['candidateScores']}")
        except Exception as exc:  # noqa: BLE001
            failures.append({"part": name, "error": str(exc)})
            print(f"[v1] {name}: FAILED {exc}")

    # QA: pairwise overlap + source alpha coverage (design section 13.2).
    overlap = {}
    names = list(masks_by_name)
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            a, b = masks_by_name[names[i]], masks_by_name[names[j]]
            inter = int((a & b).sum())
            if inter:
                overlap[f"{names[i]}|{names[j]}"] = inter
    covered = np.zeros_like(src_alpha)
    for m in masks_by_name.values():
        covered |= m
    recall = float((covered & src_alpha).sum() / max(src_alpha.sum(), 1))

    manifest = {
        "schemaVersion": 1,
        "sourceSize": [int(src.shape[1]), int(src.shape[0])],
        "setupOrigin": prompts.get("setupOrigin"),
        "components": components,
    }
    write_json(os.path.join(out_rig, "component-manifest.json"), manifest)

    report = {
        "schemaVersion": 1,
        "stage": "v1-segment",
        "input": os.path.abspath(args.input),
        "inputSha256": sha256_file(args.input),
        "promptsSha256": sha256_file(args.prompts),
        "promptsStale": prompts["_stale"],
        "source": src_report,
        "partCount": len(components),
        "failures": failures,
        "pairwiseOverlapPixels": overlap,
        "sourceAlphaRecall": round(recall, 4),
        "elapsedSeconds": round(time.time() - t0, 2),
    }
    write_json(os.path.join(out_reports, "segmentation-report.json"), report)

    Image.fromarray(src).save(os.path.join(out_source, "standing.png"))
    write_json(os.path.join(out_source, "source-report.json"), src_report)
    with open(args.prompts, encoding="utf-8") as f:
        prompts_raw = json.load(f)
    write_json(os.path.join(out_prompts, "prompts.json"), prompts_raw)

    print(f"[v1] done: {len(components)} parts, alpha recall {recall:.4f}, "
          f"overlaps {len(overlap)}, failures {len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())

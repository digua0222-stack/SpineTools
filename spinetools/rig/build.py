"""V3 rig builder: component-manifest -> skeleton/atlas/Spine 4.2/Setup Pose QA.

Implements the headless CLI contract (design doc section 12, step 3) and the
V3 verification plan (section 14): reassembly with a pixel diff, -15/0/+15
degree joint rotation previews, and explicit missing-texture reporting.

Usage:
    python -m spinetools.rig.build \
        --components output/<run>/rig/component-manifest.json \
        --profile profiles/zhaoyun/prompts.json \
        --output output/<run>

Outputs (design doc section 9): rig/skeleton-layout.json, rig/draw-order.json,
spine/<name>.{json,atlas,png}, preview/{setup-pose,joint-rotation,comparison},
reports/rig-report.json.
"""

from __future__ import annotations

import argparse
import json
import os
from typing import Any, Dict, List

import numpy as np
from PIL import Image

from ..sam.common import load_rgba, sha256_file, write_json
from .atlas import load_parts, make_atlas_text, pack_atlas, verify_regions
from .reassemble import comparison_image, composite, metrics
from .rotation import (
    evaluate_rotation,
    missing_texture_regions,
    rotation_gif_frames,
    strip_poses,
)
from .skeleton import (
    HIP_BONE,
    build_bones,
    compute_draw_order,
    compute_local_transforms,
    make_spine_json,
    movable_bones,
    skeleton_layout,
)

# Quality gate thresholds (design doc section 13.2).
GATE_RECALL = 0.99
GATE_CHANGED_PCT = 0.02
GATE_PSNR_DB = 35.0
GATE_NON_JOINT_OVERLAP_PCT = 0.03
GATE_PART_AREA_PCT = 0.60
LR_PAIRS = ("upper_arm", "forearm", "hand", "thigh", "shin", "foot")


def _load_json(path: str) -> Dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _rel(path: str, root: str) -> str:
    return os.path.relpath(path, root)


def check_lr_independence(masks_dir: str, names: List[str]) -> Dict[str, Any]:
    """Left/right parts must exist separately and not share one mask (13.1)."""
    failures: List[str] = []
    for prefix in LR_PAIRS:
        l, r = f"{prefix}_l", f"{prefix}_r"
        if l not in names or r not in names:
            failures.append(f"missing left/right part: {l}/{r}")
            continue
        ml = os.path.join(masks_dir, f"{l}.png")
        mr = os.path.join(masks_dir, f"{r}.png")
        if os.path.exists(ml) and os.path.exists(mr):
            if np.array_equal(load_rgba(ml), load_rgba(mr)):
                failures.append(f"{l}/{r} share an identical mask")
    return {"pass": not failures, "failures": failures}


def build(args: argparse.Namespace) -> Dict[str, Any]:
    out_root = args.output
    manifest_path = args.components
    run_rig_dir = os.path.dirname(manifest_path)
    source_path = args.source or os.path.join(out_root, "source", "standing.png")

    manifest = _load_json(manifest_path)
    profile = _load_json(args.profile)
    components: List[Dict[str, Any]] = manifest["components"]
    comp_names = [c["name"] for c in components]
    if len(comp_names) != len(set(comp_names)):
        raise ValueError("duplicate component names in manifest")
    setup_origin = manifest.get("setupOrigin") or profile.get("setupOrigin")
    if setup_origin is None:
        raise ValueError("setupOrigin missing in both manifest and profile")

    profile_parts = {p["name"]: p for p in profile["parts"]}
    occluded = {p["name"] for p in profile.get("occludedParts", [])}
    required = [p["name"] for p in profile["parts"] if p["name"] not in occluded]
    missing_parts = sorted(n for n in required if n not in comp_names)

    src = load_rgba(source_path)
    canvas_hw = src.shape[:2]
    if tuple(manifest["sourceSize"]) != (src.shape[1], src.shape[0]):
        raise ValueError("manifest sourceSize does not match source image")

    parts = load_parts(os.path.join(out_root, "parts"), comp_names)

    # Skeleton + Spine export.
    bones = build_bones(components, profile_parts, setup_origin)
    compute_local_transforms(bones)
    draw_order = compute_draw_order(components)
    # Character name: explicit flag > profile's original source stem (the run
    # copy is always renamed standing.png) > source file stem.
    profile_source = os.path.splitext(os.path.basename(profile.get("source", "")))[0]
    name = args.name or profile_source or os.path.splitext(os.path.basename(source_path))[0]

    spine_dir = os.path.join(out_root, "spine")
    preview_dir = os.path.join(out_root, "preview")
    reports_dir = os.path.join(out_root, "reports")
    for d in (run_rig_dir, spine_dir, preview_dir, reports_dir):
        os.makedirs(d, exist_ok=True)

    layout = skeleton_layout(bones)
    write_json(os.path.join(run_rig_dir, "skeleton-layout.json"), layout)
    draw_order_doc = {
        "schemaVersion": 1,
        "order": draw_order,
        "rule": "draw-group rank (back-to-front), then zIndex, then name; template default pending human confirmation",
    }
    write_json(os.path.join(run_rig_dir, "draw-order.json"), draw_order_doc)

    spine_json = make_spine_json(bones, components, draw_order, setup_origin, args.spine_version)
    write_json(os.path.join(spine_dir, f"{name}.json"), spine_json)

    atlas_arr, regions = pack_atlas(parts)
    Image.fromarray(atlas_arr).save(os.path.join(spine_dir, f"{name}.png"))
    with open(os.path.join(spine_dir, f"{name}.atlas"), "w", encoding="utf-8") as f:
        f.write(make_atlas_text(regions, atlas_arr.shape[1], atlas_arr.shape[0], name))
    region_verify = verify_regions(atlas_arr, parts, regions)

    # Setup Pose reassembly + comparison.
    reassembled = composite(canvas_hw, parts, components, draw_order)
    Image.fromarray(reassembled).save(os.path.join(preview_dir, "setup-pose.png"))
    Image.fromarray(comparison_image(src, reassembled)).save(
        os.path.join(preview_dir, "comparison.png")
    )
    reasm_metrics = metrics(src, reassembled)

    # Joint rotation validation.
    comp_by_name = {c["name"]: c for c in components}
    bone_by_name = {b.name: b for b in bones}
    rotation_results = []
    for joint in movable_bones(bones):
        bone = bone_by_name[joint]
        pivot = comp_by_name[joint]["pivotSource"]
        radius = int(max(10, min(30, round(bone.length * 0.75))))
        rotation_results.append(
            evaluate_rotation(
                canvas_hw, parts, components, draw_order, bone, bones, pivot, radius
            )
        )
    pivots = {j: comp_by_name[j]["pivotSource"] for j in movable_bones(bones)}
    frames = rotation_gif_frames(canvas_hw, rotation_results, pivots)
    if frames:
        frames[0].save(
            os.path.join(preview_dir, "joint-rotation.gif"),
            save_all=True,
            append_images=frames[1:],
            duration=500,
            loop=0,
            disposal=2,
        )
    missing_texture = missing_texture_regions(rotation_results)
    crack_findings = [
        {"joint": r["joint"], "angle": int(a), "crackPixels": d["crackPixels"]}
        for r in rotation_results
        for a, d in r["angles"].items()
        if a != "0" and d["crackPixels"] > 0
    ]

    # Quality gates (design doc 13.1/13.2). Review coverage stays a warning
    # unless --strict-review: V3 outputs are exactly what humans review.
    gates: Dict[str, Any] = {}
    gates["requiredPartsPresent"] = {"pass": not missing_parts, "missing": missing_parts}
    gates["alphaRecall"] = {
        "pass": reasm_metrics["recall"] >= GATE_RECALL,
        "value": reasm_metrics["recall"],
        "target": GATE_RECALL,
    }
    gates["changedPixels"] = {
        "pass": reasm_metrics["changedPixelsPct"] <= GATE_CHANGED_PCT,
        "value": reasm_metrics["changedPixelsPct"],
        "target": GATE_CHANGED_PCT,
    }
    psnr = reasm_metrics["psnrDb"]
    gates["psnr"] = {
        "pass": psnr == "inf" or float(psnr) >= GATE_PSNR_DB,
        "value": psnr,
        "target": GATE_PSNR_DB,
    }
    gates["leftRightIndependent"] = check_lr_independence(
        os.path.join(out_root, "masks"), comp_names
    )
    oversized = [
        c["name"]
        for c in components
        if (c["sourceBBox"][2] - c["sourceBBox"][0])
        * (c["sourceBBox"][3] - c["sourceBBox"][1])
        > GATE_PART_AREA_PCT * canvas_hw[0] * canvas_hw[1]
    ]
    gates["noRunawayBBox"] = {"pass": not oversized, "oversized": oversized}

    overlap_info: Dict[str, Any] = {"pass": None, "note": "segmentation-report.json not found"}
    seg_report_path = os.path.join(reports_dir, "segmentation-report.json")
    if os.path.exists(seg_report_path):
        seg = _load_json(seg_report_path)
        total_overlap = int(sum(seg.get("pairwiseOverlapPixels", {}).values()))
        alpha_px = int((src[..., 3] > 0).sum())
        pct = total_overlap / max(alpha_px, 1)
        overlap_info = {
            "pass": pct <= GATE_NON_JOINT_OVERLAP_PCT,
            "value": round(pct, 6),
            "target": GATE_NON_JOINT_OVERLAP_PCT,
        }
    gates["nonJointOverlap"] = overlap_info

    review_pending = sorted(
        c["name"] for c in components if c.get("reviewStatus") != "approved"
    )
    gates["reviewCoverage"] = {
        "pass": not review_pending,
        "pending": review_pending,
        "note": "human review gate; informational unless --strict-review",
    }

    hard_gate_names = [
        "requiredPartsPresent",
        "alphaRecall",
        "changedPixels",
        "psnr",
        "leftRightIndependent",
        "noRunawayBBox",
        "nonJointOverlap",
    ]
    if args.strict_review:
        hard_gate_names.append("reviewCoverage")
    hard_failures = [
        n for n in hard_gate_names if gates[n].get("pass") is False
    ]

    report = {
        "schemaVersion": 1,
        "stage": "v3-rig",
        "inputs": {
            "components": _rel(manifest_path, out_root),
            "componentsSha256": sha256_file(manifest_path),
            "profile": os.path.relpath(os.path.abspath(args.profile), os.getcwd()),
            "profileSha256": sha256_file(args.profile),
            "source": _rel(source_path, out_root),
            "sourceSha256": sha256_file(source_path),
        },
        "skeleton": {
            "boneCount": len(bones),
            "partCount": len(components),
            "helperBones": [b.name for b in bones if b.part_name is None and b.name not in ("root", HIP_BONE)],
            "occludedParts": sorted(occluded),
        },
        "drawOrder": draw_order,
        "atlas": {
            "size": [int(atlas_arr.shape[1]), int(atlas_arr.shape[0])],
            "padding": 2,
            "extrude": 2,
            "regions": regions,
            "pixelExact": region_verify,
            "allPixelExact": all(region_verify.values()),
        },
        "reassembly": reasm_metrics,
        "rotation": {
            "angles": [-15, 0, 15],
            "joints": strip_poses(rotation_results),
            "crackFindings": crack_findings,
            "missingTextureRegions": missing_texture,
            "verdict": "human review required for all movable joints (doc 13.2)",
        },
        "qualityGate": {
            "checks": gates,
            "hardFailures": hard_failures,
            "pass": not hard_failures,
        },
    }
    write_json(os.path.join(reports_dir, "rig-report.json"), report)
    return report


def main() -> int:
    ap = argparse.ArgumentParser(description="V3 rig builder (skeleton/atlas/Spine/Setup Pose QA)")
    ap.add_argument("--components", required=True, help="rig/component-manifest.json from the segment stage")
    ap.add_argument("--profile", required=True, help="prompts.json with joint/pivot data")
    ap.add_argument("--output", required=True, help="run root (contains parts/, masks/, source/)")
    ap.add_argument("--source", default=None, help="standing.png (default: <output>/source/standing.png)")
    ap.add_argument("--name", default=None, help="character name for spine files (default: source stem)")
    ap.add_argument("--spine-version", default="4.2.43")
    ap.add_argument("--strict-review", action="store_true",
                    help="treat unapproved reviewStatus as a hard quality-gate failure")
    args = ap.parse_args()

    report = build(args)
    gate = report["qualityGate"]
    print(
        f"[rig] bones {report['skeleton']['boneCount']}, parts {report['skeleton']['partCount']}, "
        f"recall {report['reassembly']['recall']}, changed {report['reassembly']['changedPixelsPct']}, "
        f"psnr {report['reassembly']['psnrDb']}"
    )
    print(
        f"[rig] rotation: {len(report['rotation']['joints'])} joints, "
        f"crack findings {len(report['rotation']['crackFindings'])}, "
        f"missing-texture regions {len(report['rotation']['missingTextureRegions'])}"
    )
    if gate["pass"]:
        print("[rig] quality gate PASS")
        return 0
    print(f"[rig] quality gate FAIL: {gate['hardFailures']}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

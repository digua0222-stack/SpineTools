#!/usr/bin/env python3
"""Score a See-through export for reconstruction and semantic completeness."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any


ZHAOYUN_GROUPS = {
    "head_core": {"head", "face", "headwear"},
    "hair": {"hair", "hairf", "hairb", "front hair", "back hair"},
    "torso": {"topwear"},
    "hands": {"handwear"},
    "lower_body": {"bottomwear", "legwear", "footwear"},
    "prop": {"objects"},
}
ZHAOYUN_CRITICAL_GROUPS = {"head_core", "lower_body"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Evaluate whether a See-through layer export is worth manual review."
    )
    parser.add_argument("--layer-json", type=Path, required=True)
    parser.add_argument("--metrics", type=Path, required=True)
    parser.add_argument("--profile", choices=("generic", "zhaoyun"), default="generic")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--fail-on-low-quality", action="store_true")
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as file:
        value = json.load(file)
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object: {path}")
    return value


def canonical_label(value: object) -> str:
    label = " ".join(str(value).strip().lower().replace("_", " ").split())
    for suffix in ("-left", "-right", "-l", "-r"):
        if label.endswith(suffix):
            return label[: -len(suffix)]
    return label


def clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def finite_number(value: object, default: float = 0.0) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    return result if math.isfinite(result) else default


def semantic_evaluation(labels: set[str], profile: str) -> dict[str, Any]:
    if profile != "zhaoyun":
        return {
            "groups": {},
            "foundGroups": [],
            "missingGroups": [],
            "missingCriticalGroups": [],
            "coverage": None,
        }

    group_status = {
        group: sorted(labels.intersection(expected))
        for group, expected in ZHAOYUN_GROUPS.items()
    }
    found = [group for group, matches in group_status.items() if matches]
    missing = [group for group, matches in group_status.items() if not matches]
    missing_critical = sorted(ZHAOYUN_CRITICAL_GROUPS.intersection(missing))
    return {
        "groups": group_status,
        "foundGroups": found,
        "missingGroups": missing,
        "missingCriticalGroups": missing_critical,
        "coverage": len(found) / len(group_status),
    }


def broad_layer_warnings(layer_info: dict[str, Any]) -> list[dict[str, Any]]:
    width = max(1, int(layer_info.get("width", 1)))
    height = max(1, int(layer_info.get("height", 1)))
    canvas_area = width * height
    suspicious_labels = {"back hair", "front hair", "head", "face", "topwear"}
    warnings: list[dict[str, Any]] = []
    for layer in layer_info.get("layers", []):
        if not isinstance(layer, dict):
            continue
        label = canonical_label(layer.get("name", ""))
        if label not in suspicious_labels:
            continue
        box_width = max(0, int(layer.get("right", 0)) - int(layer.get("left", 0)))
        box_height = max(0, int(layer.get("bottom", 0)) - int(layer.get("top", 0)))
        ratio = (box_width * box_height) / canvas_area
        threshold = 0.25 if label in {"back hair", "front hair", "head", "face"} else 0.40
        if ratio >= threshold:
            warnings.append(
                {
                    "name": str(layer.get("name", "")),
                    "boundingBoxAreaRatio": round(ratio, 6),
                    "reason": "semantic layer spans an unusually large part of the canvas",
                }
            )
    return warnings


def evaluate(layer_info: dict[str, Any], metrics: dict[str, Any], profile: str) -> dict[str, Any]:
    layers = [layer for layer in layer_info.get("layers", []) if isinstance(layer, dict)]
    labels = {canonical_label(layer.get("name", "")) for layer in layers}
    labels.discard("")
    layer_count = len(layers)
    alpha_recall = finite_number(metrics.get("alpha_recall"))
    psnr = finite_number(metrics.get("gray_composite_psnr_db"))
    changed = finite_number(metrics.get("changed_pixels_over_10_of_255"), 1.0)
    semantic = semantic_evaluation(labels, profile)
    broad = broad_layer_warnings(layer_info)

    thresholds: dict[str, Any] = {
        "minimumLayerCount": 8,
        "minimumAlphaRecall": 0.98,
        "minimumGrayCompositePsnrDb": 24.0,
        "maximumChangedPixelsOver10Of255": 0.08,
    }
    if profile == "zhaoyun":
        thresholds["minimumSemanticGroupCoverage"] = 0.8

    issues: list[str] = []
    if layer_count < thresholds["minimumLayerCount"]:
        issues.append(
            f"only {layer_count} layers; expected at least {thresholds['minimumLayerCount']}"
        )
    if alpha_recall < thresholds["minimumAlphaRecall"]:
        issues.append(
            f"alpha recall {alpha_recall:.4f} is below {thresholds['minimumAlphaRecall']:.2f}"
        )
    if psnr < thresholds["minimumGrayCompositePsnrDb"]:
        issues.append(
            f"reconstruction PSNR {psnr:.2f} dB is below "
            f"{thresholds['minimumGrayCompositePsnrDb']:.1f} dB"
        )
    if changed > thresholds["maximumChangedPixelsOver10Of255"]:
        issues.append(
            f"changed-pixel ratio {changed:.4f} exceeds "
            f"{thresholds['maximumChangedPixelsOver10Of255']:.2f}"
        )
    if profile == "zhaoyun":
        coverage = float(semantic["coverage"])
        if coverage < thresholds["minimumSemanticGroupCoverage"]:
            issues.append(
                f"semantic coverage {coverage:.3f} is below "
                f"{thresholds['minimumSemanticGroupCoverage']:.1f}"
            )
        if semantic["missingCriticalGroups"]:
            issues.append(
                "missing critical semantic groups: "
                + ", ".join(semantic["missingCriticalGroups"])
            )
    warnings: list[str] = []
    if broad:
        warnings.append(
            "suspicious oversized semantic layers: "
            + ", ".join(item["name"] for item in broad)
        )

    layer_score = clamp(layer_count / 18.0)
    recall_score = clamp((alpha_recall - 0.90) / 0.10)
    psnr_score = clamp((psnr - 18.0) / 12.0)
    changed_score = clamp((0.15 - changed) / 0.15)
    if profile == "zhaoyun":
        semantic_score = float(semantic["coverage"])
        score = (
            15.0 * layer_score
            + 20.0 * recall_score
            + 15.0 * psnr_score
            + 10.0 * changed_score
            + 40.0 * semantic_score
        )
    else:
        score = (
            25.0 * layer_score
            + 35.0 * recall_score
            + 25.0 * psnr_score
            + 15.0 * changed_score
        )

    return {
        "schemaVersion": 1,
        "profile": profile,
        "passed": not issues,
        "score": round(score, 2),
        "thresholds": thresholds,
        "observed": {
            "layerCount": layer_count,
            "labels": sorted(labels),
            "alphaRecall": alpha_recall,
            "grayCompositePsnrDb": psnr,
            "changedPixelsOver10Of255": changed,
        },
        "semantic": semantic,
        "suspiciousBroadLayers": broad,
        "issues": issues,
        "warnings": warnings,
        "interpretation": (
            "ranking aid only; manual review is still required for Spine bindability"
        ),
    }


def main() -> None:
    args = parse_args()
    result = evaluate(load_json(args.layer_json), load_json(args.metrics), args.profile)
    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    if args.fail_on_low_quality and not result["passed"]:
        raise SystemExit(3)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Rank quality reports produced by multi-Seed See-through runs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as file:
        value = json.load(file)
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object: {path}")
    return value


def main() -> None:
    args = parse_args()
    root = args.root.resolve()
    entries: list[dict[str, Any]] = []
    for quality_path in sorted(root.glob("*/reconstruction/quality_report.json")):
        quality = load_json(quality_path)
        run_root = quality_path.parent.parent
        run_report_path = run_root / "run_report.json"
        run_report = load_json(run_report_path) if run_report_path.is_file() else {}
        entries.append(
            {
                "run": run_root.name,
                "score": float(quality.get("score", 0.0)),
                "passed": bool(quality.get("passed", False)),
                "preset": run_report.get("preset", run_root.name.split("-seed-", 1)[0]),
                "seed": run_report.get("seed"),
                "resolution": run_report.get("resolution"),
                "steps": run_report.get("steps"),
                "layerCount": quality.get("observed", {}).get("layerCount"),
                "missingCriticalGroups": quality.get("semantic", {}).get(
                    "missingCriticalGroups", []
                ),
                "issues": quality.get("issues", []),
                "qualityReport": str(quality_path.relative_to(root)),
            }
        )
    if not entries:
        raise SystemExit(f"No quality reports found below: {root}")
    entries.sort(key=lambda item: (item["passed"], item["score"]), reverse=True)
    result = {
        "schemaVersion": 1,
        "root": str(root),
        "candidateCount": len(entries),
        "recommendedRun": entries[0]["run"],
        "ranking": entries,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    for index, entry in enumerate(entries, 1):
        status = "PASS" if entry["passed"] else "REVIEW"
        print(
            f"{index:>2}. {entry['run']}: score={entry['score']:.2f} "
            f"status={status} layers={entry['layerCount']}"
        )
    print(f"Ranking: {args.output}")


if __name__ == "__main__":
    main()

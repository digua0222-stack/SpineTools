"""Regression verification for a completed SAM run (design doc section 13.2:
headless replay consistency must be 100%).

Compares the part/mask PNG hashes of a run directory against a fixed
expectation file. AC-01 hardening: extra parts, missing paths, and
source/model/prompts hash mismatches all fail the verification - a partial
or contaminated run must not PASS.

Usage:
    python -m spinetools.sam.verify \
        --run output/v1-five-parts \
        --expected tests/sam/expected-v1-hashes.json
"""

from __future__ import annotations

import argparse
import json
import os
from typing import Any, Dict, List

from .common import sha256_file


def collect_hashes(run_dir: str) -> Dict[str, str]:
    hashes: Dict[str, str] = {}
    for sub in ("parts", "masks"):
        d = os.path.join(run_dir, sub)
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if f.endswith(".png"):
                hashes[f"{sub}/{f}"] = sha256_file(os.path.join(d, f))
    return hashes


def crosscheck_inputs(run_dir: str, exp: Dict[str, Any]) -> List[str]:
    """Fail on source/model/prompts mismatches declared by the expectation."""
    failures: List[str] = []
    source_sha = exp.get("sourceSha256")
    if source_sha:
        source_path = os.path.join(run_dir, "source", "standing.png")
        if not os.path.exists(source_path):
            failures.append("missing source/standing.png for sourceSha256 cross-check")
        elif sha256_file(source_path) != source_sha:
            failures.append("source/standing.png does not match expected sourceSha256")
    report_path = os.path.join(run_dir, "reports", "segmentation-report.json")
    if exp.get("modelSha256") or exp.get("promptsSha256"):
        if not os.path.exists(report_path):
            failures.append("missing reports/segmentation-report.json for config cross-check")
        else:
            with open(report_path, encoding="utf-8") as f:
                report = json.load(f)
            model_sha = exp.get("modelSha256")
            if model_sha and report.get("modelSha256") != model_sha:
                failures.append("run modelSha256 does not match expectation")
            prompts_sha = exp.get("promptsSha256")
            if prompts_sha and report.get("promptsSha256") != prompts_sha:
                failures.append("run promptsSha256 does not match expectation")
    return failures


def main() -> int:
    ap = argparse.ArgumentParser(description="Verify run hashes against expectations")
    ap.add_argument("--run", required=True)
    ap.add_argument("--expected", required=True)
    args = ap.parse_args()

    with open(args.expected, encoding="utf-8") as f:
        exp: Dict[str, Any] = json.load(f)

    actual = collect_hashes(args.run)
    expected_hashes: Dict[str, str] = exp["hashes"]

    missing = sorted(k for k in expected_hashes if k not in actual)
    mismatched = sorted(
        k for k in expected_hashes if k in actual and actual[k] != expected_hashes[k]
    )
    extra = sorted(k for k in actual if k not in expected_hashes)
    input_failures = crosscheck_inputs(args.run, exp)

    result = {
        "run": os.path.abspath(args.run),
        "expected": os.path.abspath(args.expected),
        "modelSha256Expected": exp.get("modelSha256"),
        "total": len(expected_hashes),
        "matched": len(expected_hashes) - len(missing) - len(mismatched),
        "missing": missing,
        "mismatched": mismatched,
        "extra": extra,
        "inputFailures": input_failures,
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))
    ok = not missing and not mismatched and not extra and not input_failures
    print("[verify] PASS" if ok else "[verify] FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

"""Regression verification for rig-stage outputs (design doc 13.2:
headless replay consistency must be 100%).

Compares the deterministic rig outputs of a run directory (skeleton layout,
draw order, Spine JSON/atlas/PNG, previews, rig report) against a fixed
expectation file. The rig report is path- and timestamp-free on purpose so
hashes stay comparable across run directories.

Usage:
    python -m spinetools.rig.verify \
        --run output/<run> \
        --expected tests/sam/expected-zhaoyun-rig-hashes.json
"""

from __future__ import annotations

import argparse
import json
import os
from typing import Any, Dict

from ..sam.common import sha256_file

TRACKED = (
    "rig/skeleton-layout.json",
    "rig/draw-order.json",
    "spine/{name}.json",
    "spine/{name}.atlas",
    "spine/{name}.png",
    "preview/setup-pose.png",
    "preview/comparison.png",
    "preview/joint-rotation.gif",
    "reports/rig-report.json",
)


def collect_hashes(run_dir: str, name: str) -> Dict[str, str]:
    hashes: Dict[str, str] = {}
    for rel in TRACKED:
        path = os.path.join(run_dir, rel.format(name=name))
        if os.path.exists(path):
            hashes[rel.format(name=name)] = sha256_file(path)
    return hashes


def main() -> int:
    ap = argparse.ArgumentParser(description="Verify rig output hashes against expectations")
    ap.add_argument("--run", required=True)
    ap.add_argument("--expected", required=True)
    ap.add_argument("--name", default=None, help="character name (default: expected file's)")
    args = ap.parse_args()

    with open(args.expected, encoding="utf-8") as f:
        exp: Dict[str, Any] = json.load(f)
    name = args.name or exp.get("name", "zhaoyun")

    actual = collect_hashes(args.run, name)
    expected_hashes: Dict[str, str] = exp["hashes"]

    missing = sorted(k for k in expected_hashes if k not in actual)
    mismatched = sorted(
        k for k in expected_hashes if k in actual and actual[k] != expected_hashes[k]
    )
    extra = sorted(k for k in actual if k not in expected_hashes)

    result = {
        "run": os.path.abspath(args.run),
        "expected": os.path.abspath(args.expected),
        "total": len(expected_hashes),
        "matched": len(expected_hashes) - len(missing) - len(mismatched),
        "missing": missing,
        "mismatched": mismatched,
        "extra": extra,
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))
    ok = not missing and not mismatched
    print("[rig-verify] PASS" if ok else "[rig-verify] FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

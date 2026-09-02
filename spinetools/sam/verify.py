"""Regression verification for a completed SAM run (design doc section 13.2:
headless replay consistency must be 100%).

Compares the part/mask PNG hashes of a run directory against a fixed
expectation file. Used by scripts/sam/run-zhaoyun-regression.sh so a fresh
Docker container can prove the validated V0/V1 flow still works.

Usage:
    python -m spinetools.sam.verify \
        --run output/v1-five-parts \
        --expected tests/sam/expected-v1-hashes.json
"""

from __future__ import annotations

import argparse
import json
import os
from typing import Any, Dict

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

    result = {
        "run": os.path.abspath(args.run),
        "expected": os.path.abspath(args.expected),
        "modelSha256Expected": exp.get("modelSha256"),
        "total": len(expected_hashes),
        "matched": len(expected_hashes) - len(missing) - len(mismatched),
        "missing": missing,
        "mismatched": mismatched,
        "extra": extra,
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))
    ok = not missing and not mismatched
    print("[verify] PASS" if ok else "[verify] FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

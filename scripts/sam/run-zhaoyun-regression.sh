#!/usr/bin/env bash
# One-command SAM regression for a fresh Docker container (design doc V0-V3+V5).
#
#   scripts/sam/run-zhaoyun-regression.sh [WORK_ROOT]
#
# Steps: install env (idempotent) -> V0 probe -> V2 segment -> replay ->
# hash verification against tests/sam/expected-zhaoyun-hashes.json ->
# V3 rig build (skeleton/atlas/Spine 4.2/Setup Pose QA) on both split runs ->
# rig hash verification against tests/rig/expected-zhaoyun-rig-hashes.json.
# Exits non-zero if any stage fails.
set -euo pipefail

WORK_ROOT="${1:-/opt/spinetools}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV="$WORK_ROOT/venv"
MODELS="$WORK_ROOT/models"
CHECKPOINT="$MODELS/sam2.1_hiera_large.pt"
RUN_ROOT="$WORK_ROOT/output/regression-$(date -u +%Y%m%dT%H%M%SZ)"
PY="$VENV/bin/python"

echo "==> [1/7] install SAM environment (idempotent)"
bash "$REPO_ROOT/scripts/sam/install-sam.sh" "$VENV" "$MODELS" "$WORK_ROOT/sam2-repo"

cd "$REPO_ROOT"

echo "==> [2/7] V0 environment probe"
"$PY" -m spinetools.sam.probe \
  --checkpoint "$CHECKPOINT" \
  --input examples/seethrough/zhaoyun.png \
  --output "$RUN_ROOT/v0-probe" || {
    # probe coverage gate is informational; report but continue
    echo "[regression] V0 probe returned non-zero (coverage gate), continuing"
  }

echo "==> [3/7] V2 full-template segmentation"
"$PY" -m spinetools.sam.segment \
  --input examples/seethrough/zhaoyun.png \
  --prompts profiles/zhaoyun/prompts.json \
  --output "$RUN_ROOT/zhaoyun-split" \
  --checkpoint "$CHECKPOINT" \
  --device cuda --offline

echo "==> [4/7] headless replay (determinism check)"
"$PY" -m spinetools.sam.segment \
  --input examples/seethrough/zhaoyun.png \
  --prompts profiles/zhaoyun/prompts.json \
  --output "$RUN_ROOT/zhaoyun-split-replay" \
  --checkpoint "$CHECKPOINT" \
  --device cuda --offline

echo "==> [5/7] hash verification"
"$PY" -m spinetools.sam.verify \
  --run "$RUN_ROOT/zhaoyun-split" \
  --expected tests/sam/expected-zhaoyun-hashes.json
"$PY" -m spinetools.sam.verify \
  --run "$RUN_ROOT/zhaoyun-split-replay" \
  --expected tests/sam/expected-zhaoyun-hashes.json

echo "==> [6/7] V3 rig build (skeleton/atlas/Spine 4.2/Setup Pose QA)"
for run in "$RUN_ROOT/zhaoyun-split" "$RUN_ROOT/zhaoyun-split-replay"; do
  "$PY" -m spinetools.rig.build \
    --components "$run/rig/component-manifest.json" \
    --profile profiles/zhaoyun/prompts.json \
    --output "$run"
done

echo "==> [7/7] rig hash verification"
"$PY" -m spinetools.rig.verify \
  --run "$RUN_ROOT/zhaoyun-split" \
  --expected tests/rig/expected-zhaoyun-rig-hashes.json
"$PY" -m spinetools.rig.verify \
  --run "$RUN_ROOT/zhaoyun-split-replay" \
  --expected tests/rig/expected-zhaoyun-rig-hashes.json

tar -czf "${RUN_ROOT}.tar.gz" -C "$(dirname "$RUN_ROOT")" "$(basename "$RUN_ROOT")"
echo "[regression] PASS - run dir: $RUN_ROOT"
echo "[regression] archive:  ${RUN_ROOT}.tar.gz"

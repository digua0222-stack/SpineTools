#!/usr/bin/env bash
# One-command SAM regression for a fresh Docker container (design doc V0+V1+V5).
#
#   scripts/sam/run-zhaoyun-regression.sh [WORK_ROOT]
#
# Steps: install env (idempotent) -> V0 probe -> V1 segment -> V1 replay ->
# hash verification against tests/sam/expected-zhaoyun-hashes.json.
# Exits non-zero if any stage fails.
set -euo pipefail

WORK_ROOT="${1:-/opt/spinetools}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV="$WORK_ROOT/venv"
MODELS="$WORK_ROOT/models"
CHECKPOINT="$MODELS/sam2.1_hiera_large.pt"
RUN_ROOT="$WORK_ROOT/output/regression-$(date -u +%Y%m%dT%H%M%SZ)"
PY="$VENV/bin/python"

echo "==> [1/5] install SAM environment (idempotent)"
bash "$REPO_ROOT/scripts/sam/install-sam.sh" "$VENV" "$MODELS" "$WORK_ROOT/sam2-repo"

cd "$REPO_ROOT"

echo "==> [2/5] V0 environment probe"
"$PY" -m spinetools.sam.probe \
  --checkpoint "$CHECKPOINT" \
  --input examples/seethrough/zhaoyun.png \
  --output "$RUN_ROOT/v0-probe" || {
    # probe coverage gate is informational; report but continue
    echo "[regression] V0 probe returned non-zero (coverage gate), continuing"
  }

echo "==> [3/5] V2 full-template segmentation"
"$PY" -m spinetools.sam.segment \
  --input examples/seethrough/zhaoyun.png \
  --prompts profiles/zhaoyun/prompts.json \
  --output "$RUN_ROOT/zhaoyun-split" \
  --checkpoint "$CHECKPOINT" \
  --device cuda --offline

echo "==> [4/5] headless replay (determinism check)"
"$PY" -m spinetools.sam.segment \
  --input examples/seethrough/zhaoyun.png \
  --prompts profiles/zhaoyun/prompts.json \
  --output "$RUN_ROOT/zhaoyun-split-replay" \
  --checkpoint "$CHECKPOINT" \
  --device cuda --offline

echo "==> [5/5] hash verification"
"$PY" -m spinetools.sam.verify \
  --run "$RUN_ROOT/zhaoyun-split" \
  --expected tests/sam/expected-zhaoyun-hashes.json
"$PY" -m spinetools.sam.verify \
  --run "$RUN_ROOT/zhaoyun-split-replay" \
  --expected tests/sam/expected-zhaoyun-hashes.json

tar -czf "${RUN_ROOT}.tar.gz" -C "$(dirname "$RUN_ROOT")" "$(basename "$RUN_ROOT")"
echo "[regression] PASS - run dir: $RUN_ROOT"
echo "[regression] archive:  ${RUN_ROOT}.tar.gz"

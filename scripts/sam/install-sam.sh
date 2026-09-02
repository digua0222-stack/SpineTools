#!/usr/bin/env bash
# Install the standalone SAM 2 environment (design doc Phase 1).
# Reference environment: Linux + NVIDIA H20. Tested with torch 2.5.1+cu121.
set -euo pipefail

VENV_ROOT="${1:-/opt/spinetools/venv}"
MODEL_DIR="${2:-/opt/spinetools/models}"
SAM2_REPO="${3:-/opt/spinetools/sam2-repo}"
CHECKPOINT="sam2.1_hiera_large.pt"
CKPT_URL="https://dl.fbaipublicfiles.com/segment_anything_2/092824/${CHECKPOINT}"

UV="${UV:-$HOME/.local/bin/uv}"
if [ ! -x "$UV" ]; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  UV="$HOME/.local/bin/uv"
fi

"$UV" venv --python 3.12 "$VENV_ROOT"
"$UV" pip install --python "$VENV_ROOT/bin/python" \
  torch==2.5.1 torchvision==0.20.1 \
  --index-url https://download.pytorch.org/whl/cu121

if [ ! -d "$SAM2_REPO" ]; then
  git clone --depth 1 https://github.com/facebookresearch/sam2.git "$SAM2_REPO"
fi
"$UV" pip install --python "$VENV_ROOT/bin/python" -e "$SAM2_REPO"

mkdir -p "$MODEL_DIR"
if [ ! -f "$MODEL_DIR/$CHECKPOINT" ]; then
  curl -L -o "$MODEL_DIR/$CHECKPOINT" "$CKPT_URL"
fi

echo "SAM environment ready:"
echo "  venv:       $VENV_ROOT"
echo "  checkpoint: $MODEL_DIR/$CHECKPOINT"
echo "Run V0 probe:"
echo "  $VENV_ROOT/bin/python -m spinetools.sam.probe \\"
echo "    --checkpoint $MODEL_DIR/$CHECKPOINT --input <standing.png> --output <dir>"

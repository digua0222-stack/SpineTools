#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMFY_ROOT="${COMFYUI_ROOT:-$HOME/ComfyUI}"
VENV_ROOT=""
JSON_OUT=""
OUTPUT_FORMAT="text"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --comfy-root) COMFY_ROOT="$2"; shift 2 ;;
    --venv-root) VENV_ROOT="$2"; shift 2 ;;
    --json-out) JSON_OUT="$2"; shift 2 ;;
    --json) OUTPUT_FORMAT="json"; shift ;;
    -h|--help)
      echo "Usage: ./scripts/seethrough/recommend-hardware.sh [--comfy-root PATH] [--venv-root PATH] [--json-out FILE] [--json]"
      exit 0 ;;
    *) echo "ERROR: Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$VENV_ROOT" ]]; then
  VENV_ROOT="$COMFY_ROOT/.venv-seethrough"
fi
if [[ -x "$VENV_ROOT/bin/python" ]]; then
  PYTHON="$VENV_ROOT/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON="$(command -v python3)"
elif command -v uv >/dev/null 2>&1; then
  PYTHON="$(uv python find 3.12)"
else
  echo "ERROR: Python 3 was not found. Run install.sh first or provide --venv-root." >&2
  exit 2
fi

arguments=("$SCRIPT_DIR/hardware_recommendation.py" --platform macos --format "$OUTPUT_FORMAT")
[[ -n "$JSON_OUT" ]] && arguments+=(--json-out "$JSON_OUT")
"$PYTHON" "${arguments[@]}"

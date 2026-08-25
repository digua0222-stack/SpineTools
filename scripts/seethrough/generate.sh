#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v uv >/dev/null 2>&1; then
  LAUNCH_PYTHON="$(uv python find 3.12)"
elif command -v python3 >/dev/null 2>&1; then
  LAUNCH_PYTHON="$(command -v python3)"
else
  echo "ERROR: uv or python3 is required. Run install.sh first." >&2
  exit 2
fi

exec "$LAUNCH_PYTHON" "$SCRIPT_DIR/generate.py" "$@"

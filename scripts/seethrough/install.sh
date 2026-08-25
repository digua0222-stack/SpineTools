#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ERROR: install.sh is the macOS installer. Use Install.ps1 on Windows." >&2
  exit 2
fi

for argument in "$@"; do
  if [[ "$argument" == "--dry-run" ]]; then
    if ! command -v python3 >/dev/null 2>&1; then
      echo "ERROR: python3 is required for --dry-run." >&2
      exit 2
    fi
    exec python3 "$SCRIPT_DIR/install_runtime.py" --platform macos "$@"
  fi
done

if ! command -v git >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    brew install git
  else
    echo "ERROR: git is missing. Run 'xcode-select --install' and rerun this script." >&2
    exit 2
  fi
fi

if ! command -v uv >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    brew install uv
  else
    installer="$(mktemp -t uv-installer)"
    trap 'rm -f "$installer"' EXIT
    curl --proto '=https' --tlsv1.2 -LsSf https://astral.sh/uv/install.sh -o "$installer"
    sh "$installer"
    export PATH="$HOME/.local/bin:$PATH"
  fi
fi

uv python install 3.12
BOOTSTRAP_PYTHON="$(uv python find 3.12)"
"$BOOTSTRAP_PYTHON" "$SCRIPT_DIR/install_runtime.py" --platform macos "$@"

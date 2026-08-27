#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKIP_SYSTEM_PACKAGES="false"
DRY_RUN="false"
RUNTIME_ARGS=()

usage() {
  cat <<'EOF'
Usage: ./scripts/seethrough/install-linux.sh [options passed to install_runtime.py]

Linux/NVIDIA installer for the pinned ComfyUI + See-through runtime.

  --skip-system-packages  Do not install git/curl/libGL/glib system packages
  --dry-run               Print and validate the install plan without changes
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-system-packages) SKIP_SYSTEM_PACKAGES="true"; shift ;;
    --dry-run) DRY_RUN="true"; RUNTIME_ARGS+=("$1"); shift ;;
    -h|--help) usage; exit 0 ;;
    *) RUNTIME_ARGS+=("$1"); shift ;;
  esac
done

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "ERROR: install-linux.sh only supports Linux." >&2
  exit 2
fi

run_as_root() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    echo "ERROR: System packages are missing and sudo is unavailable." >&2
    exit 2
  fi
}

if [[ "$SKIP_SYSTEM_PACKAGES" != "true" && "$DRY_RUN" != "true" ]]; then
  if command -v apt-get >/dev/null 2>&1; then
    run_as_root apt-get update
    run_as_root apt-get install -y git curl ca-certificates libgl1 libglib2.0-0
  elif command -v dnf >/dev/null 2>&1; then
    run_as_root dnf install -y git curl ca-certificates mesa-libGL glib2
  elif command -v yum >/dev/null 2>&1; then
    run_as_root yum install -y git curl ca-certificates mesa-libGL glib2
  else
    echo "ERROR: Unsupported package manager. Install git, curl, libGL.so.1, and glib2 first." >&2
    exit 2
  fi
fi

if ! command -v uv >/dev/null 2>&1; then
  if [[ "$DRY_RUN" == "true" ]]; then
    if ! command -v python3 >/dev/null 2>&1; then
      echo "ERROR: python3 is required for --dry-run when uv is absent." >&2
      exit 2
    fi
    exec python3 "$SCRIPT_DIR/install_runtime.py" --platform linux "${RUNTIME_ARGS[@]}"
  fi
  installer="$(mktemp -t uv-installer.XXXXXX)"
  trap 'rm -f "$installer"' EXIT
  curl --proto '=https' --tlsv1.2 -LsSf https://astral.sh/uv/install.sh -o "$installer"
  sh "$installer"
  export PATH="$HOME/.local/bin:$PATH"
fi

uv python install 3.12
BOOTSTRAP_PYTHON="$(uv python find 3.12)"
"$BOOTSTRAP_PYTHON" "$SCRIPT_DIR/install_runtime.py" --platform linux "${RUNTIME_ARGS[@]}"

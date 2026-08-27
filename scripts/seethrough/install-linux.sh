#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKIP_SYSTEM_PACKAGES="false"
DRY_RUN="false"
PYTHON_INSTALL_TIMEOUT="${SEETHROUGH_PYTHON_INSTALL_TIMEOUT:-120}"
PYTHON_INSTALL_RETRIES="${SEETHROUGH_PYTHON_INSTALL_RETRIES:-3}"
PYTHON_INSTALL_MIRROR="${SEETHROUGH_PYTHON_INSTALL_MIRROR:-https://github.com/astral-sh/python-build-standalone/releases/download}"
UV_HTTP_TIMEOUT_VALUE="${UV_HTTP_TIMEOUT:-30}"
UV_HTTP_RETRIES_VALUE="${UV_HTTP_RETRIES:-3}"
RUNTIME_ARGS=()

usage() {
  cat <<'EOF'
Usage: ./scripts/seethrough/install-linux.sh [options passed to install_runtime.py]

Linux/NVIDIA installer for the pinned ComfyUI + See-through runtime.

  --skip-system-packages       Do not install git/curl/tar/libGL/glib packages
  --python-install-timeout N   Seconds allowed per uv Python attempt (default: 120)
  --python-install-retries N   GitHub mirror attempts after the first failure (default: 3)
  --python-install-mirror URL  Python build mirror (default: official Astral GitHub releases)
  --dry-run                    Print and validate the install plan without changes

All other options are forwarded to install_runtime.py.
EOF
}

require_value() {
  local option="$1"
  local value="${2:-}"
  if [[ -z "$value" || "$value" == --* ]]; then
    echo "ERROR: $option requires a value." >&2
    exit 2
  fi
}

is_positive_integer() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]]
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-system-packages)
      SKIP_SYSTEM_PACKAGES="true"
      shift
      ;;
    --python-install-timeout)
      require_value "$1" "${2:-}"
      PYTHON_INSTALL_TIMEOUT="$2"
      shift 2
      ;;
    --python-install-retries)
      require_value "$1" "${2:-}"
      PYTHON_INSTALL_RETRIES="$2"
      shift 2
      ;;
    --python-install-mirror)
      require_value "$1" "${2:-}"
      PYTHON_INSTALL_MIRROR="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
      RUNTIME_ARGS+=("$1")
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      RUNTIME_ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "ERROR: install-linux.sh only supports Linux." >&2
  exit 2
fi
if ! is_positive_integer "$PYTHON_INSTALL_TIMEOUT"; then
  echo "ERROR: --python-install-timeout must be a positive integer." >&2
  exit 2
fi
if ! is_positive_integer "$PYTHON_INSTALL_RETRIES"; then
  echo "ERROR: --python-install-retries must be a positive integer." >&2
  exit 2
fi
if [[ ! "$PYTHON_INSTALL_MIRROR" =~ ^https://github\.com/astral-sh/python-build-standalone/releases/download/?$ ]]; then
  echo "ERROR: --python-install-mirror must be the official Astral GitHub release URL." >&2
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
    run_as_root apt-get install -y \
      ca-certificates coreutils curl git gzip libgl1 libglib2.0-0 tar
  elif command -v dnf >/dev/null 2>&1; then
    run_as_root dnf install -y \
      ca-certificates coreutils curl git gzip glib2 mesa-libGL tar
  elif command -v yum >/dev/null 2>&1; then
    run_as_root yum install -y \
      ca-certificates coreutils curl git gzip glib2 mesa-libGL tar
  else
    echo "ERROR: Unsupported package manager. Install git, curl, tar, libGL.so.1, and glib2 first." >&2
    exit 2
  fi
fi

if [[ "$DRY_RUN" == "true" ]]; then
  if ! command -v python3 >/dev/null 2>&1; then
    echo "ERROR: python3 is required for --dry-run." >&2
    exit 2
  fi
  exec python3 "$SCRIPT_DIR/install_runtime.py" --platform linux "${RUNTIME_ARGS[@]}"
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl is required. Re-run without --skip-system-packages." >&2
  exit 2
fi
if ! command -v timeout >/dev/null 2>&1; then
  echo "ERROR: GNU timeout is required. Install coreutils or re-run without --skip-system-packages." >&2
  exit 2
fi

if ! command -v uv >/dev/null 2>&1; then
  temporary_directory="$(mktemp -d -t seethrough-uv.XXXXXX)"
  trap 'rm -rf -- "$temporary_directory"' EXIT
  installer="$temporary_directory/uv-installer.sh"
  echo "[install] uv from the official Astral installer"
  if ! curl --proto '=https' --tlsv1.2 -LfsS \
    --connect-timeout 10 --max-time 120 --retry 3 \
    https://astral.sh/uv/install.sh -o "$installer"; then
    echo "[fallback] astral.sh uv installer timed out; using the official GitHub release installer."
    curl --proto '=https' --tlsv1.2 -LfsS \
      --connect-timeout 10 --max-time 120 --retry 3 \
      https://github.com/astral-sh/uv/releases/latest/download/uv-installer.sh \
      -o "$installer"
  fi
  UV_NO_MODIFY_PATH=1 sh "$installer"
  export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
fi

UV_BIN="$(command -v uv)"

install_python_attempt() {
  local label="$1"
  local mirror="${2:-}"
  local status
  echo "[python] $label (timeout=${PYTHON_INSTALL_TIMEOUT}s)"
  if [[ -n "$mirror" ]]; then
    if timeout --foreground "${PYTHON_INSTALL_TIMEOUT}s" env \
      UV_HTTP_TIMEOUT="$UV_HTTP_TIMEOUT_VALUE" \
      UV_HTTP_RETRIES="$UV_HTTP_RETRIES_VALUE" \
      UV_PYTHON_INSTALL_MIRROR="$mirror" \
      "$UV_BIN" python install 3.12; then
      return 0
    else
      status=$?
    fi
  elif timeout --foreground "${PYTHON_INSTALL_TIMEOUT}s" env \
    UV_HTTP_TIMEOUT="$UV_HTTP_TIMEOUT_VALUE" \
    UV_HTTP_RETRIES="$UV_HTTP_RETRIES_VALUE" \
    "$UV_BIN" python install 3.12; then
    return 0
  else
    status=$?
  fi
  if [[ "$status" -eq 124 ]]; then
    echo "[python] Download attempt stalled and was stopped after ${PYTHON_INSTALL_TIMEOUT}s." >&2
  else
    echo "[python] Download attempt failed with exit code $status." >&2
  fi
  return "$status"
}

if ! install_python_attempt "trying uv's default Python source"; then
  echo "[fallback] Retrying Python 3.12 from the official Astral python-build-standalone GitHub releases."
  python_ready="false"
  for ((attempt = 1; attempt <= PYTHON_INSTALL_RETRIES; attempt++)); do
    if install_python_attempt \
      "official GitHub mirror attempt $attempt/$PYTHON_INSTALL_RETRIES" \
      "$PYTHON_INSTALL_MIRROR"; then
      python_ready="true"
      break
    fi
  done
  if [[ "$python_ready" != "true" ]]; then
    echo "ERROR: Python 3.12 installation failed after the official GitHub retries." >&2
    exit 1
  fi
fi

BOOTSTRAP_PYTHON="$("$UV_BIN" python find 3.12)"
"$BOOTSTRAP_PYTHON" "$SCRIPT_DIR/install_runtime.py" \
  --platform linux --uv-bin "$UV_BIN" "${RUNTIME_ARGS[@]}"

#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="https://github.com/digua0222-stack/SpineTools.git"
REPO_BRANCH="main"
REPO_ROOT="/opt/SpineTools"
RUNTIME_ROOT="/opt/seethrough"
MODE="install"
SEED="42"
SEED_SPEC="7,23,42,88"
RUN_ID=""
HF_ENDPOINT_VALUE=""
PYTHON_INSTALL_TIMEOUT="120"
PYTHON_INSTALL_RETRIES="3"
BACKGROUND="true"
SKIP_SYSTEM_PACKAGES="false"
DRY_RUN="false"

usage() {
  cat <<'EOF'
Usage: init-fresh-docker.sh [options]

Prepare a fresh Linux NVIDIA Docker, clone/update SpineTools, and launch the
pinned ComfyUI + See-through workflow. The default mode only installs and
verifies the runtime. Background execution survives an SSH disconnect.

  --mode install|probe|screen   install: environment only (default)
                                probe: install/repair + 1-step test
                                screen: install/repair + four-Seed screening
  --repo-root PATH              SpineTools checkout (default: /opt/SpineTools)
  --runtime-root PATH           Runtime/output parent (default: /opt/seethrough)
  --repo-url URL                Git repository URL
  --branch NAME                 Git branch (default: main)
  --run-id NAME                 Session name; generated when omitted
  --seed N                      Probe Seed (default: 42)
  --seeds LIST                  Screen Seeds (default: 7,23,42,88)
  --hf-endpoint URL             Optional Hugging Face endpoint
  --python-install-timeout N    uv Python attempt timeout (default: 120)
  --python-install-retries N    Official fallback attempts (default: 3)
  --skip-system-packages        Do not invoke apt/dnf/yum in this wrapper
  --foreground                  Run interactively instead of nohup
  --dry-run                     Print the validated plan without changing files
  -h, --help                    Show help

Examples:
  bash init-fresh-docker.sh --mode install
  bash init-fresh-docker.sh --mode probe
  bash init-fresh-docker.sh --mode screen --seeds 7,23,42,88
EOF
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 2
}

require_value() {
  local option="$1"
  local value="${2:-}"
  [[ -n "$value" && "$value" != --* ]] || die "$option requires a value."
}

is_positive_integer() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]]
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      require_value "$1" "${2:-}"
      MODE="$2"
      shift 2
      ;;
    --repo-root)
      require_value "$1" "${2:-}"
      REPO_ROOT="$2"
      shift 2
      ;;
    --runtime-root)
      require_value "$1" "${2:-}"
      RUNTIME_ROOT="$2"
      shift 2
      ;;
    --repo-url)
      require_value "$1" "${2:-}"
      REPO_URL="$2"
      shift 2
      ;;
    --branch)
      require_value "$1" "${2:-}"
      REPO_BRANCH="$2"
      shift 2
      ;;
    --run-id)
      require_value "$1" "${2:-}"
      RUN_ID="$2"
      shift 2
      ;;
    --seed)
      require_value "$1" "${2:-}"
      SEED="$2"
      shift 2
      ;;
    --seeds)
      require_value "$1" "${2:-}"
      SEED_SPEC="$2"
      shift 2
      ;;
    --hf-endpoint)
      require_value "$1" "${2:-}"
      HF_ENDPOINT_VALUE="$2"
      shift 2
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
    --skip-system-packages)
      SKIP_SYSTEM_PACKAGES="true"
      shift
      ;;
    --foreground)
      BACKGROUND="false"
      shift
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

[[ "$(uname -s)" == "Linux" ]] || die "This script only supports Linux."
case "$MODE" in
  install | probe | screen) ;;
  *) die "--mode must be install, probe, or screen." ;;
esac
[[ -n "$REPO_ROOT" && "$REPO_ROOT" != "/" ]] || die "--repo-root cannot be /."
[[ -n "$RUNTIME_ROOT" && "$RUNTIME_ROOT" != "/" ]] || die "--runtime-root cannot be /."
[[ -n "$REPO_URL" && "$REPO_URL" != -* ]] || die "--repo-url is invalid."
[[ "$REPO_BRANCH" =~ ^[A-Za-z0-9._/-]+$ ]] || die "--branch contains unsafe characters."
[[ "$SEED" == "0" || "$SEED" =~ ^[1-9][0-9]*$ ]] && ((SEED <= 4294967295)) ||
  die "--seed must be 0-4294967295."
is_positive_integer "$PYTHON_INSTALL_TIMEOUT" || die "--python-install-timeout must be positive."
is_positive_integer "$PYTHON_INSTALL_RETRIES" || die "--python-install-retries must be positive."
if [[ -n "$HF_ENDPOINT_VALUE" ]]; then
  [[ "$HF_ENDPOINT_VALUE" =~ ^https?:// ]] || die "--hf-endpoint must start with http:// or https://."
  [[ "$HF_ENDPOINT_VALUE" != *"://"*"@"* ]] || die "--hf-endpoint must not contain credentials."
fi

IFS=',' read -r -a SEEDS <<<"$SEED_SPEC"
[[ ${#SEEDS[@]} -gt 0 ]] || die "--seeds must not be empty."
declare -A SEEN_SEEDS=()
for seed in "${SEEDS[@]}"; do
  [[ "$seed" == "0" || "$seed" =~ ^[1-9][0-9]*$ ]] && ((seed <= 4294967295)) ||
    die "Every screen Seed must be 0-4294967295: $seed"
  [[ -z "${SEEN_SEEDS[$seed]+present}" ]] || die "Duplicate screen Seed: $seed"
  SEEN_SEEDS["$seed"]="true"
done

if [[ -z "$RUN_ID" ]]; then
  RUN_ID="docker-${MODE}-$(date -u +%Y%m%dT%H%M%SZ)"
fi
[[ "$RUN_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || die "--run-id contains unsafe characters."

COMFY_ROOT="$RUNTIME_ROOT/ComfyUI"
VENV_ROOT="$RUNTIME_ROOT/venv"
OUTPUT_ROOT="$RUNTIME_ROOT/output"
LAUNCH_LOG="$RUNTIME_ROOT/${RUN_ID}.launch.log"
PID_FILE="$RUNTIME_ROOT/${RUN_ID}.pid"

printf '%s\n' "Fresh Docker See-through initialization"
printf '  mode:         %s\n' "$MODE"
printf '  repository:   %s (%s)\n' "$REPO_ROOT" "$REPO_BRANCH"
printf '  runtime:      %s\n' "$RUNTIME_ROOT"
printf '  session:      %s\n' "$RUN_ID"
printf '  background:   %s\n' "$BACKGROUND"
if [[ "$MODE" == "screen" ]]; then
  printf '  screen Seeds: %s\n' "$SEED_SPEC"
fi

if [[ "$DRY_RUN" == "true" ]]; then
  printf '%s\n' "[dry-run] Would install system packages: $([[ "$SKIP_SYSTEM_PACKAGES" == "true" ]] && printf no || printf yes)"
  printf '[dry-run] Would clone/update: %s -> %s\n' "$REPO_URL" "$REPO_ROOT"
  printf '[dry-run] Would launch bootstrap mode=%s at %s\n' "$MODE" "$OUTPUT_ROOT/$RUN_ID"
  exit 0
fi

if [[ "$SKIP_SYSTEM_PACKAGES" != "true" ]]; then
  privilege=()
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    command -v sudo >/dev/null 2>&1 || die "Run as root or install sudo."
    privilege=(sudo)
  fi
  if command -v dnf >/dev/null 2>&1; then
    "${privilege[@]}" dnf install -y git curl ca-certificates tar gzip
  elif command -v yum >/dev/null 2>&1; then
    "${privilege[@]}" yum install -y git curl ca-certificates tar gzip
  elif command -v apt-get >/dev/null 2>&1; then
    "${privilege[@]}" apt-get update
    "${privilege[@]}" env DEBIAN_FRONTEND=noninteractive apt-get install -y \
      git curl ca-certificates tar gzip
  else
    die "No supported package manager found (apt-get, dnf, or yum)."
  fi
fi

command -v git >/dev/null 2>&1 || die "git is unavailable after package setup."
if [[ -d "$REPO_ROOT/.git" ]]; then
  [[ -z "$(git -C "$REPO_ROOT" status --porcelain)" ]] ||
    die "Existing SpineTools checkout has local changes and was left untouched: $REPO_ROOT"
  git -C "$REPO_ROOT" fetch origin "$REPO_BRANCH"
  git -C "$REPO_ROOT" checkout "$REPO_BRANCH"
  git -C "$REPO_ROOT" pull --ff-only origin "$REPO_BRANCH"
elif [[ -e "$REPO_ROOT" ]]; then
  die "$REPO_ROOT exists but is not a Git checkout."
else
  mkdir -p "$(dirname "$REPO_ROOT")"
  git clone --branch "$REPO_BRANCH" --single-branch "$REPO_URL" "$REPO_ROOT"
fi

BOOTSTRAP="$REPO_ROOT/scripts/seethrough/bootstrap-linux.sh"
[[ -f "$BOOTSTRAP" ]] || die "Bootstrap script is missing after checkout: $BOOTSTRAP"
mkdir -p "$OUTPUT_ROOT"

bootstrap_args=(
  --comfy-root "$COMFY_ROOT"
  --venv-root "$VENV_ROOT"
  --output-dir "$OUTPUT_ROOT"
  --python-install-timeout "$PYTHON_INSTALL_TIMEOUT"
  --python-install-retries "$PYTHON_INSTALL_RETRIES"
  --run-id "$RUN_ID"
  --skip-system-packages
)
[[ -n "$HF_ENDPOINT_VALUE" ]] && bootstrap_args+=(--hf-endpoint "$HF_ENDPOINT_VALUE")
case "$MODE" in
  install)
    bootstrap_args+=(--install-only)
    ;;
  probe)
    bootstrap_args+=(--preset probe --seed "$SEED")
    ;;
  screen)
    bootstrap_args+=(--preset screen --seeds "$SEED_SPEC")
    ;;
esac

printf '  repository commit: %s\n' "$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
if [[ "$BACKGROUND" == "false" ]]; then
  printf '%s\n' "[launch] Running in foreground."
  exec bash "$BOOTSTRAP" "${bootstrap_args[@]}"
fi

[[ ! -e "$LAUNCH_LOG" ]] || die "Launch log already exists: $LAUNCH_LOG"
[[ ! -e "$PID_FILE" ]] || die "PID file already exists: $PID_FILE"
nohup bash "$BOOTSTRAP" "${bootstrap_args[@]}" >"$LAUNCH_LOG" 2>&1 &
pid="$!"
printf '%s\n' "$pid" >"$PID_FILE"

printf '%s\n' "[launched] Bootstrap is running in the background."
printf '  PID:          %s\n' "$pid"
printf '  PID file:     %s\n' "$PID_FILE"
printf '  launch log:   %s\n' "$LAUNCH_LOG"
printf '  session root: %s\n' "$OUTPUT_ROOT/$RUN_ID"
printf '\nFollow progress:\n  tail -F %q\n' "$LAUNCH_LOG"
printf '\nCheck process:\n  ps -p %q -o pid,etime,stat,%%cpu,%%mem,cmd\n' "$pid"

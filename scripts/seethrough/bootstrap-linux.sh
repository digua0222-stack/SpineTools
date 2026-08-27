#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

COMFY_ROOT="${COMFYUI_ROOT:-/opt/seethrough/ComfyUI}"
VENV_ROOT="${SEETHROUGH_VENV_ROOT:-/opt/seethrough/venv}"
OUTPUT_ROOT="${SEETHROUGH_OUTPUT_ROOT:-/opt/seethrough/output}"
INPUT_IMAGE="$REPO_ROOT/examples/seethrough/zhaoyun.png"
HF_ENDPOINT_VALUE=""
PRESET_SPEC="probe,balanced"
SEED_SPEC="42"
INSTALL_ONLY="false"
SKIP_SYSTEM_PACKAGES="false"
FORCE_MODELS="false"
SKIP_PLUGIN_CHECKOUT="false"
ONLINE="false"
DRY_RUN="false"
PYTHON_INSTALL_TIMEOUT="120"
PYTHON_INSTALL_RETRIES="3"
QUANT_MODE="none"
GROUP_OFFLOAD="off"
QUALITY_PROFILE="zhaoyun"
PORT="8188"
INFERENCE_TIMEOUT="7200"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
LOG_FILE=""

usage() {
  cat <<'EOF'
Usage: ./scripts/seethrough/bootstrap-linux.sh [options]

One-command bootstrap and test runner for a fresh Linux NVIDIA GPU container.
By default it installs/repairs the pinned runtime, then runs and immediately
archives both the probe and balanced Zhao Yun presets.

  --comfy-root PATH             ComfyUI installation (default: /opt/seethrough/ComfyUI)
  --venv-root PATH              Isolated runtime venv (default: /opt/seethrough/venv)
  --output-dir PATH             Session output root (default: /opt/seethrough/output)
  --input PATH                  Source image (default: bundled Zhao Yun PNG)
  --hf-endpoint URL             Optional Hugging Face endpoint for model downloads
  --preset LIST                 Comma-separated presets; e.g. probe or probe,balanced
  --seed N                      One Seed for every selected preset (default: 42)
  --seeds LIST                  Comma-separated Seeds; e.g. 7,23,42,88
  --quality-profile NAME        generic or zhaoyun (default: zhaoyun)
  --install-only                Install, diagnose, and archive the audit; skip inference
  --python-install-timeout N    Seconds allowed per uv Python attempt (default: 120)
  --python-install-retries N    Official GitHub fallback attempts (default: 3)
  --skip-system-packages        Reuse system packages already in the container
  --force-models                Re-download pinned model snapshots
  --skip-plugin-checkout        Keep the current See-through plugin revision
  --online                      Allow model network access during inference
  --port N                      Temporary ComfyUI port (default: 8188)
  --inference-timeout N         Seconds allowed per inference (default: 7200)
  --run-id NAME                 Safe session directory name (default: UTC timestamp-PID)
  --dry-run                     Validate and print the plan without installing or running

H20-safe defaults are always quant=none and group-offload=off.
Supported presets: probe, pilot, screen, balanced, quality, max.
EOF
}

die() {
  local message="ERROR: $*"
  if [[ -n "${LOG_FILE:-}" ]]; then
    printf '%s\n' "$message" | tee -a "$LOG_FILE" >&2
  else
    printf '%s\n' "$message" >&2
  fi
  exit 2
}

require_value() {
  local option="$1"
  local value="${2:-}"
  if [[ -z "$value" || "$value" == --* ]]; then
    die "$option requires a value."
  fi
}

is_positive_integer() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]]
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --comfy-root)
      require_value "$1" "${2:-}"
      COMFY_ROOT="$2"
      shift 2
      ;;
    --venv-root)
      require_value "$1" "${2:-}"
      VENV_ROOT="$2"
      shift 2
      ;;
    --output-dir)
      require_value "$1" "${2:-}"
      OUTPUT_ROOT="$2"
      shift 2
      ;;
    --input)
      require_value "$1" "${2:-}"
      INPUT_IMAGE="$2"
      shift 2
      ;;
    --hf-endpoint)
      require_value "$1" "${2:-}"
      HF_ENDPOINT_VALUE="$2"
      shift 2
      ;;
    --preset)
      require_value "$1" "${2:-}"
      PRESET_SPEC="$2"
      shift 2
      ;;
    --seed)
      require_value "$1" "${2:-}"
      SEED_SPEC="$2"
      shift 2
      ;;
    --seeds)
      require_value "$1" "${2:-}"
      SEED_SPEC="$2"
      shift 2
      ;;
    --quality-profile)
      require_value "$1" "${2:-}"
      QUALITY_PROFILE="$2"
      shift 2
      ;;
    --install-only)
      INSTALL_ONLY="true"
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
    --skip-system-packages)
      SKIP_SYSTEM_PACKAGES="true"
      shift
      ;;
    --force-models)
      FORCE_MODELS="true"
      shift
      ;;
    --skip-plugin-checkout)
      SKIP_PLUGIN_CHECKOUT="true"
      shift
      ;;
    --online)
      ONLINE="true"
      shift
      ;;
    --port)
      require_value "$1" "${2:-}"
      PORT="$2"
      shift 2
      ;;
    --inference-timeout)
      require_value "$1" "${2:-}"
      INFERENCE_TIMEOUT="$2"
      shift 2
      ;;
    --run-id)
      require_value "$1" "${2:-}"
      RUN_ID="$2"
      shift 2
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

[[ "$(uname -s)" == "Linux" ]] || die "bootstrap-linux.sh only supports Linux."
[[ "$COMFY_ROOT" != "/" && -n "$COMFY_ROOT" ]] || die "--comfy-root cannot be /."
[[ "$VENV_ROOT" != "/" && -n "$VENV_ROOT" ]] || die "--venv-root cannot be /."
[[ "$OUTPUT_ROOT" != "/" && -n "$OUTPUT_ROOT" ]] || die "--output-dir cannot be /."
[[ "$RUN_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || die "--run-id contains unsafe characters."
is_positive_integer "$PYTHON_INSTALL_TIMEOUT" || die "--python-install-timeout must be positive."
is_positive_integer "$PYTHON_INSTALL_RETRIES" || die "--python-install-retries must be positive."
is_positive_integer "$PORT" && ((PORT <= 65535)) || die "--port must be 1-65535."
is_positive_integer "$INFERENCE_TIMEOUT" || die "--inference-timeout must be positive."
if [[ -n "$HF_ENDPOINT_VALUE" ]]; then
  [[ "$HF_ENDPOINT_VALUE" =~ ^https?:// ]] || die "--hf-endpoint must start with http:// or https://."
  [[ "$HF_ENDPOINT_VALUE" != *"://"*"@"* ]] || die "--hf-endpoint must not contain embedded credentials."
  [[ "$HF_ENDPOINT_VALUE" != *"?"* && "$HF_ENDPOINT_VALUE" != *"#"* ]] ||
    die "--hf-endpoint must not contain a query string or fragment."
fi
case "$QUALITY_PROFILE" in
  generic | zhaoyun) ;;
  *) die "--quality-profile must be generic or zhaoyun." ;;
esac

IFS=',' read -r -a PRESETS <<<"$PRESET_SPEC"
[[ ${#PRESETS[@]} -gt 0 ]] || die "--preset must not be empty."
declare -A SEEN_PRESETS=()
for preset in "${PRESETS[@]}"; do
  case "$preset" in
    probe | pilot | screen | balanced | quality | max) ;;
    *) die "Unsupported preset: $preset" ;;
  esac
  [[ -z "${SEEN_PRESETS[$preset]+present}" ]] || die "Duplicate preset: $preset"
  SEEN_PRESETS["$preset"]="true"
done

IFS=',' read -r -a SEEDS <<<"$SEED_SPEC"
[[ ${#SEEDS[@]} -gt 0 ]] || die "--seeds must not be empty."
declare -A SEEN_SEEDS=()
for seed in "${SEEDS[@]}"; do
  [[ "$seed" == "0" || "$seed" =~ ^[1-9][0-9]*$ ]] && ((seed <= 4294967295)) ||
    die "Every Seed must be 0-4294967295: $seed"
  [[ -z "${SEEN_SEEDS[$seed]+present}" ]] || die "Duplicate Seed: $seed"
  SEEN_SEEDS["$seed"]="true"
done

SESSION_ROOT="$OUTPUT_ROOT/$RUN_ID"
if [[ "$DRY_RUN" != "true" ]]; then
  [[ ! -e "$SESSION_ROOT" ]] || die "Session already exists; choose another --run-id: $SESSION_ROOT"
  mkdir -p "$SESSION_ROOT"
  LOG_FILE="$SESSION_ROOT/bootstrap.log"
fi

log() {
  if [[ -n "$LOG_FILE" ]]; then
    printf '%s\n' "$*" | tee -a "$LOG_FILE"
  else
    printf '%s\n' "$*"
  fi
}

run_logged() {
  if [[ -z "$LOG_FILE" ]]; then
    "$@"
    return
  fi
  set +e
  "$@" 2>&1 | tee -a "$LOG_FILE"
  local status="${PIPESTATUS[0]}"
  set -e
  return "$status"
}

report_unhandled_error() {
  local status="$1"
  local line="$2"
  trap - ERR
  log "[failed] Unexpected error at bootstrap-linux.sh:$line (exit $status)."
  exit "$status"
}

trap 'report_unhandled_error "$?" "$LINENO"' ERR

preflight() {
  local disk_probe="$OUTPUT_ROOT"
  local available_kib
  log "[preflight] Linux GPU container"
  log "  kernel: $(uname -srmo)"
  log "  architecture: $(uname -m)"
  [[ "$(uname -m)" == "x86_64" ]] || die "This pinned H20 runtime currently supports Linux x86_64 only."
  if [[ -r /etc/os-release ]]; then
    log "  OS: $(. /etc/os-release && printf '%s' "${PRETTY_NAME:-unknown}")"
  fi
  if command -v apt-get >/dev/null 2>&1; then
    log "  package manager: apt-get"
  elif command -v dnf >/dev/null 2>&1; then
    log "  package manager: dnf"
  elif command -v yum >/dev/null 2>&1; then
    log "  package manager: yum"
  else
    die "No supported package manager found (apt-get, dnf, or yum)."
  fi
  if [[ "$DRY_RUN" != "true" && "$SKIP_SYSTEM_PACKAGES" != "true" && "${EUID:-$(id -u)}" -ne 0 ]] &&
    ! command -v sudo >/dev/null 2>&1; then
    die "System dependency installation requires root or sudo."
  fi
  if ! command -v nvidia-smi >/dev/null 2>&1 || ! nvidia-smi -L >/dev/null 2>&1; then
    if [[ "$DRY_RUN" == "true" ]]; then
      log "  GPU: unavailable (allowed for --dry-run)"
    else
      die "NVIDIA GPU is not visible. Start the container with NVIDIA Container Toolkit/--gpus."
    fi
  else
    log "  GPU: $(nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader | head -n 1)"
  fi
  while [[ ! -e "$disk_probe" && "$disk_probe" != "/" ]]; do
    disk_probe="$(dirname "$disk_probe")"
  done
  available_kib="$(df -Pk "$disk_probe" | awk 'NR == 2 { print $4 }')"
  if [[ "$available_kib" =~ ^[0-9]+$ ]]; then
    log "  free disk: $((available_kib / 1024)) MiB on $disk_probe"
    if ((available_kib < 20 * 1024 * 1024)); then
      log "  WARNING: Less than 20 GiB is free; a fresh model/runtime install may fail."
    fi
  fi
}

capture_environment() {
  local destination="$1"
  mkdir -p "$destination/logs" "$destination/manifests"
  {
    printf 'captured_at_utc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'hostname=%s\n' "$(hostname)"
    printf 'uname=%s\n' "$(uname -a)"
    printf 'repository_commit=%s\n' "$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || printf unknown)"
    printf 'comfyui_commit=%s\n' "$(git -C "$COMFY_ROOT" rev-parse HEAD 2>/dev/null || printf unknown)"
    printf 'plugin_commit=%s\n' "$(git -C "$COMFY_ROOT/custom_nodes/ComfyUI-See-through" rev-parse HEAD 2>/dev/null || printf unknown)"
    printf 'uv=%s\n' "$(uv --version 2>/dev/null || printf unavailable)"
    printf 'python=%s\n' "$("$VENV_ROOT/bin/python" --version 2>&1 || printf unavailable)"
    printf '\n[/etc/os-release]\n'
    [[ -r /etc/os-release ]] && cat /etc/os-release
    printf '\n[nvidia-smi]\n'
    nvidia-smi 2>&1 || true
    printf '\n[disk]\n'
    df -h "$OUTPUT_ROOT" "$COMFY_ROOT" "$VENV_ROOT" 2>&1 || true
    printf '\n[memory]\n'
    free -h 2>&1 || true
  } >"$destination/environment.txt"
  uv pip freeze --python "$VENV_ROOT/bin/python" >"$destination/pip-freeze.txt" 2>&1 || true

  local manifest
  for manifest in \
    "$VENV_ROOT/seethrough-runtime.json" \
    "$VENV_ROOT/seethrough-diagnose.json" \
    "$COMFY_ROOT/models/SeeThrough/seethrough-models.json"; do
    if [[ -f "$manifest" ]]; then
      cp "$manifest" "$destination/manifests/$(basename "$manifest")"
    fi
  done
}

archive_directory() {
  local source_directory="$1"
  local archive_path="$2"
  local partial_path="${archive_path}.partial.$$"
  [[ ! -e "$archive_path" ]] || die "Archive already exists: $archive_path"
  if ! run_logged tar -czf "$partial_path" \
    -C "$(dirname "$source_directory")" "$(basename "$source_directory")"; then
    rm -f -- "$partial_path"
    die "Failed to create archive: $archive_path"
  fi
  mv "$partial_path" "$archive_path" || die "Failed to finalize archive: $archive_path"
}

preflight
if [[ "$DRY_RUN" != "true" ]]; then
  [[ -f "$INPUT_IMAGE" ]] || die "Input image is missing: $INPUT_IMAGE"
fi
log "[plan] session: $SESSION_ROOT"
log "[plan] ComfyUI: $COMFY_ROOT"
log "[plan] venv: $VENV_ROOT"
log "[plan] input: $INPUT_IMAGE"
log "[plan] presets: $PRESET_SPEC; seeds: $SEED_SPEC"
log "[plan] quality profile: $QUALITY_PROFILE"
log "[plan] H20 defaults: quant=$QUANT_MODE, group-offload=$GROUP_OFFLOAD"

install_args=(
  --comfy-root "$COMFY_ROOT"
  --venv-root "$VENV_ROOT"
  --download-models
  --python-install-timeout "$PYTHON_INSTALL_TIMEOUT"
  --python-install-retries "$PYTHON_INSTALL_RETRIES"
)
[[ -n "$HF_ENDPOINT_VALUE" ]] && install_args+=(--hf-endpoint "$HF_ENDPOINT_VALUE")
[[ "$SKIP_SYSTEM_PACKAGES" == "true" ]] && install_args+=(--skip-system-packages)
[[ "$FORCE_MODELS" == "true" ]] && install_args+=(--force-models)
[[ "$SKIP_PLUGIN_CHECKOUT" == "true" ]] && install_args+=(--skip-plugin-checkout)
[[ "$DRY_RUN" == "true" ]] && install_args+=(--dry-run)

run_logged "$SCRIPT_DIR/install-linux.sh" "${install_args[@]}"

if [[ "$DRY_RUN" == "true" ]]; then
  if [[ "$INSTALL_ONLY" != "true" ]]; then
    for preset in "${PRESETS[@]}"; do
      for seed in "${SEEDS[@]}"; do
        run_logged "$SCRIPT_DIR/test-zhaoyun.sh" \
          --preset "$preset" \
          --seed "$seed" \
          --input "$INPUT_IMAGE" \
          --quality-profile "$QUALITY_PROFILE" \
          --comfy-root "$COMFY_ROOT" \
          --venv-root "$VENV_ROOT" \
          --output-dir "$SESSION_ROOT/${preset}-seed-${seed}" \
          --skip-install \
          --quant-mode "$QUANT_MODE" \
          --group-offload "$GROUP_OFFLOAD" \
          --dry-run
      done
    done
  fi
  log "[dry-run] Bootstrap plan validated; no session directory was created."
  exit 0
fi

export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
command -v uv >/dev/null 2>&1 || die "uv was installed but is not available in PATH."
command -v tar >/dev/null 2>&1 || die "tar is unavailable after system dependency installation."

INSTALL_AUDIT="$SESSION_ROOT/install-audit"
capture_environment "$INSTALL_AUDIT"
log "[success] Pinned runtime and models are ready."
cp "$LOG_FILE" "$INSTALL_AUDIT/logs/bootstrap.log"
archive_directory "$INSTALL_AUDIT" "$SESSION_ROOT/install-audit.tar.gz"
log "[archive] $SESSION_ROOT/install-audit.tar.gz"

if [[ "$INSTALL_ONLY" == "true" ]]; then
  log "[done] Install-only bootstrap completed."
  exit 0
fi

for preset in "${PRESETS[@]}"; do
  for seed in "${SEEDS[@]}"; do
    run_directory="$SESSION_ROOT/${preset}-seed-${seed}"
    test_args=(
      --preset "$preset"
      --seed "$seed"
      --input "$INPUT_IMAGE"
      --quality-profile "$QUALITY_PROFILE"
      --comfy-root "$COMFY_ROOT"
      --venv-root "$VENV_ROOT"
      --output-dir "$run_directory"
      --skip-install
      --quant-mode "$QUANT_MODE"
      --group-offload "$GROUP_OFFLOAD"
      --port "$PORT"
      --inference-timeout "$INFERENCE_TIMEOUT"
    )
    [[ "$ONLINE" == "true" ]] && test_args+=(--online)
    run_logged "$SCRIPT_DIR/test-zhaoyun.sh" "${test_args[@]}"
    capture_environment "$run_directory/audit"
    log "[success] $preset seed $seed completed; archiving immediately."
    mkdir -p "$run_directory/logs"
    cp "$LOG_FILE" "$run_directory/logs/bootstrap.log"
    archive_path="$SESSION_ROOT/${preset}-seed-${seed}.tar.gz"
    archive_directory "$run_directory" "$archive_path"
    log "[archive] $archive_path"
  done
done

run_logged "$VENV_ROOT/bin/python" "$SCRIPT_DIR/rank_quality_reports.py" \
  --root "$SESSION_ROOT" \
  --output "$SESSION_ROOT/quality-ranking.json"
log "[quality] $SESSION_ROOT/quality-ranking.json"

log "[done] All requested presets completed: $SESSION_ROOT"

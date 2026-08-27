#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

COMFY_ROOT="${COMFYUI_ROOT:-$HOME/ComfyUI}"
VENV_ROOT=""
INPUT_IMAGE="$REPO_ROOT/examples/seethrough/zhaoyun.png"
OUTPUT_DIRECTORY="$REPO_ROOT/output/zhaoyun-seethrough"
OUTPUT_ARCHIVE=""
OUTPUT_TAR=""
PRESET="pilot"
RESOLUTION=""
DEPTH_RESOLUTION=""
STEPS=""
SEED="42"
ALPHA_MODE="preserve"
QUANT_MODE="none"
if [[ "$(uname -s)" == "Linux" ]]; then
  GROUP_OFFLOAD="off"
else
  GROUP_OFFLOAD="auto"
fi
TBLR_SPLIT="true"
USE_LAMA="false"
HF_ENDPOINT_VALUE=""
INFERENCE_TIMEOUT="7200"
PORT="8188"
OFFLINE="true"
FORCE_MODELS="false"
SKIP_INSTALL="false"
SKIP_PLUGIN_CHECKOUT="false"
IGNORE_VRAM_GUARD="false"
DRY_RUN="false"

usage() {
  cat <<'EOF'
Usage: ./scripts/seethrough/test-zhaoyun.sh [options]

Installs pinned ComfyUI + See-through + models, then runs the bundled Zhao Yun image.

  --preset probe|pilot|screen|balanced|quality|max
                                 512/384/1 through 2048/720/100
  --resolution N                 Override layer resolution (512-2048)
  --depth-resolution N           Override depth resolution (-1 or 64-2048)
  --steps N                      Override inference steps (1-100)
  --seed N                       Seed (0-4294967295)
  --comfy-root PATH              ComfyUI directory
  --venv-root PATH               Isolated See-through environment
  --input PATH                   Override bundled test image
  --output-dir PATH              Export directory
  --archive PATH.zip             Optional exact output archive
  --tar PATH.tar.gz              Optional tar.gz of the complete output directory
  --hf-endpoint URL              Optional Hugging Face mirror
  --alpha-mode preserve|opaque
  --quant-mode none|nf4
  --group-offload auto|on|off
  --port N                       Temporary ComfyUI port
  --inference-timeout N          Inference timeout in seconds
  --no-tblr-split
  --use-lama
  --force-models
  --skip-install                 Reuse an already prepared runtime
  --skip-plugin-checkout
  --ignore-vram-guard
  --online                       Allow network access during generation
  --dry-run                      Validate install/download plan without inference
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --preset) PRESET="$2"; shift 2 ;;
    --resolution) RESOLUTION="$2"; shift 2 ;;
    --depth-resolution) DEPTH_RESOLUTION="$2"; shift 2 ;;
    --steps) STEPS="$2"; shift 2 ;;
    --seed) SEED="$2"; shift 2 ;;
    --comfy-root) COMFY_ROOT="$2"; shift 2 ;;
    --venv-root) VENV_ROOT="$2"; shift 2 ;;
    --input) INPUT_IMAGE="$2"; shift 2 ;;
    --output-dir) OUTPUT_DIRECTORY="$2"; shift 2 ;;
    --archive) OUTPUT_ARCHIVE="$2"; shift 2 ;;
    --tar) OUTPUT_TAR="$2"; shift 2 ;;
    --hf-endpoint) HF_ENDPOINT_VALUE="$2"; shift 2 ;;
    --alpha-mode) ALPHA_MODE="$2"; shift 2 ;;
    --quant-mode) QUANT_MODE="$2"; shift 2 ;;
    --group-offload) GROUP_OFFLOAD="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --inference-timeout) INFERENCE_TIMEOUT="$2"; shift 2 ;;
    --no-tblr-split) TBLR_SPLIT="false"; shift ;;
    --use-lama) USE_LAMA="true"; shift ;;
    --force-models) FORCE_MODELS="true"; shift ;;
    --skip-install) SKIP_INSTALL="true"; shift ;;
    --skip-plugin-checkout) SKIP_PLUGIN_CHECKOUT="true"; shift ;;
    --ignore-vram-guard) IGNORE_VRAM_GUARD="true"; shift ;;
    --online) OFFLINE="false"; shift ;;
    --dry-run) DRY_RUN="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$PRESET" in
  probe)
    : "${RESOLUTION:=512}"; : "${DEPTH_RESOLUTION:=384}"; : "${STEPS:=1}" ;;
  pilot)
    : "${RESOLUTION:=512}"; : "${DEPTH_RESOLUTION:=384}"; : "${STEPS:=4}" ;;
  screen)
    : "${RESOLUTION:=768}"; : "${DEPTH_RESOLUTION:=512}"; : "${STEPS:=30}" ;;
  balanced)
    : "${RESOLUTION:=1024}"; : "${DEPTH_RESOLUTION:=720}"; : "${STEPS:=30}" ;;
  quality)
    : "${RESOLUTION:=1024}"; : "${DEPTH_RESOLUTION:=720}"; : "${STEPS:=50}" ;;
  max)
    : "${RESOLUTION:=2048}"; : "${DEPTH_RESOLUTION:=720}"; : "${STEPS:=100}"
    echo "WARNING: max keeps RGBA generation at 2048/100 but uses depth 720 for H20/cu121 stability. It is not recommended for Seed screening." >&2 ;;
  *) echo "ERROR: invalid --preset" >&2; usage >&2; exit 2 ;;
esac

if [[ ! -f "$INPUT_IMAGE" ]]; then
  echo "ERROR: Zhao Yun test image is missing: $INPUT_IMAGE" >&2
  exit 2
fi
if [[ -z "$VENV_ROOT" ]]; then
  VENV_ROOT="$COMFY_ROOT/.venv-seethrough"
fi

echo "Zhao Yun See-through test"
echo "  preset:           $PRESET"
echo "  input:            $INPUT_IMAGE"
echo "  output:           $OUTPUT_DIRECTORY"
echo "  resolution:       $RESOLUTION"
echo "  depth resolution: $DEPTH_RESOLUTION"
echo "  steps / seed:     $STEPS / $SEED"
echo "  alpha / quant:    $ALPHA_MODE / $QUANT_MODE"
echo "  group offload:    $GROUP_OFFLOAD"

if [[ "$SKIP_INSTALL" != "true" ]]; then
  install_args=(
    --comfy-root "$COMFY_ROOT"
    --venv-root "$VENV_ROOT"
    --download-models
  )
  [[ -n "$HF_ENDPOINT_VALUE" ]] && install_args+=(--hf-endpoint "$HF_ENDPOINT_VALUE")
  [[ "$FORCE_MODELS" == "true" ]] && install_args+=(--force-models)
  [[ "$SKIP_PLUGIN_CHECKOUT" == "true" ]] && install_args+=(--skip-plugin-checkout)
  [[ "$DRY_RUN" == "true" ]] && install_args+=(--dry-run)
  if [[ "$(uname -s)" == "Linux" ]]; then
    "$SCRIPT_DIR/install-linux.sh" "${install_args[@]}"
  else
    "$SCRIPT_DIR/install.sh" "${install_args[@]}"
  fi
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[dry-run] Installation/download and generation plan validated; inference was not started."
  exit 0
fi

runtime_python="$VENV_ROOT/bin/python"
mkdir -p "$OUTPUT_DIRECTORY"
hardware_report="$OUTPUT_DIRECTORY/hardware_report.json"
"$runtime_python" "$SCRIPT_DIR/hardware_recommendation.py" \
  --platform auto \
  --json-out "$hardware_report"

generate_args=(
  --comfy-root "$COMFY_ROOT"
  --venv-root "$VENV_ROOT"
  --input "$INPUT_IMAGE"
  --output-dir "$OUTPUT_DIRECTORY"
  --output-prefix "zhaoyun_${PRESET}_seed_${SEED}"
  --resolution "$RESOLUTION"
  --depth-resolution "$DEPTH_RESOLUTION"
  --steps "$STEPS"
  --seed "$SEED"
  --alpha-mode "$ALPHA_MODE"
  --quant-mode "$QUANT_MODE"
  --group-offload "$GROUP_OFFLOAD"
  --inference-timeout "$INFERENCE_TIMEOUT"
  --port "$PORT"
)
[[ "$TBLR_SPLIT" == "true" ]] && generate_args+=(--tblr-split) || generate_args+=(--no-tblr-split)
[[ "$USE_LAMA" == "true" ]] && generate_args+=(--use-lama) || generate_args+=(--no-use-lama)
[[ "$IGNORE_VRAM_GUARD" == "true" ]] && generate_args+=(--ignore-vram-guard)
[[ "$OFFLINE" == "true" ]] && generate_args+=(--offline) || generate_args+=(--no-offline)
[[ -n "$OUTPUT_ARCHIVE" ]] && generate_args+=(--archive "$OUTPUT_ARCHIVE")
"$SCRIPT_DIR/generate.sh" "${generate_args[@]}"

report_path="$OUTPUT_DIRECTORY/run_report.json"
if [[ ! -f "$report_path" ]]; then
  echo "ERROR: Generation completed without run_report.json: $report_path" >&2
  exit 2
fi
layer_json="$($runtime_python -c 'import json, sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["layerInfo"])' "$report_path")"
reconstruction_directory="$OUTPUT_DIRECTORY/reconstruction"
"$runtime_python" "$SCRIPT_DIR/reconstruct_layers.py" \
  --layer-json "$layer_json" \
  --source "$INPUT_IMAGE" \
  --output-dir "$reconstruction_directory" \
  --title "Zhao Yun See-through $PRESET seed $SEED"

layer_count="$($runtime_python -c 'import json, sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["layerCount"])' "$report_path")"
echo "Zhao Yun test completed."
echo "  layers:     $layer_count"
echo "  hardware:   $hardware_report"
echo "  run report: $report_path"
echo "  comparison: $reconstruction_directory/comparison.png"
echo "  metrics:    $reconstruction_directory/metrics.json"

if [[ -n "$OUTPUT_TAR" ]]; then
  if ! command -v tar >/dev/null 2>&1; then
    echo "ERROR: tar is required for --tar." >&2
    exit 2
  fi
  mkdir -p "$(dirname "$OUTPUT_TAR")"
  output_absolute="$(cd "$(dirname "$OUTPUT_DIRECTORY")" && pwd)/$(basename "$OUTPUT_DIRECTORY")"
  tar_absolute="$(cd "$(dirname "$OUTPUT_TAR")" && pwd)/$(basename "$OUTPUT_TAR")"
  if [[ "$tar_absolute" == "$output_absolute"/* ]]; then
    echo "ERROR: --tar must be outside --output-dir to avoid archiving itself." >&2
    exit 2
  fi
  tar -czf "$OUTPUT_TAR" -C "$(dirname "$output_absolute")" "$(basename "$output_absolute")"
  echo "  tar archive: $OUTPUT_TAR"
fi

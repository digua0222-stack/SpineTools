from __future__ import annotations

import argparse
import json
import shutil
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path


def request_json(url: str, payload: dict | None = None) -> dict:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def build_prompt(image_name: str, prefix: str, resolution: int, depth_resolution: int, steps: int) -> dict:
    return {
        "1": {"class_type": "LoadImage", "inputs": {"image": image_name}},
        "2": {
            "class_type": "SeeThrough_LoadLayerDiffModel",
            "inputs": {
                "model": "seethroughv0.0.2_layerdiff3d",
                "vae_ckpt": "",
                "unet_ckpt": "",
                "quant_mode": "none",
                "cache_tag_embeds": True,
                "group_offload": True,
                "auto_download": False,
            },
        },
        "3": {
            "class_type": "SeeThrough_LoadDepthModel",
            "inputs": {
                "model": "seethroughv0.0.1_marigold",
                "quant_mode": "none",
                "cache_tag_embeds": True,
                "group_offload": True,
                "auto_download": False,
            },
        },
        "4": {
            "class_type": "SeeThrough_GenerateLayers",
            "inputs": {
                "image": ["1", 0],
                "layerdiff_model": ["2", 0],
                "seed": 42,
                "resolution": resolution,
                "num_inference_steps": steps,
            },
        },
        "5": {
            "class_type": "SeeThrough_GenerateDepth",
            "inputs": {
                "layers": ["4", 0],
                "depth_model": ["3", 0],
                "seed": 42,
                "resolution_depth": depth_resolution,
            },
        },
        "6": {
            "class_type": "SeeThrough_PostProcess",
            "inputs": {"layers_depth": ["5", 0], "tblr_split": True, "use_lama": False},
        },
        "7": {
            "class_type": "SeeThrough_SavePSD",
            "inputs": {"parts": ["6", 0], "filename_prefix": prefix},
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run one local-only See-through inference through ComfyUI.")
    parser.add_argument("--server", default="http://127.0.0.1:8188")
    parser.add_argument("--comfy-root", type=Path, required=True)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--resolution", type=int, default=1024)
    parser.add_argument("--depth-resolution", type=int, default=720)
    parser.add_argument("--steps", type=int, default=4)
    parser.add_argument("--timeout", type=int, default=3600)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    if not args.input.is_file():
        raise FileNotFoundError(args.input)
    object_info = request_json(f"{args.server.rstrip('/')}/object_info")
    required = {
        "SeeThrough_LoadLayerDiffModel",
        "SeeThrough_LoadDepthModel",
        "SeeThrough_GenerateLayers",
        "SeeThrough_GenerateDepth",
        "SeeThrough_PostProcess",
        "SeeThrough_SavePSD",
    }
    missing = sorted(required - set(object_info))
    if missing:
        raise RuntimeError(f"See-through nodes are missing: {missing}")

    run_id = uuid.uuid4().hex[:8]
    input_name = f"seethrough_smoke_{run_id}{args.input.suffix.lower()}"
    input_target = args.comfy_root / "input" / input_name
    input_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(args.input, input_target)
    prefix = f"seethrough_smoke_{run_id}"

    prompt = build_prompt(input_name, prefix, args.resolution, args.depth_resolution, args.steps)
    queued = request_json(f"{args.server.rstrip('/')}/prompt", {"prompt": prompt})
    prompt_id = queued["prompt_id"]
    deadline = time.monotonic() + args.timeout
    history = None
    while time.monotonic() < deadline:
        response = request_json(f"{args.server.rstrip('/')}/history/{prompt_id}")
        if prompt_id in response:
            history = response[prompt_id]
            status = history.get("status", {})
            messages = status.get("messages", [])
            execution_error = next(
                (message for message in messages if message and message[0] == "execution_error"), None
            )
            if execution_error:
                raise RuntimeError(json.dumps(execution_error[1], ensure_ascii=False))
            if status.get("completed"):
                break
        time.sleep(5)
    if not history or not history.get("status", {}).get("completed"):
        raise TimeoutError(f"See-through prompt did not complete: {prompt_id}")
    if history.get("status", {}).get("status_str") == "error":
        raise RuntimeError(json.dumps(history.get("status"), ensure_ascii=False))

    output_root = args.comfy_root / "output"
    layer_info = sorted(output_root.glob(f"{prefix}_*_layers.json"), key=lambda path: path.stat().st_mtime)
    if not layer_info:
        raise RuntimeError(f"No layer metadata was produced under {output_root}")
    info_path = layer_info[-1]
    info = json.loads(info_path.read_text("utf-8"))
    if not info.get("layers"):
        raise RuntimeError(f"Layer metadata is empty: {info_path}")

    result = {
        "ok": True,
        "promptId": prompt_id,
        "input": str(args.input),
        "comfyInput": str(input_target),
        "layerInfo": str(info_path),
        "layerCount": len(info["layers"]),
        "resolution": args.resolution,
        "depthResolution": args.depth_resolution,
        "steps": args.steps,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except urllib.error.HTTPError as exc:
        print(exc.read().decode("utf-8", errors="replace"))
        raise

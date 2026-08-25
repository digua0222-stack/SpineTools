from __future__ import annotations

import argparse
import json
import re
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


def build_prompt(
    image_name: str,
    prefix: str,
    resolution: int,
    depth_resolution: int,
    steps: int,
    alpha_mode: str = "preserve",
    seed: int = 42,
    quant_mode: str = "none",
    group_offload: bool = True,
    tblr_split: bool = True,
    use_lama: bool = False,
) -> dict:
    prompt = {
        "1": {"class_type": "LoadImage", "inputs": {"image": image_name}},
        "2": {
            "class_type": "SeeThrough_LoadLayerDiffModel",
            "inputs": {
                "model": "seethroughv0.0.2_layerdiff3d",
                "vae_ckpt": "",
                "unet_ckpt": "",
                "quant_mode": quant_mode,
                "cache_tag_embeds": True,
                "group_offload": group_offload,
                "auto_download": False,
            },
        },
        "3": {
            "class_type": "SeeThrough_LoadDepthModel",
            "inputs": {
                "model": "seethroughv0.0.1_marigold",
                "quant_mode": quant_mode,
                "cache_tag_embeds": True,
                "group_offload": group_offload,
                "auto_download": False,
            },
        },
        "4": {
            "class_type": "SeeThrough_GenerateLayers",
            "inputs": {
                "image": ["8", 0] if alpha_mode == "preserve" else ["1", 0],
                "layerdiff_model": ["2", 0],
                "seed": seed,
                "resolution": resolution,
                "num_inference_steps": steps,
            },
        },
        "5": {
            "class_type": "SeeThrough_GenerateDepth",
            "inputs": {
                "layers": ["4", 0],
                "depth_model": ["3", 0],
                "seed": seed,
                "resolution_depth": depth_resolution,
            },
        },
        "6": {
            "class_type": "SeeThrough_PostProcess",
            "inputs": {"layers_depth": ["5", 0], "tblr_split": tblr_split, "use_lama": use_lama},
        },
        "7": {
            "class_type": "SeeThrough_SavePSD",
            "inputs": {"parts": ["6", 0], "filename_prefix": prefix},
        },
    }
    if alpha_mode == "preserve":
        prompt["8"] = {
            "class_type": "JoinImageWithAlpha",
            "inputs": {"image": ["1", 0], "alpha": ["1", 1]},
        }
    return prompt


def safe_prefix(value: str) -> str:
    normalized = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "_", value.strip())
    normalized = re.sub(r"\s+", "_", normalized).strip("._-")
    if not normalized:
        raise ValueError("Output prefix must contain at least one letter or number")
    return normalized[:80]


def copy_outputs(info_path: Path, info: dict, output_dir: Path, source_input: Path, prefix: str) -> tuple[Path, list[str]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    source_root = info_path.parent
    filenames = [info_path.name]
    for layer in info["layers"]:
        filenames.append(layer["filename"])
        if layer.get("depth_filename"):
            filenames.append(layer["depth_filename"])

    copied: list[str] = []
    for filename in filenames:
        source = source_root / filename
        destination = output_dir / filename
        if source.resolve() != destination.resolve():
            shutil.copy2(source, destination)
        copied.append(str(destination))

    source_destination = output_dir / f"{prefix}_source{source_input.suffix.lower()}"
    if source_input.resolve() != source_destination.resolve():
        shutil.copy2(source_input, source_destination)
    copied.append(str(source_destination))
    return output_dir / info_path.name, copied


def main() -> int:
    parser = argparse.ArgumentParser(description="Run one local-only See-through inference through ComfyUI.")
    parser.add_argument("--server", default="http://127.0.0.1:8188")
    parser.add_argument("--comfy-root", type=Path, required=True)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--resolution", type=int, default=1024)
    parser.add_argument("--depth-resolution", type=int, default=720)
    parser.add_argument("--steps", type=int, default=4)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--alpha-mode", choices=["preserve", "opaque"], default="preserve")
    parser.add_argument("--quant-mode", choices=["none", "nf4"], default="none")
    parser.add_argument("--group-offload", choices=["on", "off"], default="on")
    parser.add_argument("--tblr-split", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--use-lama", action=argparse.BooleanOptionalAction, default=False)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--output-prefix", default="seethrough")
    parser.add_argument("--timeout", type=int, default=3600)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    if not args.input.is_file():
        raise FileNotFoundError(args.input)
    if not 512 <= args.resolution <= 2048:
        raise ValueError("resolution must be between 512 and 2048")
    if args.depth_resolution != -1 and not 64 <= args.depth_resolution <= 2048:
        raise ValueError("depth resolution must be -1 or between 64 and 2048")
    if not 1 <= args.steps <= 100:
        raise ValueError("steps must be between 1 and 100")
    if not 0 <= args.seed <= 2**32 - 1:
        raise ValueError("seed must be between 0 and 4294967295")
    object_info = request_json(f"{args.server.rstrip('/')}/object_info")
    required = {
        "SeeThrough_LoadLayerDiffModel",
        "SeeThrough_LoadDepthModel",
        "SeeThrough_GenerateLayers",
        "SeeThrough_GenerateDepth",
        "SeeThrough_PostProcess",
        "SeeThrough_SavePSD",
    }
    if args.alpha_mode == "preserve":
        required.add("JoinImageWithAlpha")
    missing = sorted(required - set(object_info))
    if missing:
        raise RuntimeError(f"See-through nodes are missing: {missing}")

    run_id = uuid.uuid4().hex[:8]
    input_name = f"seethrough_smoke_{run_id}{args.input.suffix.lower()}"
    input_target = args.comfy_root / "input" / input_name
    input_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(args.input, input_target)
    prefix = f"{safe_prefix(args.output_prefix)}_{args.alpha_mode}_{run_id}"

    prompt = build_prompt(
        input_name,
        prefix,
        args.resolution,
        args.depth_resolution,
        args.steps,
        alpha_mode=args.alpha_mode,
        seed=args.seed,
        quant_mode=args.quant_mode,
        group_offload=args.group_offload == "on",
        tblr_split=args.tblr_split,
        use_lama=args.use_lama,
    )
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

    copied_files: list[str] = []
    if args.output_dir:
        info_path, copied_files = copy_outputs(
            info_path,
            info,
            args.output_dir.expanduser().resolve(),
            args.input.resolve(),
            prefix,
        )

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
        "seed": args.seed,
        "alphaMode": args.alpha_mode,
        "quantMode": args.quant_mode,
        "groupOffload": args.group_offload == "on",
        "tblrSplit": args.tblr_split,
        "useLama": args.use_lama,
        "outputDirectory": str(args.output_dir.expanduser().resolve()) if args.output_dir else str(output_root),
        "outputPrefix": prefix,
        "files": copied_files,
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

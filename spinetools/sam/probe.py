"""V0 environment probe (design doc section 14).

Verifies: GPU + torch + SAM 2.1 checkpoint + headless inference.
Produces: environment manifest, GPU report, model hash, and one probe mask
from a single image with one bbox and one positive point. No browser.

Usage:
    python -m spinetools.sam.probe \
        --checkpoint /opt/spinetools/models/sam2.1_hiera_large.pt \
        --model-config configs/sam2.1/sam2.1_hiera_l.yaml \
        --input examples/seethrough/zhaoyun.png \
        --output output/<run-id>/probe
"""

from __future__ import annotations

import argparse
import os
import time

import numpy as np
from PIL import Image

from .common import (
    env_report,
    load_rgba,
    make_inference_rgb,
    mask_to_source,
    sha256_file,
    validate_source,
    write_json,
)


def build_predictor(checkpoint: str, model_config: str, device: str):
    from sam2.build_sam import build_sam2
    from sam2.sam2_image_predictor import SAM2ImagePredictor

    model = build_sam2(model_config, checkpoint, device=device)
    return SAM2ImagePredictor(model)


def main() -> int:
    ap = argparse.ArgumentParser(description="SAM V0 environment probe")
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--model-config", default="configs/sam2.1/sam2.1_hiera_l.yaml")
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--device", default="cuda")
    args = ap.parse_args()

    os.makedirs(args.output, exist_ok=True)
    t0 = time.time()

    src = load_rgba(args.input)
    src_report = validate_source(src)
    scale = src_report.get("inferenceScale", 1)
    infer = make_inference_rgb(src, scale)

    report = {
        "schemaVersion": 1,
        "stage": "v0-probe",
        "input": os.path.abspath(args.input),
        "inputSha256": sha256_file(args.input),
        "source": src_report,
        "environment": env_report(args.checkpoint, args.device),
    }

    predictor = build_predictor(args.checkpoint, args.model_config, args.device)
    predictor.set_image(infer)

    # Probe: bbox around the whole subject + one positive point at its center.
    alpha = src[..., 3] > 128
    ys, xs = np.where(alpha)
    box = np.array([xs.min(), ys.min(), xs.max(), ys.max()], dtype=float) * scale
    point = np.array([[(xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2]]) * scale
    masks, scores, _ = predictor.predict(
        point_coords=point,
        point_labels=np.array([1]),
        box=box,
        multimask_output=True,
    )
    best = int(np.argmax(scores))
    mask_src = mask_to_source(masks[best], src.shape[:2])
    coverage = float((mask_src & alpha).sum() / max(alpha.sum(), 1))

    Image.fromarray(mask_src.astype(np.uint8) * 255).save(
        os.path.join(args.output, "probe-mask.png")
    )
    report["probe"] = {
        "box": box.tolist(),
        "positivePoint": point[0].tolist(),
        "candidateScores": [round(float(s), 4) for s in scores],
        "selectedCandidate": best,
        "subjectCoverage": round(coverage, 4),
        "elapsedSeconds": round(time.time() - t0, 2),
    }
    write_json(os.path.join(args.output, "probe-report.json"), report)
    print(f"[v0] probe OK, subject coverage {coverage:.4f}, output: {args.output}")
    return 0 if coverage > 0.9 else 1


if __name__ == "__main__":
    raise SystemExit(main())

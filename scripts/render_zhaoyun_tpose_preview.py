#!/usr/bin/env python3
"""Render the real Zhao Yun Motion Rig sequence with the 23 T-Pose parts.

This is a generic JSON/PNG validation renderer. It intentionally produces a
preview GIF and a browser-playable side-by-side VP9 WebM, not a proprietary
.spine project.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MOTION = ROOT / "demo/zhaoyun/zhaoyun.motionrig.json"
DEFAULT_BINDING = ROOT / "demo/zhaoyun/zhaoyun.tpose-bind.json"
DEFAULT_ATLAS = ROOT / "demo/zhaoyun/tpose-detailed/atlas.png"
DEFAULT_VIDEO = ROOT / "demo/zhaoyun/assets/银枪三连刺.mp4"
DEFAULT_GIF = ROOT / "demo/zhaoyun/zhaoyun.tpose-rig.preview.gif"
DEFAULT_WEBM = ROOT / "demo/zhaoyun/zhaoyun.tpose-rig.comparison.webm"
PUBLIC_DIR = ROOT / "public/demo/zhaoyun"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def usable(point: dict[str, Any] | None) -> bool:
    return bool(
        point
        and point.get("visible", True)
        and math.isfinite(float(point["x"]))
        and math.isfinite(float(point["y"]))
    )


def scale_rotation(matrix: np.ndarray) -> tuple[float, float]:
    return float(math.hypot(matrix[0, 0], matrix[1, 0])), float(
        math.atan2(matrix[1, 0], matrix[0, 0])
    )


def linear(scale: float, rotation: float) -> np.ndarray:
    cosine = math.cos(rotation) * scale
    sine = math.sin(rotation) * scale
    return np.array([[cosine, -sine, 0.0], [sine, cosine, 0.0]], dtype=np.float64)


def clamp_scale(part: dict[str, Any], requested: float, default: list[float]) -> float:
    policy = part.get("scale", {})
    minimum = float(policy.get("min", default[0]))
    maximum = float(policy.get("max", default[1]))
    fixed = policy.get("fixed")
    return max(minimum, min(maximum, float(fixed if fixed is not None else requested)))


def solve_part(
    part: dict[str, Any],
    points: dict[str, dict[str, Any]],
    fallback: np.ndarray | None,
    default_scale: list[float],
) -> tuple[np.ndarray | None, str, list[float]]:
    pairs: list[tuple[np.ndarray, np.ndarray, float]] = []
    for anchor in part["anchors"]:
        target = points.get(anchor["node"])
        if usable(target):
            pairs.append(
                (
                    np.asarray(anchor["local"], dtype=np.float64),
                    np.asarray([target["x"], target["y"]], dtype=np.float64),
                    float(anchor.get("weight", 1.0)),
                )
            )
    if not pairs:
        return (fallback.copy(), "fallback", []) if fallback is not None else (None, "unresolved", [])

    weights = np.asarray([pair[2] for pair in pairs], dtype=np.float64)
    local_points = np.stack([pair[0] for pair in pairs])
    world_points = np.stack([pair[1] for pair in pairs])
    local_center = np.average(local_points, axis=0, weights=weights)
    world_center = np.average(world_points, axis=0, weights=weights)

    if len(pairs) >= 2:
        local_delta = local_points - local_center
        world_delta = world_points - world_center
        denominator = float(np.sum(weights[:, None] * local_delta * local_delta))
        a_numerator = float(
            np.sum(
                weights
                * (local_delta[:, 0] * world_delta[:, 0] + local_delta[:, 1] * world_delta[:, 1])
            )
        )
        b_numerator = float(
            np.sum(
                weights
                * (local_delta[:, 0] * world_delta[:, 1] - local_delta[:, 1] * world_delta[:, 0])
            )
        )
        raw_a = a_numerator / denominator if denominator > 1e-9 else 1.0
        raw_b = b_numerator / denominator if denominator > 1e-9 else 0.0
        raw_scale = math.hypot(raw_a, raw_b)
        rotation = math.atan2(raw_b, raw_a) if raw_scale > 1e-9 else 0.0
        matrix = linear(clamp_scale(part, raw_scale, default_scale), rotation)
        status = "solved"
    else:
        fallback_scale, fallback_rotation = scale_rotation(fallback) if fallback is not None else (1.0, 0.0)
        rotation = fallback_rotation
        driver = part.get("driverNodes")
        if driver and usable(points.get(driver[0])) and usable(points.get(driver[1])):
            source = points[driver[0]]
            target = points[driver[1]]
            rotation = math.atan2(target["y"] - source["y"], target["x"] - source["x"]) + float(
                part.get("rotationOffset", 0.0)
            )
        matrix = linear(clamp_scale(part, fallback_scale, default_scale), rotation)
        status = "degraded"

    matrix[:, 2] = world_center - matrix[:, :2] @ local_center
    errors = []
    for local_point, world_point, _weight in pairs:
        projected = matrix[:, :2] @ local_point + matrix[:, 2]
        errors.append(float(np.linalg.norm(projected - world_point)))
    return matrix, status, errors


def alpha_over(canvas: np.ndarray, layer: np.ndarray) -> None:
    alpha = layer[:, :, 3:4].astype(np.float32) / 255.0
    canvas[:, :, :3] = (
        layer[:, :, :3].astype(np.float32) * alpha
        + canvas[:, :, :3].astype(np.float32) * (1.0 - alpha)
    ).astype(np.uint8)
    canvas[:, :, 3:4] = np.maximum(canvas[:, :, 3:4], layer[:, :, 3:4])


def background(width: int, height: int) -> np.ndarray:
    canvas = np.empty((height, width, 4), dtype=np.uint8)
    canvas[:, :, :3] = (20, 18, 15)
    canvas[:, :, 3] = 255
    for x in range(0, width, 48):
        cv2.line(canvas, (x, 0), (x, height), (42, 38, 34, 255), 1)
    for y in range(0, height, 48):
        cv2.line(canvas, (0, y), (width, y), (42, 38, 34, 255), 1)
    return canvas


def render_sequence(
    motion: dict[str, Any],
    binding: dict[str, Any],
    atlas: np.ndarray,
) -> tuple[list[np.ndarray], list[dict[str, Any]]]:
    video = motion["video"]
    width, height = int(video["width"]), int(video["height"])
    default_scale = list(binding.get("settings", {}).get("scaleClamp", [0.35, 1.8]))
    ordered_parts = sorted(binding["parts"], key=lambda part: (part["z"], part["slot"], part["id"]))
    fallback: dict[str, np.ndarray] = {}
    rendered: list[np.ndarray] = []
    metrics: list[dict[str, Any]] = []

    for source_frame in motion["frames"]:
        frame_index = int(source_frame.get("frameIndex", source_frame.get("frame_index", 0)))
        points = source_frame["points"]
        canvas = background(width, height)
        errors: list[float] = []
        statuses: dict[str, int] = {"solved": 0, "degraded": 0, "fallback": 0, "unresolved": 0}
        for part in ordered_parts:
            matrix, status, anchor_errors = solve_part(
                part, points, fallback.get(part["id"]), default_scale
            )
            statuses[status] += 1
            if matrix is None:
                continue
            fallback[part["id"]] = matrix
            errors.extend(anchor_errors)
            x, y, crop_width, crop_height = map(int, part["rect"])
            crop = atlas[y : y + crop_height, x : x + crop_width]
            warped = cv2.warpAffine(
                crop,
                matrix,
                (width, height),
                flags=cv2.INTER_LINEAR,
                borderMode=cv2.BORDER_CONSTANT,
                borderValue=(0, 0, 0, 0),
            )
            alpha_over(canvas, warped)
        frame_rmse = math.sqrt(sum(error * error for error in errors) / len(errors)) if errors else 0.0
        cv2.putText(
            canvas,
            f"Frame {frame_index:03d}  bind RMSE {frame_rmse:4.1f}px",
            (18, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.62,
            (230, 230, 230, 255),
            1,
            cv2.LINE_AA,
        )
        rendered.append(canvas)
        metrics.append({"frameIndex": frame_index, "rmsePx": round(frame_rmse, 4), "statuses": statuses})
    return rendered, metrics


def write_gif(path: Path, frames: list[np.ndarray], fps: float) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    images = []
    for frame in frames:
        rgb = cv2.cvtColor(frame[:, :, :3], cv2.COLOR_BGR2RGB)
        resized = cv2.resize(rgb, (512, 512), interpolation=cv2.INTER_AREA)
        images.append(Image.fromarray(resized).convert("P", palette=Image.Palette.ADAPTIVE, colors=256))
    # GIF stores durations in 10 ms units. Distribute 40/50 ms frames using
    # rounded cumulative timestamps so 24 fps does not silently become 25 fps.
    durations: list[int] = []
    previous_boundary = 0
    for frame_index in range(len(images)):
        boundary = round((frame_index + 1) * 1000 / fps / 10) * 10
        durations.append(boundary - previous_boundary)
        previous_boundary = boundary
    images[0].save(
        path,
        save_all=True,
        append_images=images[1:],
        duration=durations,
        loop=0,
        disposal=2,
        optimize=False,
    )


def write_comparison(
    path: Path,
    source_video: Path,
    rig_frames: list[np.ndarray],
    fps: float,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    capture = cv2.VideoCapture(str(source_video))
    if not capture.isOpened():
        raise RuntimeError(f"Could not open source video: {source_video}")
    writer = cv2.VideoWriter(
        str(path),
        cv2.VideoWriter_fourcc(*"VP90"),
        fps,
        (1024, 512),
    )
    if not writer.isOpened():
        capture.release()
        raise RuntimeError("Could not open the VP9 WebM comparison writer")
    try:
        for frame_index, rig in enumerate(rig_frames):
            ok, source = capture.read()
            if not ok:
                raise RuntimeError(
                    f"Source video ended before comparison frame {frame_index}"
                )
            source = cv2.resize(source, (512, 512), interpolation=cv2.INTER_AREA)
            rig_bgr = cv2.resize(rig[:, :, :3], (512, 512), interpolation=cv2.INTER_AREA)
            cv2.putText(source, "Source video", (16, 494), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)
            cv2.putText(rig_bgr, "23-part binding", (16, 494), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)
            writer.write(np.hstack((source, rig_bgr)))
    finally:
        capture.release()
        writer.release()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--motion", type=Path, default=DEFAULT_MOTION)
    parser.add_argument("--binding", type=Path, default=DEFAULT_BINDING)
    parser.add_argument("--atlas", type=Path, default=DEFAULT_ATLAS)
    parser.add_argument("--video", type=Path, default=DEFAULT_VIDEO)
    parser.add_argument("--gif", type=Path, default=DEFAULT_GIF)
    parser.add_argument("--webm", type=Path, default=DEFAULT_WEBM)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    motion = read_json(args.motion)
    binding = read_json(args.binding)
    atlas = cv2.imdecode(np.fromfile(str(args.atlas), dtype=np.uint8), cv2.IMREAD_UNCHANGED)
    if atlas is None or atlas.ndim != 3 or atlas.shape[2] != 4:
        raise RuntimeError("Expected an RGBA/BGRA component atlas")
    frames, metrics = render_sequence(motion, binding, atlas)
    fps = float(motion["video"]["fps"])
    write_gif(args.gif, frames, fps)
    write_comparison(args.webm, args.video, frames, fps)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(args.gif, PUBLIC_DIR / args.gif.name)
    shutil.copyfile(args.webm, PUBLIC_DIR / args.webm.name)
    print(
        json.dumps(
            {
                "frames": len(frames),
                "fps": fps,
                "gif": str(args.gif),
                "gifBytes": args.gif.stat().st_size,
                "webm": str(args.webm),
                "webmBytes": args.webm.stat().st_size,
                "worstFrame": max(metrics, key=lambda item: item["rmsePx"]),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

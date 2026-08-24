#!/usr/bin/env python3
"""Build a deterministic Motion Rig Lab demo from the Zhao Yun source video.

This is deliberately a local, dependency-light baseline.  A small set of
semantic landmarks on frame zero is propagated through the clip using
forward/backward pyramidal Lucas-Kanade optical flow.  The resulting confidence
scores are intended to drive human review in the editor; they are not presented
as ground truth.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import cv2
import numpy as np


SCHEMA_VERSION = "motion-rig/v1"
TOOL_VERSION = "0.1.0"
VIDEO_NAME = "银枪三连刺.mp4"
TPOS_NAME = "tpos分离部件.png"
PARTS_NAME = "角色立绘拆分_1.png"


@dataclass(frozen=True)
class Node:
    id: str
    label: str
    parent: str | None
    color: str


NODES: tuple[Node, ...] = (
    Node("root", "根节点", None, "#f8fafc"),
    Node("pelvis", "骨盆", "root", "#fb923c"),
    Node("torso", "躯干", "pelvis", "#4ade80"),
    Node("neck", "颈部", "torso", "#4ade80"),
    Node("head", "头部", "neck", "#22d3ee"),
    Node("shoulder_back", "后侧肩", "torso", "#facc15"),
    Node("elbow_back", "后侧肘", "shoulder_back", "#facc15"),
    Node("wrist_back", "后侧腕", "elbow_back", "#facc15"),
    Node("shoulder_front", "前侧肩", "torso", "#f59e0b"),
    Node("elbow_front", "前侧肘", "shoulder_front", "#f59e0b"),
    Node("wrist_front", "前侧腕", "elbow_front", "#f59e0b"),
    Node("hip_back", "后侧髋", "pelvis", "#60a5fa"),
    Node("knee_back", "后侧膝", "hip_back", "#60a5fa"),
    Node("ankle_back", "后侧踝", "knee_back", "#60a5fa"),
    Node("hip_front", "前侧髋", "pelvis", "#818cf8"),
    Node("knee_front", "前侧膝", "hip_front", "#818cf8"),
    Node("ankle_front", "前侧踝", "knee_front", "#818cf8"),
    Node("weapon_tip", "枪尖", "wrist_front", "#f43f5e"),
)


# Demo bootstrap profile measured once on the 768 x 768 first frame.  It is
# intentionally explicit: the computer-vision tracker is reproducible and the
# editor can replace these seeds without changing the interchange schema.
SEED_FRAME_SIZE = (768.0, 768.0)
SEED_POINTS: dict[str, tuple[float, float]] = {
    "root": (329.0, 607.0),
    "pelvis": (326.0, 491.0),
    "torso": (327.0, 425.0),
    "neck": (336.0, 377.0),
    "head": (350.0, 318.0),
    "shoulder_back": (277.0, 399.0),
    "elbow_back": (226.0, 430.0),
    "wrist_back": (211.0, 473.0),
    "shoulder_front": (377.0, 399.0),
    "elbow_front": (406.0, 429.0),
    "wrist_front": (412.0, 458.0),
    "hip_back": (298.0, 493.0),
    "knee_back": (238.0, 557.0),
    "ankle_back": (215.0, 612.0),
    "hip_front": (354.0, 493.0),
    "knee_front": (382.0, 556.0),
    "ankle_front": (393.0, 612.0),
    "weapon_tip": (696.0, 425.0),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def image_metadata(path: Path) -> dict[str, Any]:
    # cv2.imread on Windows is still unreliable for non-ASCII paths in some
    # builds.  imdecode keeps the exact filesystem bytes and is Unicode-safe.
    image = cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_UNCHANGED)
    if image is None:
        raise RuntimeError(f"Cannot read reference image: {path}")
    height, width = image.shape[:2]
    return {
        "file": f"assets/{path.name}",
        "width": int(width),
        "height": int(height),
        "sha256": sha256(path),
    }


def load_video(path: Path) -> tuple[list[np.ndarray], float, int, int]:
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise RuntimeError(f"Cannot open video: {path}")

    fps = float(capture.get(cv2.CAP_PROP_FPS))
    frames: list[np.ndarray] = []
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        frames.append(frame)
    capture.release()

    if not frames:
        raise RuntimeError(f"Video contains no decodable frames: {path}")
    height, width = frames[0].shape[:2]
    if fps <= 0.0:
        raise RuntimeError(f"Video reports an invalid FPS ({fps}): {path}")
    return frames, fps, int(width), int(height)


def local_foreground_support(gray: np.ndarray, x: float, y: float, radius: int = 8) -> float:
    height, width = gray.shape[:2]
    cx, cy = int(round(x)), int(round(y))
    x0, x1 = max(0, cx - radius), min(width, cx + radius + 1)
    y0, y1 = max(0, cy - radius), min(height, cy + radius + 1)
    if x0 >= x1 or y0 >= y1:
        return 0.0
    patch = gray[y0:y1, x0:x1]
    # The source animation has an almost perfectly black background.  A low
    # threshold preserves dark armor edges while excluding compression noise.
    return float(np.mean(patch >= 16))


def clamp_point(point: np.ndarray, width: int, height: int) -> np.ndarray:
    return np.array(
        [
            min(max(float(point[0]), 0.0), float(width - 1)),
            min(max(float(point[1]), 0.0), float(height - 1)),
        ],
        dtype=np.float32,
    )


def track_points(
    frames: list[np.ndarray], width: int, height: int
) -> tuple[list[dict[str, dict[str, Any]]], list[dict[str, Any]]]:
    node_ids = [node.id for node in NODES]
    scale_x = width / SEED_FRAME_SIZE[0]
    scale_y = height / SEED_FRAME_SIZE[1]
    previous = np.array(
        [[SEED_POINTS[node_id][0] * scale_x, SEED_POINTS[node_id][1] * scale_y] for node_id in node_ids],
        dtype=np.float32,
    )

    cv2.setNumThreads(1)
    cv2.setRNGSeed(20260824)
    previous_gray = cv2.cvtColor(frames[0], cv2.COLOR_BGR2GRAY)
    tracked_frames: list[dict[str, dict[str, Any]]] = []
    quality: list[dict[str, Any]] = []

    first_points: dict[str, dict[str, Any]] = {}
    for index, node_id in enumerate(node_ids):
        support = local_foreground_support(previous_gray, *previous[index])
        confidence = min(0.98, 0.82 + 0.16 * support)
        first_points[node_id] = {
            "x": round(float(previous[index][0]), 3),
            "y": round(float(previous[index][1]), 3),
            "confidence": round(confidence, 4),
            "source": "demo_seed",
            "visible": True,
            "locked": False,
        }
    tracked_frames.append(first_points)
    first_confidences = [point["confidence"] for point in first_points.values()]
    quality.append(
        {
            "meanConfidence": round(float(np.mean(first_confidences)), 4),
            "minimumConfidence": round(float(np.min(first_confidences)), 4),
            "lowConfidencePointCount": sum(value < 0.55 for value in first_confidences),
            "maximumDisplacement": 0.0,
        }
    )

    lk_params = {
        "winSize": (31, 31),
        "maxLevel": 4,
        "criteria": (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 40, 0.001),
        "minEigThreshold": 1e-5,
    }

    for frame in frames[1:]:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        start = previous.reshape(-1, 1, 2)
        forward, status_forward, error = cv2.calcOpticalFlowPyrLK(
            previous_gray, gray, start, None, **lk_params
        )
        if forward is None or status_forward is None:
            forward = start.copy()
            status_forward = np.zeros((len(node_ids), 1), dtype=np.uint8)
            error = np.full((len(node_ids), 1), 255.0, dtype=np.float32)
        backward, status_backward, _ = cv2.calcOpticalFlowPyrLK(
            gray, previous_gray, forward, None, **lk_params
        )
        if backward is None or status_backward is None:
            backward = start.copy()
            status_backward = np.zeros((len(node_ids), 1), dtype=np.uint8)

        next_points = np.empty_like(previous)
        frame_points: dict[str, dict[str, Any]] = {}
        confidences: list[float] = []
        displacements: list[float] = []

        for index, node_id in enumerate(node_ids):
            valid = bool(status_forward[index, 0] and status_backward[index, 0])
            candidate = forward[index, 0] if valid else previous[index]
            candidate = clamp_point(candidate, width, height)
            next_points[index] = candidate

            displacement = float(np.linalg.norm(candidate - previous[index]))
            displacements.append(displacement)
            if valid:
                fb_error = float(np.linalg.norm(backward[index, 0] - start[index, 0]))
                lk_error = float(error[index, 0]) if error is not None else 255.0
                support = local_foreground_support(gray, *candidate)
                flow_confidence = math.exp(-fb_error / 4.0) * math.exp(-min(lk_error, 255.0) / 180.0)
                support_confidence = 0.45 + 0.55 * support
                motion_confidence = math.exp(-max(0.0, displacement - 45.0) / 35.0)
                confidence = min(0.995, max(0.02, flow_confidence * support_confidence * motion_confidence))
                source = "opencv_lk"
            else:
                confidence = 0.02
                source = "opencv_lk_fallback"

            confidences.append(confidence)
            frame_points[node_id] = {
                "x": round(float(candidate[0]), 3),
                "y": round(float(candidate[1]), 3),
                "confidence": round(confidence, 4),
                "source": source,
                "visible": valid,
                "locked": False,
            }

        tracked_frames.append(frame_points)
        quality.append(
            {
                "meanConfidence": round(float(np.mean(confidences)), 4),
                "minimumConfidence": round(float(np.min(confidences)), 4),
                "lowConfidencePointCount": sum(value < 0.55 for value in confidences),
                "maximumDisplacement": round(float(np.max(displacements)), 3),
            }
        )
        previous = next_points
        previous_gray = gray

    return tracked_frames, quality


def build_suggestions(quality: list[dict[str, Any]]) -> list[dict[str, Any]]:
    suggestions: list[dict[str, Any]] = []
    for frame_index, metrics in enumerate(quality):
        reasons: list[str] = []
        if metrics["minimumConfidence"] < 0.35:
            reasons.append("minimum-confidence")
        if metrics["lowConfidencePointCount"] >= 3:
            reasons.append("multiple-low-confidence-points")
        if metrics["maximumDisplacement"] > 32.0:
            reasons.append("large-inter-frame-motion")
        if metrics["meanConfidence"] < 0.62:
            reasons.append("low-mean-confidence")
        if not reasons:
            continue
        score = (
            (1.0 - float(metrics["meanConfidence"])) * 0.55
            + min(1.0, float(metrics["lowConfidencePointCount"]) / len(NODES)) * 0.3
            + min(1.0, float(metrics["maximumDisplacement"]) / 64.0) * 0.15
        )
        suggestions.append(
            {
                "frameIndex": frame_index,
                "priority": round(min(1.0, max(0.0, score)), 4),
                "reasons": reasons,
                "status": "open",
            }
        )
    suggestions.sort(key=lambda item: (-item["priority"], item["frameIndex"]))
    return suggestions


def relative_to(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


def build_document(demo_dir: Path) -> tuple[dict[str, Any], list[np.ndarray]]:
    assets_dir = demo_dir / "assets"
    video_path = assets_dir / VIDEO_NAME
    tpose_path = assets_dir / TPOS_NAME
    parts_path = assets_dir / PARTS_NAME
    for required in (video_path, tpose_path, parts_path):
        if not required.is_file():
            raise FileNotFoundError(f"Missing demo asset: {required}")

    frames, fps, width, height = load_video(video_path)
    tracked_frames, quality = track_points(frames, width, height)
    suggestions = build_suggestions(quality)
    frame_records = []
    for frame_index, points in enumerate(tracked_frames):
        frame_records.append(
            {
                "frameIndex": frame_index,
                "timeSeconds": round(frame_index / fps, 6),
                "score": quality[frame_index]["meanConfidence"],
                "points": points,
                "quality": quality[frame_index],
            }
        )

    document: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "project": {
            "id": "zhaoyun-silver-spear-demo",
            "title": "赵云·银枪三连刺",
            "coordinateSystem": "image-pixels-top-left",
        },
        "video": {
            "file": f"assets/{VIDEO_NAME}",
            "width": width,
            "height": height,
            "fps": round(fps, 6),
            "frameCount": len(frames),
            "durationSeconds": round(len(frames) / fps, 6),
            "sha256": sha256(video_path),
        },
        "referenceImages": [
            {"id": "tpose-parts", "role": "tpose-parts", **image_metadata(tpose_path)},
            {"id": "character-parts", "role": "part-inventory", **image_metadata(parts_path)},
        ],
        "skeleton": {
            "id": "zhaoyun-18",
            "nodes": [
                {
                    "name": node.id,
                    "label": node.label,
                    "parent": node.parent,
                    "color": node.color,
                }
                for node in NODES
            ],
            "edges": [[node.parent, node.id] for node in NODES if node.parent is not None],
            "symmetryPairs": [
                ["shoulder_back", "shoulder_front"],
                ["elbow_back", "elbow_front"],
                ["wrist_back", "wrist_front"],
                ["hip_back", "hip_front"],
                ["knee_back", "knee_front"],
                ["ankle_back", "ankle_front"],
            ],
        },
        "frames": frame_records,
        "suggestions": suggestions,
        "generation": {
            "tool": "Motion Rig Lab Zhao Yun baseline",
            "version": TOOL_VERSION,
            "method": "demo-seed-plus-forward-backward-pyramidal-lucas-kanade",
            "seedFrameIndex": 0,
            "deterministic": True,
            "notes": [
                "This baseline is an automatic tracker initialized by a demo-specific seed profile.",
                "Confidence is a review signal, not a calibrated probability or ground-truth accuracy.",
            ],
        },
    }
    return document, frames


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
    )


def write_asset_manifest(demo_dir: Path) -> None:
    assets_dir = demo_dir / "assets"
    manifest = {
        "algorithm": "sha256",
        "files": [
            {
                "path": path.name,
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
            }
            for path in (assets_dir / VIDEO_NAME, assets_dir / TPOS_NAME, assets_dir / PARTS_NAME)
        ],
    }
    write_json(assets_dir / "SHA256SUMS.json", manifest)


def sync_web_assets(
    demo_dir: Path, public_dir: Path, document: dict[str, Any]
) -> dict[str, Any]:
    """Create the three-file, URL-safe payload consumed by the Web demo."""
    source_assets = demo_dir / "assets"
    public_dir.mkdir(parents=True, exist_ok=True)
    video_target = public_dir / "zhaoyun.mp4"
    tpose_target = public_dir / "tpose_parts.png"
    shutil.copyfile(source_assets / VIDEO_NAME, video_target)
    shutil.copyfile(source_assets / TPOS_NAME, tpose_target)

    web_document = copy.deepcopy(document)
    web_document["video"]["file"] = "zhaoyun.mp4"
    # The compact Web payload intentionally includes only references that were
    # copied, so every URI in the public JSON resolves successfully.
    web_document["referenceImages"] = [
        reference
        for reference in web_document["referenceImages"]
        if reference["role"] == "tpose-parts"
    ]
    web_document["referenceImages"][0]["file"] = "tpose_parts.png"
    write_json(public_dir / "zhaoyun.motionrig.json", web_document)
    return web_document


def draw_skeleton(frame: np.ndarray, document: dict[str, Any], frame_index: int) -> np.ndarray:
    canvas = frame.copy()
    points = document["frames"][frame_index]["points"]
    for edge in document["skeleton"]["edges"]:
        source, target = points[edge[0]], points[edge[1]]
        cv2.line(
            canvas,
            (int(round(source["x"])), int(round(source["y"]))),
            (int(round(target["x"])), int(round(target["y"]))),
            (80, 220, 255),
            2,
            cv2.LINE_AA,
        )
    for point in points.values():
        confidence = float(point["confidence"])
        color = (70, 230, 80) if confidence >= 0.55 else (40, 80, 245)
        cv2.circle(
            canvas,
            (int(round(point["x"])), int(round(point["y"]))),
            5,
            color,
            -1,
            cv2.LINE_AA,
        )
    return canvas


def write_contact_sheet(demo_dir: Path, document: dict[str, Any], frames: list[np.ndarray]) -> None:
    indices = np.linspace(0, len(frames) - 1, 9, dtype=int).tolist()
    tiles: list[np.ndarray] = []
    for frame_index in indices:
        overlay = draw_skeleton(frames[frame_index], document, frame_index)
        tile = cv2.resize(overlay, (256, 256), interpolation=cv2.INTER_AREA)
        cv2.putText(
            tile,
            f"frame {frame_index}",
            (8, 22),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 255, 255),
            1,
            cv2.LINE_AA,
        )
        tiles.append(tile)
    sheet = np.vstack([np.hstack(tiles[row : row + 3]) for row in range(0, 9, 3)])
    target = demo_dir / "zhaoyun.prelabels.contact-sheet.png"
    if not cv2.imwrite(str(target), sheet):
        raise RuntimeError(f"Could not write preview: {target}")


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    repository_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--demo-dir",
        type=Path,
        default=repository_root / "demo" / "zhaoyun",
        help="Demo folder containing assets/ (default: %(default)s)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Motion Rig JSON output (default: <demo-dir>/zhaoyun.motionrig.json)",
    )
    parser.add_argument(
        "--skip-preview",
        action="store_true",
        help="Do not generate the nine-frame visual contact sheet.",
    )
    parser.add_argument(
        "--skip-web-assets",
        action="store_true",
        help="Do not sync JSON, MP4 and T-Pose PNG into public/demo/zhaoyun.",
    )
    parser.add_argument(
        "--public-dir",
        type=Path,
        default=repository_root / "public" / "demo" / "zhaoyun",
        help="Web demo output folder (default: %(default)s)",
    )
    return parser.parse_args(list(argv))


def main(argv: Iterable[str] = ()) -> int:
    args = parse_args(argv)
    demo_dir = args.demo_dir.resolve()
    output = (args.output or demo_dir / "zhaoyun.motionrig.json").resolve()
    document, frames = build_document(demo_dir)
    write_json(output, document)
    write_asset_manifest(demo_dir)
    if not args.skip_preview:
        write_contact_sheet(demo_dir, document, frames)
    if not args.skip_web_assets:
        sync_web_assets(demo_dir, args.public_dir.resolve(), document)

    confidence_values = [
        point["confidence"]
        for frame in document["frames"]
        for point in frame["points"].values()
    ]
    print(f"Wrote: {output}")
    print(
        "Video: "
        f"{document['video']['frameCount']} frames, "
        f"{document['video']['width']}x{document['video']['height']} @ "
        f"{document['video']['fps']:.3f} fps"
    )
    print(
        f"Landmarks: {len(NODES)}; confidence mean={np.mean(confidence_values):.4f}, "
        f"min={np.min(confidence_values):.4f}; review suggestions={len(document['suggestions'])}"
    )
    if not args.skip_web_assets:
        print(f"Web demo assets: {args.public_dir.resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

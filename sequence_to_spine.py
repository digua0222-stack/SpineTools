"""Offline image-sequence to Spine JSON/atlas/PNG converter.

This is an independent implementation of the public behavior and exported
file format observed on spine.dawnwindstudio.top v2.3. It does not require the
Spine editor or Spine CLI.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from PIL import Image, ImageChops


SUPPORTED_VERSIONS = ("3.8.75", "4.2.43")
IMAGE_SUFFIXES = {".png", ".webp", ".jpg", ".jpeg", ".bmp"}


@dataclass
class EventSpec:
    name: str
    frame: int


@dataclass
class AnimationGroup:
    group_id: str
    name: str
    fps: float
    frames: list[Image.Image]
    sources: list[str]
    event: EventSpec | None = None


@dataclass
class PackedFrame:
    name: str
    x: int
    y: int
    width: int
    height: int
    group_id: str
    image: Image.Image


def natural_key(path: Path) -> list[int | str]:
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", path.name)]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_rgba(path: Path) -> Image.Image:
    with Image.open(path) as opened:
        return opened.convert("RGBA")


def detect_sheet_grid(image: Image.Image) -> tuple[int, int] | None:
    """Reproduce the useful, exact-divisibility part of the site's detection."""
    width, height = image.size
    if width > 2 * height and width % height == 0:
        return width // height, 1
    if height > 2 * width and height % width == 0:
        return 1, height // width
    for cols in range(2, 21):
        if width % cols:
            continue
        cell_width = width // cols
        for rows in range(2, 21):
            if height % rows:
                continue
            cell_height = height // rows
            if abs(cell_width - cell_height) / max(cell_width, cell_height) < 0.25:
                return cols, rows
    return None


def split_sprite_sheet(image: Image.Image, cols: int, rows: int) -> list[Image.Image]:
    if cols < 1 or rows < 1:
        raise ValueError("sprite-sheet cols and rows must be positive")
    if image.width % cols or image.height % rows:
        raise ValueError(
            f"sprite sheet {image.size} is not evenly divisible by {cols}x{rows}"
        )
    cell_width = image.width // cols
    cell_height = image.height // rows
    frames: list[Image.Image] = []
    for row in range(rows):
        for col in range(cols):
            frame = image.crop(
                (
                    col * cell_width,
                    row * cell_height,
                    (col + 1) * cell_width,
                    (row + 1) * cell_height,
                )
            )
            if frame.getchannel("A").getbbox() is not None:
                frames.append(frame)
    return frames


def image_paths(input_path: Path, pattern: str) -> list[Path]:
    if input_path.is_file():
        if input_path.suffix.lower() not in IMAGE_SUFFIXES:
            raise ValueError(f"unsupported image type: {input_path}")
        return [input_path]
    if not input_path.is_dir():
        raise FileNotFoundError(input_path)
    paths = [
        path
        for path in input_path.glob(pattern)
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    ]
    paths.sort(key=natural_key)
    if not paths:
        raise ValueError(f"no images matched {pattern!r} in {input_path}")
    return paths


def load_group(
    *,
    group_id: str,
    name: str,
    fps: float,
    input_path: Path,
    pattern: str,
    sheet_cols: int | None,
    sheet_rows: int | None,
    auto_sheet: bool,
    event: EventSpec | None,
) -> AnimationGroup:
    if fps <= 0:
        raise ValueError("fps must be greater than zero")
    paths = image_paths(input_path, pattern)
    loaded = [load_rgba(path) for path in paths]
    sources = [str(path) for path in paths]

    if len(loaded) == 1:
        grid: tuple[int, int] | None = None
        if sheet_cols is not None or sheet_rows is not None:
            if sheet_cols is None or sheet_rows is None:
                raise ValueError("both sheet_cols and sheet_rows are required")
            grid = sheet_cols, sheet_rows
        elif auto_sheet:
            grid = detect_sheet_grid(loaded[0])
        if grid is not None:
            loaded = split_sprite_sheet(loaded[0], *grid)

    if not loaded:
        raise ValueError(f"animation {name!r} has no non-empty frames")
    return AnimationGroup(group_id, name, fps, loaded, sources, event)


def pack_frames(
    groups: Iterable[AnimationGroup], columns: int = 10, padding: int = 2
) -> tuple[Image.Image, list[PackedFrame]]:
    if columns < 1:
        raise ValueError("columns must be positive")
    if padding < 0:
        raise ValueError("padding cannot be negative")
    flattened = [(group, frame) for group in groups for frame in group.frames]
    if not flattened:
        raise ValueError("there are no frames to pack")

    max_width = max(frame.width for _, frame in flattened)
    max_height = max(frame.height for _, frame in flattened)
    rows = math.ceil(len(flattened) / columns)
    atlas_width = columns * max_width + (columns + 1) * padding
    atlas_height = rows * max_height + (rows + 1) * padding
    atlas = Image.new("RGBA", (atlas_width, atlas_height), (0, 0, 0, 0))

    packed: list[PackedFrame] = []
    for index, (group, frame) in enumerate(flattened):
        row, col = divmod(index, columns)
        x = padding + col * (max_width + padding) + (max_width - frame.width) // 2
        y = padding + row * (max_height + padding) + (max_height - frame.height) // 2
        atlas.alpha_composite(frame, (x, y))
        packed.append(
            PackedFrame(
                name=f"frame_{index}",
                x=x,
                y=y,
                width=frame.width,
                height=frame.height,
                group_id=group.group_id,
                image=frame,
            )
        )
    return atlas, packed


def make_atlas_text(frames: Iterable[PackedFrame], width: int, height: int, name: str) -> str:
    text = (
        f"\n{name}.png\n"
        f"size: {width},{height}\n"
        "format: RGBA8888\n"
        "filter: Linear,Linear\n"
        "repeat: none\n"
    )
    for frame in frames:
        text += (
            f"{frame.name}\n"
            "  rotate: false\n"
            f"  xy: {frame.x}, {frame.y}\n"
            f"  size: {frame.width}, {frame.height}\n"
            f"  orig: {frame.width}, {frame.height}\n"
            "  offset: 0, 0\n"
            "  index: -1\n"
        )
    return text


def make_spine_json(
    frames: list[PackedFrame], groups: list[AnimationGroup], spine_version: str
) -> dict[str, Any]:
    skeleton: dict[str, Any] = {
        "skeleton": {
            "hash": " ",
            "spine": spine_version,
            "x": 0,
            "y": 0,
            "width": 0,
            "height": 0,
            "images": "./",
            "audio": "",
        },
        "bones": [{"name": "root"}],
        "slots": [{"name": "frame", "bone": "root", "attachment": "frame_0"}],
        "skins": [{"name": "default", "attachments": {"frame": {}}}],
        "animations": {},
    }

    event_names = list(
        dict.fromkeys(group.event.name for group in groups if group.event and group.event.name)
    )
    if event_names:
        skeleton["events"] = {name: {} for name in event_names}

    attachments = skeleton["skins"][0]["attachments"]["frame"]
    for frame in frames:
        attachments[frame.name] = {
            "x": 0,
            "y": 0,
            "width": frame.width,
            "height": frame.height,
        }

    seen_animation_names: set[str] = set()
    for group in groups:
        if group.name in seen_animation_names:
            raise ValueError(f"duplicate animation name: {group.name}")
        seen_animation_names.add(group.name)
        group_frames = [frame for frame in frames if frame.group_id == group.group_id]
        step = 1.0 / group.fps
        def json_number(value: float) -> int | float:
            return int(value) if value.is_integer() else value

        timeline = [
            {"time": json_number(index * step), "name": frame.name}
            for index, frame in enumerate(group_frames)
        ]
        timeline.append(
            {"time": json_number(len(group_frames) * step), "name": group_frames[0].name}
        )
        animation: dict[str, Any] = {"slots": {"frame": {"attachment": timeline}}}
        if group.event and group.event.name:
            event_time = (group.event.frame - 1) * step
            if 0 <= event_time < len(group_frames) * step:
                animation["events"] = [
                    {"time": json_number(event_time), "name": group.event.name}
                ]
        skeleton["animations"][group.name] = animation
    return skeleton


def verify_pixels(atlas_path: Path, frames: list[PackedFrame]) -> int:
    with Image.open(atlas_path) as opened:
        atlas = opened.convert("RGBA")
    exact = 0
    for frame in frames:
        packed = atlas.crop(
            (frame.x, frame.y, frame.x + frame.width, frame.y + frame.height)
        )
        if ImageChops.difference(packed, frame.image).getbbox() is None:
            exact += 1
    return exact


def export(
    *,
    groups: list[AnimationGroup],
    output_dir: Path,
    output_name: str,
    spine_version: str,
    columns: int,
    padding: int,
    make_zip: bool,
) -> dict[str, Any]:
    if spine_version not in SUPPORTED_VERSIONS:
        raise ValueError(f"spine_version must be one of {', '.join(SUPPORTED_VERSIONS)}")
    if not output_name or any(char in output_name for char in '<>:"/\\|?*'):
        raise ValueError("output_name is empty or contains invalid filename characters")

    output_dir.mkdir(parents=True, exist_ok=True)
    atlas_image, frames = pack_frames(groups, columns, padding)
    png_path = output_dir / f"{output_name}.png"
    atlas_path = output_dir / f"{output_name}.atlas"
    json_path = output_dir / f"{output_name}.json"
    zip_path = output_dir / f"{output_name}.zip"

    atlas_image.save(png_path, format="PNG")
    atlas_path.write_text(
        make_atlas_text(frames, atlas_image.width, atlas_image.height, output_name),
        encoding="utf-8",
        newline="\n",
    )
    skeleton = make_spine_json(frames, groups, spine_version)
    json_path.write_text(
        json.dumps(skeleton, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n"
    )

    if make_zip:
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_STORED) as archive:
            for path in (png_path, atlas_path, json_path):
                archive.write(path, arcname=path.name)

    exact_frames = verify_pixels(png_path, frames)
    result_paths = [png_path, atlas_path, json_path] + ([zip_path] if make_zip else [])
    report = {
        "status": "ok",
        "implementation": "independent local sequence-frame converter",
        "output_name": output_name,
        "spine_version": spine_version,
        "animations": [
            {
                "name": group.name,
                "fps": group.fps,
                "frames": len(group.frames),
                "duration": len(group.frames) / group.fps,
            }
            for group in groups
        ],
        "atlas": {
            "width": atlas_image.width,
            "height": atlas_image.height,
            "regions": len(frames),
            "columns": columns,
            "padding": padding,
        },
        "verification": {
            "pixel_exact_frames": exact_frames,
            "total_frames": len(frames),
        },
        "files": {
            path.name: {"path": str(path), "bytes": path.stat().st_size, "sha256": sha256(path)}
            for path in result_paths
        },
    }
    report_path = output_dir / f"{output_name}.report.json"
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    report["report_path"] = str(report_path)
    return report


def resolve_path(value: str, base: Path) -> Path:
    path = Path(value)
    return path if path.is_absolute() else (base / path).resolve()


def groups_from_config(config_path: Path) -> tuple[list[AnimationGroup], dict[str, Any]]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    base = config_path.parent
    groups: list[AnimationGroup] = []
    for index, item in enumerate(config.get("animations", []), start=1):
        event_data = item.get("event")
        event = (
            EventSpec(str(event_data["name"]), int(event_data["frame"]))
            if event_data
            else None
        )
        sheet = item.get("sheet") or {}
        groups.append(
            load_group(
                group_id=f"group-{index}",
                name=str(item["name"]),
                fps=float(item.get("fps", 15)),
                input_path=resolve_path(str(item["input"]), base),
                pattern=str(item.get("glob", "*.png")),
                sheet_cols=sheet.get("cols"),
                sheet_rows=sheet.get("rows"),
                auto_sheet=bool(item.get("auto_sheet", True)),
                event=event,
            )
        )
    if not groups:
        raise ValueError("config must contain at least one animation")
    return groups, config


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        description="Convert PNG sequences or sprite sheets into a Spine sequence-frame export."
    )
    source = result.add_mutually_exclusive_group(required=True)
    source.add_argument("--input", type=Path, help="image file or directory")
    source.add_argument("--config", type=Path, help="multi-animation JSON config")
    result.add_argument("--output", type=Path, required=True, help="output directory")
    result.add_argument("--name", help="output base name")
    result.add_argument("--animation", default="action1", help="single-input animation name")
    result.add_argument("--fps", type=float, default=15.0)
    result.add_argument("--glob", default="*.png", help="directory glob for single input")
    result.add_argument("--spine-version", choices=SUPPORTED_VERSIONS, default="4.2.43")
    result.add_argument("--sheet-cols", type=int)
    result.add_argument("--sheet-rows", type=int)
    result.add_argument("--no-auto-sheet", action="store_true")
    result.add_argument("--event-name")
    result.add_argument("--event-frame", type=int)
    result.add_argument("--columns", type=int, default=10)
    result.add_argument("--padding", type=int, default=2)
    result.add_argument("--no-zip", action="store_true")
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        if args.config:
            config_path = args.config.resolve()
            groups, config = groups_from_config(config_path)
            output_name = args.name or str(config.get("output_name", "animation"))
            spine_version = str(config.get("spine_version", args.spine_version))
            columns = int(config.get("columns", args.columns))
            padding = int(config.get("padding", args.padding))
        else:
            if bool(args.event_name) != bool(args.event_frame):
                raise ValueError("--event-name and --event-frame must be used together")
            event = (
                EventSpec(args.event_name, args.event_frame) if args.event_name else None
            )
            groups = [
                load_group(
                    group_id="group-1",
                    name=args.animation,
                    fps=args.fps,
                    input_path=args.input.resolve(),
                    pattern=args.glob,
                    sheet_cols=args.sheet_cols,
                    sheet_rows=args.sheet_rows,
                    auto_sheet=not args.no_auto_sheet,
                    event=event,
                )
            ]
            output_name = args.name or args.animation
            spine_version = args.spine_version
            columns = args.columns
            padding = args.padding

        report = export(
            groups=groups,
            output_dir=args.output.resolve(),
            output_name=output_name,
            spine_version=spine_version,
            columns=columns,
            padding=padding,
            make_zip=not args.no_zip,
        )
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except Exception as error:
        print(json.dumps({"status": "error", "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

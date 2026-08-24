#!/usr/bin/env python3
"""Build the Zhao Yun 23-part T-Pose binding manifest.

The component extractor owns pixel recovery and crop discovery. This script
owns the deliberately human-auditable semantic bridge from those crops to the
18-point Motion Rig skeleton. It emits only generic JSON and does not depend on
Spine Editor or Spine Runtimes.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_COMPONENTS = ROOT / "demo/zhaoyun/tpose-detailed/manifest.json"
DEFAULT_OUTPUT = ROOT / "demo/zhaoyun/zhaoyun.tpose-bind.json"
DEFAULT_PUBLIC_OUTPUT = ROOT / "public/demo/zhaoyun/zhaoyun.tpose-bind.json"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def local(width: int, height: int, x: float, y: float) -> list[float]:
    """Convert normalized crop coordinates to stable one-decimal pixels."""

    return [round(width * x, 1), round(height * y, 1)]


def build_manifest(components_manifest: dict[str, Any]) -> dict[str, Any]:
    components = {
        item["id"]: item for item in components_manifest.get("components", [])
    }
    expected_ids = {
        "weapon",
        "helmet",
        "cape",
        "head",
        "shoulder_back",
        "shoulder_front",
        "torso",
        "upper_arm_back",
        "upper_arm_front",
        "forearm_back",
        "forearm_front",
        "hand_back",
        "hand_front",
        "hip_cover_back",
        "hip_cover_front",
        "thigh_back",
        "thigh_front",
        "knee_cover_back",
        "knee_cover_front",
        "shin_back",
        "shin_front",
        "foot_back",
        "foot_front",
    }
    missing = sorted(expected_ids - components.keys())
    extra = sorted(components.keys() - expected_ids)
    if missing or extra:
        raise ValueError(
            f"Expected the Zhao Yun 23-part inventory; missing={missing}, extra={extra}"
        )

    parts: list[dict[str, Any]] = []

    def add(
        component_id: str,
        *,
        anchors: list[tuple[str, float, float]],
        pivot: tuple[float, float],
        bone: str,
        slot: str,
        z: int,
        solve: str = "similarity-2d",
        driver_nodes: tuple[str, str] | None = None,
        rotation_offset: float | None = None,
        fixed_scale: float | None = None,
        scale_range: tuple[float, float] = (0.35, 1.8),
    ) -> None:
        component = components[component_id]
        bbox = component["bbox"]
        width = int(bbox["width"])
        height = int(bbox["height"])
        part: dict[str, Any] = {
            "id": component_id,
            "name": component_id.replace("_", " ").title(),
            "rect": [
                int(bbox["x"]),
                int(bbox["y"]),
                width,
                height,
            ],
            "pivot": local(width, height, *pivot),
            "anchors": [
                {"node": node, "local": local(width, height, x, y)}
                for node, x, y in anchors
            ],
            "bone": bone,
            "slot": slot,
            "z": z,
            "solve": solve,
            "scale": {
                "min": scale_range[0],
                "max": scale_range[1],
            },
        }
        if driver_nodes is not None:
            part["driverNodes"] = list(driver_nodes)
        if rotation_offset is not None:
            part["rotationOffset"] = round(rotation_offset, 8)
        if fixed_scale is not None:
            part["scale"]["fixed"] = fixed_scale
        parts.append(part)

    # Back accessories and limbs are painted first. Screen-left pieces are the
    # demo's "back" chain; screen-right pieces are the "front" chain.
    add(
        "cape",
        anchors=[("neck", 0.5, 0.055)],
        pivot=(0.5, 0.055),
        bone="torso",
        slot="cape",
        z=0,
        driver_nodes=("neck", "pelvis"),
        rotation_offset=-math.pi / 2,
        fixed_scale=0.78,
    )

    for side, z_base in (("back", 10), ("front", 32)):
        shoulder = f"shoulder_{side}"
        elbow = f"elbow_{side}"
        wrist = f"wrist_{side}"
        hip = f"hip_{side}"
        knee = f"knee_{side}"
        ankle = f"ankle_{side}"

        add(
            f"upper_arm_{side}",
            anchors=[(shoulder, 0.5, 0.06), (elbow, 0.5, 0.94)],
            pivot=(0.5, 0.06),
            bone=shoulder,
            slot=f"upper-arm-{side}",
            z=z_base,
        )
        add(
            f"forearm_{side}",
            anchors=[(elbow, 0.5, 0.05), (wrist, 0.5, 0.94)],
            pivot=(0.5, 0.05),
            bone=elbow,
            slot=f"forearm-{side}",
            z=z_base + 1,
        )
        add(
            f"hand_{side}",
            anchors=[(wrist, 0.5, 0.1)],
            pivot=(0.5, 0.1),
            bone=wrist,
            slot=f"hand-{side}",
            z=z_base + 2,
            driver_nodes=(elbow, wrist),
            rotation_offset=-math.pi / 2,
            fixed_scale=0.65,
        )
        add(
            f"shoulder_{side}",
            anchors=[(shoulder, 0.5, 0.5)],
            pivot=(0.5, 0.5),
            bone=shoulder,
            slot=f"shoulder-cover-{side}",
            z=z_base + 3,
            driver_nodes=(shoulder, elbow),
            rotation_offset=-math.pi / 2,
            fixed_scale=0.72,
        )
        add(
            f"thigh_{side}",
            anchors=[(hip, 0.5, 0.05), (knee, 0.5, 0.94)],
            pivot=(0.5, 0.05),
            bone=hip,
            slot=f"thigh-{side}",
            z=z_base,
        )
        add(
            f"shin_{side}",
            anchors=[(knee, 0.5, 0.04), (ankle, 0.5, 0.92)],
            pivot=(0.5, 0.04),
            bone=knee,
            slot=f"shin-{side}",
            z=z_base + 1,
        )
        add(
            f"foot_{side}",
            anchors=[(ankle, 0.5, 0.08)],
            pivot=(0.5, 0.08),
            bone=ankle,
            slot=f"foot-{side}",
            z=z_base + 2,
            driver_nodes=(knee, ankle),
            rotation_offset=-math.pi / 2,
            fixed_scale=0.7,
        )
        add(
            f"hip_cover_{side}",
            anchors=[(hip, 0.5, 0.5)],
            pivot=(0.5, 0.5),
            bone=hip,
            slot=f"hip-cover-{side}",
            z=z_base + 4,
            driver_nodes=(hip, knee),
            rotation_offset=-math.pi / 2,
            fixed_scale=0.68,
        )
        add(
            f"knee_cover_{side}",
            anchors=[(knee, 0.5, 0.5)],
            pivot=(0.5, 0.5),
            bone=knee,
            slot=f"knee-cover-{side}",
            z=z_base + 4,
            driver_nodes=(hip, knee),
            rotation_offset=-math.pi / 2,
            fixed_scale=0.68,
        )

    add(
        "torso",
        anchors=[
            ("neck", 0.5, 0.02),
            ("torso", 0.5, 0.27),
            ("pelvis", 0.5, 0.58),
        ],
        pivot=(0.5, 0.58),
        bone="torso",
        slot="torso",
        z=24,
        scale_range=(0.55, 1.25),
    )
    add(
        "head",
        anchors=[("head", 0.5, 0.45), ("neck", 0.5, 0.96)],
        pivot=(0.5, 0.96),
        bone="head",
        slot="face",
        z=42,
    )
    add(
        "helmet",
        anchors=[("head", 0.5, 0.56), ("neck", 0.5, 0.96)],
        pivot=(0.5, 0.96),
        bone="head",
        slot="helmet",
        z=43,
    )
    # The current 18-point demo has no weapon_tail/front_grip/rear_grip. This
    # explicit degraded mapping is a smoke-test fallback, not a two-hand proof.
    add(
        "weapon",
        anchors=[("weapon_tip", 0.27, 0.01), ("wrist_front", 0.72, 0.67)],
        pivot=(0.72, 0.67),
        bone="weapon",
        slot="weapon",
        z=50,
        scale_range=(0.45, 1.6),
    )

    if len(parts) != 23 or {part["id"] for part in parts} != expected_ids:
        raise AssertionError("Binding generation must cover every extracted component once")

    atlas = components_manifest["atlas"]
    return {
        "schema": "tpose-bind/v1",
        "atlas": {
            "file": "tpose-detailed/atlas.png",
            "width": int(atlas["width"]),
            "height": int(atlas["height"]),
            "background": "transparent",
            "transparent": True,
        },
        "settings": {"scaleClamp": [0.35, 1.8]},
        "parts": parts,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--components", type=Path, default=DEFAULT_COMPONENTS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--public-output", type=Path, default=DEFAULT_PUBLIC_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    manifest = build_manifest(read_json(args.components))
    write_json(args.output, manifest)
    if args.public_output:
        args.public_output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(args.output, args.public_output)
    print(
        f"Wrote {len(manifest['parts'])} bindings to {args.output} "
        f"and {args.public_output}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

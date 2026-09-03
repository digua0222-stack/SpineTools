"""Skeleton construction and Spine 4.2 JSON export (design doc section 10).

- The hip is the character-local origin; bone direction = pivotSource ->
  jointTargetSource; bone length = distance between the two joints.
- Attachment placement is derived exactly from ``sourceBBox`` and
  ``pivotSource`` (no feature matching for same-source parts, section 2).
- MVP binds every rigid part to exactly one bone of the same name; occluded
  template bones (e.g. ``shoulder_r``) stay as zero-length helper bones so the
  hierarchy matches the template (section 7.2).
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from .geometry import (
    direction_degrees,
    length,
    normalize_degrees,
    rotate,
    round4,
    source_to_spine,
    sub,
)

ROOT_BONE = "root"
HIP_BONE = "hip"

# Back-to-front default ranks for draw groups (design doc 10.1: template
# defaults first, human confirmation from the reassembly preview afterwards).
DRAW_GROUP_RANK = {
    "cape_back": 10,
    "hair_back": 20,
    "arm_back": 30,
    "leg_back": 40,
    "torso": 50,
    "head": 60,
    "hair_front": 70,
    "arm_front": 80,
    "leg_front": 90,
    "prop_front": 100,
}
DEFAULT_GROUP_RANK = 55

# Limb/head joints exercised by the V3 rotation validation and the
# ``setup_validation`` animation timeline.
MOVABLE_JOINT_PREFIXES = (
    "upper_arm",
    "forearm",
    "hand",
    "thigh",
    "shin",
    "foot",
)
MOVABLE_EXTRA_BONES = ("head",)


class Bone:
    def __init__(
        self,
        name: str,
        parent: Optional[str],
        joint_spine: Sequence[float],
        rotation_world: float = 0.0,
        bone_length: float = 0.0,
        part_name: Optional[str] = None,
    ) -> None:
        self.name = name
        self.parent = parent
        self.joint_spine = (float(joint_spine[0]), float(joint_spine[1]))
        self.rotation_world = float(rotation_world)
        self.length = float(bone_length)
        self.part_name = part_name
        # Filled by compute_local_transforms.
        self.local_x = 0.0
        self.local_y = 0.0
        self.local_rotation = 0.0


def build_bones(
    components: List[Dict[str, Any]],
    profile_parts: Dict[str, Dict[str, Any]],
    setup_origin: Sequence[float],
) -> List[Bone]:
    """Build the bone list in hierarchy order (parents before children)."""
    by_name: Dict[str, Bone] = {}

    def add(bone: Bone) -> None:
        if bone.name in by_name:
            raise ValueError(f"duplicate bone: {bone.name}")
        by_name[bone.name] = bone

    add(Bone(ROOT_BONE, None, (0.0, 0.0)))
    add(Bone(HIP_BONE, ROOT_BONE, (0.0, 0.0)))

    # Parts become bones named after the part; occluded parent bones are
    # inserted on demand as zero-length helpers at their child's joint.
    pending = {c["name"]: c for c in components}

    def ensure_parent_chain(comp: Dict[str, Any]) -> None:
        parent = comp.get("parentBone") or HIP_BONE
        if parent in by_name:
            return
        if parent in pending:
            ensure_parent_chain(pending[parent])
            return
        # Occluded bone: no component. Place it at this child's joint with
        # zero length so children keep their template hierarchy slot.
        pivot = comp.get("pivotSource")
        if pivot is None:
            raise ValueError(
                f"{comp['name']}: parent bone {parent!r} missing and part has no pivotSource"
            )
        joint = source_to_spine(pivot, setup_origin)
        grand = profile_parts.get(parent, {}).get("parentBone") or HIP_BONE
        add(Bone(parent, grand, joint, 0.0, 0.0, part_name=None))

    ordered: List[Dict[str, Any]] = []
    queue = list(components)
    # Iteratively emit components whose parent chain is satisfied.
    guard = 0
    while queue:
        guard += 1
        if guard > 10000:
            raise ValueError("bone hierarchy resolution did not converge")
        comp = queue.pop(0)
        parent = comp.get("parentBone") or HIP_BONE
        if parent not in by_name:
            if parent in pending and parent != comp["name"]:
                queue.append(comp)
                continue
            ensure_parent_chain(comp)
        ordered.append(comp)
        part = profile_parts.get(comp["name"], {})
        pivot = comp.get("pivotSource")
        if pivot is None:
            raise ValueError(f"{comp['name']}: pivotSource is required")
        joint = source_to_spine(pivot, setup_origin)
        target = part.get("jointTargetSource")
        if target is not None:
            target_spine = source_to_spine(target, setup_origin)
            rotation = direction_degrees(joint, target_spine)
            bone_len = length(sub(target_spine, joint))
        else:
            rotation, bone_len = 0.0, 0.0
        add(
            Bone(
                comp["name"],
                comp.get("parentBone") or HIP_BONE,
                joint,
                rotation,
                bone_len,
                part_name=comp["name"],
            )
        )
        pending.pop(comp["name"], None)

    bones = list(by_name.values())

    def depth(b: Bone) -> int:
        d, cur = 0, b
        while cur.parent is not None:
            cur = by_name[cur.parent]
            d += 1
        return d

    bones.sort(key=lambda b: (depth(b), b.name != HIP_BONE and b.part_name is None, b.name))
    # root must stay first, hip second.
    bones.sort(key=lambda b: {ROOT_BONE: 0, HIP_BONE: 1}.get(b.name, 2))
    return bones


def compute_local_transforms(bones: List[Bone]) -> None:
    by_name = {b.name: b for b in bones}
    for bone in bones:
        if bone.parent is None:
            bone.local_x, bone.local_y = bone.joint_spine
            bone.local_rotation = bone.rotation_world
            continue
        parent = by_name[bone.parent]
        offset = sub(bone.joint_spine, parent.joint_spine)
        lx, ly = rotate(offset, -parent.rotation_world)
        bone.local_x = lx
        bone.local_y = ly
        bone.local_rotation = normalize_degrees(bone.rotation_world - parent.rotation_world)


def draw_group_rank(draw_group: Optional[str]) -> int:
    return DRAW_GROUP_RANK.get(draw_group or "", DEFAULT_GROUP_RANK)


def compute_draw_order(components: List[Dict[str, Any]]) -> List[str]:
    """Back-to-front slot order: draw-group rank, then zIndex, then name."""
    ordered = sorted(
        components,
        key=lambda c: (
            draw_group_rank(c.get("drawGroup")),
            int(c.get("zIndex", 0)),
            c["name"],
        ),
    )
    return [c["name"] for c in ordered]


def attachment_placement(
    component: Dict[str, Any], bone: Bone, setup_origin: Sequence[float]
) -> Dict[str, float]:
    """Region attachment transform relative to its bone (section 10.1)."""
    l, t, r, b = component["sourceBBox"]
    center_source = ((l + r) / 2.0, (t + b) / 2.0)
    center_spine = source_to_spine(center_source, setup_origin)
    offset = sub(center_spine, bone.joint_spine)
    ax, ay = rotate(offset, -bone.rotation_world)
    return {
        "x": round4(ax),
        "y": round4(ay),
        "rotation": round4(normalize_degrees(-bone.rotation_world)),
        "width": r - l,
        "height": b - t,
    }


def movable_bones(bones: List[Bone]) -> List[str]:
    names = []
    for bone in bones:
        if bone.part_name is None:
            continue
        if bone.name.startswith(MOVABLE_JOINT_PREFIXES) or bone.name in MOVABLE_EXTRA_BONES:
            names.append(bone.name)
    return names


def make_spine_json(
    bones: List[Bone],
    components: List[Dict[str, Any]],
    draw_order: List[str],
    setup_origin: Sequence[float],
    spine_version: str = "4.2.43",
) -> Dict[str, Any]:
    by_name = {b.name: b for b in bones}
    comp_by_name = {c["name"]: c for c in components}

    bone_entries: List[Dict[str, Any]] = []
    for bone in bones:
        entry: Dict[str, Any] = {"name": bone.name}
        if bone.parent is not None:
            entry["parent"] = bone.parent
            entry["x"] = round4(bone.local_x)
            entry["y"] = round4(bone.local_y)
            entry["rotation"] = round4(bone.local_rotation)
        if bone.length:
            entry["length"] = round4(bone.length)
        bone_entries.append(entry)

    slot_entries = [
        {"name": name, "bone": name, "attachment": name} for name in draw_order
    ]

    attachments: Dict[str, Dict[str, Any]] = {}
    for name in draw_order:
        comp = comp_by_name[name]
        bone = by_name[name]
        attachments[name] = {name: attachment_placement(comp, bone, setup_origin)}

    rotate_timelines: Dict[str, Any] = {}
    for name in movable_bones(bones):
        rotate_timelines[name] = {
            "rotate": [
                {"time": 0, "value": 0},
                {"time": 0.5, "value": -15},
                {"time": 1, "value": 0},
                {"time": 1.5, "value": 15},
                {"time": 2, "value": 0},
            ]
        }

    return {
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
        "bones": bone_entries,
        "slots": slot_entries,
        "skins": [{"name": "default", "attachments": attachments}],
        "animations": {"setup_validation": {"bones": rotate_timelines}},
    }


def skeleton_layout(bones: List[Bone]) -> Dict[str, Any]:
    return {
        "schemaVersion": 1,
        "bones": [
            {
                "name": b.name,
                "parent": b.parent,
                "part": b.part_name,
                "jointSpine": [round4(b.joint_spine[0]), round4(b.joint_spine[1])],
                "rotationWorld": round4(b.rotation_world),
                "length": round4(b.length),
                "local": {
                    "x": round4(b.local_x),
                    "y": round4(b.local_y),
                    "rotation": round4(b.local_rotation),
                },
            }
            for b in bones
        ],
    }

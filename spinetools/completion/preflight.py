"""Completion preflight (AC-02): load a SAM run and validate inputs.

Reads the SAM run, the source image and the saved prompts; carries
``jointTargetSource``/``drawGroup``/``occludedParts`` forward automatically
and verifies source/prompt hashes. Incomplete input raises ``PreflightError``
- the pipeline never asks an operator for missing data.

Bone nodes vs image parts: a fully invisible part (e.g. the occluded right
shoulder) still gets a bone requirement and a target part record; it is
simply a part whose visibleMask is empty by declaration, not a part that can
be dropped.

``reviewStatus=draft`` upstream never triggers a human wait: the automatic
input checks decide usability and record an independent ``autoStatus``
conclusion while preserving the original review record.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from ..sam.common import sha256_file

REQUIRED_SUBDIRS = ("source", "prompts", "masks", "parts", "rig")
# Bones that always exist without a same-named part.
BUILTIN_BONES = ("root", "hip")

AUTO_USABLE = "auto-usable"
AUTO_STALE = "auto-stale-rejected"


class PreflightError(RuntimeError):
    """Incomplete or inconsistent completion input; never a human question."""


@dataclass
class PartInput:
    name: str
    source_bbox: List[int]
    pivot_source: Optional[List[float]]
    joint_target_source: Optional[List[float]]
    parent_bone: Optional[str]
    draw_group: Optional[str]
    z_index: int
    review_status: str
    auto_status: str
    occluded: bool = False
    occlusion_reason: Optional[str] = None
    part_path: Optional[str] = None
    mask_path: Optional[str] = None
    rgba_sha256: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SamRun:
    run_dir: str
    source_path: str
    source_sha256: str
    prompts: Dict[str, Any]
    prompts_sha256: str
    manifest: Dict[str, Any]
    parts: List[PartInput]
    occluded_parts: List[PartInput]
    stale: bool
    auto_notes: List[str]


def _load_json(path: str) -> Dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _is_valid_parent(
    parent: str,
    part_name: str,
    prompts: Dict[str, Any],
    component_names: set,
) -> bool:
    """Whether ``parent`` is a legal bone for ``part_name`` (AC-02).

    Valid: a component name, an occluded part name, a builtin bone, or a
    helper bone referenced as ``parentBone`` by at least one *other* part
    (e.g. ``head`` or the occluded ``shoulder_r``). A name referenced only
    by the part under validation is a typo, not a bone.
    """
    if parent in component_names or parent in BUILTIN_BONES:
        return True
    if any(occ["name"] == parent for occ in prompts.get("occludedParts", [])):
        return True
    for other in prompts.get("parts", []):
        if other["name"] != part_name and other.get("parentBone") == parent:
            return True
    return False


def load_sam_run(run_dir: str, allow_stale: bool = False) -> SamRun:
    errors: List[str] = []
    for sub in REQUIRED_SUBDIRS:
        if not os.path.isdir(os.path.join(run_dir, sub)):
            errors.append(f"missing required directory: {sub}/")
    if errors:
        raise PreflightError("; ".join(errors))

    source_path = os.path.join(run_dir, "source", "standing.png")
    prompts_path = os.path.join(run_dir, "prompts", "prompts.json")
    manifest_path = os.path.join(run_dir, "rig", "component-manifest.json")
    for path in (source_path, prompts_path, manifest_path):
        if not os.path.exists(path):
            raise PreflightError(f"missing required file: {os.path.relpath(path, run_dir)}")

    source_sha = sha256_file(source_path)
    prompts = _load_json(prompts_path)
    prompts_sha = sha256_file(prompts_path)
    manifest = _load_json(manifest_path)

    stale = prompts.get("sourceSha256") is not None and prompts["sourceSha256"] != source_sha
    if stale and not allow_stale:
        raise PreflightError(
            "prompts sourceSha256 does not match run source image; "
            "completion on stale inputs is unsafe (pass allow_stale to inspect)"
        )

    components = manifest.get("components", [])
    names = [c["name"] for c in components]
    duplicates = sorted({n for n in names if names.count(n) > 1})
    if duplicates:
        raise PreflightError(f"duplicate component names: {duplicates}")

    profile_parts = {p["name"]: p for p in prompts.get("parts", [])}
    occluded = {p["name"]: p for p in prompts.get("occludedParts", [])}
    component_names = set(names)

    auto_notes: List[str] = []
    parts: List[PartInput] = []
    for comp in components:
        name = comp["name"]
        parent = comp.get("parentBone")
        if parent and not _is_valid_parent(parent, name, prompts, component_names):
            raise PreflightError(f"{name}: invalid parentBone {parent!r}")
        review = comp.get("reviewStatus", "draft")
        if review == "stale":
            auto_status = AUTO_STALE if not allow_stale else AUTO_USABLE
            if not allow_stale:
                raise PreflightError(f"{name}: reviewStatus=stale on current inputs")
        elif review == "approved":
            auto_status = AUTO_USABLE
        else:
            # draft: automatic checks decide usability; no human wait state.
            auto_status = AUTO_USABLE
            auto_notes.append(
                f"{name}: upstream reviewStatus=draft accepted by automatic input checks; original status preserved"
            )
        profile = profile_parts.get(name, {})
        l, t, r, b = comp["sourceBBox"]
        src_w, src_h = manifest.get("sourceSize", [0, 0])
        if l < 0 or t < 0 or r > src_w or b > src_h:
            raise PreflightError(f"{name}: sourceBBox {comp['sourceBBox']} escapes source canvas {src_w}x{src_h}")
        part_path = os.path.join(run_dir, "parts", f"{name}.png")
        mask_path = os.path.join(run_dir, "masks", f"{name}.png")
        if not os.path.exists(part_path) or not os.path.exists(mask_path):
            raise PreflightError(f"{name}: missing parts/ or masks/ PNG")
        parts.append(
            PartInput(
                name=name,
                source_bbox=list(comp["sourceBBox"]),
                pivot_source=comp.get("pivotSource"),
                joint_target_source=profile.get("jointTargetSource"),
                parent_bone=parent,
                draw_group=comp.get("drawGroup"),
                z_index=int(comp.get("zIndex", 0)),
                review_status=review,
                auto_status=auto_status,
                part_path=part_path,
                mask_path=mask_path,
                rgba_sha256=sha256_file(part_path),
                extra={"candidateIndex": profile.get("candidateIndex")},
            )
        )

    # Occluded parts: invisible by declaration, still require a bone and a
    # completion target record. They are not dropped and not auto-invented.
    occluded_parts: List[PartInput] = []
    for name, occ in sorted(occluded.items()):
        if name in names:
            continue
        occluded_parts.append(
            PartInput(
                name=name,
                source_bbox=[],
                pivot_source=None,
                joint_target_source=None,
                parent_bone=None,
                draw_group=None,
                z_index=-1,
                review_status="occluded",
                auto_status="needs-completion-plan",
                occluded=True,
                occlusion_reason=occ.get("reason"),
            )
        )
        auto_notes.append(
            f"{name}: fully occluded; bone required, completion target recorded ({occ.get('reason', 'no reason')})"
        )

    return SamRun(
        run_dir=os.path.abspath(run_dir),
        source_path=source_path,
        source_sha256=source_sha,
        prompts=prompts,
        prompts_sha256=prompts_sha,
        manifest=manifest,
        parts=parts,
        occluded_parts=occluded_parts,
        stale=stale,
        auto_notes=auto_notes,
    )

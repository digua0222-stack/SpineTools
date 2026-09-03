"""AC-02 acceptance tests: completion contracts and preflight."""

from __future__ import annotations

import json
import os

import numpy as np
import pytest
from PIL import Image

from spinetools.completion import contracts, preflight


class TestCompletedBBox:
    def test_expansion_beyond_source_allowed(self):
        # Repair pixels outside the photographed frame must not be clipped;
        # the offset is recorded in the box itself.
        repair = np.zeros((10, 10), dtype=bool)
        repair[0, 0] = True
        bbox = contracts.make_completed_bbox([2, 2, 5, 5], repair, margin=3)
        assert bbox == [-3, -3, 8, 8]

    def test_negative_coords_and_pivot_local(self):
        bbox = [-4, -6, 10, 12]
        assert contracts.pivot_local([3, 4], bbox) == [7, 10]
        assert contracts.source_to_canvas([3, 4], bbox) == (7.0, 10.0)
        assert contracts.canvas_to_source([7, 10], bbox) == (3.0, 4.0)

    def test_empty_box_rejected(self):
        masks = {k: np.zeros((2, 2), bool) for k in contracts.MASK_KINDS}
        assert contracts.validate_mask_set(masks, [3, 3, 3, 9])


class TestMaskSet:
    def make_masks(self, shape=(8, 8)):
        masks = {k: np.zeros(shape, bool) for k in contracts.MASK_KINDS}
        masks["fullMask"][2:6, 2:6] = True
        masks["protectedMask"][3:5, 3:5] = True
        masks["visibleMask"][3:5, 3:5] = True
        return masks

    def test_valid_set_passes(self):
        masks = self.make_masks()
        masks["repairMask"][2, 2] = True
        assert contracts.validate_mask_set(masks, [0, 0, 8, 8]) == []

    def test_repair_protected_intersection_rejected(self):
        masks = self.make_masks()
        masks["repairMask"][4, 4] = True  # inside protected
        errors = contracts.validate_mask_set(masks, [0, 0, 8, 8])
        assert any("intersects protectedMask" in e for e in errors)

    def test_local_global_mask_shape_mismatch(self):
        masks = self.make_masks((8, 8))
        masks["fullMask"] = np.zeros((9, 9), bool)
        errors = contracts.validate_mask_set(masks, [0, 0, 8, 8])
        assert any("fullMask shape" in e for e in errors)

    def test_visible_outside_full_rejected(self):
        masks = self.make_masks()
        masks["visibleMask"][7, 7] = True
        errors = contracts.validate_mask_set(masks, [0, 0, 8, 8])
        assert any("visibleMask must be a subset of fullMask" in e for e in errors)

    def test_provenance_validation(self):
        prov = np.full((3, 3), "source", dtype=object)
        assert contracts.validate_provenance(prov) == []
        prov[1, 1] = "magic"
        assert contracts.validate_provenance(prov)


class TestModelInput:
    def test_transparent_rgb_pollution_detected_and_sanitized(self):
        rgba = np.zeros((4, 4, 4), np.uint8)
        rgba[..., 3] = 255
        rgba[0, 0] = (200, 30, 30, 255)  # visible red
        rgba[3, 3] = (0, 0, 220, 0)  # invisible but carries occluder blue
        visible = np.zeros((4, 4), bool)
        visible[0, 0] = True
        assert contracts.detect_transparent_rgb_pollution(rgba, visible) > 0
        rgb = contracts.build_model_input_rgb(rgba, visible)
        assert tuple(rgb[0, 0]) == (200, 30, 30)
        assert tuple(rgb[3, 3]) == (255, 255, 255)  # leaked blue is gone

    def test_semi_transparent_composited_over_background(self):
        rgba = np.zeros((2, 2, 4), np.uint8)
        rgba[0, 0] = (0, 0, 0, 128)
        visible = np.ones((2, 2), bool)
        rgb = contracts.build_model_input_rgb(rgba, visible)
        assert rgb[0, 0, 0] in (127, 128)  # blended, not raw black

    def test_protected_pixels_hard_gate(self):
        before = np.zeros((2, 2, 4), np.uint8)
        after = before.copy()
        protected = np.ones((2, 2), bool)
        assert contracts.check_protected_pixels(before, after, protected) == 0
        after[0, 0, 0] = 1
        assert contracts.check_protected_pixels(before, after, protected) == 1


def make_sam_run(tmp_path, *, review="draft", src_sha=None, parent_bone="hip", dup=False):
    run = tmp_path / "run"
    for sub in preflight.REQUIRED_SUBDIRS:
        (run / sub).mkdir(parents=True)
    src = np.zeros((16, 16, 4), np.uint8)
    src[..., :] = (50, 60, 70, 255)
    Image.fromarray(src).save(run / "source" / "standing.png")
    import hashlib

    real_sha = hashlib.sha256(open(run / "source" / "standing.png", "rb").read()).hexdigest()
    prompts = {
        "schemaVersion": 1,
        "source": "standing.png",
        "sourceSha256": src_sha if src_sha is not None else real_sha,
        "parts": [
            {
                "name": "torso",
                "parentBone": parent_bone,
                "box": [0, 0, 16, 16],
                "positivePoints": [[8, 8]],
                "jointTargetSource": [8, 15],
                "drawGroup": "torso",
                "reviewStatus": review,
            }
        ],
        "occludedParts": [{"name": "shoulder_r", "reason": "fully occluded"}],
    }
    (run / "prompts" / "prompts.json").write_text(json.dumps(prompts))
    comps = [
        {
            "name": "torso",
            "sourceBBox": [0, 0, 16, 16],
            "pivotSource": [8, 4],
            "parentBone": parent_bone,
            "zIndex": 0,
            "drawGroup": "torso",
            "reviewStatus": review,
        }
    ]
    if dup:
        comps.append(dict(comps[0]))
    manifest = {"schemaVersion": 1, "sourceSize": [16, 16], "components": comps}
    (run / "rig" / "component-manifest.json").write_text(json.dumps(manifest))
    part = np.zeros((16, 16, 4), np.uint8)
    part[..., :] = (50, 60, 70, 255)
    Image.fromarray(part).save(run / "parts" / "torso.png")
    Image.fromarray(np.full((16, 16), 255, np.uint8)).save(run / "masks" / "torso.png")
    return str(run)


class TestPreflight:
    def test_happy_path_carries_profile_fields(self, tmp_path):
        run = preflight.load_sam_run(make_sam_run(tmp_path))
        part = run.parts[0]
        assert part.joint_target_source == [8, 15]
        assert part.draw_group == "torso"
        assert part.auto_status == preflight.AUTO_USABLE
        assert part.review_status == "draft"  # original preserved
        assert len(run.occluded_parts) == 1
        occ = run.occluded_parts[0]
        assert occ.name == "shoulder_r" and occ.occluded
        assert occ.auto_status == "needs-completion-plan"

    def test_duplicate_part_names_rejected(self, tmp_path):
        with pytest.raises(preflight.PreflightError, match="duplicate"):
            preflight.load_sam_run(make_sam_run(tmp_path, dup=True))

    def test_invalid_parent_bone_rejected(self, tmp_path):
        with pytest.raises(preflight.PreflightError, match="invalid parentBone"):
            preflight.load_sam_run(make_sam_run(tmp_path, parent_bone="nope"))

    def test_stale_source_rejected(self, tmp_path):
        with pytest.raises(preflight.PreflightError, match="stale"):
            preflight.load_sam_run(make_sam_run(tmp_path, src_sha="0" * 64))

    def test_stale_allowed_for_inspection(self, tmp_path):
        run = preflight.load_sam_run(make_sam_run(tmp_path, src_sha="0" * 64), allow_stale=True)
        assert run.stale

    def test_missing_dir_rejected(self, tmp_path):
        run_dir = make_sam_run(tmp_path)
        os.remove(os.path.join(run_dir, "parts", "torso.png"))
        with pytest.raises(preflight.PreflightError):
            preflight.load_sam_run(run_dir)

    def test_draft_never_waits_for_human(self, tmp_path):
        run = preflight.load_sam_run(make_sam_run(tmp_path, review="draft"))
        assert all(p.auto_status != "WAITING_FOR_REVIEW" for p in run.parts)
        assert any("draft accepted" in n for n in run.auto_notes)

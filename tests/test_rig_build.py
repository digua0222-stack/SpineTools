"""Unit tests for the V3 rig stage (skeleton/atlas/reassembly/rotation)."""

from __future__ import annotations

import math

import numpy as np
import pytest

from spinetools.rig import atlas, geometry, reassemble, rotation, skeleton


def make_part(w: int, h: int, color: tuple[int, int, int, int]) -> np.ndarray:
    arr = np.zeros((h, w, 4), np.uint8)
    arr[..., :] = color
    return arr


class TestGeometry:
    def test_source_spine_roundtrip(self):
        hip = (195, 245)
        p = (226, 128)
        sp = geometry.source_to_spine(p, hip)
        assert sp == (31.0, 117.0)
        assert geometry.spine_to_source(sp, hip) == (226.0, 128.0)

    def test_direction_degrees_y_up(self):
        assert geometry.direction_degrees((0, 0), (1, 0)) == 0
        assert geometry.direction_degrees((0, 0), (0, 1)) == 90
        assert geometry.direction_degrees((0, 0), (0, -1)) == -90

    def test_normalize_degrees(self):
        assert geometry.normalize_degrees(190) == -170
        assert geometry.normalize_degrees(-190) == 170
        assert geometry.normalize_degrees(360) == 0

    def test_rotate(self):
        x, y = geometry.rotate((1, 0), 90)
        assert x == pytest.approx(0, abs=1e-9)
        assert y == pytest.approx(1, abs=1e-9)


def mini_components() -> list[dict]:
    return [
        {
            "name": "torso",
            "sourceBBox": [10, 10, 30, 40],
            "pivotSource": [20, 12],
            "parentBone": "hip",
            "zIndex": 0,
            "drawGroup": "torso",
        },
        {
            "name": "thigh_l",
            "sourceBBox": [12, 40, 20, 60],
            "pivotSource": [16, 42],
            "parentBone": "hip",
            "zIndex": 1,
            "drawGroup": "leg_back",
        },
        {
            "name": "shin_l",
            "sourceBBox": [12, 60, 20, 80],
            "pivotSource": [16, 62],
            "parentBone": "thigh_l",
            "zIndex": 2,
            "drawGroup": "leg_back",
        },
    ]


def mini_profile() -> dict:
    return {
        "torso": {"parentBone": "hip", "jointTargetSource": [20, 38]},
        "thigh_l": {"parentBone": "hip", "jointTargetSource": [16, 60]},
        "shin_l": {"parentBone": "thigh_l", "jointTargetSource": [16, 78]},
    }


class TestSkeleton:
    def test_bone_hierarchy_and_locals(self):
        hip = (20, 40)
        bones = skeleton.build_bones(mini_components(), mini_profile(), hip)
        skeleton.compute_local_transforms(bones)
        by_name = {b.name: b for b in bones}
        assert by_name["torso"].parent == "hip"
        assert by_name["shin_l"].parent == "thigh_l"
        # torso joint = source (20,12) -> spine (0, 28); direction pivot->target
        # = (0,-26) in spine coords -> -90 degrees, length 26.
        assert by_name["torso"].joint_spine == (0.0, 28.0)
        assert by_name["torso"].rotation_world == pytest.approx(-90)
        assert by_name["torso"].length == pytest.approx(26)
        # hip sits at spine origin with zero rotation: torso local == joint.
        assert by_name["torso"].local_x == pytest.approx(0)
        assert by_name["torso"].local_y == pytest.approx(28)
        assert by_name["torso"].local_rotation == pytest.approx(-90)

    def test_occluded_parent_becomes_helper_bone(self):
        comps = [
            {
                "name": "upper_arm_r",
                "sourceBBox": [30, 10, 40, 20],
                "pivotSource": [32, 14],
                "parentBone": "shoulder_r",
                "zIndex": 0,
                "drawGroup": "arm_front",
            }
        ]
        profile = {"upper_arm_r": {"parentBone": "shoulder_r", "jointTargetSource": [38, 18]}}
        bones = skeleton.build_bones(comps, profile, (20, 40))
        by_name = {b.name: b for b in bones}
        assert "shoulder_r" in by_name
        assert by_name["shoulder_r"].part_name is None
        assert by_name["shoulder_r"].length == 0
        # Helper bone anchors at its child's joint.
        assert by_name["shoulder_r"].joint_spine == by_name["upper_arm_r"].joint_spine

    def test_draw_order_group_ranks(self):
        order = skeleton.compute_draw_order(mini_components())
        # leg_back (40) before torso (50).
        assert order == ["thigh_l", "shin_l", "torso"]

    def test_attachment_placement_axis_aligned_bone(self):
        comp = {
            "name": "p",
            "sourceBBox": [10, 10, 30, 40],
            "pivotSource": [20, 12],
        }
        hip = (20, 40)
        bones = skeleton.build_bones(
            [{**comp, "parentBone": "hip", "zIndex": 0, "drawGroup": "torso"}],
            {"p": {"parentBone": "hip", "jointTargetSource": [20, 38]}},
            hip,
        )
        skeleton.compute_local_transforms(bones)
        placement = skeleton.attachment_placement(comp, bones[-1], hip)
        # Center source (20,25) -> spine (0,15); bone rot -90 -> local offset
        # R(90)*(0,15)-(0,28) = R(90)*(0,-13) = (13, 0).
        assert placement["x"] == pytest.approx(13)
        assert placement["y"] == pytest.approx(0)
        assert placement["rotation"] == pytest.approx(90)
        assert placement["width"] == 20
        assert placement["height"] == 30

    def test_spine_json_shape(self):
        hip = (20, 40)
        comps = [
            {**c, "file": f"../parts/{c['name']}.png", "mask": f"../masks/{c['name']}.png"}
            for c in mini_components()
        ]
        bones = skeleton.build_bones(comps, mini_profile(), hip)
        skeleton.compute_local_transforms(bones)
        order = skeleton.compute_draw_order(comps)
        doc = skeleton.make_spine_json(bones, comps, order, hip)
        assert doc["skeleton"]["spine"] == "4.2.43"
        assert doc["bones"][0] == {"name": "root"}
        assert {s["name"] for s in doc["slots"]} == set(order)
        skins = doc["skins"][0]["attachments"]
        assert set(skins) == set(order)
        # Movable limb bones get setup_validation rotation timelines.
        timelines = doc["animations"]["setup_validation"]["bones"]
        assert "thigh_l" in timelines and "shin_l" in timelines
        assert "torso" not in timelines


class TestAtlas:
    def test_deterministic_and_pixel_exact(self):
        parts = {
            "a": make_part(10, 6, (255, 0, 0, 255)),
            "b": make_part(4, 12, (0, 255, 0, 200)),
            "c": make_part(8, 8, (0, 0, 255, 128)),
        }
        atlas1, regions1 = atlas.pack_atlas(parts)
        atlas2, regions2 = atlas.pack_atlas(parts)
        assert np.array_equal(atlas1, atlas2)
        assert [r["name"] for r in regions1] == [r["name"] for r in regions2]
        verified = atlas.verify_regions(atlas1, parts, regions1)
        assert all(verified.values())

    def test_regions_do_not_overlap(self):
        parts = {f"p{i}": make_part(5 + i, 7 + i, (i, i, i, 255)) for i in range(6)}
        _, regions = atlas.pack_atlas(parts, max_width=32)
        boxes = []
        for r in regions:
            box = (r["x"], r["y"], r["x"] + r["width"], r["y"] + r["height"])
            for other in boxes:
                assert box[2] <= other[0] or box[0] >= other[2] or box[3] <= other[1] or box[1] >= other[3]
            boxes.append(box)

    def test_atlas_text_lists_regions(self):
        parts = {"a": make_part(4, 4, (1, 2, 3, 255))}
        arr, regions = atlas.pack_atlas(parts)
        text = atlas.make_atlas_text(regions, arr.shape[1], arr.shape[0], "hero")
        assert "hero.png" in text
        assert "\na\n" in text
        assert f"  xy: {regions[0]['x']}, {regions[0]['y']}" in text


class TestReassemble:
    def test_identical_composite_metrics(self):
        # Two non-overlapping parts cropped from the same source must
        # reassemble pixel-exactly.
        src = np.zeros((30, 30, 4), np.uint8)
        src[5:15, 5:15] = (200, 10, 10, 255)
        src[18:26, 18:28] = (10, 200, 10, 255)
        comps = [
            {"name": "a", "sourceBBox": [5, 5, 15, 15]},
            {"name": "b", "sourceBBox": [18, 18, 28, 26]},
        ]
        parts = {
            "a": src[5:15, 5:15].copy(),
            "b": src[18:26, 18:28].copy(),
        }
        canvas = reassemble.composite(src.shape[:2], parts, comps, ["a", "b"])
        assert np.array_equal(canvas, src)
        m = reassemble.metrics(src, canvas)
        assert m["recall"] == 1
        assert m["changedPixels"] == 0
        assert m["psnrDb"] == "inf"

    def test_metrics_detect_change(self):
        src = np.zeros((10, 10, 4), np.uint8)
        src[..., :] = (100, 100, 100, 255)
        out = src.copy()
        out[0, 0] = (0, 0, 0, 0)
        m = reassemble.metrics(src, out)
        assert m["changedPixels"] == 1
        assert m["recall"] == pytest.approx(0.99)

    def test_comparison_image_width(self):
        src = np.zeros((8, 6, 4), np.uint8)
        out = reassemble.comparison_image(src, src)
        assert out.shape == (8, 18, 4)


class TestRotation:
    def bones_for_test(self):
        return [
            skeleton.Bone("root", None, (0, 0)),
            skeleton.Bone("hip", "root", (0, 0)),
            skeleton.Bone("arm", "hip", (5, 5), part_name="arm"),
            skeleton.Bone("hand", "arm", (5, 15), part_name="hand"),
        ]

    def test_subtree_collects_descendant_parts(self):
        bones = self.bones_for_test()
        assert sorted(rotation.subtree_part_names("arm", bones)) == ["arm", "hand"]
        assert rotation.subtree_part_names("hand", bones) == ["hand"]

    def test_pivot_pixel_fixed_under_rotation(self):
        part = np.zeros((20, 20, 4), np.uint8)
        part[8:12, 8:12] = (255, 255, 255, 255)  # block at pivot
        part[2:6, 2:6] = (255, 0, 0, 255)
        rotated, (dx, dy) = rotation._rotate_part(part, (10, 10), 30)
        # Pivot pixel stays opaque white at its fixed canvas position.
        assert rotated[dy + 10, dx + 10, 3] == 255
        assert tuple(rotated[dy + 10, dx + 10, :3]) == (255, 255, 255)
        # Expanded canvas: nothing is clipped even far from the pivot.
        assert rotated.shape[0] > 20 and rotated.shape[1] > 20

    def test_interior_transparent_detection(self):
        alpha = np.full((9, 9), 255, np.uint8)
        alpha[4, 4] = 0
        holes = rotation._interior_transparent(alpha)
        assert holes[4, 4]
        assert holes.sum() == 1
        # Edge transparent pixels are not interior holes.
        alpha2 = np.full((9, 9), 255, np.uint8)
        alpha2[0, :] = 0
        assert not rotation._interior_transparent(alpha2).any()

    def test_evaluate_rotation_reports_all_angles(self):
        src_hw = (40, 40)
        parts = {
            "arm": make_part(10, 10, (200, 0, 0, 255)),
            "hand": make_part(6, 6, (0, 0, 200, 255)),
        }
        comps = [
            {"name": "arm", "sourceBBox": [10, 10, 20, 20], "pivotSource": [15, 15]},
            {"name": "hand", "sourceBBox": [12, 20, 18, 26], "pivotSource": [15, 21]},
        ]
        bones = self.bones_for_test()
        res = rotation.evaluate_rotation(
            src_hw, parts, comps, ["arm"], bones[2], bones, (15, 15), 8
        )
        assert set(res["angles"]) == {"-15", "0", "15"}
        for data in res["angles"].values():
            assert data["crackPixels"] >= 0
            assert data["revealedPixels"] >= 0

    def test_missing_texture_regions_threshold(self):
        results = [
            {
                "joint": "arm",
                "angles": {
                    "-15": {"revealedPixels": 100},
                    "0": {"revealedPixels": 0},
                    "15": {"revealedPixels": 3},
                },
            }
        ]
        regions = rotation.missing_texture_regions(results)
        assert len(regions) == 1
        assert regions[0]["angle"] == -15

    def test_strip_poses(self):
        stripped = rotation.strip_poses(
            [{"joint": "a", "windowRadius": 5, "angles": {"0": {"pose": np.zeros((2, 2, 4), np.uint8), "crackPixels": 0}}}]
        )
        assert "pose" not in stripped[0]["angles"]["0"]

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPOSITORY_ROOT / "scripts" / "extract_tpose_parts.py"
SPEC = importlib.util.spec_from_file_location("extract_tpose_parts", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class DetailedTposeExtractionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = (
            REPOSITORY_ROOT
            / "demo"
            / "zhaoyun"
            / "assets"
            / "tpose_detailed_checkerboard_source.png"
        )
        cls.temporary = tempfile.TemporaryDirectory()
        temporary_root = Path(cls.temporary.name)
        cls.output = temporary_root / "generated"
        cls.public = temporary_root / "public"
        cls.manifest = MODULE.extract(cls.source, cls.output, cls.public)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.temporary.cleanup()

    def test_source_is_opaque_rgb_with_a_baked_checkerboard(self) -> None:
        source = self.manifest["source"]
        self.assertEqual((source["width"], source["height"], source["channels"]), (1024, 1024, 3))
        self.assertFalse(source["transparency"]["hasAlphaChannel"])
        self.assertEqual(source["transparency"]["effectiveAlphaMin"], 255)
        self.assertEqual(source["transparency"]["effectiveAlphaMax"], 255)
        self.assertTrue(source["checkerboard"]["likelyBakedCheckerboard"])
        self.assertEqual(source["sha256"], "e7321eb57be54fc8c992c49e4a3a3bd5aa8400664e69ea28a2d44e4ebcbf3a43")
        self.assertEqual(source["file"], "../assets/tpose_detailed_checkerboard_source.png")
        public_source = self.public.parent / "assets" / self.source.name
        self.assertTrue(public_source.is_file())
        self.assertEqual(MODULE.sha256(public_source), MODULE.sha256(self.source))

    def test_exactly_23_stably_named_components_are_detected(self) -> None:
        expected_ids = {slot.id for slot in MODULE.LAYOUT_SLOTS}
        components = self.manifest["components"]
        self.assertEqual(self.manifest["componentCount"], 23)
        self.assertEqual({component["id"] for component in components}, expected_ids)
        self.assertEqual(self.manifest["naming"]["unresolvedIds"], [])
        self.assertIn("hip_cover_back", self.manifest["naming"]["requiresHumanConfirmationIds"])
        self.assertIn("knee_cover_front", self.manifest["naming"]["requiresHumanConfirmationIds"])

    def test_prominent_bounding_boxes_and_all_coordinates(self) -> None:
        by_id = {component["id"]: component for component in self.manifest["components"]}
        self.assertEqual(by_id["weapon"]["bbox"], {"x": 175, "y": 10, "width": 103, "height": 450})
        self.assertEqual(by_id["helmet"]["bbox"], {"x": 383, "y": 17, "width": 205, "height": 183})
        self.assertEqual(by_id["cape"]["bbox"], {"x": 586, "y": 47, "width": 310, "height": 277})
        self.assertEqual(by_id["torso"]["bbox"], {"x": 420, "y": 367, "width": 172, "height": 213})
        for component in by_id.values():
            bbox = component["bbox"]
            self.assertGreater(bbox["width"], 0)
            self.assertGreater(bbox["height"], 0)
            self.assertGreaterEqual(bbox["x"], 0)
            self.assertGreaterEqual(bbox["y"], 0)
            self.assertLessEqual(bbox["x"] + bbox["width"], 1024)
            self.assertLessEqual(bbox["y"] + bbox["height"], 1024)

    def test_output_pngs_have_real_binary_alpha_and_matching_area(self) -> None:
        atlas = MODULE.read_image(self.output / "atlas.png")
        self.assertEqual(atlas.shape, (1024, 1024, 4))
        self.assertEqual(np.unique(atlas[:, :, 3]).tolist(), [0, 255])
        self.assertEqual(np.count_nonzero(atlas[:, :, 3]), 171077)
        for component in self.manifest["components"]:
            crop = MODULE.read_image(self.output / component["file"])
            self.assertEqual(crop.shape[2], 4)
            self.assertEqual(int(np.count_nonzero(crop[:, :, 3])), component["maskArea"])
            self.assertEqual(component["alpha"]["nonZeroPixels"], component["maskArea"])
            self.assertEqual(component["fileBytes"], (self.output / component["file"]).stat().st_size)
            self.assertEqual(component["fileSha256"], MODULE.sha256(self.output / component["file"]))

    def test_public_payload_is_byte_identical(self) -> None:
        paths = ["atlas.png", "manifest.json", "spine.atlas"] + [
            component["file"] for component in self.manifest["components"]
        ]
        for relative in paths:
            generated = self.output / relative
            public = self.public / relative
            self.assertTrue(public.is_file(), relative)
            self.assertEqual(generated.stat().st_size, public.stat().st_size)
            self.assertEqual(MODULE.sha256(generated), MODULE.sha256(public))
        self.assertEqual(self.manifest["atlas"]["imageSha256"], MODULE.sha256(self.output / "atlas.png"))
        self.assertEqual(self.manifest["atlas"]["spineAtlasSha256"], MODULE.sha256(self.output / "spine.atlas"))

    def test_manifest_is_deterministic(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            second = Path(directory) / "second"
            MODULE.extract(self.source, second, None)
            first_text = (self.output / "manifest.json").read_text(encoding="utf-8")
            second_text = (second / "manifest.json").read_text(encoding="utf-8")
        self.assertEqual(json.loads(first_text), json.loads(second_text))
        self.assertEqual(first_text, second_text)

    def test_preview_artifacts_preserve_the_107_frame_timebase(self) -> None:
        gif_path = self.source.parents[1] / "zhaoyun.tpose-rig.preview.gif"
        with Image.open(gif_path) as gif:
            durations = []
            for frame_index in range(gif.n_frames):
                gif.seek(frame_index)
                durations.append(int(gif.info.get("duration", 0)))
            self.assertEqual(gif.n_frames, 107)
            self.assertEqual(gif.size, (512, 512))
            self.assertEqual(set(durations), {40, 50})
            self.assertEqual(sum(durations), 4460)

        webm_path = self.source.parents[1] / "zhaoyun.tpose-rig.comparison.webm"
        capture = cv2.VideoCapture(str(webm_path))
        try:
            self.assertTrue(capture.isOpened())
            self.assertEqual(int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)), 1024)
            self.assertEqual(int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)), 512)
            self.assertEqual(int(capture.get(cv2.CAP_PROP_FRAME_COUNT)), 107)
            self.assertAlmostEqual(capture.get(cv2.CAP_PROP_FPS), 24.0, places=3)
        finally:
            capture.release()


if __name__ == "__main__":
    unittest.main()

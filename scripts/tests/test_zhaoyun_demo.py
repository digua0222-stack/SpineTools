from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPOSITORY_ROOT / "scripts" / "build_zhaoyun_demo.py"
SPEC = importlib.util.spec_from_file_location("build_zhaoyun_demo", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ZhaoYunDemoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.demo_dir = REPOSITORY_ROOT / "demo" / "zhaoyun"
        cls.document, cls.frames = MODULE.build_document(cls.demo_dir)

    def test_media_metadata_matches_real_source(self) -> None:
        video = self.document["video"]
        self.assertEqual(self.document["schemaVersion"], "motion-rig/v1")
        self.assertEqual((video["width"], video["height"]), (768, 768))
        self.assertEqual(video["frameCount"], 107)
        self.assertAlmostEqual(video["fps"], 24.0, places=3)
        self.assertEqual(len(self.frames), video["frameCount"])
        self.assertEqual(len(video["sha256"]), 64)

    def test_skeleton_and_every_frame_have_exactly_18_points(self) -> None:
        node_ids = [node["name"] for node in self.document["skeleton"]["nodes"]]
        self.assertEqual(len(node_ids), 18)
        self.assertEqual(len(set(node_ids)), 18)
        expected = set(node_ids)
        for frame in self.document["frames"]:
            self.assertEqual(set(frame["points"]), expected)

    def test_coordinates_confidence_and_time_are_in_range(self) -> None:
        video = self.document["video"]
        for expected_index, frame in enumerate(self.document["frames"]):
            self.assertEqual(frame["frameIndex"], expected_index)
            self.assertAlmostEqual(frame["timeSeconds"], expected_index / video["fps"], places=5)
            for point in frame["points"].values():
                self.assertGreaterEqual(point["x"], 0.0)
                self.assertLess(point["x"], video["width"])
                self.assertGreaterEqual(point["y"], 0.0)
                self.assertLess(point["y"], video["height"])
                self.assertGreaterEqual(point["confidence"], 0.0)
                self.assertLessEqual(point["confidence"], 1.0)
                self.assertIn(point["source"], {"demo_seed", "opencv_lk", "opencv_lk_fallback"})
                self.assertIsInstance(point["visible"], bool)
                self.assertFalse(point["locked"])

    def test_suggestions_reference_existing_frames_and_are_sorted(self) -> None:
        suggestions = self.document["suggestions"]
        self.assertGreater(len(suggestions), 0)
        priorities = [suggestion["priority"] for suggestion in suggestions]
        self.assertEqual(priorities, sorted(priorities, reverse=True))
        for suggestion in suggestions:
            self.assertIn(suggestion["frameIndex"], range(len(self.document["frames"])))
            self.assertGreaterEqual(suggestion["priority"], 0.0)
            self.assertLessEqual(suggestion["priority"], 1.0)
            self.assertTrue(suggestion["reasons"])

    def test_json_writer_round_trips_utf8(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "demo.motionrig.json"
            MODULE.write_json(output, self.document)
            loaded = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(loaded["project"]["title"], "赵云·银枪三连刺")
        self.assertEqual(loaded["video"]["frameCount"], 107)

    def test_web_payload_matches_source_bytes_and_hashes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            public_dir = Path(directory) / "public" / "demo" / "zhaoyun"
            web_document = MODULE.sync_web_assets(self.demo_dir, public_dir, self.document)
            source_video = self.demo_dir / "assets" / MODULE.VIDEO_NAME
            source_tpose = self.demo_dir / "assets" / MODULE.TPOS_NAME
            web_video = public_dir / "zhaoyun.mp4"
            web_tpose = public_dir / "tpose_parts.png"
            web_json = public_dir / "zhaoyun.motionrig.json"

            self.assertEqual(web_video.stat().st_size, source_video.stat().st_size)
            self.assertEqual(web_tpose.stat().st_size, source_tpose.stat().st_size)
            self.assertEqual(MODULE.sha256(web_video), MODULE.sha256(source_video))
            self.assertEqual(MODULE.sha256(web_tpose), MODULE.sha256(source_tpose))
            self.assertEqual(web_document["video"]["sha256"], MODULE.sha256(web_video))
            self.assertEqual(web_document["video"]["file"], "zhaoyun.mp4")
            self.assertEqual(web_document["referenceImages"][0]["file"], "tpose_parts.png")
            self.assertEqual(len(web_document["referenceImages"]), 1)
            self.assertTrue(web_json.is_file())


if __name__ == "__main__":
    unittest.main()

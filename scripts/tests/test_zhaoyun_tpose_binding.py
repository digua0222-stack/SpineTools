from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts.build_zhaoyun_tpose_binding import (
    DEFAULT_COMPONENTS,
    DEFAULT_OUTPUT,
    DEFAULT_PUBLIC_OUTPUT,
    build_manifest,
    read_json,
    write_json,
)


class ZhaoYunTposeBindingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.components = read_json(DEFAULT_COMPONENTS)
        cls.manifest = build_manifest(cls.components)

    def test_covers_every_extracted_component_exactly_once(self) -> None:
        component_ids = {item["id"] for item in self.components["components"]}
        part_ids = [item["id"] for item in self.manifest["parts"]]
        self.assertEqual(len(part_ids), 23)
        self.assertEqual(len(set(part_ids)), len(part_ids))
        self.assertEqual(set(part_ids), component_ids)

    def test_every_crop_and_anchor_stays_inside_the_atlas_or_part(self) -> None:
        atlas = self.manifest["atlas"]
        for part in self.manifest["parts"]:
            x, y, width, height = part["rect"]
            self.assertGreater(width, 0)
            self.assertGreater(height, 0)
            self.assertGreaterEqual(x, 0)
            self.assertGreaterEqual(y, 0)
            self.assertLessEqual(x + width, atlas["width"])
            self.assertLessEqual(y + height, atlas["height"])
            for anchor in part["anchors"]:
                self.assertGreaterEqual(anchor["local"][0], 0)
                self.assertGreaterEqual(anchor["local"][1], 0)
                self.assertLessEqual(anchor["local"][0], width)
                self.assertLessEqual(anchor["local"][1], height)

    def test_nodes_match_the_current_motion_rig_skeleton(self) -> None:
        project_path = Path(__file__).resolve().parents[2] / "demo/zhaoyun/zhaoyun.motionrig.json"
        project = json.loads(project_path.read_text(encoding="utf-8"))
        node_names = {
            node["name"] if isinstance(node, dict) else node
            for node in project["skeleton"]["nodes"]
        }
        referenced = {
            anchor["node"]
            for part in self.manifest["parts"]
            for anchor in part["anchors"]
        }
        referenced.update(
            node
            for part in self.manifest["parts"]
            for node in part.get("driverNodes", [])
        )
        self.assertTrue(referenced <= node_names)
        self.assertIn("weapon_tip", referenced)
        self.assertNotIn("weapon_tail", referenced)

    def test_json_round_trip_is_utf8_and_deterministic(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "赵云.tpose-bind.json"
            write_json(target, self.manifest)
            first = target.read_bytes()
            write_json(target, json.loads(first.decode("utf-8")))
            self.assertEqual(target.read_bytes(), first)
        atlas_file = self.manifest["atlas"]["file"]
        self.assertTrue((DEFAULT_OUTPUT.parent / atlas_file).is_file())
        self.assertTrue((DEFAULT_PUBLIC_OUTPUT.parent / atlas_file).is_file())


if __name__ == "__main__":
    unittest.main()

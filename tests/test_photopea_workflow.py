"""Offline invariants for the optional Photopea workflow (no MCP/browser calls)."""
import argparse
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
AVAILABLE = all(importlib.util.find_spec(name) for name in ["numpy", "PIL", "psd_tools", "scipy"]) and sys.version_info >= (3, 11)
if AVAILABLE:
    import numpy as np
    from PIL import Image
    spec = importlib.util.spec_from_file_location("photopea_replay_test", REPO / "scripts/photopea/replay.py")
    workflow = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(workflow)


@unittest.skipUnless(AVAILABLE, "Install scripts/photopea/requirements.txt with Python 3.11+ for optional tests")
class PhotopeaWorkflowTests(unittest.TestCase):
    def test_run_compression_preserves_holes_and_disjoint_regions(self):
        mask = np.zeros((9, 11), dtype=bool)
        mask[1:8, 1:10] = True
        mask[3:6, 4:7] = False
        mask[0, 0] = True
        mask[8, 10] = True
        decoded = np.zeros_like(mask)
        for polygon in workflow.mask_rectangles(mask, 13, 29):
            x0, y0 = polygon[0]
            x1, y1 = polygon[2]
            decoded[y0 - 29:y1 - 29, x0 - 13:x1 - 13] = True
        np.testing.assert_array_equal(decoded, mask)

    def test_transparent_rgb_is_not_visible_error(self):
        a = Image.new("RGBA", (3, 2), (255, 80, 90, 0))
        b = Image.new("RGBA", (3, 2), (0, 0, 0, 0))
        self.assertEqual(workflow.visible_error(a, b)["premultipliedRGB_MAE"], 0)
        b.putpixel((1, 1), (0, 0, 0, 255))
        with self.assertRaises(ValueError):
            workflow.require_same(a, b)

    def test_opaque_color_difference_is_rejected(self):
        a = Image.new("RGBA", (1, 1), (255, 0, 0, 255))
        b = Image.new("RGBA", (1, 1), (0, 0, 0, 255))
        with self.assertRaises(ValueError):
            workflow.require_same(a, b)

    def test_parent_rotation_transforms_joint_offsets(self):
        world = workflow.bone_world([{"name": "root", "x": 5, "y": 7, "rotation": 90},
                                    {"name": "arm", "parent": "root", "x": 10, "rotation": -90}])
        self.assertAlmostEqual(world["arm"][0], 5)
        self.assertAlmostEqual(world["arm"][1], 17)
        self.assertAlmostEqual(world["arm"][2], 0)

    def test_unsupported_or_unordered_bones_fail(self):
        for bones in [[{"name": "child", "parent": "root"}],
                      [{"name": "root", "scaleX": 2}],
                      [{"name": "root"}, {"name": "root"}]]:
            with self.subTest(bones=bones), self.assertRaises(ValueError):
                workflow.bone_world(bones)

    def test_unreviewed_source_fails_before_creating_output(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            case = root / "case"
            case.mkdir()
            source = root / "source.png"
            Image.new("RGBA", (2, 2), (0, 0, 0, 255)).save(source)
            (case / "recipe.json").write_text(json.dumps({"name": "test", "source": "../source.png",
                "sourceSize": [2, 2], "sourceSHA256": "unreviewed"}), encoding="utf-8")
            (case / "rig.json").write_text("{}", encoding="utf-8")
            args = argparse.Namespace(case=case, source=None, output=root / "out", codex_config=root / "unused.toml", mcp_server="photopea")
            with self.assertRaisesRegex(ValueError, "SHA256"):
                workflow.Job(args)
            self.assertFalse(args.output.exists())


if __name__ == "__main__":
    unittest.main()

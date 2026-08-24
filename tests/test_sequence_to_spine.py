from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from sequence_to_spine import export, gif_durations, load_group


class SequenceToSpineTest(unittest.TestCase):
    def test_gif_durations_preserve_12_fps_total_in_centiseconds(self) -> None:
        durations = gif_durations(54, 12)
        self.assertEqual(set(durations), {80, 90})
        self.assertEqual(sum(durations), 4500)

    def test_export_builds_valid_sequence_timeline_and_pixel_exact_atlas(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            frames_dir = root / "frames"
            output_dir = root / "output"
            frames_dir.mkdir()

            colors = [(255, 0, 0, 255), (0, 255, 0, 255), (0, 0, 255, 255)]
            for index, color in enumerate(colors):
                image = Image.new("RGBA", (12, 8), (0, 0, 0, 0))
                image.paste(color, (index, 1, index + 5, 7))
                image.save(frames_dir / f"frame_{index:03d}.png")

            group = load_group(
                group_id="group-1",
                name="attack",
                fps=10,
                input_path=frames_dir,
                pattern="frame_*.png",
                sheet_cols=None,
                sheet_rows=None,
                auto_sheet=False,
                event=None,
            )
            report = export(
                groups=[group],
                output_dir=output_dir,
                output_name="hero_attack",
                spine_version="4.2.43",
                columns=10,
                padding=2,
                make_zip=True,
                make_gif=True,
            )

            self.assertEqual(report["verification"]["pixel_exact_frames"], 3)
            self.assertEqual(report["atlas"]["regions"], 3)
            self.assertEqual(report["atlas"]["width"], 142)
            self.assertEqual(report["atlas"]["height"], 12)

            skeleton = json.loads((output_dir / "hero_attack.json").read_text("utf-8"))
            timeline = skeleton["animations"]["attack"]["slots"]["frame"]["attachment"]
            self.assertEqual(
                timeline,
                [
                    {"time": 0, "name": "frame_0"},
                    {"time": 0.1, "name": "frame_1"},
                    {"time": 0.2, "name": "frame_2"},
                    {"time": 0.30000000000000004, "name": "frame_0"},
                ],
            )
            self.assertTrue((output_dir / "hero_attack.atlas").is_file())
            self.assertTrue((output_dir / "hero_attack.png").is_file())
            self.assertTrue((output_dir / "hero_attack.zip").is_file())
            gif_path = output_dir / "hero_attack.gif"
            self.assertTrue(gif_path.is_file())
            with Image.open(gif_path) as preview:
                self.assertEqual(preview.n_frames, 3)
                self.assertEqual(preview.info.get("loop"), 0)
                durations = []
                for index in range(preview.n_frames):
                    preview.seek(index)
                    durations.append(preview.info.get("duration", 0))
            self.assertEqual(sum(durations), 300)
            self.assertEqual(report["gif_previews"][0]["frames"], 3)

            second_report = export(
                groups=[group],
                output_dir=output_dir,
                output_name="hero_attack",
                spine_version="4.2.43",
                columns=10,
                padding=2,
                make_zip=True,
                make_gif=True,
            )
            self.assertEqual(second_report["gif_previews"][0]["duration_ms"], 300)


if __name__ == "__main__":
    unittest.main()

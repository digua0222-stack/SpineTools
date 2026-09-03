"""AC-01 acceptance tests: export denoise correctness and hardened verify.

Covers the documented mis-deletion reproduction (2x20 block must stay 40),
single-pixel/thin-line/multi-component/semi-transparent edge cases, and the
verification rules: extra parts, missing paths, source/model/prompts
mismatches must not PASS.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys

import numpy as np
import pytest
from PIL import Image

from spinetools.sam.segment import export_part, remove_small_components
from spinetools.sam.verify import collect_hashes, crosscheck_inputs


class TestRemoveSmallComponents:
    def test_2x20_block_stays_40(self):
        # Documented AC-01 reproduction: pre-listed row starts must not split
        # an already-claimed component (was 40 -> 21).
        mask = np.ones((2, 20), dtype=bool)
        assert int(remove_small_components(mask, 10).sum()) == 40

    def test_single_pixel_dropped(self):
        mask = np.zeros((5, 5), dtype=bool)
        mask[2, 2] = True
        assert not remove_small_components(mask, 10).any()

    def test_thin_line_kept_when_long_enough(self):
        line = np.zeros((3, 20), dtype=bool)
        line[1, :15] = True
        assert int(remove_small_components(line, 10).sum()) == 15
        short = np.zeros((3, 20), dtype=bool)
        short[1, :9] = True
        assert not remove_small_components(short, 10).any()

    def test_multi_component_independent(self):
        mask = np.zeros((10, 40), dtype=bool)
        mask[0:4, 0:3] = True  # 12 px - kept
        mask[5:9, 10:13] = True  # 12 px - kept
        mask[0, 20] = True  # 1 px - dropped
        out = remove_small_components(mask, 10)
        assert int(out.sum()) == 24
        assert out[0, 0] and out[5, 10] and not out[0, 20]

    def test_exact_threshold_kept(self):
        mask = np.zeros((3, 5), dtype=bool)
        mask[:2, :] = True  # exactly 10 px
        mask[0, 0] = False  # 9 px now
        assert not remove_small_components(mask, 10).any()
        mask[0, 0] = True
        assert int(remove_small_components(mask, 10).sum()) == 10


class TestExportPart:
    def test_semi_transparent_edge_preserved(self, tmp_path):
        src = np.zeros((10, 10, 4), np.uint8)
        src[..., :] = (10, 20, 30, 255)
        src[0, :, 3] = 128  # semi-transparent edge row
        src[9, :, 3] = 0  # fully transparent row
        mask = np.ones((10, 10), dtype=bool)
        masks_dir = tmp_path / "masks"
        parts_dir = tmp_path / "parts"
        masks_dir.mkdir()
        parts_dir.mkdir()
        meta = export_part(src, mask, "p", str(masks_dir), str(parts_dir))
        # alpha=0 row excluded; semi-transparent row kept with original alpha.
        assert meta["pixelCount"] == 90
        part = np.array(Image.open(parts_dir / "p.png").convert("RGBA"))
        assert part.shape == (9, 10, 4)
        assert (part[0, :, 3] == 128).all()
        exported_mask = np.array(Image.open(masks_dir / "p.png")) > 0
        assert exported_mask.shape == (10, 10)
        assert int(exported_mask.sum()) == 90

    def test_empty_mask_rejected(self, tmp_path):
        src = np.zeros((4, 4, 4), np.uint8)
        masks_dir = tmp_path / "m"
        parts_dir = tmp_path / "p"
        masks_dir.mkdir()
        parts_dir.mkdir()
        with pytest.raises(ValueError, match="empty mask"):
            export_part(src, np.zeros((4, 4), bool), "x", str(masks_dir), str(parts_dir))


def make_run(tmp_path, part_pixels=(255, 0, 0, 255)) -> str:
    run = tmp_path / "run"
    for sub in ("parts", "masks", "source", "reports"):
        (run / sub).mkdir(parents=True)
    part = np.full((4, 4, 4), part_pixels, np.uint8)
    Image.fromarray(part).save(run / "parts" / "a.png")
    Image.fromarray(np.full((4, 4), 255, np.uint8)).save(run / "masks" / "a.png")
    Image.fromarray(part).save(run / "source" / "standing.png")
    report = {"modelSha256": "model-x", "promptsSha256": "prompts-x"}
    (run / "reports" / "segmentation-report.json").write_text(json.dumps(report))
    return str(run)


def expected_for(run: str, **extra) -> dict:
    exp = {
        "hashes": collect_hashes(run),
        "sourceSha256": extra.get(
            "sourceSha256",
            __import__("hashlib").sha256(open(os.path.join(run, "source", "standing.png"), "rb").read()).hexdigest(),
        ),
        "modelSha256": "model-x",
        "promptsSha256": "prompts-x",
    }
    return exp


class TestVerifyHardening:
    def run_verify(self, run: str, exp: dict) -> subprocess.CompletedProcess:
        with open(os.path.join(run, "expected.json"), "w") as f:
            json.dump(exp, f)
        return subprocess.run(
            [sys.executable, "-m", "spinetools.sam.verify", "--run", run, "--expected", os.path.join(run, "expected.json")],
            capture_output=True,
            text=True,
        )

    def test_clean_run_passes(self, tmp_path):
        run = make_run(tmp_path)
        proc = self.run_verify(run, expected_for(run))
        assert proc.returncode == 0, proc.stdout
        assert "[verify] PASS" in proc.stdout

    def test_extra_part_fails(self, tmp_path):
        run = make_run(tmp_path)
        exp = expected_for(run)
        Image.fromarray(np.full((4, 4, 4), (0, 255, 0, 255), np.uint8)).save(
            os.path.join(run, "parts", "extra.png")
        )
        proc = self.run_verify(run, exp)
        assert proc.returncode == 1
        assert "parts/extra.png" in proc.stdout

    def test_missing_part_fails(self, tmp_path):
        run = make_run(tmp_path)
        exp = expected_for(run)
        os.remove(os.path.join(run, "parts", "a.png"))
        proc = self.run_verify(run, exp)
        assert proc.returncode == 1

    def test_mismatched_part_fails(self, tmp_path):
        run = make_run(tmp_path)
        exp = expected_for(run)
        Image.fromarray(np.full((4, 4, 4), (9, 9, 9, 255), np.uint8)).save(
            os.path.join(run, "parts", "a.png")
        )
        proc = self.run_verify(run, exp)
        assert proc.returncode == 1

    def test_source_mismatch_fails(self, tmp_path):
        run = make_run(tmp_path)
        exp = expected_for(run, sourceSha256="0" * 64)
        assert crosscheck_inputs(run, exp)
        proc = self.run_verify(run, exp)
        assert proc.returncode == 1

    def test_model_mismatch_fails(self, tmp_path):
        run = make_run(tmp_path)
        exp = expected_for(run)
        exp["modelSha256"] = "model-y"
        assert crosscheck_inputs(run, exp)
        proc = self.run_verify(run, exp)
        assert proc.returncode == 1

    def test_missing_report_fails(self, tmp_path):
        run = make_run(tmp_path)
        exp = expected_for(run)
        os.remove(os.path.join(run, "reports", "segmentation-report.json"))
        proc = self.run_verify(run, exp)
        assert proc.returncode == 1

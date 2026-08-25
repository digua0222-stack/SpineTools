from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT_ROOT = ROOT / "scripts" / "seethrough"


def load_smoke_module():
    path = SCRIPT_ROOT / "smoke_test.py"
    spec = importlib.util.spec_from_file_location("seethrough_smoke_test", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SeeThroughToolingTest(unittest.TestCase):
    def test_runtime_pins_are_immutable_revisions(self) -> None:
        config = json.loads((SCRIPT_ROOT / "config.json").read_text("utf-8"))
        self.assertRegex(config["plugin"]["commit"], r"^[0-9a-f]{40}$")
        self.assertRegex(config["comfyUi"]["testedCommit"], r"^[0-9a-f]{40}$")
        for model in config["models"]:
            self.assertRegex(model["revision"], r"^[0-9a-f]{40}$")
        for auxiliary in config["auxiliaryHubFiles"]:
            self.assertRegex(auxiliary["revision"], r"^[0-9a-f]{40}$")
            self.assertEqual(auxiliary["cacheRef"], "main")
        self.assertEqual(config["torchIndexUrl"], "https://download.pytorch.org/whl/cu126")
        self.assertEqual(
            config["torchPackages"],
            [
                "torch==2.13.0+cu126",
                "torchvision==0.28.0+cu126",
                "torchaudio==2.11.0+cu126",
            ],
        )
        self.assertEqual(config["minimumFreeVramMiBForPilotInference"], 7000)
        self.assertEqual(config["minimumFreeVramMiBForInference"], 9500)
        self.assertEqual(config["platforms"]["windows"]["accelerator"], "cuda")
        self.assertTrue(config["platforms"]["windows"]["groupOffloadDefault"])
        self.assertEqual(config["platforms"]["macos"]["accelerator"], "mps")
        self.assertFalse(config["platforms"]["macos"]["groupOffloadDefault"])

    def test_dependency_lock_exists(self) -> None:
        lock = (SCRIPT_ROOT / "requirements-win-cu126.lock.txt").read_text("utf-8")
        self.assertIn("diffusers==0.40.0", lock)
        self.assertIn("bitsandbytes==0.50.1", lock)
        self.assertIn("torch==2.13.0+cu126", lock)
        mac_requirements = (SCRIPT_ROOT / "requirements-macos.txt").read_text("utf-8")
        self.assertIn("diffusers==0.40.0", mac_requirements)
        self.assertNotIn("bitsandbytes==", mac_requirements)

    def test_smoke_prompt_is_local_only_and_low_vram(self) -> None:
        module = load_smoke_module()
        prompt = module.build_prompt("input.png", "pilot", 1024, 720, 4)
        self.assertEqual(prompt["8"]["class_type"], "JoinImageWithAlpha")
        self.assertEqual(prompt["8"]["inputs"]["image"], ["1", 0])
        self.assertEqual(prompt["8"]["inputs"]["alpha"], ["1", 1])
        self.assertEqual(prompt["4"]["inputs"]["image"], ["8", 0])
        self.assertFalse(prompt["2"]["inputs"]["auto_download"])
        self.assertFalse(prompt["3"]["inputs"]["auto_download"])
        self.assertTrue(prompt["2"]["inputs"]["group_offload"])
        self.assertTrue(prompt["3"]["inputs"]["group_offload"])
        self.assertEqual(prompt["4"]["inputs"]["resolution"], 1024)
        self.assertEqual(prompt["5"]["inputs"]["resolution_depth"], 720)
        self.assertFalse(prompt["6"]["inputs"]["use_lama"])

        mac_prompt = module.build_prompt(
            "input.png",
            "mac",
            768,
            512,
            30,
            group_offload=False,
            tblr_split=False,
            use_lama=True,
        )
        self.assertFalse(mac_prompt["2"]["inputs"]["group_offload"])
        self.assertFalse(mac_prompt["3"]["inputs"]["group_offload"])
        self.assertFalse(mac_prompt["6"]["inputs"]["tblr_split"])
        self.assertTrue(mac_prompt["6"]["inputs"]["use_lama"])

        opaque = module.build_prompt("input.png", "baseline", 512, 384, 30, alpha_mode="opaque")
        self.assertNotIn("8", opaque)
        self.assertEqual(opaque["4"]["inputs"]["image"], ["1", 0])

    def test_maintenance_scripts_exist(self) -> None:
        for name in [
            "Install.ps1",
            "Download-Models.ps1",
            "Diagnose.ps1",
            "Start.ps1",
            "Test-Installation.ps1",
            "Generate.ps1",
            "install_runtime.py",
            "generate.py",
            "install.sh",
            "generate.sh",
        ]:
            self.assertTrue((SCRIPT_ROOT / name).is_file(), name)

    def test_runtime_uses_an_isolated_comfy_user_directory(self) -> None:
        install = (SCRIPT_ROOT / "install_runtime.py").read_text("utf-8")
        start = (SCRIPT_ROOT / "Start.ps1").read_text("utf-8")
        self.assertIn("network_mode = offline", install)
        self.assertIn('"--user-directory", $runtimeUserRoot', start)
        self.assertIn("HF_HUB_CACHE", start)

    def test_export_copy_keeps_json_and_referenced_files_together(self) -> None:
        module = load_smoke_module()
        self.assertEqual(module.safe_prefix("赵云 切片"), "赵云_切片")
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            comfy_output = root / "comfy-output"
            export = root / "export"
            comfy_output.mkdir()
            (comfy_output / "part.png").write_bytes(b"part")
            (comfy_output / "part_depth.png").write_bytes(b"depth")
            info = {
                "layers": [
                    {
                        "name": "part",
                        "filename": "part.png",
                        "depth_filename": "part_depth.png",
                    }
                ]
            }
            info_path = comfy_output / "layers.json"
            info_path.write_text(json.dumps(info), "utf-8")
            source = root / "source.png"
            source.write_bytes(b"source")
            copied_info, copied = module.copy_outputs(info_path, info, export, source, "demo")
            self.assertEqual(copied_info, export / "layers.json")
            self.assertEqual(len(copied), 4)
            self.assertTrue((export / "part.png").is_file())
            self.assertTrue((export / "part_depth.png").is_file())
            self.assertTrue((export / "demo_source.png").is_file())

    def test_cross_platform_install_dry_runs(self) -> None:
        for target_platform in ["windows", "macos"]:
            completed = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT_ROOT / "install_runtime.py"),
                    "--platform",
                    target_platform,
                    "--comfy-root",
                    str(ROOT / ".dry-run" / target_platform / "ComfyUI"),
                    "--download-models",
                    "--dry-run",
                ],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
            )
            self.assertEqual(completed.returncode, 0, completed.stdout)
            self.assertIn("[dry-run]", completed.stdout)


if __name__ == "__main__":
    unittest.main()

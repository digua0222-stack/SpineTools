from __future__ import annotations

import importlib.util
import json
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

    def test_dependency_lock_exists(self) -> None:
        lock = (SCRIPT_ROOT / "requirements-win-cu126.lock.txt").read_text("utf-8")
        self.assertIn("diffusers==0.40.0", lock)
        self.assertIn("bitsandbytes==0.50.1", lock)
        self.assertIn("torch==2.13.0+cu126", lock)

    def test_smoke_prompt_is_local_only_and_low_vram(self) -> None:
        module = load_smoke_module()
        prompt = module.build_prompt("input.png", "pilot", 1024, 720, 4)
        self.assertFalse(prompt["2"]["inputs"]["auto_download"])
        self.assertFalse(prompt["3"]["inputs"]["auto_download"])
        self.assertTrue(prompt["2"]["inputs"]["group_offload"])
        self.assertTrue(prompt["3"]["inputs"]["group_offload"])
        self.assertEqual(prompt["4"]["inputs"]["resolution"], 1024)
        self.assertEqual(prompt["5"]["inputs"]["resolution_depth"], 720)
        self.assertFalse(prompt["6"]["inputs"]["use_lama"])

    def test_maintenance_scripts_exist(self) -> None:
        for name in [
            "Install.ps1",
            "Download-Models.ps1",
            "Diagnose.ps1",
            "Start.ps1",
            "Test-Installation.ps1",
        ]:
            self.assertTrue((SCRIPT_ROOT / name).is_file(), name)

    def test_runtime_uses_an_isolated_comfy_user_directory(self) -> None:
        install = (SCRIPT_ROOT / "Install.ps1").read_text("utf-8")
        start = (SCRIPT_ROOT / "Start.ps1").read_text("utf-8")
        self.assertIn("network_mode = offline", install)
        self.assertIn('"--user-directory", $runtimeUserRoot', start)
        self.assertIn("HF_HUB_CACHE", start)


if __name__ == "__main__":
    unittest.main()

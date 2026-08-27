from __future__ import annotations

import importlib.util
import os
import shlex
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT_ROOT = ROOT / "scripts" / "seethrough"


def find_bash() -> Path | None:
    discovered = shutil.which("bash")
    if discovered:
        return Path(discovered)
    if os.name != "nt" or shutil.which("git") is None:
        return None
    try:
        git_exec_path = Path(
            subprocess.check_output(["git", "--exec-path"], text=True).strip()
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    for candidate in [
        git_exec_path.parents[1] / "bin" / "bash.exe",
        git_exec_path.parents[2] / "bin" / "bash.exe",
        git_exec_path.parents[2] / "usr" / "bin" / "bash.exe",
    ]:
        if candidate.is_file():
            return candidate
    return None


def bash_path(path: Path) -> str:
    resolved = path.resolve()
    if os.name != "nt":
        return str(resolved)
    drive = resolved.drive.rstrip(":").lower()
    suffix = resolved.as_posix().split(":", 1)[1]
    return f"/{drive}{suffix}"


def load_install_runtime_module():
    path = SCRIPT_ROOT / "install_runtime.py"
    spec = importlib.util.spec_from_file_location("seethrough_install_runtime", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class LinuxBootstrapTest(unittest.TestCase):
    def test_bootstrap_contract_and_h20_defaults(self) -> None:
        bootstrap = (SCRIPT_ROOT / "bootstrap-linux.sh").read_text("utf-8")
        for option in [
            "--comfy-root",
            "--venv-root",
            "--output-dir",
            "--hf-endpoint",
            "--preset",
            "--seed",
            "--seeds",
            "--input",
            "--quality-profile",
            "--install-only",
            "--python-install-timeout",
            "--python-install-retries",
        ]:
            self.assertIn(option, bootstrap)
        self.assertIn('PRESET_SPEC="probe,balanced"', bootstrap)
        self.assertIn('QUANT_MODE="none"', bootstrap)
        self.assertIn('GROUP_OFFLOAD="off"', bootstrap)
        self.assertIn("install-audit.tar.gz", bootstrap)
        self.assertIn("pip-freeze.txt", bootstrap)
        self.assertIn("archive_directory", bootstrap)

        zhaoyun_runner = (SCRIPT_ROOT / "test-zhaoyun.sh").read_text("utf-8")
        self.assertIn(
            ': "${RESOLUTION:=2048}"; : "${DEPTH_RESOLUTION:=720}"; : "${STEPS:=100}"',
            zhaoyun_runner,
        )
        self.assertNotIn(
            ': "${RESOLUTION:=2048}"; : "${DEPTH_RESOLUTION:=2048}"; : "${STEPS:=100}"',
            zhaoyun_runner,
        )

    def test_linux_installer_uses_only_official_python_fallback(self) -> None:
        installer = (SCRIPT_ROOT / "install-linux.sh").read_text("utf-8")
        official = (
            "https://github.com/astral-sh/python-build-standalone/releases/download"
        )
        self.assertIn(official, installer)
        self.assertIn("UV_PYTHON_INSTALL_MIRROR", installer)
        self.assertIn("timeout --foreground", installer)
        self.assertIn("UV_HTTP_RETRIES", installer)
        self.assertIn("apt-get install", installer)
        self.assertIn("dnf install", installer)
        # TencentOS 3.2 ships curl 7.61, which predates --retry-all-errors.
        self.assertNotIn("--retry-all-errors", installer)
        for untrusted_proxy in ["ghproxy", "fastgit", "kkgithub", "github.moeyy"]:
            self.assertNotIn(untrusted_proxy, installer.lower())

    def test_existing_dirty_comfyui_is_left_untouched(self) -> None:
        module = load_install_runtime_module()
        with tempfile.TemporaryDirectory() as temporary:
            comfy_root = Path(temporary) / "ComfyUI"
            comfy_root.mkdir()
            subprocess.run(["git", "init", "-q", str(comfy_root)], check=True)
            subprocess.run(
                [
                    "git",
                    "-C",
                    str(comfy_root),
                    "config",
                    "user.email",
                    "test@example.invalid",
                ],
                check=True,
            )
            subprocess.run(
                ["git", "-C", str(comfy_root), "config", "user.name", "Bootstrap Test"],
                check=True,
            )
            main_py = comfy_root / "main.py"
            main_py.write_text("# pinned\n", "utf-8")
            subprocess.run(["git", "-C", str(comfy_root), "add", "main.py"], check=True)
            subprocess.run(
                ["git", "-C", str(comfy_root), "commit", "-qm", "initial"], check=True
            )
            main_py.write_text("# user change\n", "utf-8")

            with self.assertRaisesRegex(RuntimeError, "left untouched"):
                module.ensure_comfyui(
                    comfy_root,
                    {"comfyUi": {"testedCommit": "0" * 40}},
                    dry_run=False,
                )
            self.assertEqual(main_py.read_text("utf-8"), "# user change\n")

    def test_shell_scripts_parse_and_show_help(self) -> None:
        bash = find_bash()
        if bash is None:
            self.skipTest("bash is unavailable")
        for name in ["bootstrap-linux.sh", "install-linux.sh", "test-zhaoyun.sh"]:
            script = SCRIPT_ROOT / name
            syntax = subprocess.run(
                [str(bash), "-n", bash_path(script)],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
            )
            self.assertEqual(syntax.returncode, 0, syntax.stdout)
        help_result = subprocess.run(
            [str(bash), bash_path(SCRIPT_ROOT / "bootstrap-linux.sh"), "--help"],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        self.assertEqual(help_result.returncode, 0, help_result.stdout)
        self.assertIn("probe,balanced", help_result.stdout)

    def test_bootstrap_dry_run_is_gpu_free_and_does_not_create_output(self) -> None:
        bash = find_bash()
        if bash is None:
            self.skipTest("bash is unavailable")
        with tempfile.TemporaryDirectory() as temporary:
            temporary_root = Path(temporary)
            fake_bin = temporary_root / "fake-bin"
            fake_bin.mkdir()
            (fake_bin / "uname").write_text(
                "#!/usr/bin/env bash\n"
                "case \"${1:-}\" in\n"
                "  -s) echo Linux ;;\n"
                "  -m) echo x86_64 ;;\n"
                "  -a) echo 'Linux ci 6.1 x86_64 GNU/Linux' ;;\n"
                "  -srmo) echo 'Linux 6.1 x86_64 GNU/Linux' ;;\n"
                "  *) echo Linux ;;\n"
                "esac\n",
                "utf-8",
            )
            (fake_bin / "apt-get").write_text("#!/usr/bin/env bash\nexit 0\n", "utf-8")
            (fake_bin / "python3").write_text(
                "#!/usr/bin/env bash\nprintf '%s\\n' '[dry-run] mocked runtime plan'\n",
                "utf-8",
            )
            for fake_command in fake_bin.iterdir():
                fake_command.chmod(0o755)

            output_root = temporary_root / "output"
            command = " ".join(
                [
                    f"PATH={shlex.quote(bash_path(fake_bin))}:$PATH",
                    shlex.quote(bash_path(SCRIPT_ROOT / "bootstrap-linux.sh")),
                    "--dry-run",
                    "--preset",
                    "probe,balanced",
                    "--seeds",
                    "7,42",
                    "--comfy-root",
                    shlex.quote(bash_path(temporary_root / "ComfyUI")),
                    "--venv-root",
                    shlex.quote(bash_path(temporary_root / "venv")),
                    "--output-dir",
                    shlex.quote(bash_path(output_root)),
                ]
            )
            completed = subprocess.run(
                [str(bash), "-c", command],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
            )
            self.assertEqual(completed.returncode, 0, completed.stdout)
            self.assertIn("quant=none, group-offload=off", completed.stdout)
            self.assertIn("preset:           probe", completed.stdout)
            self.assertIn("preset:           balanced", completed.stdout)
            self.assertIn("steps / seed:     1 / 7", completed.stdout)
            self.assertIn("steps / seed:     30 / 42", completed.stdout)
            self.assertIn("no session directory was created", completed.stdout)
            self.assertFalse(output_root.exists())

    def test_python_stall_retries_with_official_github_mirror(self) -> None:
        bash = find_bash()
        if bash is None:
            self.skipTest("bash is unavailable")
        prerequisites = subprocess.run(
            [str(bash), "-c", "command -v curl >/dev/null && command -v timeout >/dev/null"],
            check=False,
        )
        if prerequisites.returncode != 0:
            self.skipTest("curl or GNU timeout is unavailable")
        with tempfile.TemporaryDirectory() as temporary:
            temporary_root = Path(temporary)
            fake_bin = temporary_root / "fake-bin"
            fake_bin.mkdir()
            state = temporary_root / "uv-attempts.txt"
            bootstrap_python = fake_bin / "bootstrap-python"
            (fake_bin / "uname").write_text(
                "#!/usr/bin/env bash\nprintf '%s\\n' Linux\n", "utf-8"
            )
            (fake_bin / "uv").write_text(
                "#!/usr/bin/env bash\n"
                "if [[ \"${1:-} ${2:-}\" == 'python install' ]]; then\n"
                "  printf '%s\\n' \"${UV_PYTHON_INSTALL_MIRROR:-default}\" >>\"$UV_TEST_STATE\"\n"
                "  if [[ -z \"${UV_PYTHON_INSTALL_MIRROR:-}\" ]]; then exec sleep 10; fi\n"
                "  exit 0\n"
                "fi\n"
                "if [[ \"${1:-} ${2:-}\" == 'python find' ]]; then\n"
                "  printf '%s\\n' \"$BOOTSTRAP_PYTHON_PATH\"\n"
                "  exit 0\n"
                "fi\n"
                "exit 2\n",
                "utf-8",
            )
            bootstrap_python.write_text("#!/usr/bin/env bash\nexit 0\n", "utf-8")
            for fake_command in fake_bin.iterdir():
                fake_command.chmod(0o755)

            command = " ".join(
                [
                    f"PATH={shlex.quote(bash_path(fake_bin))}:$PATH",
                    f"UV_TEST_STATE={shlex.quote(bash_path(state))}",
                    f"BOOTSTRAP_PYTHON_PATH={shlex.quote(bash_path(bootstrap_python))}",
                    shlex.quote(bash_path(SCRIPT_ROOT / "install-linux.sh")),
                    "--skip-system-packages",
                    "--python-install-timeout",
                    "1",
                    "--python-install-retries",
                    "2",
                ]
            )
            completed = subprocess.run(
                [str(bash), "-c", command],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
            )
            self.assertEqual(completed.returncode, 0, completed.stdout)
            attempts = state.read_text("utf-8").splitlines()
            self.assertEqual(attempts[0], "default")
            self.assertEqual(
                attempts[1],
                "https://github.com/astral-sh/python-build-standalone/releases/download",
            )
            self.assertIn("[fallback]", completed.stdout)
            self.assertIn("stalled and was stopped", completed.stdout)


if __name__ == "__main__":
    unittest.main()

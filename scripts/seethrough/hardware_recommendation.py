#!/usr/bin/env python3
"""Print local GPU details and recommend Zhao Yun See-through example parameters."""

from __future__ import annotations

import argparse
import csv
import ctypes
import json
import os
import platform
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCRIPT_ROOT = Path(__file__).resolve().parent
CONFIG_PATH = SCRIPT_ROOT / "config.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Print GPU/VRAM details and recommend See-through example parameters."
    )
    parser.add_argument("--format", choices=["text", "json"], default="text")
    parser.add_argument("--json-out", type=Path)
    parser.add_argument("--gpu-index", type=int)
    parser.add_argument(
        "--platform", choices=["auto", "windows", "macos", "linux"], default="auto"
    )
    return parser.parse_args()


def run_capture(command: list[str]) -> str | None:
    try:
        completed = subprocess.run(
            command,
            check=True,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        return completed.stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def numeric(value: str, *, integer: bool = True) -> int | float | None:
    normalized = value.strip().replace(" MiB", "").replace(" W", "")
    if not normalized or normalized.lower() in {"n/a", "[not supported]"}:
        return None
    try:
        return int(float(normalized)) if integer else float(normalized)
    except ValueError:
        return None


def find_nvidia_smi() -> str | None:
    found = shutil.which("nvidia-smi")
    if found:
        return found
    if platform.system() == "Windows":
        windows_root = Path(os.environ.get("WINDIR", r"C:\Windows"))
        candidates = [
            windows_root / "System32" / "nvidia-smi.exe",
            Path(os.environ.get("ProgramFiles", r"C:\Program Files"))
            / "NVIDIA Corporation"
            / "NVSMI"
            / "nvidia-smi.exe",
        ]
        return next((str(path) for path in candidates if path.is_file()), None)
    return None


def detect_nvidia_gpus() -> tuple[list[dict[str, Any]], str | None]:
    executable = find_nvidia_smi()
    if not executable:
        return [], None
    fields = [
        "index",
        "name",
        "uuid",
        "driver_version",
        "memory.total",
        "memory.free",
        "memory.used",
        "utilization.gpu",
        "temperature.gpu",
        "compute_cap",
    ]
    output = run_capture(
        [executable, f"--query-gpu={','.join(fields)}", "--format=csv,noheader,nounits"]
    )
    if not output:
        return [], executable
    power_output = run_capture(
        [executable, "--query-gpu=power.draw,power.limit", "--format=csv,noheader,nounits"]
    )
    power_rows = list(csv.reader(power_output.splitlines())) if power_output else []
    gpus: list[dict[str, Any]] = []
    for row_number, row in enumerate(csv.reader(output.splitlines())):
        if len(row) != len(fields):
            continue
        values = [value.strip() for value in row]
        gpu = {
            "index": numeric(values[0]),
            "name": values[1],
            "uuid": values[2],
            "driverVersion": values[3],
            "memoryTotalMiB": numeric(values[4]),
            "memoryFreeMiB": numeric(values[5]),
            "memoryUsedMiB": numeric(values[6]),
            "utilizationPercent": numeric(values[7]),
            "temperatureC": numeric(values[8]),
            "computeCapability": values[9],
        }
        if row_number < len(power_rows) and len(power_rows[row_number]) >= 2:
            gpu["powerDrawW"] = numeric(power_rows[row_number][0], integer=False)
            gpu["powerLimitW"] = numeric(power_rows[row_number][1], integer=False)
        gpus.append(gpu)
    return gpus, executable


def walk_dicts(value: Any):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk_dicts(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_dicts(child)


def detect_apple_gpus() -> list[dict[str, Any]]:
    output = run_capture(["system_profiler", "SPDisplaysDataType", "-json"])
    if not output:
        return []
    try:
        report = json.loads(output)
    except json.JSONDecodeError:
        return []
    gpus: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in walk_dicts(report):
        name = item.get("sppci_model") or item.get("_name")
        metal = item.get("spdisplays_metal") or item.get("spdisplays_metal_support")
        if not name or not metal or name in seen:
            continue
        seen.add(str(name))
        gpus.append(
            {
                "index": len(gpus),
                "name": str(name),
                "vendor": item.get("spdisplays_vendor"),
                "metalSupport": metal,
                "memoryModel": "unified",
            }
        )
    return gpus


def system_memory() -> dict[str, int | None]:
    system = platform.system()
    if system == "Windows":
        class MemoryStatus(ctypes.Structure):
            _fields_ = [
                ("length", ctypes.c_ulong),
                ("memoryLoad", ctypes.c_ulong),
                ("totalPhysical", ctypes.c_ulonglong),
                ("availablePhysical", ctypes.c_ulonglong),
                ("totalPageFile", ctypes.c_ulonglong),
                ("availablePageFile", ctypes.c_ulonglong),
                ("totalVirtual", ctypes.c_ulonglong),
                ("availableVirtual", ctypes.c_ulonglong),
                ("availableExtendedVirtual", ctypes.c_ulonglong),
            ]

        status = MemoryStatus()
        status.length = ctypes.sizeof(MemoryStatus)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            return {
                "totalMiB": round(status.totalPhysical / 1024**2),
                "availableMiB": round(status.availablePhysical / 1024**2),
            }
    if system == "Darwin":
        total = run_capture(["sysctl", "-n", "hw.memsize"])
        total_mib = round(int(total) / 1024**2) if total and total.isdigit() else None
        return {"totalMiB": total_mib, "availableMiB": None}
    if Path("/proc/meminfo").is_file():
        values: dict[str, int] = {}
        for line in Path("/proc/meminfo").read_text("utf-8").splitlines():
            key, _, value = line.partition(":")
            if value:
                values[key] = int(value.strip().split()[0]) // 1024
        return {"totalMiB": values.get("MemTotal"), "availableMiB": values.get("MemAvailable")}
    return {"totalMiB": None, "availableMiB": None}


def profile(
    name: str,
    resolution: int,
    depth_resolution: int,
    steps: int,
    *,
    quant_mode: str,
    group_offload: str,
    ignore_vram_guard: bool = False,
    note: str = "",
) -> dict[str, Any]:
    return {
        "name": name,
        "resolution": resolution,
        "depthResolution": depth_resolution,
        "steps": steps,
        "quantMode": quant_mode,
        "groupOffload": group_offload,
        "alphaMode": "preserve",
        "tblrSplit": True,
        "useLama": False,
        "ignoreVramGuard": ignore_vram_guard,
        "note": note,
    }


def windows_profiles(total_vram_mib: int) -> tuple[str, bool, list[dict[str, Any]], list[str]]:
    notes: list[str] = []
    pilot = profile("pilot", 512, 384, 4, quant_mode="none", group_offload="on")
    if total_vram_mib < 8192:
        notes.append("低于8GB显存，不满足当前Windows/CUDA工具链的支持门槛。")
        return "unsupported", False, [pilot], notes
    if total_vram_mib < 10240:
        screen = profile("screen", 512, 384, 30, quant_mode="nf4", group_offload="on")
        quality = profile(
            "quality",
            768,
            512,
            40,
            quant_mode="nf4",
            group_offload="on",
            ignore_vram_guard=True,
            note="8GB实验档；可能OOM，不作为稳定承诺。",
        )
        notes.append("8GB显存应以512档为主；768档需要NF4并可能OOM。")
        return "cuda-8gb", True, [pilot, screen, quality], notes
    if total_vram_mib < 12288:
        screen = profile("screen", 768, 512, 30, quant_mode="none", group_offload="on")
        quality = profile("quality", 768, 640, 50, quant_mode="none", group_offload="on")
        return "cuda-10gb", True, [pilot, screen, quality], notes
    if total_vram_mib < 16384:
        screen = profile("screen", 768, 512, 30, quant_mode="none", group_offload="on")
        quality = profile("quality", 1024, 720, 50, quant_mode="none", group_offload="on")
        notes.append("1024/720/50已在RTX 3060 12GB实测，整卡峰值约10.3GB。")
        return "cuda-12gb", True, [pilot, screen, quality], notes
    if total_vram_mib < 24576:
        screen = profile("screen", 1024, 720, 30, quant_mode="none", group_offload="on")
        quality = profile("quality", 1024, 1024, 50, quant_mode="none", group_offload="on")
        notes.append("1280可单Seed实验，但1024仍是稳定质量建议。")
        return "cuda-16gb", True, [pilot, screen, quality], notes
    screen = profile("screen", 1024, 720, 30, quant_mode="none", group_offload="on")
    quality = profile("quality", 1280, 1024, 50, quant_mode="none", group_offload="on")
    notes.append("1536及以上仍属于实验档；模型语义错误不会因显存增加而消失。")
    return "cuda-24gb-plus", True, [pilot, screen, quality], notes


def macos_profiles(system_ram_mib: int) -> tuple[str, bool, list[dict[str, Any]], list[str]]:
    notes = ["Apple Silicon使用统一内存；容量不能与独立显存按1:1比较。", "macOS完整推理仍需在目标Mac实测。"]
    pilot = profile("pilot", 512, 384, 4, quant_mode="none", group_offload="off")
    if system_ram_mib < 16384:
        notes.append("低于16GB统一内存不列为当前MPS工具链推荐环境。")
        return "mps-under-16gb", False, [pilot], notes
    if system_ram_mib < 24576:
        screen = profile("screen", 512, 384, 30, quant_mode="none", group_offload="off")
        quality = profile("quality", 768, 512, 40, quant_mode="none", group_offload="off")
        return "mps-16gb", True, [pilot, screen, quality], notes
    if system_ram_mib < 49152:
        screen = profile("screen", 768, 512, 30, quant_mode="none", group_offload="off")
        quality = profile("quality", 1024, 720, 40, quant_mode="none", group_offload="off")
        return "mps-24-32gb", True, [pilot, screen, quality], notes
    screen = profile("screen", 1024, 720, 30, quant_mode="none", group_offload="off")
    quality = profile("quality", 1024, 1024, 50, quant_mode="none", group_offload="off")
    notes.append("1280可实验，但默认仍保留1024以控制统一内存峰值。")
    return "mps-48gb-plus", True, [pilot, screen, quality], notes


def required_free_vram(profile_data: dict[str, Any], config: dict[str, Any]) -> int:
    is_pilot_size = profile_data["resolution"] <= 512 and profile_data["depthResolution"] <= 384
    key = "minimumFreeVramMiBForPilotInference" if is_pilot_size else "minimumFreeVramMiBForInference"
    return int(config[key])


def profile_command(profile_data: dict[str, Any], target_platform: str) -> str:
    if target_platform in {"macos", "linux"}:
        pieces = [
            "./scripts/seethrough/test-zhaoyun.sh",
            f"--preset {profile_data['name']}",
            f"--resolution {profile_data['resolution']}",
            f"--depth-resolution {profile_data['depthResolution']}",
            f"--steps {profile_data['steps']}",
            "--seed 42",
            f"--quant-mode {profile_data['quantMode']}",
            f"--group-offload {profile_data['groupOffload']}",
        ]
        return " ".join(pieces)
    pieces = [
        "pwsh -NoProfile -File .\\scripts\\seethrough\\Test-ZhaoYun.ps1",
        f"-Preset {profile_data['name']}",
        f"-Resolution {profile_data['resolution']}",
        f"-DepthResolution {profile_data['depthResolution']}",
        f"-Steps {profile_data['steps']}",
        "-Seed 42",
        f"-QuantMode {profile_data['quantMode']}",
        f"-GroupOffload {profile_data['groupOffload']}",
    ]
    if profile_data.get("ignoreVramGuard"):
        pieces.append("-IgnoreVramGuard")
    return " ".join(pieces)


def choose_gpu(gpus: list[dict[str, Any]], requested_index: int | None) -> dict[str, Any] | None:
    if not gpus:
        return None
    if requested_index is not None:
        return next((gpu for gpu in gpus if gpu.get("index") == requested_index), None)
    visible = os.environ.get("CUDA_VISIBLE_DEVICES", "").split(",")[0].strip()
    if visible.isdigit():
        selected = next((gpu for gpu in gpus if gpu.get("index") == int(visible)), None)
        if selected:
            return selected
    return gpus[0]


def build_report(target_platform: str, gpu_index: int | None = None) -> dict[str, Any]:
    config = json.loads(CONFIG_PATH.read_text("utf-8"))
    memory = system_memory()
    nvidia_gpus, nvidia_smi = detect_nvidia_gpus()
    apple_gpus = detect_apple_gpus() if target_platform == "macos" else []
    selected = choose_gpu(nvidia_gpus, gpu_index)
    notes: list[str]
    if target_platform in {"windows", "linux"} and selected and selected.get("memoryTotalMiB"):
        total_vram = int(selected["memoryTotalMiB"])
        tier, supported, profiles, notes = windows_profiles(total_vram)
        free_vram = selected.get("memoryFreeMiB")
        for item in profiles:
            if target_platform == "linux" and total_vram >= 24576:
                item["groupOffload"] = "off"
            item["requiredFreeVramMiB"] = required_free_vram(item, config)
            item["readyNow"] = (
                None if free_vram is None else int(free_vram) >= int(item["requiredFreeVramMiB"])
            )
            item["command"] = profile_command(item, target_platform)
        if target_platform == "linux" and total_vram >= 49152:
            notes.extend(
                [
                    "H20 96GB实测建议使用balanced档1024/720/30；不要把2048/100用于多Seed初筛。",
                    "驱动535应使用cu121兼容栈；升级驱动后再评估较新的PyTorch/CUDA组合。",
                ]
            )
        if free_vram is not None and not any(item.get("readyNow") for item in profiles):
            notes.append(
                f"当前仅有{free_vram}MiB空闲显存，低于pilot安全门槛；先关闭GPU进程再运行。"
            )
    elif (
        target_platform == "macos"
        and apple_gpus
        and platform.machine().lower() in {"arm64", "aarch64"}
    ):
        total_ram = int(memory.get("totalMiB") or 0)
        tier, supported, profiles, notes = macos_profiles(total_ram)
        for item in profiles:
            item["requiredFreeVramMiB"] = None
            item["readyNow"] = None
            item["command"] = profile_command(item, target_platform)
    else:
        tier, supported, profiles = "no-supported-accelerator", False, []
        notes = ["未检测到受支持的Windows/Linux NVIDIA CUDA或macOS Apple Silicon MPS环境。"]

    return {
        "schemaVersion": 1,
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "platform": target_platform,
        "os": {
            "system": platform.system(),
            "release": platform.release(),
            "version": platform.version(),
            "machine": platform.machine(),
        },
        "cpu": {"name": platform.processor(), "logicalCores": os.cpu_count()},
        "systemMemory": memory,
        "accelerator": "cuda" if selected else "mps" if target_platform == "macos" and apple_gpus else "none",
        "nvidiaSmi": nvidia_smi,
        "gpus": nvidia_gpus or apple_gpus,
        "selectedGpu": selected or (apple_gpus[0] if apple_gpus else None),
        "recommendation": {
            "tier": tier,
            "supported": supported,
            "profiles": profiles,
            "notes": notes,
        },
    }


def text_report(report: dict[str, Any]) -> str:
    lines = [
        "See-through 单机硬件报告",
        f"  平台/加速器: {report['platform']} / {report['accelerator']}",
        f"  操作系统:     {report['os']['system']} {report['os']['release']} ({report['os']['machine']})",
        f"  CPU:          {report['cpu']['name'] or 'unknown'} / {report['cpu']['logicalCores']}逻辑核",
        f"  系统内存:     {report['systemMemory'].get('totalMiB')}MiB total / {report['systemMemory'].get('availableMiB')}MiB available",
    ]
    for gpu in report["gpus"]:
        lines.append(f"  GPU {gpu.get('index')}:        {gpu.get('name')}")
        if gpu.get("memoryTotalMiB") is not None:
            lines.extend(
                [
                    f"    驱动/计算能力: {gpu.get('driverVersion')} / {gpu.get('computeCapability')}",
                    f"    显存:          {gpu.get('memoryTotalMiB')}MiB total / {gpu.get('memoryFreeMiB')}MiB free / {gpu.get('memoryUsedMiB')}MiB used",
                    f"    利用率/温度:   {gpu.get('utilizationPercent')}% / {gpu.get('temperatureC')}°C",
                    f"    功耗:          {gpu.get('powerDrawW')}W / {gpu.get('powerLimitW')}W",
                ]
            )
        else:
            lines.append(f"    Metal/内存模型: {gpu.get('metalSupport')} / {gpu.get('memoryModel')}")
    recommendation = report["recommendation"]
    lines.append(
        f"  推荐档位:     {recommendation['tier']} ({'supported' if recommendation['supported'] else 'unsupported'})"
    )
    for item in recommendation["profiles"]:
        readiness = "ready" if item.get("readyNow") is True else "not-ready" if item.get("readyNow") is False else "unknown"
        lines.extend(
            [
                "",
                f"[{item['name']}] {item['resolution']}/{item['depthResolution']}/{item['steps']}  quant={item['quantMode']} offload={item['groupOffload']}  {readiness}",
                f"  当前所需空闲显存: {item.get('requiredFreeVramMiB')}MiB",
                f"  命令: {item['command']}",
            ]
        )
        if item.get("note"):
            lines.append(f"  说明: {item['note']}")
    if recommendation["notes"]:
        lines.append("")
        lines.extend(f"注意: {note}" for note in recommendation["notes"])
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    if args.platform == "auto":
        system = platform.system()
        target_platform = (
            "windows"
            if system == "Windows"
            else "macos"
            if system == "Darwin"
            else "linux"
            if system == "Linux"
            else "unsupported"
        )
    else:
        target_platform = args.platform
    report = build_report(target_platform, args.gpu_index)
    payload = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.json_out:
        args.json_out.expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
        args.json_out.expanduser().resolve().write_text(payload, "utf-8")
    print(payload if args.format == "json" else text_report(report))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)

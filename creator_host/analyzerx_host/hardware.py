from __future__ import annotations

import os
import platform
import shutil
from pathlib import Path
from typing import Any

from .contracts import HardwareProfile


def _memory_bytes() -> int | None:
    try:
        pages = os.sysconf("SC_PHYS_PAGES")
        page_size = os.sysconf("SC_PAGE_SIZE")
        return int(pages * page_size)
    except (AttributeError, OSError, ValueError):
        return None


def _free_storage_bytes() -> int | None:
    try:
        return shutil.disk_usage(Path.home()).free
    except OSError:
        return None


def _torch_probe() -> dict[str, Any]:
    try:
        import torch  # type: ignore
    except Exception as exc:  # pragma: no cover - depends on host install
        return {"backend": "unknown", "error": str(exc)}

    if bool(getattr(torch, "cuda", None)) and torch.cuda.is_available():
        name = torch.cuda.get_device_name(0)
        props = torch.cuda.get_device_properties(0)
        version = getattr(torch.version, "cuda", None)
        return {"backend": "cuda", "gpu_name": name, "vram_bytes": int(getattr(props, "total_memory", 0) or 0) or None, "driver_version": version}

    mps = getattr(getattr(torch, "backends", None), "mps", None)
    if mps is not None and mps.is_available():
        return {"backend": "mps", "gpu_name": "Apple MPS", "vram_bytes": None, "driver_version": None}

    # ROCm builds report the CUDA API surface through torch.cuda. If that path is
    # unavailable, keep the profile truthful instead of guessing from the GPU name.
    return {"backend": "cpu", "gpu_name": None, "vram_bytes": None, "driver_version": None}


def detect_hardware() -> HardwareProfile:
    system = platform.system().lower()
    machine = platform.machine().lower()
    probe = _torch_probe()
    backend = probe.get("backend", "unknown")
    if system == "darwin" and backend == "mps":
        target_platform = "macos-arm64" if machine in {"arm64", "aarch64"} else "cpu"
    elif system == "windows" and machine in {"amd64", "x86_64"}:
        target_platform = "windows-x64"
    elif system == "linux" and machine in {"amd64", "x86_64"}:
        target_platform = "linux-x64"
    elif machine in {"arm64", "aarch64"}:
        target_platform = "android-arm64" if system == "android" else "cpu"
    else:
        target_platform = "cpu"

    return HardwareProfile(
        platform=target_platform,
        architecture=machine,
        cpu_model=platform.processor() or None,
        cpu_cores=os.cpu_count(),
        total_memory_bytes=_memory_bytes(),
        free_storage_bytes=_free_storage_bytes(),
        backend=backend if backend in {"cuda", "mps", "cpu"} else "unknown",
        gpu_name=probe.get("gpu_name"),
        vram_bytes=probe.get("vram_bytes"),
        driver_version=probe.get("driver_version"),
        native_runtime_available=backend in {"cuda", "mps", "cpu"},
    )


def compatibility_reasons(profile: HardwareProfile, *, min_ram_bytes: int | None, min_vram_bytes: int | None, supported_backends: set[str]) -> list[str]:
    reasons: list[str] = []
    if profile.backend not in supported_backends:
        reasons.append(f"The {profile.backend} execution backend is not supported by this adapter.")
    if min_ram_bytes and profile.total_memory_bytes and profile.total_memory_bytes < min_ram_bytes:
        reasons.append(f"At least {min_ram_bytes // 1_000_000_000} GB system memory is recommended.")
    if min_vram_bytes and profile.vram_bytes is not None and profile.vram_bytes < min_vram_bytes:
        reasons.append(f"At least {min_vram_bytes // 1_000_000_000} GB GPU memory is recommended.")
    if min_vram_bytes and profile.backend == "cpu":
        reasons.append("This adapter requires a GPU backend for the requested quality profile.")
    return reasons

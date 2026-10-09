from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class JobState(str, Enum):
    QUEUED = "queued"
    VALIDATING = "validating"
    LOADING = "loading"
    RUNNING = "running"
    CANCELLING = "cancelling"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass(frozen=True)
class HardwareProfile:
    platform: str
    architecture: str
    cpu_model: str | None
    cpu_cores: int | None
    total_memory_bytes: int | None
    free_storage_bytes: int | None
    backend: Literal["cuda", "rocm", "mps", "cpu", "unknown"]
    gpu_name: str | None = None
    vram_bytes: int | None = None
    driver_version: str | None = None
    native_runtime_available: bool = False
    captured_at: str = field(default_factory=utc_now)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class JobRequest:
    job_id: str
    tool_id: str
    tool_version: str
    operation: str
    prompt: str
    inputs: list[str] = field(default_factory=list)
    parameters: dict[str, Any] = field(default_factory=dict)
    seed: int | None = None
    output_format: str = "png"
    priority: int = 50


@dataclass(frozen=True)
class JobEvent:
    job_id: str
    state: JobState
    progress: float
    stage: str
    message: str
    metrics: dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(default_factory=utc_now)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["state"] = self.state.value
        return payload


@dataclass(frozen=True)
class JobResult:
    job_id: str
    output_files: list[str]
    preview_files: list[str]
    metadata: dict[str, Any]
    hardware_profile: HardwareProfile
    runtime_versions: dict[str, str]
    warnings: list[str] = field(default_factory=list)
    provenance: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["hardware_profile"] = self.hardware_profile.to_dict()
        return payload

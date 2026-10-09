from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from .contracts import HardwareProfile, JobEvent, JobRequest, JobResult, JobState


class AdapterUnavailable(RuntimeError):
    """Raised when a finance tool cannot safely execute on the current host."""


def _runtime_versions() -> dict[str, str]:
    versions: dict[str, str] = {}
    for package in ("torch", "transformers", "pandas", "pandas_ta", "edgar"):
        try:
            module = __import__(package)
            versions[package] = str(getattr(module, "__version__", "installed"))
        except Exception:
            versions[package] = "not-installed"
    return versions


async def _progress(callback, job_id: str, state: JobState, progress: float, stage: str, message: str, **metrics: Any) -> None:
    await callback(JobEvent(job_id, state, progress, stage, message, metrics))


class FinanceAdapter:
    def __init__(self, tool_id: str, profile: HardwareProfile, output_root: str | Path) -> None:
        self.tool_id = tool_id
        self.profile = profile
        self.output_root = Path(output_root)
        self.output_root.mkdir(parents=True, exist_ok=True)

    def _result(self, request: JobRequest, files: list[str], warnings: list[str] | None = None, metadata: dict[str, Any] | None = None) -> JobResult:
        return JobResult(request.job_id, files, files, {"toolId": request.tool_id, "operation": request.operation, **(metadata or {})}, self.profile, _runtime_versions(), warnings or [], {"source": "native-local-host", "adapter": self.tool_id})


class TechnicalIndicatorsAdapter(FinanceAdapter):
    async def generate(self, request: JobRequest, callback, cancel_event: asyncio.Event) -> JobResult:
        try:
            import pandas  # type: ignore  # noqa: F401
            import pandas_ta  # type: ignore  # noqa: F401
        except Exception as exc:
            raise AdapterUnavailable("Install the pinned pandas and pandas-ta runtime before computing indicators.") from exc
        input_path = request.parameters.get("ohlcvPath")
        if not isinstance(input_path, str) or not Path(input_path).is_file():
            raise AdapterUnavailable("A source-backed OHLCV file is required; the adapter will not invent price history.")
        await _progress(callback, request.job_id, JobState.LOADING, 0.2, "loading", "Loading source-backed OHLCV data")
        if cancel_event.is_set():
            return self._result(request, [], ["Cancelled before indicator computation"])
        await _progress(callback, request.job_id, JobState.RUNNING, 0.6, "computing", "Computing the requested technical indicators")
        # The production adapter will write a normalized result after validating
        # the declared columns and indicator parameters. This scaffold deliberately
        # refuses to fabricate a result until the installed runtime is verified.
        raise AdapterUnavailable("Technical-indicator runtime entrypoint is not enabled in this host build; no signal was fabricated.")


class FinBertSentimentAdapter(FinanceAdapter):
    async def generate(self, request: JobRequest, callback, cancel_event: asyncio.Event) -> JobResult:
        try:
            import transformers  # type: ignore  # noqa: F401
            import torch  # type: ignore  # noqa: F401
        except Exception as exc:
            raise AdapterUnavailable("Transformers and PyTorch are required for local FinBERT sentiment.") from exc
        text = request.prompt.strip()
        if not text:
            raise AdapterUnavailable("News or filing text is required for sentiment analysis.")
        await _progress(callback, request.job_id, JobState.LOADING, 0.2, "loading", "Loading the pinned ProsusAI/finbert model")
        if cancel_event.is_set():
            return self._result(request, [], ["Cancelled before sentiment inference"])
        await _progress(callback, request.job_id, JobState.RUNNING, 0.65, "classifying", "Classifying financial sentiment with evidence retained")
        raise AdapterUnavailable("FinBERT artifact loading is not enabled in this host build; no sentiment label was fabricated.")


class FilingResearchAdapter(FinanceAdapter):
    async def generate(self, request: JobRequest, callback, cancel_event: asyncio.Event) -> JobResult:
        input_path = request.parameters.get("filingPath")
        if not isinstance(input_path, str) or not Path(input_path).is_file():
            raise AdapterUnavailable("A downloaded filing or authorized SEC/NSE/BSE source payload is required.")
        await _progress(callback, request.job_id, JobState.RUNNING, 0.45, "extracting", "Extracting filing facts while preserving source locations")
        if cancel_event.is_set():
            return self._result(request, [], ["Cancelled during filing extraction"])
        raise AdapterUnavailable("Filing extraction entrypoint is not enabled in this host build; no financial fact was fabricated.")


class GroundedAssistantAdapter(FinanceAdapter):
    async def generate(self, request: JobRequest, callback, cancel_event: asyncio.Event) -> JobResult:
        context_path = request.parameters.get("contextPath")
        if not isinstance(context_path, str) or not Path(context_path).is_file():
            raise AdapterUnavailable("Grounded assistant context must be supplied from AnalyzerX source-backed records.")
        await _progress(callback, request.job_id, JobState.RUNNING, 0.55, "reasoning", "Answering from supplied AnalyzerX evidence only")
        if cancel_event.is_set():
            return self._result(request, [], ["Cancelled during grounded response"])
        raise AdapterUnavailable("The selected local assistant model is not loaded on this host; no unsupported answer was generated.")


def build_adapter(tool_id: str, profile: HardwareProfile, output_root: str | Path) -> FinanceAdapter:
    if tool_id == "pandas-ta-indicators":
        return TechnicalIndicatorsAdapter(tool_id, profile, output_root)
    if tool_id == "finbert-financial-sentiment":
        return FinBertSentimentAdapter(tool_id, profile, output_root)
    if tool_id in {"sec-edgar-filing-research", "institutional-flow-parser"}:
        return FilingResearchAdapter(tool_id, profile, output_root)
    if tool_id == "grounded-research-assistant":
        return GroundedAssistantAdapter(tool_id, profile, output_root)
    raise AdapterUnavailable(f"No finance adapter is registered for {tool_id}")

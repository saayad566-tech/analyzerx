"""Optional real local-model adapters for the AnalyzerX workstation runner.

The runner never pretends an engine is installed: each adapter probes its
binary/endpoint and reports a precise unavailable reason when it is not.
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any, AsyncIterator

import httpx

@dataclass
class AdapterInfo:
    runtime: str
    available: bool
    detail: str
    supports_stream: bool

class AdapterError(RuntimeError):
    pass

class LocalAdapter:
    async def inspect(self) -> AdapterInfo:
        raise NotImplementedError
    async def generate(self, prompt: str, model_path: str | None = None) -> AsyncIterator[str]:
        raise NotImplementedError

class LlamaCppAdapter(LocalAdapter):
    def __init__(self) -> None:
        self.binary = os.environ.get("ANALYZERX_LLAMA_CLI") or shutil.which("llama-cli") or shutil.which("main")

    async def inspect(self) -> AdapterInfo:
        if not self.binary:
            return AdapterInfo("llama.cpp", False, "Install a reviewed llama-cli binary or set ANALYZERX_LLAMA_CLI.", True)
        return AdapterInfo("llama.cpp", True, self.binary, True)

    async def generate(self, prompt: str, model_path: str | None = None) -> AsyncIterator[str]:
        info = await self.inspect()
        if not info.available:
            raise AdapterError(info.detail)
        if not model_path or not Path(model_path).exists():
            raise AdapterError("A local GGUF model path is required for llama.cpp generation.")
        process = await asyncio.create_subprocess_exec(self.binary, "-m", model_path, "-p", prompt, "--no-display-prompt", "-n", "256", stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        assert process.stdout is not None
        async for line in process.stdout:
            text = line.decode(errors="replace")
            if text:
                yield text
        stderr = (await process.stderr.read()).decode(errors="replace") if process.stderr else ""
        code = await process.wait()
        if code != 0:
            raise AdapterError(stderr[-1000:] or f"llama.cpp exited with code {code}")

class LiteRTAdapter(LocalAdapter):
    def __init__(self) -> None:
        self.endpoint = os.environ.get("ANALYZERX_LITERT_ENDPOINT", "http://127.0.0.1:8766")

    async def inspect(self) -> AdapterInfo:
        try:
            async with httpx.AsyncClient(timeout=1.5) as client:
                response = await client.get(f"{self.endpoint}/health")
            if response.is_success:
                return AdapterInfo("LiteRT", True, self.endpoint, True)
            return AdapterInfo("LiteRT", False, f"LiteRT endpoint returned HTTP {response.status_code}.", True)
        except Exception:
            return AdapterInfo("LiteRT", False, f"No LiteRT local endpoint at {self.endpoint}.", True)

    async def generate(self, prompt: str, model_path: str | None = None) -> AsyncIterator[str]:
        info = await self.inspect()
        if not info.available:
            raise AdapterError(info.detail)
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(f"{self.endpoint}/generate", json={"prompt": prompt, "modelPath": model_path})
            if not response.is_success:
                raise AdapterError(f"LiteRT endpoint returned HTTP {response.status_code}.")
            payload: Any = response.json()
        text = payload.get("text", "") if isinstance(payload, dict) else str(payload)
        for token in text.split():
            yield token + " "

async def inspect_adapters() -> list[dict[str, Any]]:
    results = []
    for adapter in (LlamaCppAdapter(), LiteRTAdapter()):
        results.append(vars(await adapter.inspect()))
    return results

async def stream_with_adapter(runtime: str, prompt: str, model_path: str | None = None) -> AsyncIterator[str]:
    adapter: LocalAdapter = LlamaCppAdapter() if runtime == "llama.cpp" else LiteRTAdapter()
    async for token in adapter.generate(prompt, model_path):
        yield token

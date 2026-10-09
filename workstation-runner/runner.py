"""AnalyzerX BYOH workstation runner.

Runs on the user's workstation, not in the mobile APK. It intentionally uses
local-only defaults and never exposes provider secrets in responses or logs.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import platform
import socket
import threading
import secrets
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from adapters import AdapterError, inspect_adapters, stream_with_adapter

APP_VERSION = "0.1.0"
DATA_DIR = Path(os.environ.get("ANALYZERX_RUNNER_HOME", Path.home() / ".analyzerx-runner"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
TOKEN_FILE = DATA_DIR / "pairing-token.json"
KEY_FILE = DATA_DIR / "provider-keys.json"

app = FastAPI(title="AnalyzerX BYOH Runner", version=APP_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://127.0.0.1"],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)

@dataclass
class RunnerState:
    status: str = "idle"
    last_heartbeat: float = field(default_factory=time.time)
    pairing_nonce: Optional[str] = None
    pairing_expires_at: float = 0.0
    token_hash: Optional[str] = None
    jobs: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    sockets: set[WebSocket] = field(default_factory=set)

state = RunnerState()

class PairConfirm(BaseModel):
    nonce: str = Field(min_length=16, max_length=128)

class ProviderKey(BaseModel):
    provider: str = Field(min_length=2, max_length=80)
    key: str = Field(min_length=4, max_length=500)

class JobRequest(BaseModel):
    task_type: str = Field(default="assistant", min_length=2, max_length=80)
    model_id: str = Field(default="local-default", min_length=1, max_length=120)
    prompt: str = Field(default="", max_length=20_000)
    runtime: str = Field(default="synthetic", pattern="^(synthetic|llama.cpp|LiteRT)$")
    model_path: Optional[str] = Field(default=None, max_length=500)


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, indent=2))
    try:
        path.chmod(0o600)
    except OSError:
        pass


def _token_from_header(value: Optional[str]) -> str:
    if not value or not value.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Runner token required")
    token = value.removeprefix("Bearer ").strip()
    if not state.token_hash or not secrets.compare_digest(_hash(token), state.token_hash):
        raise HTTPException(status_code=403, detail="Invalid or revoked runner token")
    return token


def hardware_profile() -> dict[str, Any]:
    cpu_count = os.cpu_count() or 1
    memory_bytes = None
    meminfo = Path("/proc/meminfo")
    if meminfo.exists():
        for line in meminfo.read_text().splitlines():
            if line.startswith("MemTotal:"):
                memory_bytes = int(line.split()[1]) * 1024
                break
    return {
        "platform": platform.system().lower(),
        "osVersion": platform.platform(),
        "python": platform.python_version(),
        "architecture": platform.machine(),
        "cpuCount": cpu_count,
        "memoryBytes": memory_bytes,
        "gpu": {"status": "unknown", "backend": "cpu"},
        "backends": ["cpu"],
        "freeStorageBytes": None,
    }


def advertise_host() -> str:
    configured = os.environ.get("ANALYZERX_RUNNER_ADVERTISE_HOST")
    if configured:
        return configured
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("8.8.8.8", 80))
        return probe.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        probe.close()


def runner_url() -> str:
    host = advertise_host()
    port = int(os.environ.get("ANALYZERX_RUNNER_PORT", "8765"))
    return f"http://{host}:{port}"


def discovery_loop() -> None:
    """Respond to a bounded LAN discovery packet without exposing secrets."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("0.0.0.0", int(os.environ.get("ANALYZERX_DISCOVERY_PORT", "37020"))))
        while True:
            data, address = sock.recvfrom(2048)
            if data.strip() != b"ANALYZERX_DISCOVER_V1":
                continue
            payload = json.dumps({"service": "AnalyzerX BYOH Runner", "version": APP_VERSION, "url": runner_url(), "hardware": hardware_profile()}).encode()
            sock.sendto(payload, address)
    except OSError:
        return
    finally:
        sock.close()


def provider_status() -> list[dict[str, Any]]:
    keys = _load_json(KEY_FILE)
    return [
        {
            "provider": name,
            "configured": bool(value),
            "masked": "configured" if value else "not configured",
            "lastHealth": None,
            "status": "configured" if value else "not_configured",
        }
        for name, value in keys.items()
    ]


async def broadcast(event: dict[str, Any]) -> None:
    dead = []
    for socket in state.sockets:
        try:
            await socket.send_json(event)
        except Exception:
            dead.append(socket)
    for socket in dead:
        state.sockets.discard(socket)


async def run_job(job_id: str) -> None:
    job = state.jobs[job_id]
    state.status = "running"
    stages = ["queued", "resolving model", "loading runtime", "running inference", "saving result", "completed"]
    for index, stage in enumerate(stages):
        if job["cancelRequested"]:
            job.update({"status": "cancelled", "stage": "cancelled", "progress": job["progress"], "finishedAt": time.time()})
            state.status = "idle"
            await broadcast({"type": "job.updated", "job": job})
            return
        if stage == "running inference" and job.get("runtime") in {"llama.cpp", "LiteRT"}:
            try:
                chunks = []
                async for token in stream_with_adapter(job["runtime"], job.get("prompt", ""), job.get("modelPath")):
                    chunks.append(token)
                    job["outputPreview"] = "".join(chunks)[-2000:]
                    await broadcast({"type": "job.updated", "job": job})
            except AdapterError as error:
                job.update({"status": "failed", "stage": "adapter unavailable", "error": str(error), "finishedAt": time.time()})
                state.status = "degraded"
                await broadcast({"type": "job.updated", "job": job})
                return
        else:
            await asyncio.sleep(0.25 if stage != "running inference" else 0.8)
        job.update({"status": "running" if stage != "completed" else "completed", "stage": stage, "progress": round(index / (len(stages) - 1), 3)})
        await broadcast({"type": "job.updated", "job": job})
    state.status = "idle"


@app.on_event("startup")
async def start_discovery() -> None:
    if not any(thread.name == "analyzerx-lan-discovery" for thread in threading.enumerate()):
        threading.Thread(target=discovery_loop, name="analyzerx-lan-discovery", daemon=True).start()


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "runnerVersion": APP_VERSION,
        "status": state.status,
        "lastHeartbeat": state.last_heartbeat,
        "hardware": hardware_profile(),
        "jobCount": len(state.jobs),
    }


@app.post("/pair/start")
async def pair_start() -> dict[str, Any]:
    nonce = secrets.token_urlsafe(24)
    state.pairing_nonce = nonce
    state.pairing_expires_at = time.time() + 120
    return {"nonce": nonce, "expiresAt": state.pairing_expires_at, "runnerVersion": APP_VERSION, "pairingUrl": f"analyzerx://pair?runner={runner_url()}&nonce={nonce}"}


@app.post("/pair/confirm")
async def pair_confirm(payload: PairConfirm) -> dict[str, Any]:
    if not state.pairing_nonce or time.time() >= state.pairing_expires_at or not secrets.compare_digest(payload.nonce, state.pairing_nonce):
        raise HTTPException(status_code=400, detail="Pairing nonce is expired or invalid")
    token = secrets.token_urlsafe(40)
    state.token_hash = _hash(token)
    _save_json(TOKEN_FILE, {"tokenHash": state.token_hash, "pairedAt": time.time()})
    state.pairing_nonce = None
    return {"token": token, "pairedAt": time.time(), "runnerVersion": APP_VERSION, "hardware": hardware_profile()}


@app.post("/pair/revoke")
async def pair_revoke(authorization: Optional[str] = Header(default=None)) -> dict[str, bool]:
    _token_from_header(authorization)
    state.token_hash = None
    TOKEN_FILE.unlink(missing_ok=True)
    return {"revoked": True}


@app.get("/adapters")
async def adapters(authorization: Optional[str] = Header(default=None)) -> dict[str, Any]:
    _token_from_header(authorization)
    return {"adapters": await inspect_adapters()}


@app.get("/state")
async def current_state(authorization: Optional[str] = Header(default=None)) -> dict[str, Any]:
    _token_from_header(authorization)
    state.last_heartbeat = time.time()
    return {"status": state.status, "hardware": hardware_profile(), "jobs": list(state.jobs.values()), "providers": provider_status(), "lastHeartbeat": state.last_heartbeat}


@app.post("/providers/key")
async def set_provider_key(payload: ProviderKey, authorization: Optional[str] = Header(default=None)) -> dict[str, Any]:
    _token_from_header(authorization)
    keys = _load_json(KEY_FILE)
    keys[payload.provider] = payload.key
    _save_json(KEY_FILE, keys)
    return {"provider": payload.provider, "status": "configured", "masked": "configured"}


@app.delete("/providers/{provider}")
async def delete_provider_key(provider: str, authorization: Optional[str] = Header(default=None)) -> dict[str, bool]:
    _token_from_header(authorization)
    keys = _load_json(KEY_FILE)
    keys.pop(provider, None)
    _save_json(KEY_FILE, keys)
    return {"removed": True}


@app.post("/jobs")
async def create_job(payload: JobRequest, authorization: Optional[str] = Header(default=None)) -> dict[str, Any]:
    _token_from_header(authorization)
    job_id = str(uuid.uuid4())
    job = {"id": job_id, "taskType": payload.task_type, "modelId": payload.model_id, "runtime": payload.runtime, "modelPath": payload.model_path, "prompt": payload.prompt, "status": "queued", "stage": "queued", "progress": 0, "createdAt": time.time(), "cancelRequested": False}
    state.jobs[job_id] = job
    asyncio.create_task(run_job(job_id))
    return job


@app.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str, authorization: Optional[str] = Header(default=None)) -> dict[str, Any]:
    _token_from_header(authorization)
    job = state.jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job["cancelRequested"] = True
    return job


@app.websocket("/events")
async def events(socket: WebSocket, token: Optional[str] = None) -> None:
    if not state.token_hash or not token or not secrets.compare_digest(_hash(token), state.token_hash):
        await socket.close(code=4403)
        return
    await socket.accept()
    state.sockets.add(socket)
    try:
        await socket.send_json({"type": "runner.state", "status": state.status, "jobs": list(state.jobs.values()), "hardware": hardware_profile()})
        while True:
            await socket.receive_text()
            state.last_heartbeat = time.time()
    except WebSocketDisconnect:
        state.sockets.discard(socket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("runner:app", host=os.environ.get("ANALYZERX_RUNNER_HOST", "127.0.0.1"), port=int(os.environ.get("ANALYZERX_RUNNER_PORT", "8765")), reload=False)

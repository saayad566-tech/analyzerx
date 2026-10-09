from __future__ import annotations

import asyncio
import contextlib
import sqlite3
import time
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from .contracts import JobEvent, JobRequest, JobResult, JobState


Adapter = Callable[[JobRequest, Callable[[JobEvent], Awaitable[None]], asyncio.Event], Awaitable[JobResult]]


class DurableJobQueue:
    def __init__(self, database_path: str | Path, max_concurrency: int = 1) -> None:
        self.database_path = str(database_path)
        self.max_concurrency = max(1, max_concurrency)
        self._queue: asyncio.Queue[JobRequest] = asyncio.Queue()
        self._cancel_events: dict[str, asyncio.Event] = {}
        self._workers: list[asyncio.Task[None]] = []
        self._listeners: list[Callable[[JobEvent], Awaitable[None]]] = []
        self._adapters: dict[str, Adapter] = {}
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(self.database_path) as connection:
            connection.execute("CREATE TABLE IF NOT EXISTS jobs (job_id TEXT PRIMARY KEY, tool_id TEXT NOT NULL, state TEXT NOT NULL, progress REAL NOT NULL, stage TEXT NOT NULL, message TEXT NOT NULL, payload TEXT NOT NULL, result TEXT, error TEXT, created_at REAL NOT NULL, updated_at REAL NOT NULL)")
            connection.commit()

    def register_adapter(self, tool_id: str, adapter: Adapter) -> None:
        self._adapters[tool_id] = adapter

    def add_listener(self, listener: Callable[[JobEvent], Awaitable[None]]) -> None:
        self._listeners.append(listener)

    async def start(self) -> None:
        if self._workers:
            return
        self._workers = [asyncio.create_task(self._worker(index)) for index in range(self.max_concurrency)]

    async def stop(self) -> None:
        for task in self._workers:
            task.cancel()
        for task in self._workers:
            with contextlib.suppress(asyncio.CancelledError):
                await task
        self._workers.clear()

    async def submit(self, request: JobRequest) -> None:
        if request.tool_id not in self._adapters:
            raise ValueError(f"No validated adapter is registered for {request.tool_id}")
        self._cancel_events[request.job_id] = asyncio.Event()
        self._write_job(request, JobState.QUEUED, 0.0, "queued", "Waiting for an available local worker")
        await self._queue.put(request)
        if not self._workers:
            await self.start()

    async def cancel(self, job_id: str) -> bool:
        event = self._cancel_events.get(job_id)
        if event is None:
            return False
        event.set()
        return True

    async def _emit(self, event: JobEvent) -> None:
        self._write_event(event)
        for listener in self._listeners:
            with contextlib.suppress(Exception):
                await listener(event)

    async def _worker(self, worker_id: int) -> None:
        while True:
            request = await self._queue.get()
            cancel_event = self._cancel_events[request.job_id]
            adapter = self._adapters[request.tool_id]
            try:
                await self._emit(JobEvent(request.job_id, JobState.VALIDATING, 0.02, "validating", f"Worker {worker_id} validated the job"))
                if cancel_event.is_set():
                    await self._emit(JobEvent(request.job_id, JobState.CANCELLED, 0.0, "cancelled", "Cancelled before model load"))
                    continue

                async def progress(event: JobEvent) -> None:
                    await self._emit(event)

                result = await adapter(request, progress, cancel_event)
                if cancel_event.is_set():
                    await self._emit(JobEvent(request.job_id, JobState.CANCELLED, 0.0, "cancelled", "Generation cancelled and resources released"))
                else:
                    await self._emit(JobEvent(request.job_id, JobState.SUCCEEDED, 1.0, "complete", "Generation completed", {"outputs": len(result.output_files)}))
                    self._write_result(request.job_id, result.to_dict())
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                await self._emit(JobEvent(request.job_id, JobState.FAILED, 0.0, "failed", "Generation failed", {"error": str(exc)}))
            finally:
                self._queue.task_done()
                self._cancel_events.pop(request.job_id, None)

    def _write_job(self, request: JobRequest, state: JobState, progress: float, stage: str, message: str) -> None:
        import json
        now = time.time()
        with sqlite3.connect(self.database_path) as connection:
            connection.execute("INSERT OR REPLACE INTO jobs(job_id, tool_id, state, progress, stage, message, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM jobs WHERE job_id = ?), ?), ?)", (request.job_id, request.tool_id, state.value, progress, stage, message, json.dumps(request.__dict__), request.job_id, now, now))
            connection.commit()

    def _write_event(self, event: JobEvent) -> None:
        now = time.time()
        with sqlite3.connect(self.database_path) as connection:
            connection.execute("UPDATE jobs SET state = ?, progress = ?, stage = ?, message = ?, updated_at = ? WHERE job_id = ?", (event.state.value, event.progress, event.stage, event.message, now, event.job_id))
            connection.commit()

    def _write_result(self, job_id: str, result: dict[str, Any]) -> None:
        import json
        with sqlite3.connect(self.database_path) as connection:
            connection.execute("UPDATE jobs SET result = ?, updated_at = ? WHERE job_id = ?", (json.dumps(result), time.time(), job_id))
            connection.commit()

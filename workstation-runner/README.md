# AnalyzerX BYOH Workstation Runner

This local agent lets AnalyzerX use a user-owned workstation for local AI inference, provider calls, model management, and long-running jobs without requiring a paid backend service.

## Start locally

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install fastapi uvicorn pydantic
python runner.py
```

The runner binds to `127.0.0.1:8765` by default. Override with `ANALYZERX_RUNNER_HOST` and `ANALYZERX_RUNNER_PORT`. Set `ANALYZERX_RUNNER_HOME` to change the local state directory.

## Safety model

Pairing uses a two-minute nonce. After confirmation, the client receives a rotating bearer token. Tokens and provider keys are stored in the local runner directory with restrictive file permissions. Provider keys are accepted only by authenticated workstation requests and are never returned in clear text.

The current scaffold exposes hardware discovery, runner health, pairing, provider-key status, job creation, progress events, cancellation, and revocation. Model backend adapters are added behind this protocol so the mobile/PWA client can monitor the same lifecycle regardless of whether the workstation uses llama.cpp, LiteRT, an OpenAI-compatible local server, or another verified local backend.

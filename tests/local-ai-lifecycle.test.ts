import { describe, expect, it } from "vitest";

import { deriveModelLifecycle, isOperational, type LocalAIModelSignals } from "../lib/local-ai-lifecycle";
import { isConnectedEngineConfigured, resolveMarketChatEngine } from "../lib/market-chat-runtime";

const BASE: LocalAIModelSignals = {
  installability: "verified_installable",
  runtimeAvailable: true,
  deviceEligible: true,
  downloaded: true,
  verified: true,
  loaded: false,
};

describe("local AI model lifecycle", () => {
  it("is 'installed' — not 'ready' — when downloaded but not loaded", () => {
    const lifecycle = deriveModelLifecycle(BASE);
    expect(lifecycle.state).toBe("installed");
    // The whole point of FIX 02: never claim Ready before a confirmed load.
    expect(lifecycle.label).not.toBe("Ready");
    expect(lifecycle.canGenerate).toBe(false);
  });

  it("is 'ready' only once the runtime confirms a load", () => {
    const lifecycle = deriveModelLifecycle({ ...BASE, loaded: true });
    expect(lifecycle.state).toBe("ready");
    expect(lifecycle.label).toBe("Ready");
    expect(lifecycle.canGenerate).toBe(true);
    expect(isOperational(lifecycle.state)).toBe(true);
  });

  it("reports 'not installed' with the exact next action when the file is missing", () => {
    const lifecycle = deriveModelLifecycle({ ...BASE, downloaded: false, verified: false });
    expect(lifecycle.state).toBe("not-installed");
    expect(lifecycle.canGenerate).toBe(false);
    expect(lifecycle.nextAction).toContain("Marketplace");
  });

  it("reports 'verifying' when the file is present but integrity is unconfirmed", () => {
    expect(deriveModelLifecycle({ ...BASE, verified: false }).state).toBe("verifying");
  });

  it("reports 'loading' and 'generating' distinctly", () => {
    expect(deriveModelLifecycle({ ...BASE, loading: true }).state).toBe("loading");
    const generating = deriveModelLifecycle({ ...BASE, loaded: true, generating: true });
    expect(generating.state).toBe("generating");
    expect(generating.canGenerate).toBe(true);
  });

  it("is 'unsupported' when the runtime is absent, without offering selection", () => {
    const lifecycle = deriveModelLifecycle({ ...BASE, runtimeAvailable: false });
    expect(lifecycle.state).toBe("unsupported");
    expect(lifecycle.canSelect).toBe(false);
    expect(lifecycle.nextAction).toMatch(/Connected/);
  });

  it("is 'unsupported' for publisher-gated and runtime-pending models", () => {
    expect(deriveModelLifecycle({ ...BASE, installability: "requires_account" }).state).toBe("unsupported");
    expect(deriveModelLifecycle({ ...BASE, installability: "runtime_pending" }).state).toBe("unsupported");
  });

  it("is 'unsupported' when the device does not meet the requirements", () => {
    const lifecycle = deriveModelLifecycle({ ...BASE, deviceEligible: false, deviceReasons: ["Free storage must be at least 3.00 GB before download."] });
    expect(lifecycle.state).toBe("unsupported");
    expect(lifecycle.detail).toContain("3.00 GB");
  });

  it("surfaces a load failure as 'failed' with a retry action", () => {
    const lifecycle = deriveModelLifecycle({ ...BASE, lastError: "The native runtime could not load this model." });
    expect(lifecycle.state).toBe("failed");
    expect(lifecycle.detail).toContain("could not load");
    expect(lifecycle.nextAction).toMatch(/Retry/);
  });

  it("is deterministic for identical signals", () => {
    expect(deriveModelLifecycle(BASE)).toEqual(deriveModelLifecycle(BASE));
  });
});

describe("engine selection", () => {
  it("uses the local engine only with a selected model and an available runtime", () => {
    expect(resolveMarketChatEngine({ mode: "local", activeModelId: "qwen3-06b", nativeRuntimeAvailable: true, hasAttachments: false })).toBe("local");
    expect(resolveMarketChatEngine({ mode: "local", activeModelId: "qwen3-06b", nativeRuntimeAvailable: false, hasAttachments: false })).toBe("connected");
    expect(resolveMarketChatEngine({ mode: "local", activeModelId: null, nativeRuntimeAvailable: true, hasAttachments: false })).toBe("connected");
  });

  it("reports whether a hosted provider is actually configured", () => {
    // Connected mode must be described honestly rather than failing at send time.
    const configured = isConnectedEngineConfigured();
    expect(typeof configured).toBe("boolean");
  });
});

import {
  assessLocalAIModel,
  getLocalAIDeviceProfile,
  getLocalAIModel,
  getLocalAIModelState,
  getLocalAIRuntime,
  type LocalAIModelId,
} from "@/lib/local-ai";
import { deriveModelLifecycle, isOperational, type LocalAIModelLifecycle } from "@/lib/local-ai-lifecycle";

/**
 * Local-AI session manager.
 *
 * The reported failure was that the Assistant displayed a model as active while
 * the native engine was never loaded, so generation failed with "Load a verified
 * .litertlm model before generating." This manager is the single place that
 * verifies and loads a model before inference, and the single source of truth
 * for whether a model is genuinely operational.
 */

/** A model-lifecycle failure whose text is already safe to show the user. */
export class LocalAIModelError extends Error {
  readonly userMessage: string;
  readonly nextAction: string;
  constructor(userMessage: string, nextAction: string) {
    super(userMessage);
    this.name = "LocalAIModelError";
    this.userMessage = userMessage;
    this.nextAction = nextAction;
  }
}

export type LocalAISessionSnapshot = {
  loadedModelId: LocalAIModelId | null;
  loadingModelId: LocalAIModelId | null;
  generating: boolean;
  lastError: string | null;
  lastModelId: LocalAIModelId | null;
};

type Listener = (snapshot: LocalAISessionSnapshot) => void;

const EMPTY: LocalAISessionSnapshot = { loadedModelId: null, loadingModelId: null, generating: false, lastError: null, lastModelId: null };

class LocalAISessionManager {
  private snapshot: LocalAISessionSnapshot = EMPTY;
  private listeners = new Set<Listener>();

  getSnapshot(): LocalAISessionSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private update(patch: Partial<LocalAISessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener(this.snapshot);
  }

  /** True only when this exact model is loaded and can generate. */
  isModelOperational(modelId: LocalAIModelId): boolean {
    return this.snapshot.loadedModelId === modelId && this.snapshot.loadingModelId === null;
  }

  markGenerating(generating: boolean): void {
    this.update({ generating });
  }

  async unload(): Promise<void> {
    const runtime = getLocalAIRuntime();
    if (runtime.isAvailable) await runtime.unload().catch(() => undefined);
    this.update({ loadedModelId: null, loadingModelId: null, generating: false });
  }

  /**
   * Verify the artifact and load it into the native runtime, or throw a
   * `LocalAIModelError` naming the exact missing dependency and the next step.
   * Safe to call before every send: a model that is already loaded is a no-op.
   */
  async ensureModelLoaded(modelId: LocalAIModelId): Promise<void> {
    const runtime = getLocalAIRuntime();
    if (!runtime.isAvailable) {
      throw new LocalAIModelError("This build has no native local-AI bridge, so on-device models cannot run.", "Use Connected mode, or install an AnalyzerX build that includes the local runtime.");
    }
    const model = getLocalAIModel(modelId);
    if (model.installability !== "verified_installable") {
      throw new LocalAIModelError(
        model.unavailableReason ?? `${model.displayName} cannot be installed in this build.`,
        "Choose a supported on-device model, or use Connected mode.",
      );
    }
    const device = await getLocalAIDeviceProfile();
    const assessment = assessLocalAIModel(model, device);
    if (!assessment.eligible) {
      throw new LocalAIModelError(
        `${model.displayName} cannot run on this device: ${assessment.reasons.join(" ")}`,
        "Free up storage, choose a smaller model, or use Connected mode.",
      );
    }
    const state = await getLocalAIModelState(modelId);
    if (state.status !== "downloaded" || !state.localUri) {
      throw new LocalAIModelError(
        `The model file for ${model.displayName} is not on this device.`,
        "Download it in Marketplace → Local AI models.",
      );
    }
    if (this.isModelOperational(modelId)) return;

    this.update({ loadingModelId: modelId, lastModelId: modelId, lastError: null });
    try {
      if (this.snapshot.loadedModelId && this.snapshot.loadedModelId !== modelId) {
        await runtime.unload().catch(() => undefined);
        this.update({ loadedModelId: null });
      }
      const backend = device.backend === "unknown" ? "cpu" : device.backend;
      await runtime.load(state.localUri, backend);
      this.update({ loadedModelId: modelId, loadingModelId: null, lastError: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The native runtime could not load this model.";
      this.update({ loadingModelId: null, loadedModelId: null, lastError: message });
      throw new LocalAIModelError(`${model.displayName} could not be loaded on this device.`, "Retry the load, or choose another model in Model Center.");
    }
  }

  /** The explicit lifecycle for a model, combining device, storage and session state. */
  async lifecycleFor(modelId: LocalAIModelId): Promise<LocalAIModelLifecycle> {
    const model = getLocalAIModel(modelId);
    const runtime = getLocalAIRuntime();
    const device = await getLocalAIDeviceProfile();
    const assessment = assessLocalAIModel(model, device);
    const state = await getLocalAIModelState(modelId).catch(() => null);
    // getLocalAIModelState reports "downloaded" only when the on-device byte
    // count equals the pinned manifest size, so it doubles as an integrity check.
    const downloaded = state?.status === "downloaded";
    return deriveModelLifecycle({
      installability: model.installability,
      runtimeAvailable: runtime.isAvailable,
      deviceEligible: assessment.eligible,
      deviceReasons: assessment.reasons,
      downloaded,
      verified: downloaded,
      loading: this.snapshot.loadingModelId === modelId,
      loaded: this.snapshot.loadedModelId === modelId,
      generating: this.snapshot.generating && this.snapshot.loadedModelId === modelId,
      lastError: this.snapshot.lastModelId === modelId ? this.snapshot.lastError : null,
      unavailableReason: model.unavailableReason ?? null,
    });
  }
}

export const localAISession = new LocalAISessionManager();
export { isOperational };

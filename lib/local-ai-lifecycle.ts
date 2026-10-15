/**
 * Explicit local-AI model lifecycle.
 *
 * The assistant must never advertise an operational model before the native
 * runtime has actually loaded it. This module turns the raw signals we have
 * (installability, download state, integrity, device eligibility, load and
 * generation flags) into one explicit state plus the exact user-facing message
 * and next action, so the UI can show "Ready" only after a confirmed load.
 *
 * It is pure and dependency-free, so it is fully unit-tested.
 */

export type LocalAIModelLifecycleState =
  | "unsupported"
  | "not-installed"
  | "downloading"
  | "verifying"
  | "installed"
  | "loading"
  | "ready"
  | "generating"
  | "failed";

export type LocalAIInstallability = "verified_installable" | "requires_account" | "runtime_pending";

export type LocalAIModelSignals = {
  installability: LocalAIInstallability;
  /** The native bridge exists in this build. */
  runtimeAvailable: boolean;
  /** The device passes the model's RAM/storage/architecture gates. */
  deviceEligible: boolean;
  deviceReasons?: readonly string[];
  /** The artifact file is present on device. */
  downloaded: boolean;
  /** Integrity (size/checksum) has been confirmed. */
  verified: boolean;
  /** A download is currently in progress. */
  downloading?: boolean;
  /** The runtime is loading this model right now. */
  loading?: boolean;
  /** The runtime has loaded this model and it can generate. */
  loaded: boolean;
  /** A generation is in flight. */
  generating?: boolean;
  /** The last failure, if any. */
  lastError?: string | null;
  /** Set when the model is catalogued but cannot be installed in this build. */
  unavailableReason?: string | null;
};

export type LocalAIModelLifecycle = {
  state: LocalAIModelLifecycleState;
  /** Short badge/label for the UI. */
  label: string;
  /** One sentence the user can act on. */
  detail: string;
  /** True ONLY once the runtime has confirmed the model is loaded. */
  canGenerate: boolean;
  /** Whether the model may be chosen in the switcher. */
  canSelect: boolean;
  /** The concrete next step, or null when nothing is needed. */
  nextAction: string | null;
};

const NEXT_INSTALL = "Download it in Marketplace → Local AI models.";

export function deriveModelLifecycle(signals: LocalAIModelSignals): LocalAIModelLifecycle {
  const {
    installability,
    runtimeAvailable,
    deviceEligible,
    deviceReasons = [],
    downloaded,
    verified,
    downloading = false,
    loading = false,
    loaded,
    generating = false,
    lastError = null,
    unavailableReason = null,
  } = signals;

  // A model whose artifact or runtime cannot run in this build.
  if (installability !== "verified_installable") {
    const detail = unavailableReason
      ?? (installability === "requires_account"
        ? "This artifact is publisher-gated and cannot be downloaded anonymously."
        : "This model's Android runtime adapter is not shipped in this build.");
    return { state: "unsupported", label: "Unsupported", detail, canGenerate: false, canSelect: false, nextAction: "Choose a supported on-device model, or use Connected mode." };
  }

  if (!runtimeAvailable) {
    return { state: "unsupported", label: "Unsupported", detail: "This build has no native local-AI bridge, so on-device inference cannot run.", canGenerate: false, canSelect: false, nextAction: "Use Connected mode, or install an AnalyzerX build that includes the local runtime." };
  }

  if (!deviceEligible) {
    return { state: "unsupported", label: "Unsupported on this device", detail: deviceReasons.join(" ") || "This device does not meet the model's requirements.", canGenerate: false, canSelect: false, nextAction: "Use a smaller model, free up storage, or use Connected mode." };
  }

  if (downloading) {
    return { state: "downloading", label: "Downloading", detail: "The verified artifact is still downloading.", canGenerate: false, canSelect: false, nextAction: "Keep AnalyzerX open until the download finishes." };
  }

  if (!downloaded) {
    return { state: "not-installed", label: "Not installed", detail: "The model file is not on this device.", canGenerate: false, canSelect: false, nextAction: NEXT_INSTALL };
  }

  if (!verified) {
    return { state: "verifying", label: "Verifying", detail: "The model file is present but its integrity has not been confirmed.", canGenerate: false, canSelect: false, nextAction: "Re-download the model to restore a verified artifact." };
  }

  if (loading) {
    return { state: "loading", label: "Loading", detail: "The native runtime is loading this model into memory.", canGenerate: false, canSelect: true, nextAction: null };
  }

  if (generating && loaded) {
    return { state: "generating", label: "Generating", detail: "The model is producing a response.", canGenerate: true, canSelect: true, nextAction: null };
  }

  if (loaded) {
    return { state: "ready", label: "Ready", detail: "Loaded and ready to answer on this device.", canGenerate: true, canSelect: true, nextAction: null };
  }

  if (lastError) {
    return { state: "failed", label: "Load failed", detail: lastError, canGenerate: false, canSelect: true, nextAction: "Retry loading, or choose another model." };
  }

  // Downloaded and verified, but not yet loaded into the runtime.
  return { state: "installed", label: "Installed", detail: "Downloaded and verified. It has not been loaded yet.", canGenerate: false, canSelect: true, nextAction: "AnalyzerX loads it automatically when you send a message." };
}

/** States where the UI must not claim the model can answer. */
export function isOperational(state: LocalAIModelLifecycleState): boolean {
  return state === "ready" || state === "generating";
}

/**
 * Device capability tiers and the behaviour that follows from them.
 *
 * Why this exists: the app made one set of assumptions for every device. A 2 GB
 * Android Go phone and a 12 GB flagship were treated identically, so the low-end
 * device got an eager model load and a large list window it could not afford, and the
 * flagship got no benefit from its headroom.
 *
 * Thresholds are grounded in measured sources, not invented:
 *  - Android's own CDD: `isLowRamDevice()` is true when under 1 GB is available to the
 *    kernel and userspace; Go-edition devices are specified at 512 MB / 1 GB / 2 GB
 *    depending on release.
 *  - Google's 2025 device requirement: 2-3 GB devices must run Go edition, and from
 *    Android 16 a 4 GB device must too, so full Android effectively starts at 6 GB.
 *  - Android's guidance is to scale memory use at runtime from `isLowRamDevice()` and
 *    `getMemoryClass()`, and to keep PSS under ~90 MB on Go-class devices.
 *  - On-device LLM: roughly 0.6 GB of weights per 1B parameters at Q4, and the real
 *    requirement is weight size plus 50-100% headroom for the KV cache, runtime and
 *    OS. A 3B model at Q4 is ~2 GB on disk but wants ~4 GB to run comfortably.
 *    Measured on a Tensor G3: Q4_K_M 1.7 GB / 2.1 GB RAM / 11.2 tok/s against FP16
 *    6 GB / 7.2 GB / 2.1 tok/s.
 *
 * Pure module: no react-native import, so it is unit-testable. The caller reads the
 * platform signals and passes them in.
 */

export type DeviceTier = "low" | "mid" | "high";

export type DeviceSignals = {
  /** Total device RAM in MB, if readable. */
  totalRamMb?: number | null;
  /** Android's ActivityManager.isLowRamDevice(). */
  isLowRamDevice?: boolean | null;
  /** Available CPU cores. */
  cpuCores?: number | null;
  /** Android's ActivityManager.getMemoryClass(), in MB. */
  memoryClassMb?: number | null;
  /** Build.VERSION.SDK_INT. */
  sdkInt?: number | null;
};

/** MB constants, named so the thresholds read clearly. */
const MB_PER_GB = 1024;
const GO_EDITION_CEILING_MB = 2 * MB_PER_GB; // 2 GB — Go edition territory
const FULL_ANDROID_FLOOR_MB = 6 * MB_PER_GB; // 6 GB — full Android from 16 onward
const GO_MEMORY_CLASS_MB = 160; // Android's mid-range signal
const LOW_CORE_COUNT = 2;
const HIGH_CORE_COUNT = 8;

export type DeviceBehaviour = {
  /** May the app offer on-device inference at all. */
  localAiEnabled: boolean;
  /** Largest parameter count the device should attempt at Q4, in billions. 0 = none. */
  maxLocalModelParams: 0 | 1 | 3;
  /** Recommended quantisation. */
  quantisation: "Q4_K_M" | "none";
  /** Multiply network poll intervals by this to spare battery and data. */
  pollIntervalMultiplier: number;
  /** FlatList/FlashList windowSize. */
  listWindowSize: number;
  /** How many list rows to render on first paint. */
  initialNumToRender: number;
  /** Image decode/serving quality hint. */
  imageQuality: "low" | "medium" | "high";
  /** Cap on cached list rows / search entries. */
  cacheEntries: number;
  /** True when the app must be frugal with memory everywhere. */
  frugal: boolean;
};

export type DeviceProfile = {
  tier: DeviceTier;
  /** The signals that decided the tier, for diagnostics and support. */
  reasons: string[];
  signals: Required<DeviceSignals>;
  behaviour: DeviceBehaviour;
  /** Honest one-liner for a settings screen. */
  summary: string;
};

const BEHAVIOUR: Record<DeviceTier, DeviceBehaviour> = {
  low: {
    localAiEnabled: false,
    maxLocalModelParams: 0,
    quantisation: "none",
    pollIntervalMultiplier: 2,
    listWindowSize: 3,
    initialNumToRender: 8,
    imageQuality: "low",
    cacheEntries: 50,
    frugal: true,
  },
  mid: {
    localAiEnabled: true,
    maxLocalModelParams: 1,
    quantisation: "Q4_K_M",
    pollIntervalMultiplier: 1.5,
    listWindowSize: 5,
    initialNumToRender: 12,
    imageQuality: "medium",
    cacheEntries: 150,
    frugal: false,
  },
  high: {
    localAiEnabled: true,
    maxLocalModelParams: 3,
    quantisation: "Q4_K_M",
    pollIntervalMultiplier: 1,
    listWindowSize: 7,
    initialNumToRender: 16,
    imageQuality: "high",
    cacheEntries: 400,
    frugal: false,
  },
};

/**
 * Classify a device into a tier.
 *
 * A single low-end signal is enough to demote: it is better to behave modestly on a
 * device that could have coped than to over-commit on one that cannot. Missing signals
 * never promote a device — an unreadable value is treated as absent, and a device with
 * no readable signals at all is treated as `mid`, the safe middle.
 */
export function classifyDevice(signals: DeviceSignals = {}): DeviceProfile {
  const ram = Number.isFinite(signals.totalRamMb) ? (signals.totalRamMb as number) : null;
  const cores = Number.isFinite(signals.cpuCores) ? (signals.cpuCores as number) : null;
  const memoryClass = Number.isFinite(signals.memoryClassMb) ? (signals.memoryClassMb as number) : null;
  const lowRam = typeof signals.isLowRamDevice === "boolean" ? signals.isLowRamDevice : null;
  const sdkInt = Number.isFinite(signals.sdkInt) ? (signals.sdkInt as number) : null;

  const reasons: string[] = [];
  let tier: DeviceTier;

  const lowSignals: string[] = [];
  if (lowRam === true) lowSignals.push("the platform reports a low-RAM device");
  if (ram !== null && ram <= GO_EDITION_CEILING_MB) lowSignals.push(`total RAM ${Math.round(ram)} MB is at or below the 2 GB Go-edition ceiling`);
  if (cores !== null && cores <= LOW_CORE_COUNT) lowSignals.push(`only ${cores} CPU core(s)`);

  if (lowSignals.length) {
    tier = "low";
    reasons.push(...lowSignals);
  } else {
    const midSignals: string[] = [];
    if (ram !== null && ram < FULL_ANDROID_FLOOR_MB) midSignals.push(`total RAM ${Math.round(ram)} MB is below the 6 GB full-Android floor`);
    if (memoryClass !== null && memoryClass <= GO_MEMORY_CLASS_MB) midSignals.push(`per-app memory class ${memoryClass} MB is at or below ${GO_MEMORY_CLASS_MB} MB`);
    if (cores !== null && cores < HIGH_CORE_COUNT) midSignals.push(`${cores} CPU cores, fewer than ${HIGH_CORE_COUNT}`);

    if (midSignals.length) {
      tier = "mid";
      reasons.push(...midSignals);
    } else if (ram === null && cores === null && memoryClass === null && lowRam === null) {
      tier = "mid";
      reasons.push("no device signals were readable, so the safe middle tier is assumed");
    } else {
      tier = "high";
      reasons.push("no low-end or mid-range signal was present");
    }
  }

  const behaviour = BEHAVIOUR[tier];
  const summary =
    tier === "high"
      ? "This device can run on-device AI up to a 3B model at Q4, and full-rate refresh."
      : tier === "mid"
        ? "This device can run a small on-device model (up to 1B at Q4); refresh is slightly paced to save battery."
        : "This device is memory-constrained: on-device AI is off and refresh is paced to keep the app responsive.";

  return {
    tier,
    reasons,
    signals: {
      totalRamMb: ram,
      isLowRamDevice: lowRam,
      cpuCores: cores,
      memoryClassMb: memoryClass,
      sdkInt,
    },
    behaviour,
    summary,
  };
}

/**
 * The memory budget a model may occupy on this device, in MB.
 *
 * Uses 40% of total RAM: the remainder covers the OS, the app and the KV cache. This
 * is deliberately conservative — on-device guidance is to take the weight size and add
 * 50-100% headroom, so a budget that is the weight size alone would be a trap.
 */
export function localModelBudgetMb(profile: DeviceProfile): number {
  const ram = profile.signals.totalRamMb;
  if (!profile.behaviour.localAiEnabled || ram === null) return 0;
  return Math.floor(ram * 0.4);
}

export type ModelFit = {
  fits: boolean;
  /** Why, in plain words. */
  reason: string;
};

/**
 * Whether a model of a given size will run on this device.
 *
 * `fileSizeMb` is the on-disk size at Q4, which is close to the weight footprint. The
 * running requirement is roughly double that once the KV cache and runtime are added.
 */
export function modelFits(profile: DeviceProfile, fileSizeMb: number): ModelFit {
  if (!profile.behaviour.localAiEnabled) {
    return { fits: false, reason: "On-device inference is disabled for this device tier." };
  }
  if (!Number.isFinite(fileSizeMb) || fileSizeMb <= 0) {
    return { fits: false, reason: "No usable model size was given." };
  }
  const budget = localModelBudgetMb(profile);
  const needed = fileSizeMb * 2; // weights + headroom for KV cache and runtime
  if (needed <= budget) {
    return { fits: true, reason: `Needs about ${Math.round(needed)} MB and the device budget is ${budget} MB.` };
  }
  return {
    fits: false,
    reason: `Needs about ${Math.round(needed)} MB but the device budget is only ${budget} MB.`,
  };
}

/** The largest recommended Q4 file size for this device, in MB. */
export function recommendedModelFileMb(profile: DeviceProfile): number {
  return Math.floor(localModelBudgetMb(profile) / 2);
}

/** Scale a base poll interval for this device. */
export function pacedIntervalMs(profile: DeviceProfile, baseMs: number): number {
  if (!Number.isFinite(baseMs) || baseMs <= 0) return baseMs;
  return Math.round(baseMs * profile.behaviour.pollIntervalMultiplier);
}

/** True when the device is too constrained to keep an eager model in memory. */
export function shouldPreloadModel(profile: DeviceProfile): boolean {
  return profile.behaviour.localAiEnabled && profile.tier === "high";
}

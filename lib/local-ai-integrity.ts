/**
 * Local AI artifact integrity (PROMPT 1, requirements 3, 8 and 10).
 *
 * The download path already rejected a wrong-length file, but a file of exactly
 * the right length with corrupt bytes passed — size is not integrity. The model
 * manifests pin a SHA-256 for the artifact, so this module turns that pin into
 * an actual verdict, and gates inference on it.
 *
 * Honesty rules:
 *  - A model is only reported as checksum-verified when a digest was actually
 *    computed and matched. When no digest can be computed (the JS layer cannot
 *    hash a 498 MB file without the native bridge), the verdict is
 *    "size-verified only" and says so — it is never described as verified.
 *  - Inference is refused for an incomplete artifact.
 */

export type IntegrityVerdict =
  | "verified-checksum"
  | "size-verified-only"
  | "size-mismatch"
  | "checksum-mismatch"
  | "missing";

export type IntegrityResult = {
  verdict: IntegrityVerdict;
  ok: boolean;
  /** True only when a digest was computed and matched. */
  checksumVerified: boolean;
  reason: string;
};

export type IntegrityInput = {
  /** Size declared by the manifest, or null when unknown. */
  expectedSizeBytes: number | null;
  /** SHA-256 declared by the manifest, or null when none is pinned. */
  expectedChecksum: string | null;
  /** Size observed on disk. */
  actualSizeBytes: number;
  /** SHA-256 computed on device, or null when it could not be computed. */
  actualChecksum: string | null;
};

function normalizeChecksum(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(trimmed) ? trimmed : null;
}

/** Evaluate an artifact against its manifest pin. Pure and deterministic. */
export function verifyModelArtifact(input: IntegrityInput): IntegrityResult {
  const expectedChecksum = normalizeChecksum(input.expectedChecksum);

  if (input.actualSizeBytes <= 0) {
    return { verdict: "missing", ok: false, checksumVerified: false, reason: "No artifact is present on disk." };
  }

  if (input.expectedSizeBytes !== null && input.actualSizeBytes !== input.expectedSizeBytes) {
    return {
      verdict: "size-mismatch",
      ok: false,
      checksumVerified: false,
      reason: `The artifact is ${input.actualSizeBytes} bytes but the manifest declares ${input.expectedSizeBytes}. It is incomplete and must not be used.`,
    };
  }

  if (expectedChecksum) {
    const actualChecksum = normalizeChecksum(input.actualChecksum);
    if (actualChecksum === null) {
      return {
        verdict: "size-verified-only",
        ok: true,
        checksumVerified: false,
        reason: "The artifact has the expected size, but no SHA-256 digest could be computed on this build, so integrity is size-verified only — not checksum-verified.",
      };
    }
    if (actualChecksum !== expectedChecksum) {
      return {
        verdict: "checksum-mismatch",
        ok: false,
        checksumVerified: false,
        reason: "The computed SHA-256 does not match the pinned value. The artifact is corrupt or was tampered with and must not be used.",
      };
    }
    return { verdict: "verified-checksum", ok: true, checksumVerified: true, reason: "The artifact matches the pinned SHA-256." };
  }

  return {
    verdict: "size-verified-only",
    ok: true,
    checksumVerified: false,
    reason: "The manifest pins no checksum for this artifact, so integrity is size-verified only.",
  };
}

/**
 * Whether inference may run. A partial, missing or corrupt artifact is always
 * refused, regardless of what the UI believes.
 */
export function canRunInference(input: { artifactExists: boolean; integrity: IntegrityResult | null; nativeRuntimeAvailable: boolean }): { allowed: boolean; reason: string } {
  if (!input.nativeRuntimeAvailable) return { allowed: false, reason: "The native LiteRT-LM bridge is not included in this build." };
  if (!input.artifactExists) return { allowed: false, reason: "The model file is not present on this device." };
  if (!input.integrity) return { allowed: false, reason: "The model artifact has not been integrity-checked yet." };
  if (!input.integrity.ok) return { allowed: false, reason: input.integrity.reason };
  return { allowed: true, reason: input.integrity.reason };
}

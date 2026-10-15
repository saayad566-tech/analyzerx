import { describe, expect, it } from "vitest";

import { canRunInference, verifyModelArtifact } from "../lib/local-ai-integrity";

const CHECKSUM = "b1baab462f6be49d70eada79d715c2c52cd9ece0cad00bddf6a2c097d23498e9";

describe("verifyModelArtifact (PROMPT 1)", () => {
  it("verifies when a computed digest matches the pin", () => {
    const result = verifyModelArtifact({ expectedSizeBytes: 497_664_000, expectedChecksum: CHECKSUM, actualSizeBytes: 497_664_000, actualChecksum: CHECKSUM });
    expect(result.verdict).toBe("verified-checksum");
    expect(result.ok).toBe(true);
    expect(result.checksumVerified).toBe(true);
  });

  it("rejects a corrupt artifact of exactly the right length", () => {
    // This is the case a size-only check used to accept.
    const result = verifyModelArtifact({ expectedSizeBytes: 497_664_000, expectedChecksum: CHECKSUM, actualSizeBytes: 497_664_000, actualChecksum: "0".repeat(64) });
    expect(result.verdict).toBe("checksum-mismatch");
    expect(result.ok).toBe(false);
    expect(result.checksumVerified).toBe(false);
  });

  it("rejects an incomplete artifact", () => {
    const result = verifyModelArtifact({ expectedSizeBytes: 497_664_000, expectedChecksum: CHECKSUM, actualSizeBytes: 100, actualChecksum: null });
    expect(result.verdict).toBe("size-mismatch");
    expect(result.ok).toBe(false);
  });

  it("reports size-verified-only when no digest can be computed, and never claims verification", () => {
    const result = verifyModelArtifact({ expectedSizeBytes: 497_664_000, expectedChecksum: CHECKSUM, actualSizeBytes: 497_664_000, actualChecksum: null });
    expect(result.verdict).toBe("size-verified-only");
    expect(result.checksumVerified).toBe(false);
    expect(result.reason).toMatch(/not checksum-verified/i);
  });

  it("treats a missing file as missing", () => {
    expect(verifyModelArtifact({ expectedSizeBytes: 10, expectedChecksum: null, actualSizeBytes: 0, actualChecksum: null }).verdict).toBe("missing");
  });

  it("ignores a malformed pinned checksum rather than failing the artifact", () => {
    const result = verifyModelArtifact({ expectedSizeBytes: 100, expectedChecksum: "not-a-hash", actualSizeBytes: 100, actualChecksum: null });
    expect(result.verdict).toBe("size-verified-only");
    expect(result.ok).toBe(true);
  });

  it("is deterministic", () => {
    const input = { expectedSizeBytes: 100, expectedChecksum: CHECKSUM, actualSizeBytes: 100, actualChecksum: CHECKSUM };
    expect(verifyModelArtifact(input)).toEqual(verifyModelArtifact(input));
  });
});

describe("canRunInference (PROMPT 1)", () => {
  const verified = verifyModelArtifact({ expectedSizeBytes: 100, expectedChecksum: CHECKSUM, actualSizeBytes: 100, actualChecksum: CHECKSUM });

  it("refuses inference without the native runtime", () => {
    expect(canRunInference({ artifactExists: true, integrity: verified, nativeRuntimeAvailable: false }).allowed).toBe(false);
  });

  it("refuses inference when the model is missing or unchecked", () => {
    expect(canRunInference({ artifactExists: false, integrity: verified, nativeRuntimeAvailable: true }).allowed).toBe(false);
    expect(canRunInference({ artifactExists: true, integrity: null, nativeRuntimeAvailable: true }).allowed).toBe(false);
  });

  it("refuses inference on a corrupt artifact", () => {
    const corrupt = verifyModelArtifact({ expectedSizeBytes: 100, expectedChecksum: CHECKSUM, actualSizeBytes: 100, actualChecksum: "1".repeat(64) });
    const result = canRunInference({ artifactExists: true, integrity: corrupt, nativeRuntimeAvailable: true });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/SHA-256/i);
  });

  it("allows inference only for a complete artifact", () => {
    expect(canRunInference({ artifactExists: true, integrity: verified, nativeRuntimeAvailable: true }).allowed).toBe(true);
  });
});

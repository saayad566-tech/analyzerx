/**
 * Version and integrity management (Prompt 2, section 6).
 *
 * SHA-256 is computed over the retrieved bytes, not over a re-encoded string,
 * because the point of the hash is to identify the exact bytes that were
 * fetched. It is implemented here in pure TypeScript so it is correct and
 * testable in every runtime the app uses; `expo-crypto` hashes the UTF-8
 * encoding of a string, which would not equal the hash of the raw file.
 *
 * The other rule this module enforces: a changed URL is not evidence of a new
 * filing, and an earlier version is never silently overwritten.
 */

import type { DocumentFormat, IngestionTimestamps } from "./types";

/* ------------------------------------------------------------------ *
 * SHA-256
 * ------------------------------------------------------------------ */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/** SHA-256 of a byte array, as a lowercase hex string. */
export function sha256Bytes(bytes: Uint8Array): string {
  const bitLength = bytes.length * 8;
  const withPadding = new Uint8Array((((bytes.length + 9) >> 6) + 1) << 6);
  withPadding.set(bytes);
  withPadding[bytes.length] = 0x80;
  // The length is written as a 64-bit big-endian integer in the final 8 bytes.
  const view = new DataView(withPadding.buffer);
  view.setUint32(withPadding.length - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(withPadding.length - 4, bitLength >>> 0);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < withPadding.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map((value) => value.toString(16).padStart(8, "0")).join("");
}

/** SHA-256 of a UTF-8 string, for convenience. */
export function sha256Text(text: string): string {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff;
  return sha256Bytes(bytes);
}

/* ------------------------------------------------------------------ *
 * Versions
 * ------------------------------------------------------------------ */

export type DocumentVersion = {
  /** The version's own id, derived from the filing key and the content hash. */
  versionId: string;
  filingKey: string;
  sha256: string;
  byteLength: number;
  contentType: string | null;
  format: DocumentFormat;
  requestedUrl: string;
  finalUrl: string;
  retrievedUtc: string;
  parserVersion: string | null;
  /** The version this one replaces, when the source establishes that. */
  supersedes: string | null;
  /** True when the source marks this version as an amendment or correction. */
  isAmendment: boolean;
};

export type VersionHistory = {
  filingKey: string;
  /** Every version ever recorded, oldest first. The order is never re-sorted in place. */
  versions: DocumentVersion[];
  currentVersionId: string | null;
};

export function emptyHistory(filingKey: string): VersionHistory {
  return { filingKey, versions: [], currentVersionId: null };
}

/**
 * Record a version without ever overwriting an earlier one.
 *
 * If the content hash matches a version already held, nothing new is created
 * and the existing version is returned, so a repeat download is idempotent.
 */
export function recordVersion(
  history: VersionHistory,
  incoming: Omit<DocumentVersion, "versionId" | "supersedes">,
): { history: VersionHistory; version: DocumentVersion; created: boolean } {
  const existing = history.versions.find((version) => version.sha256 === incoming.sha256);
  if (existing) {
    return { history, version: existing, created: false };
  }
  const previous = history.currentVersionId
    ? history.versions.find((version) => version.versionId === history.currentVersionId) ?? null
    : null;
  const version: DocumentVersion = {
    ...incoming,
    versionId: `${history.filingKey}::v${history.versions.length + 1}::${incoming.sha256.slice(0, 12)}`,
    supersedes: incoming.isAmendment ? previous?.versionId ?? null : null,
  };
  return {
    history: { ...history, versions: [...history.versions, version], currentVersionId: version.versionId },
    version,
    created: true,
  };
}

export type ChangeAssessment = {
  /** Whether the content actually differs from the version held. */
  contentChanged: boolean;
  /** Whether the URL differs, which is not by itself evidence of a new filing. */
  urlChanged: boolean;
  /** What the caller should do, given both signals. */
  recommendation: "none" | "new_version" | "investigate_url_change" | "amend";
  note: string;
};

/**
 * Assess a newly fetched document against what is already held.
 *
 * A changed URL with identical bytes is a redirect or a re-publication of the
 * same document, not a new filing. A changed hash on the same URL is a genuine
 * content change and must not overwrite the earlier version.
 */
export function assessChange(history: VersionHistory, incoming: { sha256: string; finalUrl: string; isAmendment: boolean }): ChangeAssessment {
  const current = history.currentVersionId ? history.versions.find((version) => version.versionId === history.currentVersionId) ?? null : null;
  if (!current) {
    return { contentChanged: true, urlChanged: false, recommendation: "new_version", note: "No earlier version is held, so this is recorded as the first version." };
  }
  const contentChanged = current.sha256 !== incoming.sha256;
  const urlChanged = current.finalUrl !== incoming.finalUrl;

  if (!contentChanged && urlChanged) {
    return { contentChanged: false, urlChanged: true, recommendation: "investigate_url_change", note: "The URL changed but the bytes are identical, so this is the same document at a new address rather than a new filing." };
  }
  if (!contentChanged) {
    return { contentChanged: false, urlChanged: false, recommendation: "none", note: "The document is unchanged." };
  }
  if (incoming.isAmendment) {
    return { contentChanged: true, urlChanged, recommendation: "amend", note: "The source marks this as an amendment; it is recorded as a new version that supersedes the earlier one." };
  }
  return { contentChanged: true, urlChanged, recommendation: "new_version", note: "The content differs from the version held. The earlier version is retained and this is recorded alongside it." };
}

/**
 * Merge a source-stated publication time into a filing's timestamps without
 * ever substituting the current time for it. A source that states no
 * publication date leaves the field unknown.
 */
export function withPublication(timestamps: IngestionTimestamps, sourceDate: string | null): IngestionTimestamps {
  if (!sourceDate || !sourceDate.trim()) {
    return { ...timestamps, publication: { known: false, reason: "The source did not state a publication time." } };
  }
  const parsed = new Date(sourceDate);
  if (Number.isNaN(parsed.getTime())) {
    return { ...timestamps, publication: { known: false, reason: `The source stated "${sourceDate}", which is not a usable date.` } };
  }
  return { ...timestamps, publication: { known: true, value: parsed.toISOString() } };
}

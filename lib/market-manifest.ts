/**
 * Signed market-data manifest: schema, canonical serialization, and verification.
 *
 * This is the piece that turns the lifecycle state machine into a working download. The
 * client fetches a manifest, verifies its Ed25519 signature against a pinned public key,
 * and only then uses the URLs and hashes inside it.
 *
 * The security property that matters: **the client fails closed.** A manifest with no
 * signature, an unknown key id, a bad signature, an expired window, a non-HTTPS URL, or a
 * missing hash is rejected outright. There is no fallback to an unverified endpoint and no
 * "trust on first use", because either would defeat the point of signing.
 *
 * Canonical serialization: the signature covers a deterministic byte encoding of the
 * payload, not whatever the server happened to send. Key order, whitespace and number
 * formatting would otherwise change the bytes and break every signature, so the payload is
 * re-serialized with sorted keys before verification.
 */
import { verifyEd25519, hexToBytes, bytesToHex } from "./ed25519";

/* ------------------------------------------------------------------ *
 * Schema
 * ------------------------------------------------------------------ */

export type ManifestPart = {
  /** 1-based part number, for a country split across several files. */
  index: number;
  url: string;
  sizeBytes: number;
  sha256: string;
};

export type ManifestMarketEntry = {
  /** Data version for this country's pack. */
  version: string;
  /** The lowest app version that can parse this pack. */
  minAppVersion: string;
  /** Absolute HTTPS URL of the pack, when it is a single file. */
  url?: string;
  sizeBytes: number;
  sha256: string;
  /** Present when the country is split across several parts. */
  parts?: ManifestPart[];
};

export type ManifestPayload = {
  /** Schema version of the manifest itself. */
  manifestVersion: number;
  /** ISO-8601 generation timestamp. */
  generatedAt: string;
  /** ISO-8601 expiry. A manifest past this is refused. */
  expiresAt: string;
  /** One entry per country. */
  markets: Record<string, ManifestMarketEntry>;
};

export type ManifestSignature = {
  /** Only Ed25519 is accepted. */
  algorithm: "Ed25519";
  /** Which pinned key signed this, so keys can be rotated. */
  keyId: string;
  /** Hex-encoded 64-byte detached signature over the canonical payload bytes. */
  signature: string;
};

export type SignedManifest = {
  payload: ManifestPayload;
  signature: ManifestSignature;
};

/* ------------------------------------------------------------------ *
 * Pinned keys
 * ------------------------------------------------------------------ */

/**
 * Public verification keys, pinned in the binary.
 *
 * Only public keys live here. The private signing key stays in the CI pipeline and is
 * never shipped. `keyId` exists so a key can be rotated without an app release: publish
 * the new key id in the manifest, ship it as the default in the next build, and retire the
 * old one afterwards. A manifest signed by an id not in this list is refused.
 *
 * The placeholder below is a real Ed25519 public key (the RFC 8032 test-vector key) so the
 * verification path is exercised end to end. Replace it with the production key's public
 * half before publishing packs; `docs/MANIFEST_SPEC.md` gives the generation command.
 */
export const PINNED_MANIFEST_KEYS: Readonly<Record<string, string>> = {
  "analyzerx-manifest-test-1": "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
};

/* ------------------------------------------------------------------ *
 * Canonical serialization
 * ------------------------------------------------------------------ */

/**
 * Deterministic JSON: object keys sorted, no insignificant whitespace.
 *
 * Arrays keep their order (part order is meaningful), objects are sorted at every level.
 * Numbers are emitted via `String(n)`, which is stable for the integers and short decimals
 * this schema uses.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("Canonical JSON cannot encode a non-finite number.");
      return JSON.stringify(value);
    }
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}

export function canonicalBytes(payload: ManifestPayload): Uint8Array {
  return new TextEncoder().encode(canonicalize(payload));
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

export type ManifestVerdict =
  | { ok: true; payload: ManifestPayload; keyId: string }
  | { ok: false; reason: string };

const SHA256_HEX = /^[0-9a-f]{64}$/;

function isHttps(url: unknown): boolean {
  return typeof url === "string" && /^https:\/\/[^\s]+$/i.test(url);
}

/**
 * Structural validation of one market entry.
 *
 * Every URL must be HTTPS and every hash must be a 64-character lowercase hex digest. A
 * pack with no usable hash cannot be integrity-checked after download, so it is refused
 * rather than downloaded unverified.
 */
export function validateMarketEntry(marketId: string, entry: unknown): { ok: true; entry: ManifestMarketEntry } | { ok: false; reason: string } {
  if (!entry || typeof entry !== "object") return { ok: false, reason: `${marketId}: entry is not an object.` };
  const value = entry as Partial<ManifestMarketEntry>;
  if (typeof value.version !== "string" || !value.version.trim()) return { ok: false, reason: `${marketId}: missing version.` };
  if (typeof value.minAppVersion !== "string" || !value.minAppVersion.trim()) return { ok: false, reason: `${marketId}: missing minAppVersion.` };
  if (typeof value.sizeBytes !== "number" || !Number.isFinite(value.sizeBytes) || value.sizeBytes <= 0) return { ok: false, reason: `${marketId}: sizeBytes must be a positive number.` };

  const hasSingle = value.url !== undefined;
  const hasParts = Array.isArray(value.parts) && value.parts.length > 0;
  if (!hasSingle && !hasParts) return { ok: false, reason: `${marketId}: has neither a url nor parts.` };

  if (hasSingle) {
    if (!isHttps(value.url)) return { ok: false, reason: `${marketId}: url must be an absolute https URL.` };
    if (typeof value.sha256 !== "string" || !SHA256_HEX.test(value.sha256)) return { ok: false, reason: `${marketId}: sha256 must be 64 lowercase hex characters.` };
  }

  if (hasParts) {
    const seen = new Set<number>();
    for (const part of value.parts as ManifestPart[]) {
      if (!part || typeof part !== "object") return { ok: false, reason: `${marketId}: a part is not an object.` };
      if (!Number.isInteger(part.index) || part.index < 1) return { ok: false, reason: `${marketId}: part index must be a positive integer.` };
      if (seen.has(part.index)) return { ok: false, reason: `${marketId}: duplicate part index ${part.index}.` };
      seen.add(part.index);
      if (!isHttps(part.url)) return { ok: false, reason: `${marketId}: part ${part.index} url must be an absolute https URL.` };
      if (!SHA256_HEX.test(part.sha256 ?? "")) return { ok: false, reason: `${marketId}: part ${part.index} sha256 must be 64 lowercase hex characters.` };
      if (typeof part.sizeBytes !== "number" || part.sizeBytes <= 0) return { ok: false, reason: `${marketId}: part ${part.index} sizeBytes must be positive.` };
    }
    // Parts must be numbered 1..n with no gaps, or a download could silently skip one.
    const expected = Array.from({ length: seen.size }, (_, i) => i + 1);
    if (!expected.every((index) => seen.has(index))) return { ok: false, reason: `${marketId}: part indices must be contiguous starting at 1.` };
  }

  return { ok: true, entry: value as ManifestMarketEntry };
}

/**
 * Verify a signed manifest.
 *
 * Order matters: the signature is checked FIRST, over the canonical payload, before any
 * entry is read. Parsing untrusted fields and only then deciding whether to trust them is
 * how a malformed entry ends up in a code path that assumed it was verified.
 *
 * `now` is injectable so expiry can be tested without waiting.
 */
export function verifyManifest(input: unknown, options: { now?: Date; pinnedKeys?: Readonly<Record<string, string>> } = {}): ManifestVerdict {
  const now = options.now ?? new Date();
  const pinned = options.pinnedKeys ?? PINNED_MANIFEST_KEYS;

  if (!input || typeof input !== "object") return { ok: false, reason: "Manifest is not an object." };
  const signed = input as Partial<SignedManifest>;
  if (!signed.payload || typeof signed.payload !== "object") return { ok: false, reason: "Manifest has no payload." };
  if (!signed.signature || typeof signed.signature !== "object") return { ok: false, reason: "Manifest is unsigned; unsigned artifacts are refused." };

  const { algorithm, keyId, signature } = signed.signature as Partial<ManifestSignature>;
  if (algorithm !== "Ed25519") return { ok: false, reason: `Unsupported signature algorithm: ${String(algorithm)}. Only Ed25519 is accepted.` };
  if (typeof keyId !== "string" || !keyId) return { ok: false, reason: "Signature has no key id." };
  if (typeof signature !== "string" || !/^[0-9a-f]{128}$/i.test(signature)) return { ok: false, reason: "Signature must be 128 hex characters." };

  const publicKeyHex = pinned[keyId];
  if (!publicKeyHex) return { ok: false, reason: `Unknown signing key "${keyId}". The manifest was not signed by a pinned key.` };

  const payload = signed.payload as ManifestPayload;

  // 1. Signature first, over the canonical bytes.
  let message: Uint8Array;
  try {
    message = canonicalBytes(payload);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Payload could not be canonicalized." };
  }
  const result = verifyEd25519(hexToBytes(signature), message, hexToBytes(publicKeyHex));
  if (!result.valid) return { ok: false, reason: `Signature verification failed: ${result.reason ?? "invalid signature"}` };

  // 2. Only now is the payload trustworthy enough to read.
  if (payload.manifestVersion !== 1) return { ok: false, reason: `Unsupported manifest version: ${String(payload.manifestVersion)}.` };
  if (typeof payload.generatedAt !== "string" || Number.isNaN(Date.parse(payload.generatedAt))) return { ok: false, reason: "generatedAt is missing or not a timestamp." };
  if (typeof payload.expiresAt !== "string" || Number.isNaN(Date.parse(payload.expiresAt))) return { ok: false, reason: "expiresAt is missing or not a timestamp." };
  if (Date.parse(payload.expiresAt) <= now.getTime()) return { ok: false, reason: `Manifest expired at ${payload.expiresAt}.` };
  if (!payload.markets || typeof payload.markets !== "object") return { ok: false, reason: "Manifest has no markets block." };

  for (const [marketId, entry] of Object.entries(payload.markets)) {
    const verdict = validateMarketEntry(marketId, entry);
    if (!verdict.ok) return { ok: false, reason: verdict.reason };
  }

  return { ok: true, payload, keyId };
}

/* ------------------------------------------------------------------ *
 * Version comparison and diffing
 * ------------------------------------------------------------------ */

export type ParsedVersion = { major: number; minor: number; patch: number; prerelease: string | null };

/** Parse a dotted version. Returns null rather than guessing at something malformed. */
export function parseVersion(value: string): ParsedVersion | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4] ?? null };
}

/** -1 if a < b, 0 if equal, 1 if a > b. A prerelease sorts below its release. */
export function compareVersions(a: string, b: string): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  if (left.major !== right.major) return left.major < right.major ? -1 : 1;
  if (left.minor !== right.minor) return left.minor < right.minor ? -1 : 1;
  if (left.patch !== right.patch) return left.patch < right.patch ? -1 : 1;
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return left.prerelease < right.prerelease ? -1 : 1;
}

export type PackStatus =
  /** No local pack: the user should be offered a download. */
  | { kind: "absent"; remoteVersion: string }
  /** Local pack is current. */
  | { kind: "current"; version: string }
  /** Remote is newer: the lifecycle moves to update-available. */
  | { kind: "update-available"; from: string; to: string }
  /** Local is newer than the manifest: the manifest is stale, so nothing is offered. */
  | { kind: "local-ahead"; from: string; to: string }
  /** The pack needs a newer app than this one. */
  | { kind: "requires-app-update"; required: string; current: string }
  /** The versions could not be compared. */
  | { kind: "uncomparable"; reason: string };

/**
 * Compare one market's remote entry against what is installed locally.
 *
 * `minAppVersion` is checked first: offering a pack the app cannot parse would produce a
 * half-read dataset, so an incompatible pack is reported rather than downloaded.
 */
export function diffMarketPack(
  entry: ManifestMarketEntry,
  local: { version: string | null },
  appVersion: string,
): PackStatus {
  const min = compareVersions(appVersion, entry.minAppVersion);
  if (min === null) return { kind: "uncomparable", reason: `Could not compare app version ${appVersion} with required ${entry.minAppVersion}.` };
  if (min < 0) return { kind: "requires-app-update", required: entry.minAppVersion, current: appVersion };

  // Validate the REMOTE version before anything else. Returning "absent" for a pack whose
  // advertised version cannot be parsed would offer a download that could never be
  // compared against what gets installed, so a malformed version is reported instead.
  if (!parseVersion(entry.version)) return { kind: "uncomparable", reason: `The published version "${entry.version}" is not a valid semantic version.` };

  if (!local.version) return { kind: "absent", remoteVersion: entry.version };

  const cmp = compareVersions(entry.version, local.version);
  if (cmp === null) return { kind: "uncomparable", reason: `Could not compare ${entry.version} with installed ${local.version}.` };
  if (cmp > 0) return { kind: "update-available", from: local.version, to: entry.version };
  if (cmp < 0) return { kind: "local-ahead", from: local.version, to: entry.version };
  return { kind: "current", version: entry.version };
}

/** Total size of a pack, whether it is one file or several parts. */
export function packSizeBytes(entry: ManifestMarketEntry): number {
  if (entry.parts?.length) return entry.parts.reduce((sum, part) => sum + part.sizeBytes, 0);
  return entry.sizeBytes;
}

/** Every downloadable file for a pack, in order. Parts are ordered by index. */
export function packFiles(entry: ManifestMarketEntry): Array<{ url: string; sha256: string; sizeBytes: number; part: number | null }> {
  if (entry.parts?.length) {
    return [...entry.parts]
      .sort((a, b) => a.index - b.index)
      .map((part) => ({ url: part.url, sha256: part.sha256, sizeBytes: part.sizeBytes, part: part.index }));
  }
  return [{ url: entry.url as string, sha256: entry.sha256, sizeBytes: entry.sizeBytes, part: null }];
}

/** A short fingerprint of a payload, for logging without dumping the whole manifest. */
export function manifestFingerprint(payload: ManifestPayload): string {
  return bytesToHex(canonicalBytes(payload)).slice(0, 16);
}

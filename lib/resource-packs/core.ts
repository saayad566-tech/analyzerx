/**
 * Resource-pack core — pure logic, no React Native imports.
 *
 * Everything here is deterministic and side-effect free so it can be unit-tested in plain Node:
 * manifest validation, market-scoped pack resolution, download planning, integrity verification
 * and progress accounting. The platform adapters (`transport.ts`, `fs.ts`, `installer.ts`) are
 * thin shells around this.
 */
import type { z } from "zod";
import type { MarketId } from "../market-regions";
import { sha256Hex } from "./hash";
import {
  packIndexSchema,
  packManifestSchema,
  type ChunkRef,
  type PackIndex,
  type PackIndexEntry,
  type PackManifest,
  type Sha256Hex,
} from "./types";

/** Raised when remote data does not satisfy the resource-pack contract. */
export class PackValidationError extends Error {
  constructor(message: string, readonly detail?: string) {
    super(message);
    this.name = "PackValidationError";
  }
}

/** Raised when a pack is asked to serve a market it does not belong to. */
export class MarketScopeError extends Error {
  constructor(readonly expected: MarketId, readonly actual: MarketId) {
    super(`Market isolation violation: pack for "${actual}" cannot serve market "${expected}".`);
    this.name = "MarketScopeError";
  }
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`).join("; ");
}

/** Validate the top-level index ("main file"). Throws {@link PackValidationError}. */
export function parseIndex(raw: unknown): PackIndex {
  const result = packIndexSchema.safeParse(raw);
  if (!result.success) throw new PackValidationError("Resource-pack index did not satisfy the resource-pack contract.", describeIssues(result.error));
  return result.data;
}

/** Validate a per-market manifest. Throws {@link PackValidationError}. */
export function parsePackManifest(raw: unknown): PackManifest {
  const result = packManifestSchema.safeParse(raw);
  if (!result.success) throw new PackValidationError("Resource-pack manifest did not satisfy the resource-pack contract.", describeIssues(result.error));
  const manifest = result.data;
  const declared = manifest.datasets.reduce((sum, dataset) => sum + dataset.bytes, 0);
  if (declared !== manifest.totalBytes) {
    throw new PackValidationError("Resource-pack manifest totalBytes does not match its datasets.", `datasets=${declared} totalBytes=${manifest.totalBytes}`);
  }
  return manifest;
}

/**
 * Return the index entry for a market, or null when the index has none.
 *
 * Market isolation: this is an exact, single-market lookup. A missing market never resolves to
 * another market's entry.
 */
export function resolvePackEntry(index: PackIndex, marketId: MarketId): PackIndexEntry | null {
  return index.packs.find((entry) => entry.marketId === marketId) ?? null;
}

/** Throw if the manifest belongs to a different market than the one being served. */
export function assertMarketScope(manifest: PackManifest, expected: MarketId): void {
  if (manifest.marketId !== expected) throw new MarketScopeError(expected, manifest.marketId);
}

/** Every chunk in download order (dataset order, then chunk index). */
export function planDownload(manifest: PackManifest): ChunkRef[] {
  const seen = new Set<string>();
  const refs: ChunkRef[] = [];
  for (const dataset of manifest.datasets) {
    const ordered = [...dataset.chunks].sort((a, b) => a.index - b.index);
    for (const chunk of ordered) {
      if (seen.has(chunk.file)) continue;
      seen.add(chunk.file);
      refs.push({ datasetName: dataset.name, index: chunk.index, file: chunk.file, bytes: chunk.bytes, sha256: chunk.sha256 });
    }
  }
  return refs;
}

/** Total bytes across all chunks (what the device must download). */
export function totalChunkBytes(manifest: PackManifest): number {
  return planDownload(manifest).reduce((sum, chunk) => sum + chunk.bytes, 0);
}

/** Constant-time-ish comparison of two hex digests. */
export function verifyHex(expected: string, actual: string): boolean {
  if (expected.length !== actual.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) mismatch |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  return mismatch === 0;
}

/**
 * The canonical byte body of a manifest, excluding its own `sha256` field.
 * The build tool and the app must agree on this exactly.
 */
export function canonicalManifestBody(manifest: PackManifest): string {
  const body = {
    schemaVersion: manifest.schemaVersion,
    marketId: manifest.marketId,
    packVersion: manifest.packVersion,
    generatedAt: manifest.generatedAt,
    chunkBytes: manifest.chunkBytes,
    datasets: manifest.datasets.map((dataset) => ({
      name: dataset.name,
      bytes: dataset.bytes,
      sha256: dataset.sha256,
      encoding: dataset.encoding,
      chunks: [...dataset.chunks].sort((a, b) => a.index - b.index).map((chunk) => ({ index: chunk.index, file: chunk.file, bytes: chunk.bytes, sha256: chunk.sha256 })),
    })),
    totalBytes: manifest.totalBytes,
  };
  return JSON.stringify(body);
}

/** Verify the manifest's self-digest using the supplied hash function. */
export async function verifyManifestDigest(manifest: PackManifest, hash: Sha256Hex): Promise<boolean> {
  const actual = await hash(new TextEncoder().encode(canonicalManifestBody(manifest)));
  return verifyHex(manifest.sha256, actual);
}

/** Verify a single chunk body against its expected digest and length. */
export async function verifyChunkBody(body: Uint8Array, expectedSha256: string, expectedBytes?: number): Promise<boolean> {
  if (typeof expectedBytes === "number" && body.byteLength !== expectedBytes) return false;
  const digest = await sha256Hex(body);
  return verifyHex(expectedSha256, digest);
}

export type ChunkVerification = {
  ok: boolean;
  verifiedBytes: number;
  failures: { file: string; reason: string }[];
};

/**
 * Verify a set of downloaded chunk bodies against the manifest.
 * Detects both transport corruption (bad chunk digest) and truncation (wrong length).
 */
export async function verifyChunks(manifest: PackManifest, bodies: Map<string, Uint8Array>, hash: Sha256Hex): Promise<ChunkVerification> {
  const failures: { file: string; reason: string }[] = [];
  let verifiedBytes = 0;
  for (const ref of planDownload(manifest)) {
    const body = bodies.get(ref.file);
    if (!body) {
      failures.push({ file: ref.file, reason: "missing" });
      continue;
    }
    if (body.byteLength !== ref.bytes) {
      failures.push({ file: ref.file, reason: `length ${body.byteLength} != ${ref.bytes}` });
      continue;
    }
    const digest = await hash(body);
    if (!verifyHex(ref.sha256, digest)) {
      failures.push({ file: ref.file, reason: "digest mismatch" });
      continue;
    }
    verifiedBytes += body.byteLength;
  }
  return { ok: failures.length === 0, verifiedBytes, failures };
}

/** Concatenate a dataset's verified chunks in index order. */
export function assembleDataset(datasetName: string, manifest: PackManifest, bodies: Map<string, Uint8Array>): Uint8Array {
  const dataset = manifest.datasets.find((candidate) => candidate.name === datasetName);
  if (!dataset) throw new PackValidationError(`Dataset "${datasetName}" is not part of pack ${manifest.marketId}.`);
  const ordered = [...dataset.chunks].sort((a, b) => a.index - b.index);
  const total = ordered.reduce((sum, chunk) => sum + chunk.bytes, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of ordered) {
    const body = bodies.get(chunk.file);
    if (!body) throw new PackValidationError(`Chunk "${chunk.file}" for dataset "${datasetName}" is missing.`);
    out.set(body, offset);
    offset += body.byteLength;
  }
  return out;
}

/** Verify an assembled dataset's digest. */
export async function verifyDataset(datasetName: string, assembled: Uint8Array, manifest: PackManifest, hash: Sha256Hex): Promise<boolean> {
  const dataset = manifest.datasets.find((candidate) => candidate.name === datasetName);
  if (!dataset) return false;
  if (assembled.byteLength !== dataset.bytes) return false;
  return verifyHex(dataset.sha256, await hash(assembled));
}

/** Decode an assembled dataset into a JS value based on its declared encoding. */
export function decodeDataset(datasetName: string, assembled: Uint8Array, manifest: PackManifest): unknown {
  const dataset = manifest.datasets.find((candidate) => candidate.name === datasetName);
  if (!dataset) throw new PackValidationError(`Dataset "${datasetName}" is not part of pack ${manifest.marketId}.`);
  const text = new TextDecoder().decode(assembled);
  if (dataset.encoding === "json") return JSON.parse(text) as unknown;
  if (dataset.encoding === "jsonl") {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as unknown);
  }
  return text;
}

/** Which chunks of a pack are already present and verified locally. */
export type PackPresence = { done: number; total: number; fraction: number; missing: ChunkRef[] };

export function packPresence(manifest: PackManifest, presentFiles: ReadonlySet<string>): PackPresence {
  const refs = planDownload(manifest);
  const missing = refs.filter((ref) => !presentFiles.has(ref.file));
  const done = refs.length - missing.length;
  return { done, total: refs.length, fraction: refs.length === 0 ? 1 : done / refs.length, missing };
}

/** True when every chunk of the manifest is present locally. */
export function isPackComplete(manifest: PackManifest, presentFiles: ReadonlySet<string>): boolean {
  return packPresence(manifest, presentFiles).missing.length === 0;
}

/** Build a progress report from verified byte counts. */
export function packProgress(manifest: PackManifest, bytesDone: number, chunksDone: number, currentFile: string | null): import("./types").PackProgress {
  const refs = planDownload(manifest);
  const bytesTotal = refs.reduce((sum, ref) => sum + ref.bytes, 0);
  const clampedDone = Math.max(0, Math.min(bytesDone, bytesTotal));
  return {
    marketId: manifest.marketId,
    packVersion: manifest.packVersion,
    bytesDone: clampedDone,
    bytesTotal,
    fraction: bytesTotal === 0 ? 1 : clampedDone / bytesTotal,
    currentFile,
    chunksDone,
    chunksTotal: refs.length,
  };
}

/** Human-readable byte size (SI, one decimal). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return unit === 0 ? `${value} ${units[unit]}` : `${value.toFixed(1)} ${units[unit]}`;
}

/** A stable local directory name for a market pack (safe for the filesystem). */
export function packDirectoryName(marketId: MarketId, packVersion: string): string {
  const safeVersion = packVersion.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${marketId}-${safeVersion}`;
}

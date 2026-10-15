/**
 * Resource-pack on-disk format — the canonical byte layout shared by the build tool and the app.
 *
 * IMPORTANT: `canonicalManifestBody` here MUST stay byte-identical to
 * `canonicalManifestBody` in `lib/resource-packs/core.ts`. The app verifies each manifest against
 * its own `sha256`, computed over exactly this body. A mismatch would make every pack look corrupt.
 *
 * Plain ESM, Node-only, no dependencies.
 */
import { createHash } from "node:crypto";

/** Chunk size used by default: 4 MiB, well under GitHub's per-file limits. */
export const DEFAULT_CHUNK_BYTES = 4 * 1024 * 1024;

export const MARKET_ORDER = ["IN", "US", "GB", "CA", "AU", "JP", "SG", "HK", "DE", "FR"];

/** Lowercase hex SHA-256 of a Buffer/Uint8Array. */
export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * The canonical manifest body (everything except the manifest's own `sha256`).
 * Key order and dataset/chunk ordering are fixed and must match the app.
 */
export function canonicalManifestBody(manifest) {
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
      chunks: [...dataset.chunks]
        .sort((a, b) => a.index - b.index)
        .map((chunk) => ({ index: chunk.index, file: chunk.file, bytes: chunk.bytes, sha256: chunk.sha256 })),
    })),
    totalBytes: manifest.totalBytes,
  };
  return JSON.stringify(body);
}

/** Compute and attach the manifest's self-digest. */
export function sealManifest(manifest) {
  return { ...manifest, sha256: sha256Hex(Buffer.from(canonicalManifestBody(manifest), "utf8")) };
}

/** Split a buffer into `chunkBytes`-sized pieces. */
export function chunkBuffer(buffer, chunkBytes) {
  const pieces = [];
  for (let offset = 0; offset < buffer.length; offset += chunkBytes) {
    pieces.push(buffer.subarray(offset, Math.min(offset + chunkBytes, buffer.length)));
  }
  return pieces.length ? pieces : [Buffer.alloc(0)];
}

/** A filesystem-safe version string. */
export function normalizeVersion(input) {
  const value = String(input ?? "").trim();
  return value.replace(/[^0-9A-Za-z._-]/g, "_") || "0.0.0";
}

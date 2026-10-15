/**
 * Resource-pack contract.
 *
 * AnalyzerX ships as a light code repository. Market data (India, USA, …) lives in a
 * separate assets repository, split into size-bounded chunks, and is fetched at runtime
 * through a single "main file" (the index) plus one manifest per market.
 *
 * The types here are the contract shared by the build tool (`scripts/build-resource-pack.mjs`),
 * the runtime installer, and the unit tests. Keep them free of React Native imports so the
 * pure logic stays testable in plain Node.
 */
import { z } from "zod";
import type { MarketId } from "../market-regions";

export type { MarketId };

/** Every market the app offers, in the app's canonical order. */
export const MARKET_ID_VALUES = ["IN", "US", "GB", "CA", "AU", "JP", "SG", "HK", "DE", "FR"] as const;

/** Hex-encoded SHA-256 (64 lowercase hex characters). */
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/, "expected a lowercase hex SHA-256 digest");

export const marketIdSchema = z.enum(MARKET_ID_VALUES);

/**
 * One physical chunk of a dataset. Chunks are stored as opaque bytes; the app concatenates a
 * dataset's chunks in `index` order and then verifies the assembled dataset digest.
 */
export const chunkSchema = z.object({
  /** 0-based position of this chunk inside its dataset. */
  index: z.number().int().min(0),
  /** Repository-relative path, e.g. `packs/IN/000.bin`. */
  file: z.string().min(1),
  /** Exact byte length of this chunk. */
  bytes: z.number().int().positive(),
  /** SHA-256 of this chunk's bytes. */
  sha256: sha256Hex,
});

/** One logical dataset inside a pack (e.g. `events`, `storylines`, `flows`). */
export const datasetSchema = z.object({
  /** Stable dataset name used by the app to read the data back. */
  name: z.string().min(1).max(64),
  /** Byte length of the assembled dataset. */
  bytes: z.number().int().nonnegative(),
  /** SHA-256 of the assembled dataset bytes. */
  sha256: sha256Hex,
  /** How the assembled bytes are interpreted. */
  encoding: z.enum(["json", "jsonl", "text"]),
  /** Ordered chunks; concatenating them in order reproduces the dataset. */
  chunks: z.array(chunkSchema).min(1),
});

/** The per-market manifest — the "main file" the app fetches for the selected market. */
export const packManifestSchema = z.object({
  schemaVersion: z.literal(1),
  marketId: marketIdSchema,
  /** Human-facing version, e.g. `2026.10.15` or a semver. */
  packVersion: z.string().min(1).max(64),
  generatedAt: z.string().min(1),
  /** The chunk size the build tool used (informational; chunking is authoritative). */
  chunkBytes: z.number().int().positive(),
  datasets: z.array(datasetSchema).min(1),
  /** Sum of every dataset's bytes. */
  totalBytes: z.number().int().nonnegative(),
  /** SHA-256 over the canonical manifest body (everything except this field). */
  sha256: sha256Hex,
});

/** One entry in the index, describing where a market's manifest lives. */
export const indexEntrySchema = z.object({
  marketId: marketIdSchema,
  packVersion: z.string().min(1).max(64),
  /** Repository-relative path to the market manifest, e.g. `manifests/IN.json`. */
  manifestPath: z.string().min(1),
  totalBytes: z.number().int().nonnegative(),
  datasetNames: z.array(z.string().min(1)),
});

/** The top-level "main file": one index for every market. */
export const packIndexSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().min(1),
  packs: z.array(indexEntrySchema).min(1),
});

export type PackChunk = z.infer<typeof chunkSchema>;
export type PackDataset = z.infer<typeof datasetSchema>;
export type PackManifest = z.infer<typeof packManifestSchema>;
export type PackIndexEntry = z.infer<typeof indexEntrySchema>;
export type PackIndex = z.infer<typeof packIndexSchema>;

/** A resolved chunk to download, with its owning dataset attached. */
export type ChunkRef = {
  datasetName: string;
  index: number;
  file: string;
  bytes: number;
  sha256: string;
};

/** Progress report emitted while installing a pack. */
export type PackProgress = {
  marketId: MarketId;
  packVersion: string;
  /** Bytes fully downloaded and verified so far. */
  bytesDone: number;
  /** Total bytes across every dataset. */
  bytesTotal: number;
  /** Fraction in [0, 1]. */
  fraction: number;
  /** The file currently being fetched, or null when finished. */
  currentFile: string | null;
  /** Number of verified chunks. */
  chunksDone: number;
  chunksTotal: number;
};

/** The outcome of an install attempt. */
export type PackInstallResult =
  | { status: "installed"; marketId: MarketId; packVersion: string; bytes: number; datasets: string[] }
  | { status: "up-to-date"; marketId: MarketId; packVersion: string; bytes: number; datasets: string[] }
  | { status: "unsupported"; marketId: MarketId; message: string }
  | { status: "failed"; marketId: MarketId; message: string };

/** A function that returns the lowercase hex SHA-256 of the supplied bytes. */
export type Sha256Hex = (data: Uint8Array) => Promise<string>;

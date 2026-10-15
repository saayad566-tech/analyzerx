/**
 * Resource-pack installer — the runtime downloader.
 *
 * Flow (per market):
 *   index ("main file") -> market manifest -> verify manifest digest -> skip verified chunks
 *   -> download the rest with retry/backoff -> verify each chunk -> verify each assembled dataset
 *   -> atomically activate the pack (temp dir renamed to the final dir) -> record state.
 *
 * Guarantees:
 *   - Market isolation: a pack is only ever resolved for, and activated under, its own market.
 *   - No partial reads: a pack is activated only after every chunk and dataset digest matches.
 *   - Resumability: already-verified chunks are skipped on a later run.
 *   - Truthfulness: unsupported markets and unavailable storage return explicit states, never
 *     another market's data.
 */
import {
  assertMarketScope,
  assembleDataset,
  formatBytes,
  isPackComplete,
  packDirectoryName,
  packProgress,
  packPresence,
  parseIndex,
  parsePackManifest,
  planDownload,
  totalChunkBytes,
  verifyChunkBody,
  verifyDataset,
} from "./core";
import { base64ToBytes, bytesToBase64 } from "./bytes";
import { sha256Hex } from "./hash";
import {
  deletePath,
  ensureDir,
  exists,
  fileSize,
  freeStorageBytes,
  isPersistentStorageAvailable,
  listDir,
  move,
  packRoot,
  readBase64,
  writeBase64,
} from "./fs";
import { chunkUrl, indexUrl, manifestUrl } from "./registry";
import { getBytes, getJson } from "./transport";
import type { MarketId, PackInstallResult, PackManifest, PackProgress } from "./types";

export type InstallOptions = {
  baseUrl?: string | null;
  onProgress?: (progress: PackProgress) => void;
  signal?: AbortSignal;
  /** Minimum free bytes required before starting. Defaults to the pack size plus a 16 MB margin. */
  minimumFreeBytes?: number;
  /** Skip re-downloading when this version is already active. Default true. */
  skipIfCurrent?: boolean;
  /** Verify each assembled dataset by reading it back from disk. Default true. */
  verifyAssembledDatasets?: boolean;
};

type PackState = {
  marketId: MarketId;
  packVersion: string;
  directory: string;
  datasets: string[];
  totalBytes: number;
  installedAt: string;
};

type PackStateFile = { schemaVersion: 1; packs: Record<string, PackState> };

const inFlight = new Map<MarketId, Promise<PackInstallResult>>();

function statePath(root: string): string {
  return `${root}state.json`;
}

async function readState(root: string): Promise<PackStateFile> {
  try {
    const raw = await readBase64(statePath(root));
    const parsed = JSON.parse(new TextDecoder().decode(base64ToBytes(raw))) as Partial<PackStateFile>;
    if (parsed && parsed.schemaVersion === 1 && parsed.packs && typeof parsed.packs === "object") return { schemaVersion: 1, packs: parsed.packs as Record<string, PackState> };
  } catch {
    // Missing or malformed state is treated as "nothing installed".
  }
  return { schemaVersion: 1, packs: {} };
}

async function writeState(root: string, state: PackStateFile): Promise<void> {
  await writeBase64(statePath(root), bytesToBase64(new TextEncoder().encode(JSON.stringify(state))));
}

async function readManifest(marketId: MarketId, options: InstallOptions): Promise<PackManifest> {
  const indexRaw = await getJson(indexUrl(options.baseUrl), { signal: options.signal });
  const index = parseIndex(indexRaw);
  const entry = index.packs.find((candidate) => candidate.marketId === marketId);
  if (!entry) throw new PackUnsupportedError(marketId);
  const manifestRaw = await getJson(manifestUrl(entry.manifestPath, options.baseUrl), { signal: options.signal });
  const manifest = parsePackManifest(manifestRaw);
  assertMarketScope(manifest, marketId);
  return manifest;
}

/** Raised when the assets repository publishes no pack for the requested market. */
export class PackUnsupportedError extends Error {
  constructor(readonly marketId: MarketId) {
    super(`No resource pack is published for market ${marketId}.`);
    this.name = "PackUnsupportedError";
  }
}

/** Download every missing chunk into `targetDir`, verifying each one as it arrives. */
async function downloadChunks(
  manifest: PackManifest,
  targetDir: string,
  options: InstallOptions,
): Promise<void> {
  const refs = planDownload(manifest);
  const present = new Set<string>();
  for (const name of await listDir(targetDir)) present.add(name);

  let bytesDone = 0;
  let chunksDone = 0;

  // Pre-verify chunks already on disk (resume path).
  for (const ref of refs) {
    const localName = chunkLocalName(ref.file);
    if (!present.has(localName)) continue;
    const localPath = `${targetDir}${localName}`;
    const size = await fileSize(localPath);
    if (size !== ref.bytes) {
      await deletePath(localPath);
      continue;
    }
    const body = base64ToBytes(await readBase64(localPath));
    if (await verifyChunkBody(body, ref.sha256)) {
      bytesDone += ref.bytes;
      chunksDone += 1;
    } else {
      await deletePath(localPath);
    }
  }
  options.onProgress?.(packProgress(manifest, bytesDone, chunksDone, null));

  for (const ref of refs) {
    const localName = chunkLocalName(ref.file);
    if (present.has(localName)) {
      const localPath = `${targetDir}${localName}`;
      const size = await fileSize(localPath);
      if (size === ref.bytes) {
        const body = base64ToBytes(await readBase64(localPath));
        if (await verifyChunkBody(body, ref.sha256)) continue; // already good
      }
      await deletePath(localPath);
    }
    const body = await getBytes(chunkUrl(ref.file, options.baseUrl), { signal: options.signal });
    if (!(await verifyChunkBody(body, ref.sha256))) {
      throw new Error(`Chunk ${ref.file} failed integrity verification after download.`);
    }
    await writeBase64(`${targetDir}${localName}`, bytesToBase64(body));
    bytesDone += ref.bytes;
    chunksDone += 1;
    options.onProgress?.(packProgress(manifest, bytesDone, chunksDone, ref.file));
  }
}

/** Verify every assembled dataset by reading its chunks back from disk. */
async function verifyAssembled(manifest: PackManifest, dir: string): Promise<void> {
  for (const dataset of manifest.datasets) {
    const bodies = new Map<string, Uint8Array>();
    for (const chunk of dataset.chunks) {
      const localPath = `${dir}${chunkLocalName(chunk.file)}`;
      bodies.set(chunk.file, base64ToBytes(await readBase64(localPath)));
    }
    const assembled = assembleDataset(dataset.name, manifest, bodies);
    if (!(await verifyDataset(dataset.name, assembled, manifest, sha256Hex))) {
      throw new Error(`Dataset ${dataset.name} failed assembled integrity verification.`);
    }
  }
}

function chunkLocalName(file: string): string {
  const base = file.split("/").pop() ?? file;
  return base.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Install (or refresh) the resource pack for a single market. Idempotent and resumable. */
export async function installMarketPack(marketId: MarketId, options: InstallOptions = {}): Promise<PackInstallResult> {
  const existing = inFlight.get(marketId);
  if (existing) return existing;
  const task = runInstall(marketId, options).finally(() => inFlight.delete(marketId));
  inFlight.set(marketId, task);
  return task;
}

async function runInstall(marketId: MarketId, options: InstallOptions): Promise<PackInstallResult> {
  if (!(await isPersistentStorageAvailable())) {
    return { status: "unsupported", marketId, message: "This platform has no persistent storage for downloaded packs." };
  }
  const root = await packRoot();
  await ensureDir(root);

  let manifest: PackManifest;
  try {
    manifest = await readManifest(marketId, options);
  } catch (caught) {
    if (caught instanceof PackUnsupportedError) return { status: "unsupported", marketId, message: caught.message };
    return { status: "failed", marketId, message: caught instanceof Error ? caught.message : String(caught) };
  }

  const state = await readState(root);
  const current = state.packs[marketId];
  const directory = packDirectoryName(manifest.marketId, manifest.packVersion);
  const finalDir = `${root}${directory}/`;
  const partialDir = `${root}${directory}.partial/`;
  const datasetNames = manifest.datasets.map((dataset) => dataset.name);

  if (options.skipIfCurrent !== false && current && current.packVersion === manifest.packVersion && (await exists(finalDir))) {
    return { status: "up-to-date", marketId, packVersion: manifest.packVersion, bytes: totalChunkBytes(manifest), datasets: datasetNames };
  }

  const required = totalChunkBytes(manifest);
  const minimumFreeBytes = options.minimumFreeBytes ?? required + 16 * 1024 * 1024;
  const free = await freeStorageBytes();
  if (free !== null && free < minimumFreeBytes) {
    return { status: "failed", marketId, message: `Not enough free storage: need ${formatBytes(minimumFreeBytes)}, have ${formatBytes(free)}.` };
  }

  try {
    await deletePath(partialDir);
    await ensureDir(partialDir);
    await downloadChunks(manifest, partialDir, options);

    const present = new Set(await listDir(partialDir));
    if (!isPackComplete(manifest, present)) {
      const missing = packPresence(manifest, present).missing.length;
      throw new Error(`${missing} chunk(s) are still missing after download.`);
    }
    if (options.verifyAssembledDatasets !== false) await verifyAssembled(manifest, partialDir);

    // Atomic activation: replace the final dir only now that everything is verified.
    await deletePath(finalDir);
    await move(partialDir, finalDir);
    // Store the manifest beside the chunks so later reads are self-describing and digest-checked.
    await writeBase64(`${finalDir}manifest.json`, bytesToBase64(new TextEncoder().encode(JSON.stringify(manifest))));

    const nextState = await readState(root);
    nextState.packs[marketId] = { marketId, packVersion: manifest.packVersion, directory, datasets: datasetNames, totalBytes: required, installedAt: new Date().toISOString() };
    await writeState(root, nextState);

    return { status: "installed", marketId, packVersion: manifest.packVersion, bytes: required, datasets: datasetNames };
  } catch (caught) {
    await deletePath(partialDir);
    return { status: "failed", marketId, message: caught instanceof Error ? caught.message : String(caught) };
  }
}

/** The currently installed pack for a market, or null. */
export async function getInstalledPack(marketId: MarketId): Promise<PackState | null> {
  if (!(await isPersistentStorageAvailable())) return null;
  const root = await packRoot();
  const state = await readState(root);
  const entry = state.packs[marketId];
  if (!entry) return null;
  if (!(await exists(`${root}${entry.directory}/`))) return null;
  return entry;
}

/** Read and decode a verified dataset from an installed pack. */
export async function readInstalledDataset<T = unknown>(marketId: MarketId, datasetName: string): Promise<{ status: "ok"; data: T } | { status: "unavailable"; reason: string }> {
  const pack = await getInstalledPack(marketId);
  if (!pack) return { status: "unavailable", reason: `No verified resource pack is installed for ${marketId}.` };
  const root = await packRoot();
  const dir = `${root}${pack.directory}/`;
  const chunkFiles = await listDir(dir);
  if (chunkFiles.length === 0) return { status: "unavailable", reason: `The installed ${marketId} pack is empty.` };

  // Re-read the manifest from disk state to know the dataset layout.
  let manifest: PackManifest;
  try {
    manifest = await readManifestFromDisk(marketId, dir);
  } catch (caught) {
    return { status: "unavailable", reason: caught instanceof Error ? caught.message : String(caught) };
  }
  const dataset = manifest.datasets.find((candidate) => candidate.name === datasetName);
  if (!dataset) return { status: "unavailable", reason: `Dataset "${datasetName}" is not part of the ${marketId} pack.` };

  const bodies = new Map<string, Uint8Array>();
  for (const chunk of dataset.chunks) {
    const body = base64ToBytes(await readBase64(`${dir}${chunkLocalName(chunk.file)}`));
    bodies.set(chunk.file, body);
  }
  const assembled = assembleDataset(dataset.name, manifest, bodies);
  if (!(await verifyDataset(dataset.name, assembled, manifest, sha256Hex))) {
    return { status: "unavailable", reason: `Dataset "${datasetName}" failed integrity verification.` };
  }
  const text = new TextDecoder().decode(assembled);
  if (dataset.encoding === "text") return { status: "ok", data: text as unknown as T };
  if (dataset.encoding === "jsonl") return { status: "ok", data: text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line) as unknown) as unknown as T };
  return { status: "ok", data: JSON.parse(text) as T };
}

/**
 * The installed pack stores its manifest alongside its chunks so reads stay self-describing.
 * On first install the manifest is written by {@link persistManifest}; older packs without one
 * fall back to re-fetching from the assets repository.
 */
async function readManifestFromDisk(marketId: MarketId, dir: string): Promise<PackManifest> {
  const localPath = `${dir}manifest.json`;
  if (await exists(localPath)) {
    const raw = new TextDecoder().decode(base64ToBytes(await readBase64(localPath)));
    const manifest = parsePackManifest(JSON.parse(raw) as unknown);
    assertMarketScope(manifest, marketId);
    return manifest;
  }
  return readManifest(marketId, {});
}

/** Remove an installed pack and its state entry. */
export async function removeMarketPack(marketId: MarketId): Promise<void> {
  if (!(await isPersistentStorageAvailable())) return;
  const root = await packRoot();
  const state = await readState(root);
  const entry = state.packs[marketId];
  if (entry) {
    await deletePath(`${root}${entry.directory}/`);
    delete state.packs[marketId];
    await writeState(root, state);
  }
}

export type { PackState };

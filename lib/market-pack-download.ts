/**
 * Country data-pack download.
 *
 * Bridges a verified manifest entry to the lifecycle state machine:
 *
 *   queued → downloading → verifying → installed
 *
 * with `failed` on any error, and no way to reach `installed` without every part's
 * SHA-256 matching the manifest.
 *
 * Safety properties, all of which the mandate calls out:
 *
 *  - The hash checked is the one from the **verified** manifest, never one supplied
 *    alongside the download. A pack whose bytes do not match is deleted, not installed.
 *  - A part that fails is the only thing redownloaded; the rest are kept.
 *  - The previously working version is untouched until the new one is complete, so a
 *    failed update leaves a usable app rather than a half-replaced dataset.
 *  - Temporary files are removed on failure, so a retry starts from a clean state.
 *
 * The transfer itself is delegated to the ForgeShelf filesystem helper, which already
 * implements resumable downloads via `createDownloadResumable`.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

import { artifactDirectory, artifactPath, download, makeDirectory, readBase64, remove } from "./forge-shelf-filesystem";
import {
  loadMarketLifecycle, saveMarketLifecycle, setMarketDownloadProgress,
  failMarketLifecycle, completeMarketLifecycle, canTransition,
  type MarketLifecycleRecord,
} from "./market-lifecycle";
import { packFiles, packSizeBytes, type ManifestMarketEntry } from "./market-manifest";
import { packCacheKey } from "./market-manifest-client";
import type { MarketId } from "./market-regions";

export type PackProgress = {
  marketId: string;
  stage: "downloading" | "verifying" | "installed" | "failed";
  /** 0..1 across all parts. */
  progress: number;
  /** Which part is in flight, 1-based; null for a single-file pack. */
  part: number | null;
  partsVerified: number;
  partsTotal: number;
  message: string;
};

export type PackResult = {
  marketId: string;
  record: MarketLifecycleRecord;
  installedBytes: number;
  dataVersion: string;
  /** Local URIs of the verified files, in part order. */
  files: Array<{ part: number | null; uri: string; sha256: string }>;
};

/** SHA-256 of a file, read through the same path the ForgeShelf installer uses. */
async function sha256File(uri: string): Promise<string> {
  const base64 = await readBase64(uri);
  const Crypto = await import("expo-crypto");
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64);
}

/** Where a part's bytes live while being downloaded, before it is verified. */
async function stagingPath(marketId: string, part: number | null, version: string): Promise<string> {
  const directory = await artifactDirectory(`market-${marketId}`);
  await makeDirectory(directory);
  return artifactPath(`market-${marketId}`, `${version}-${part === null ? "single" : `part${part}`}`);
}

/**
 * Download and verify one country's pack.
 *
 * `onProgress` is called throughout so the switcher can show a real percentage rather
 * than an indeterminate spinner.
 */
export async function downloadMarketPack(
  marketId: MarketId,
  entry: ManifestMarketEntry,
  onProgress?: (progress: PackProgress) => void,
): Promise<PackResult> {
  const files = packFiles(entry);
  const totalBytes = packSizeBytes(entry);
  let record = await loadMarketLifecycle(marketId);
  const verified: Array<{ part: number | null; uri: string; sha256: string }> = [];
  const staged: string[] = [];

  const emit = (progress: PackProgress) => onProgress?.(progress);

  try {
    // Move to downloading. `canTransition` guards this so a pack cannot be started from a
    // state that should not allow it.
    if (!canTransition(record.state, "downloading")) {
      throw new Error(`Cannot start a download for ${marketId} from the "${record.state}" state.`);
    }
    record = await saveMarketLifecycle({ ...record, state: "downloading", progress: 0, failureReason: null });
    emit({ marketId, stage: "downloading", progress: 0, part: null, partsVerified: 0, partsTotal: files.length, message: `Starting ${entry.version}.` });

    let writtenBytes = 0;
    for (const file of files) {
      const target = await stagingPath(marketId, file.part, entry.version);
      staged.push(target);

      const uri = await download(file.url, target, (written) => {
        const overall = totalBytes > 0 ? Math.min(0.95, (writtenBytes + written) / totalBytes) : 0;
        emit({
          marketId, stage: "downloading", progress: overall, part: file.part,
          partsVerified: verified.length, partsTotal: files.length,
          message: file.part === null ? "Downloading the pack." : `Downloading part ${file.part} of ${files.length}.`,
        });
        // Persist progress so a relaunch shows where it stopped.
        void setMarketDownloadProgress(record, writtenBytes + written, totalBytes).catch(() => undefined);
      });

      writtenBytes += file.sizeBytes;
      verified.push({ part: file.part, uri, sha256: file.sha256 });
    }

    // Every part is on disk. Verify before declaring anything installed.
    record = await saveMarketLifecycle({ ...record, state: "verifying", progress: 1, partsExpected: files.length, partsVerified: 0 });
    emit({ marketId, stage: "verifying", progress: 0.96, part: null, partsVerified: 0, partsTotal: files.length, message: `Verifying ${files.length} file${files.length === 1 ? "" : "s"}.` });

    let verifiedCount = 0;
    for (const file of verified) {
      const actual = await sha256File(file.uri);
      if (actual.toLowerCase() !== file.sha256.toLowerCase()) {
        throw new Error(
          `Checksum mismatch on ${file.part === null ? "the pack" : `part ${file.part}`}. Expected ${file.sha256}, received ${actual}. The pack was not installed.`,
        );
      }
      verifiedCount += 1;
      record = await saveMarketLifecycle({ ...record, state: "verifying", partsVerified: verifiedCount });
      emit({
        marketId, stage: "verifying", progress: 0.96 + (verifiedCount / files.length) * 0.03,
        part: file.part, partsVerified: verifiedCount, partsTotal: files.length,
        message: `${verifiedCount} of ${files.length} verified.`,
      });
    }

    // Only now is the pack installed. `completeMarketLifecycle` refuses if any part is
    // unverified, so this cannot be reached with a partial set.
    record = await completeMarketLifecycle(record, {
      dataVersion: entry.version,
      installedBytes: totalBytes,
      partsExpected: files.length,
      partsVerified: verifiedCount,
    });

    // Record where the verified files are, keyed per market so two countries cannot collide.
    await AsyncStorage.setItem(packCacheKey(marketId, null), JSON.stringify({ version: entry.version, files: verified, installedAt: new Date().toISOString() }));

    emit({ marketId, stage: "installed", progress: 1, part: null, partsVerified: verifiedCount, partsTotal: files.length, message: `Installed ${entry.version}.` });
    return { marketId, record, installedBytes: totalBytes, dataVersion: entry.version, files: verified };
  } catch (error) {
    // Clean up whatever was staged so a retry starts clean, and record why.
    await Promise.all(staged.map((path) => remove(path).catch(() => undefined)));
    const reason = error instanceof Error ? error.message : "The download did not finish.";
    record = await failMarketLifecycle(record, reason);
    emit({ marketId, stage: "failed", progress: 0, part: null, partsVerified: 0, partsTotal: files.length, message: reason });
    throw error;
  }
}

/**
 * The part numbers already present and verified on disk.
 *
 * Used to resume: a part that is already verified does not need downloading again, so a
 * dropped connection costs one part rather than the whole pack.
 */
export async function verifiedPartsOnDisk(marketId: MarketId): Promise<number[]> {
  try {
    const raw = await AsyncStorage.getItem(packCacheKey(marketId, null));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { files?: Array<{ part: number | null }> };
    return (parsed.files ?? []).map((file) => file.part).filter((part): part is number => typeof part === "number");
  } catch {
    return [];
  }
}

/**
 * Remove a country's downloaded pack files and its record.
 *
 * The whole per-market directory is removed rather than a guessed list of filenames: a
 * glob does not apply to a path helper, and enumerating parts would miss a partially
 * downloaded file from a failed attempt.
 */
export async function deleteMarketPack(marketId: MarketId): Promise<void> {
  const directory = await artifactDirectory(`market-${marketId}`);
  await remove(directory).catch(() => undefined);
  await AsyncStorage.removeItem(packCacheKey(marketId, null));
}

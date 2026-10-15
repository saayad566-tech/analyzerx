/**
 * Resource packs — public API.
 *
 * One entry point for the app: ensure the selected market's pack is present, then read verified
 * data from it, falling back to the bundled market seed. Market isolation is enforced throughout:
 * a read for market X can only ever return market X's data.
 */
import { datasetForMarket, type MarketDataset } from "../market-dataset";
import type { MarketId } from "../market-regions";
import { readSeedDataset } from "./fallback";
import { getInstalledPack, installMarketPack, readInstalledDataset, removeMarketPack, type InstallOptions, type PackState } from "./installer";
import { configureResourcePacks } from "./registry";
import type { PackInstallResult, PackProgress } from "./types";

export { installMarketPack, getInstalledPack, readInstalledDataset, removeMarketPack } from "./installer";
export { configureResourcePacks, ASSET_REPOSITORY, DEFAULT_CHUNK_BYTES, assetBaseUrl, indexUrl } from "./registry";
export { formatBytes } from "./core";
export type { InstallOptions, PackState } from "./installer";
export type { PackInstallResult, PackProgress } from "./types";

/** Where a dataset read came from. */
export type DatasetSource = "pack" | "seed";

export type DatasetRead<T> =
  | { status: "ok"; data: T; source: DatasetSource; packVersion: string | null }
  | { status: "unavailable"; reason: string };

/**
 * Read a dataset for a market: a verified installed pack first, then the bundled seed.
 * Never returns another market's data.
 */
export async function loadMarketDataset<T = unknown>(marketId: MarketId, name: string): Promise<DatasetRead<T>> {
  const fromPack = await readInstalledDataset<T>(marketId, name);
  if (fromPack.status === "ok") {
    const pack = await getInstalledPack(marketId);
    return { status: "ok", data: fromPack.data, source: "pack", packVersion: pack?.packVersion ?? null };
  }
  const fromSeed = readSeedDataset<T>(marketId, name);
  if (fromSeed.status === "ok") return { status: "ok", data: fromSeed.data, source: "seed", packVersion: null };
  return { status: "unavailable", reason: fromPack.reason };
}

/** The bundled, always-available dataset for a market (used when a pack is not installed). */
export function bundledMarketDataset(marketId: MarketId): MarketDataset {
  return datasetForMarket(marketId);
}

/** A compact status for a market's pack, safe to render in the UI. */
export type MarketPackStatus = {
  marketId: MarketId;
  installed: boolean;
  packVersion: string | null;
  datasets: string[];
  totalBytes: number;
  installedAt: string | null;
  /** "pack" when a verified pack is active, "seed" otherwise. */
  source: DatasetSource;
};

export async function marketPackStatus(marketId: MarketId): Promise<MarketPackStatus> {
  const pack: PackState | null = await getInstalledPack(marketId);
  return {
    marketId,
    installed: pack !== null,
    packVersion: pack?.packVersion ?? null,
    datasets: pack?.datasets ?? [],
    totalBytes: pack?.totalBytes ?? 0,
    installedAt: pack?.installedAt ?? null,
    source: pack ? "pack" : "seed",
  };
}

/**
 * Ensure the selected market's pack is installed, emitting progress.
 * Returns the install result; callers fall back to the bundled seed when it is not `installed`.
 */
export async function ensureMarketPack(marketId: MarketId, options: InstallOptions = {}): Promise<PackInstallResult> {
  return installMarketPack(marketId, options);
}

/** Progress type re-export for UI callers. */
export type { PackProgress as ResourcePackProgress };

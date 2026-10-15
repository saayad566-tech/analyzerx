/**
 * Bundled offline seed for resource-pack datasets.
 *
 * When no verified pack is installed (fresh install, web, offline, or a market the assets
 * repository does not publish), the app still needs truthful content. This module serves the
 * deterministic, market-scoped seed from `lib/market-dataset.ts` — and nothing from another market.
 */
import { datasetForMarket } from "../market-dataset";
import type { MarketId } from "../market-regions";

export type SeedReadResult<T> = { status: "ok"; data: T; source: "seed" } | { status: "unavailable"; reason: string };

/** Dataset names the bundled seed can serve. */
export const SEED_DATASET_NAMES = ["events", "storylines", "sectors", "flows", "meta"] as const;
export type SeedDatasetName = (typeof SEED_DATASET_NAMES)[number];

/** Read a dataset from the bundled market seed. */
export function readSeedDataset<T = unknown>(marketId: MarketId, name: string): SeedReadResult<T> {
  const dataset = datasetForMarket(marketId);
  switch (name) {
    case "events":
      return { status: "ok", data: dataset.events as unknown as T, source: "seed" };
    case "storylines":
      return { status: "ok", data: dataset.storylines as unknown as T, source: "seed" };
    case "sectors":
      return { status: "ok", data: dataset.sectors as unknown as T, source: "seed" };
    case "flows":
      return { status: "ok", data: dataset.flows as unknown as T, source: "seed" };
    case "meta":
      return {
        status: "ok",
        data: {
          marketId: dataset.marketId,
          supported: dataset.supported,
          notice: dataset.notice,
          flowCategories: dataset.flowCategories,
          eventFilters: dataset.eventFilters,
        } as unknown as T,
        source: "seed",
      };
    default:
      return { status: "unavailable", reason: `The bundled seed has no dataset named "${name}".` };
  }
}

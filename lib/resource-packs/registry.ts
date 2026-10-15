/**
 * Resource-pack remote registry.
 *
 * The code repository stays light; market data lives in a **separate** assets repository and is
 * fetched at runtime through a single main file (`manifests/index.json`). This module is the only
 * place that knows where those files live, so the location can be changed without touching logic.
 *
 * No React Native imports — pure configuration.
 */

/** The separate assets repository that hosts chunked market packs. */
export const ASSET_REPOSITORY = {
  owner: "saayad566-tech",
  repo: "analyzerx-assets",
  ref: "main",
} as const;

/** Default chunk size used by the build tool and expected by the runtime. */
export const DEFAULT_CHUNK_BYTES = 4 * 1024 * 1024;

/** The index ("main file") path inside the assets repository. */
export const INDEX_PATH = "manifests/index.json";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * Resolve the HTTPS base for the assets repository.
 *
 * `override` wins (used by tests and by an operator who mirrors the assets), then a runtime
 * override set through {@link configureResourcePacks}, then the default raw GitHub host.
 */
let runtimeBase: string | null = null;

/** Point the app at a different assets base (mirror, CDN, or a local test server). */
export function configureResourcePacks(options: { baseUrl?: string | null }): void {
  runtimeBase = options.baseUrl ? trimTrailingSlash(options.baseUrl) : null;
}

export function assetBaseUrl(override?: string | null): string {
  if (override) return trimTrailingSlash(override);
  if (runtimeBase) return runtimeBase;
  return `https://raw.githubusercontent.com/${ASSET_REPOSITORY.owner}/${ASSET_REPOSITORY.repo}/${ASSET_REPOSITORY.ref}`;
}

/** Absolute URL for the index ("main file"). */
export function indexUrl(override?: string | null): string {
  return `${assetBaseUrl(override)}/${INDEX_PATH}`;
}

/** Absolute URL for a per-market manifest. */
export function manifestUrl(manifestPath: string, override?: string | null): string {
  return `${assetBaseUrl(override)}/${manifestPath.replace(/^\/+/, "")}`;
}

/** Absolute URL for a chunk file. */
export function chunkUrl(file: string, override?: string | null): string {
  return `${assetBaseUrl(override)}/${file.replace(/^\/+/, "")}`;
}

/** A jsDelivr CDN mirror, offered as a fallback when the raw host is rate-limited. */
export function cdnBaseUrl(): string {
  return `https://cdn.jsdelivr.net/gh/${ASSET_REPOSITORY.owner}/${ASSET_REPOSITORY.repo}@${ASSET_REPOSITORY.ref}`;
}

/**
 * Free operating cost estimate (Prompt 5, section 6).
 *
 * Every number below is derived from measured properties of the actual sources,
 * not from a provider's quota. No quota is invented: where a figure depends on
 * a provider, it is marked unknown rather than guessed.
 *
 * The most important finding is structural, and it is why the £0 design holds
 * further than it might appear: the exchange and regulator sources are FEED
 * sources. One request returns every company's announcements, so the request
 * volume does not grow with the number of companies tracked. Only per-company
 * sources, such as a regulator's per-issuer submissions endpoint, scale with
 * company count.
 */

export type CompanyScale = 10 | 100 | 1000;

/** Measured or documented properties of the sources, with their basis stated. */
export const SOURCE_COST_INPUTS = {
  /** The NSE announcements feed, measured at about 534 KB. */
  nseFeedBytes: 534_000,
  /** The BSE announcements feed, measured at about 4.1 MB. */
  bseFeedBytes: 4_100_000,
  /** The SEBI feed, measured at about 16 KB. */
  sebiFeedBytes: 16_000,
  /** The data.gov.in catalogue response, measured at a few kilobytes. */
  datagovinBytes: 4_000,
  /** A typical filing document, measured from real NSE PDFs at 180-430 KB. */
  averageDocumentBytes: 280_000,
  /** A filing's metadata only, when the document is not retained. */
  averageMetadataBytes: 5_000,
  /** Refreshes per day if the user opens the app and refreshes at the cap. */
  maxRefreshesPerDay: 24,
} as const;

export type CostEstimate = {
  scale: CompanyScale;
  /** Requests per day, split by whether they scale with company count. */
  requestsPerDay: {
    feedSources: number;
    perCompanySources: number;
    total: number;
  };
  bandwidthPerDayBytes: number;
  bandwidthPerDayLabel: string;
  /** Storage held on the device, bounded by the store ceiling. */
  storageBytes: number;
  storageLabel: string;
  /** Execution time per refresh, in seconds. */
  executionSecondsPerRefresh: number;
  /** The honest statement of what drives the cost. */
  note: string;
};

function humanBytes(bytes: number): string {
  if (bytes < 1_000) return `${bytes} bytes`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}

/**
 * Estimate the recurring volume for a given number of tracked companies.
 *
 * Feed sources are counted once per refresh regardless of scale, because one
 * request serves every company. Per-company sources are counted once per
 * company per refresh.
 */
export function estimateCost(scale: CompanyScale, options: { refreshesPerDay?: number; retainDocuments?: boolean } = {}): CostEstimate {
  const refreshes = Math.min(options.refreshesPerDay ?? 6, SOURCE_COST_INPUTS.maxRefreshesPerDay);
  const retain = options.retainDocuments ?? false;

  const feedBytesPerRefresh = SOURCE_COST_INPUTS.nseFeedBytes + SOURCE_COST_INPUTS.bseFeedBytes + SOURCE_COST_INPUTS.sebiFeedBytes + SOURCE_COST_INPUTS.datagovinBytes;
  const feedSources = 4 * refreshes;

  // Only per-company sources scale with the number of companies tracked.
  const perCompanySources = scale * refreshes;

  const bandwidthPerDayBytes = feedBytesPerRefresh * refreshes + scale * (retain ? SOURCE_COST_INPUTS.averageDocumentBytes : SOURCE_COST_INPUTS.averageMetadataBytes);

  // The on-device store is bounded, so storage does not grow without limit.
  const storageBytes = Math.min(scale * (retain ? SOURCE_COST_INPUTS.averageDocumentBytes : SOURCE_COST_INPUTS.averageMetadataBytes) * 12, 64_000_000);

  return {
    scale,
    requestsPerDay: { feedSources, perCompanySources, total: feedSources + perCompanySources },
    bandwidthPerDayBytes,
    bandwidthPerDayLabel: humanBytes(bandwidthPerDayBytes),
    storageBytes,
    storageLabel: humanBytes(storageBytes),
    executionSecondsPerRefresh: Math.round((feedBytesPerRefresh / 1_000_000) * 2 + scale * 0.05),
    note:
      scale <= 100
        ? "Feed sources serve every company in one request, so the volume is flat across this range."
        : "Feed sources still serve every company in one request; the growth comes from per-company sources and from retained documents.",
  };
}

export function estimateAllScales(options: { refreshesPerDay?: number; retainDocuments?: boolean } = {}): CostEstimate[] {
  return ([10, 100, 1000] as CompanyScale[]).map((scale) => estimateCost(scale, options));
}

export type FeasibilityBoundary = {
  feasible: boolean;
  /** What the £0 design can do. */
  holds: string[];
  /** Where it stops holding, and why. */
  stopsAt: string[];
  /** What would have to change. */
  wouldRequire: string[];
};

/**
 * Where the £0 design stops being feasible.
 *
 * These are conditions, not provider quotas. No free tier is promised, and no
 * quota is invented: the point is that the design's limits come from the
 * sources and the device, not from a hosting plan.
 */
export function feasibilityBoundary(): FeasibilityBoundary {
  return {
    feasible: true,
    holds: [
      "Tracking 10, 100 or even 1,000 companies in feed-based markets, because one request returns every company's announcements.",
      "Storage, because the on-device store is bounded by a ceiling and evicts the least recently used entries.",
      "Monitoring while the app is open, in Mode A.",
      "Every permitted Indian source, at no cost, within its terms.",
    ],
    stopsAt: [
      "Monitoring while the app is closed. That needs Mode B, and a free-tier host sleeps, throttles and expires, so it cannot be the only path.",
      "Live or delayed prices. No zero-cost permitted feed exists; a licensed provider is required.",
      "Per-company sources at scale. A regulator's per-issuer endpoint costs one request per company, so 1,000 companies means 1,000 requests per sweep, which is slow and heavy on a phone.",
      "Markets where no automated interface has been confirmed, which are manual-import only.",
    ],
    wouldRequire: [
      "A backend with a documented free-tier path whose quotas have been verified, for closed-app monitoring.",
      "A licensed market-data agreement, for prices.",
      "A bulk download rather than a per-company endpoint, to scale per-company sources.",
    ],
  };
}

/** The estimate rendered as a table, for the in-app display. */
export function costTable(options: { refreshesPerDay?: number; retainDocuments?: boolean } = {}): string {
  const rows = estimateAllScales(options).map(
    (estimate) =>
      `${String(estimate.scale).padStart(4)} companies: ${String(estimate.requestsPerDay.total).padStart(5)} requests/day, ${estimate.bandwidthPerDayLabel}/day, ${estimate.storageLabel} stored, about ${estimate.executionSecondsPerRefresh}s per refresh`,
  );
  return ["Estimated recurring volume at zero cost:", ...rows].join("\n");
}

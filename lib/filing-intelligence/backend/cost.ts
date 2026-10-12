/**
 * Cost estimate at 10, 100 and 1,000 users (Prompt 7, section 6).
 *
 * Every quota used here was read from the provider's own documentation and is
 * recorded with its source in the free-tier register. Where a figure depends on
 * user behaviour rather than a provider limit, the assumption is stated so it
 * can be challenged.
 */

import { PROVIDER_FACTS } from "./freeTier";

export type UserScale = 10 | 100 | 1000;

/** Stated assumptions, so the arithmetic can be checked rather than trusted. */
export const BACKEND_COST_ASSUMPTIONS = {
  /** Companies each user tracks. */
  companiesPerUser: 10,
  /** New filings per company per year, from the observed cadence of Indian disclosures. */
  filingsPerCompanyPerYear: 50,
  /** Bytes of metadata per filing. */
  metadataBytesPerFiling: 5_000,
  /** Average document size, measured from real NSE PDFs. */
  documentBytes: 280_000,
  /** Fraction of filings whose content may legally be retained. */
  retainableFraction: 0.4,
  /** Metadata read per user per day, in bytes. */
  dailyReadBytesPerUser: 200_000,
} as const;

export type UserCostEstimate = {
  scale: UserScale;
  filingsPerYear: number;
  metadataMb: number;
  /** Content stored, only for filings that may be retained. */
  contentGb: number;
  egressGbPerMonth: number;
  /** The verified quota this scale is measured against. */
  verdict: "within_free_tiers" | "exceeds_a_free_tier";
  /** The first quota to be exceeded, and at what scale. */
  firstFailure: string | null;
  note: string;
};

/** The point at which the free database size is exceeded, in filings. */
export function filingsBeforeDatabaseLimit(): number {
  const supabase = PROVIDER_FACTS.find((entry) => entry.provider === "Supabase");
  const databaseLimit = supabase?.limits.find((limit) => limit.resource === "Database size")?.included ?? "";
  const megabytes = Number(databaseLimit.replace(/[^\d]/g, "")) || 500;
  return Math.floor((megabytes * 1_000_000) / BACKEND_COST_ASSUMPTIONS.metadataBytesPerFiling);
}

export function estimateUserCost(scale: UserScale): UserCostEstimate {
  const companies = scale * BACKEND_COST_ASSUMPTIONS.companiesPerUser;
  const filingsPerYear = companies * BACKEND_COST_ASSUMPTIONS.filingsPerCompanyPerYear;
  const metadataBytes = filingsPerYear * BACKEND_COST_ASSUMPTIONS.metadataBytesPerFiling;
  const metadataMb = metadataBytes / 1_000_000;
  const contentBytes = filingsPerYear * BACKEND_COST_ASSUMPTIONS.retainableFraction * BACKEND_COST_ASSUMPTIONS.documentBytes;
  const contentGb = contentBytes / 1_000_000_000;
  const egressGbPerMonth = (scale * BACKEND_COST_ASSUMPTIONS.dailyReadBytesPerUser * 30) / 1_000_000_000;

  const databaseMb = Number(
    (PROVIDER_FACTS.find((entry) => entry.provider === "Supabase")?.limits.find((limit) => limit.resource === "Database size")?.included ?? "500").replace(/[^\d]/g, ""),
  ) || 500;

  const overDatabase = metadataMb > databaseMb;
  const overStorage = contentGb > 10; // the verified R2 free storage
  const overEgress = egressGbPerMonth > 5; // the verified Supabase free egress

  let firstFailure: string | null = null;
  if (overDatabase) firstFailure = `The database size is exceeded: ${metadataMb.toFixed(1)} MB against the verified 500 MB free tier.`;
  else if (overStorage) firstFailure = `Object storage is exceeded: ${contentGb.toFixed(2)} GB against the verified 10 GB free tier.`;
  else if (overEgress) firstFailure = `Egress is exceeded: ${egressGbPerMonth.toFixed(2)} GB per month against the verified 5 GB free tier.`;

  return {
    scale,
    filingsPerYear,
    metadataMb: Math.round(metadataMb * 10) / 10,
    contentGb: Math.round(contentGb * 100) / 100,
    egressGbPerMonth: Math.round(egressGbPerMonth * 100) / 100,
    verdict: firstFailure ? "exceeds_a_free_tier" : "within_free_tiers",
    firstFailure,
    note:
      scale === 10
        ? "Comfortably inside every verified free tier."
        : scale === 100
          ? "Still inside the free tiers, but the database is the closest constraint."
          : "At this scale the database size is the first free tier to fail; the storage and egress tiers follow.",
  };
}

export function estimateUserScales(): UserCostEstimate[] {
  return ([10, 100, 1000] as UserScale[]).map(estimateUserCost);
}

export type FreeTierBoundary = {
  /** The scale at which the first free tier is exceeded. */
  firstFailureScale: string;
  /** The resource that fails first. */
  firstFailureResource: string;
  /** What it would take to go past it. */
  pastIt: string[];
  /** Constraints that are functional rather than financial. */
  functionalCeilings: string[];
};

/**
 * Where the zero-cost design stops being feasible, with the resource named.
 *
 * The arithmetic is driven by the verified 500 MB free database and the stated
 * assumption of 5 KB of metadata per filing, which puts the boundary at roughly
 * 100,000 filings.
 */
export function freeTierBoundary(): FreeTierBoundary {
  const limit = filingsBeforeDatabaseLimit();
  return {
    firstFailureScale: `About ${limit.toLocaleString("en-IN")} filing metadata rows, reached between 100 and 1,000 users at the stated assumptions.`,
    firstFailureResource: "The verified 500 MB free database size.",
    pastIt: [
      "Store only the metadata a feature actually reads, and move document text out of the database.",
      "Move metadata to the verified 5 GB free SQLite tier, which is ten times the size.",
      "Accept a paid database plan, which is the honest answer once the free size is genuinely insufficient.",
    ],
    functionalCeilings: [
      "A free scheduler on the verified host runs a cron job only ONCE PER DAY, so sub-daily checking is not available at zero cost regardless of quota.",
      "The verified free queue allows 10,000 operations per day, which suits a daily sweep but not per-document fan-out.",
      "The verified free serverless CPU budget is 10 ms per request, so heavy parsing cannot run there.",
    ],
  };
}

export function userCostTable(): string {
  const rows = estimateUserScales().map(
    (estimate) =>
      `${String(estimate.scale).padStart(4)} users: ${estimate.filingsPerYear.toLocaleString("en-IN").padStart(9)} filings/yr, ${String(estimate.metadataMb).padStart(7)} MB metadata, ${String(estimate.contentGb).padStart(6)} GB content, ${String(estimate.egressGbPerMonth).padStart(5)} GB/mo egress -> ${estimate.verdict}${estimate.firstFailure ? ` (${estimate.firstFailure})` : ""}`,
  );
  return ["Estimated monthly volume at zero cost:", ...rows, "", "Assumptions: 10 companies per user, 50 filings per company per year, 5 KB metadata per filing, 280 KB per document, 40% of content retainable, 200 KB read per user per day."].join("\n");
}

/**
 * Market-scoped coverage types (Prompt 4, sections 2, 5, 6).
 *
 * The governing rule is that markets do not mix. A source belongs to exactly
 * one market, and a market's coverage is described only by its own sources.
 * Selecting the United States must never surface an Indian filing, and the
 * coverage matrix must never show a single green badge implying that a whole
 * market is covered when it is not.
 *
 * Data categories are independent capabilities. One source does not provide
 * every category, and the matrix says which source provides which.
 */

import type { MarketId } from "../../market-regions";

export type { MarketId };

/** The independent data categories (Prompt 4, section 2). */
export type DataCategory =
  | "company_identity"
  | "annual_reports"
  | "quarterly_results"
  | "corporate_announcements"
  | "shareholding_patterns"
  | "corporate_actions"
  | "audited_statements"
  | "regulatory_orders"
  | "historical_prices"
  | "live_prices"
  | "index_data"
  | "fundamental_ratios"
  | "company_metadata";

export const DATA_CATEGORIES: DataCategory[] = [
  "company_identity",
  "annual_reports",
  "quarterly_results",
  "corporate_announcements",
  "shareholding_patterns",
  "corporate_actions",
  "audited_statements",
  "regulatory_orders",
  "historical_prices",
  "live_prices",
  "index_data",
  "fundamental_ratios",
  "company_metadata",
];

export function categoryLabel(category: DataCategory): string {
  switch (category) {
    case "company_identity":
      return "Company identity";
    case "annual_reports":
      return "Annual reports";
    case "quarterly_results":
      return "Quarterly and interim results";
    case "corporate_announcements":
      return "Corporate announcements";
    case "shareholding_patterns":
      return "Shareholding patterns";
    case "corporate_actions":
      return "Corporate actions";
    case "audited_statements":
      return "Audited financial statements";
    case "regulatory_orders":
      return "Regulatory circulars and enforcement orders";
    case "historical_prices":
      return "Historical prices";
    case "live_prices":
      return "Live or delayed prices";
    case "index_data":
      return "Index data";
    case "fundamental_ratios":
      return "Fundamental ratios";
    case "company_metadata":
      return "Company metadata";
  }
}

/**
 * Recurring-cost classification (Prompt 4, section 5).
 *
 * A source is never called free when it needs a credit card, a paid plan, a
 * paid market-data licence or an unverified hosting tier. Those cases say so.
 */
export type CostClass =
  | "zero" // no subscription, documented public access
  | "zero_within_free_tier" // free only inside limits that must be respected
  | "unknown" // not established
  | "paid_or_authorised"; // requires payment or separate authorisation

export function costLabel(cost: CostClass): string {
  switch (cost) {
    case "zero":
      return "Zero cost";
    case "zero_within_free_tier":
      return "Zero within free-tier limits";
    case "unknown":
      return "Cost unknown";
    case "paid_or_authorised":
      return "Paid or needs authorisation";
  }
}

/** How a source may be reached, mirroring the A-F access classes. */
export type MarketAccessClass =
  | "A_official_api"
  | "B_official_dataset"
  | "C_permitted_document"
  | "D_human_only"
  | "E_licensed_feed"
  | "F_unsupported";

export function marketAccessClassLabel(accessClass: MarketAccessClass): string {
  switch (accessClass) {
    case "A_official_api":
      return "A · Official API";
    case "B_official_dataset":
      return "B · Official dataset";
    case "C_permitted_document":
      return "C · Permitted document";
    case "D_human_only":
      return "D · Human-accessible only";
    case "E_licensed_feed":
      return "E · Licensed feed";
    case "F_unsupported":
      return "F · Unsupported";
  }
}

/** The state a source is in, derived from evidence rather than asserted. */
export type MarketSourceStatus = "connected" | "available" | "planned" | "blocked" | "degraded" | "stale" | "unsupported";

export function statusLabel(status: MarketSourceStatus): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "available":
      return "Available";
    case "planned":
      return "Not implemented";
    case "blocked":
      return "Blocked";
    case "degraded":
      return "Degraded";
    case "stale":
      return "Stale";
    case "unsupported":
      return "Unsupported";
  }
}

export type MarketSource = {
  sourceId: string;
  name: string;
  /** The market this source belongs to. Exactly one. */
  marketId: MarketId;
  accessClass: MarketAccessClass;
  /** The categories this source actually provides. Never all of them. */
  categories: DataCategory[];
  /** The official documentation URL. */
  documentationUrl: string;
  /** The terms-of-use URL, when one is published. */
  termsUrl: string | null;
  accessMethod: string;
  authentication: "none" | "api_key" | "account" | "unknown";
  cost: CostClass;
  /** What the licence permits, in plain language. */
  licensing: string;
  /** Whether redistribution of the content is permitted. */
  redistributionAllowed: boolean | null;
  /** How often the source updates, when documented. */
  updateFrequency: string | null;
  /** Verified historical depth, or null when unverified. */
  historicalDepth: string | null;
  /** The documented rate limit, or a note that none is published. */
  rateLimit: string;
  /** Known failure modes. */
  failureModes: string[];
  /** The manual fallback when automation is not permitted. */
  manualFallback: string;
  status: MarketSourceStatus;
  /** The dependency that blocks it, when one does. */
  blocker: string | null;
  /** Evidence of the latest successful end-to-end check, or null. */
  latestCheckEvidence: string | null;
  lastSuccessfulCheckUtc: string | null;
  lastError: string | null;
  /** Whether the latest relevant filing could be confirmed. */
  latestFilingConfirmed: boolean;
  /** True when an adapter exists in the codebase. */
  hasAdapter: boolean;
};

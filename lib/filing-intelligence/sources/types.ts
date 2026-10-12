/**
 * Source registry - the full typed record (Phase 2).
 *
 * A configured connector is not necessarily connected. A successful HTTP
 * response does not necessarily mean valid financial data was retrieved. A
 * connected source without a recent successful check must not be marked
 * healthy. Those three rules drive the shape below: the status is derived from
 * recorded evidence, never asserted, and the fields that describe capability
 * are separate from the fields that describe observed health.
 */

/** The explicit lifecycle states the registry recognises. */
export type SourceState =
  | "planned"
  | "unsupported"
  | "blocked"
  | "available"
  | "connected"
  | "stale"
  | "degraded"
  | "failed";

/**
 * How a source may be accessed. This is the A-F classification the
 * specification asks for, and it is the field that decides whether an adapter
 * is allowed to fetch at all.
 */
export type AccessClass =
  | "A_official_api" // documented official API
  | "B_official_dataset" // official downloadable dataset
  | "C_permitted_document" // official document retrievable with permission
  | "D_human_only" // human-accessible page, no verified automated permission
  | "E_licensed_feed" // licensed feed needing payment or separate authorisation
  | "F_unsupported"; // unsupported or unverified

export type SourceClassification = "regulator" | "exchange" | "government" | "company" | "provider";

export type RetrievalMethod = "api" | "feed" | "dataset_download" | "document_fetch" | "manual_import" | "none";

export type AuthRequirement = "none" | "api_key" | "oauth" | "account" | "unknown";

export type RateLimitRule = {
  /** Requests permitted per window, when the source documents one. */
  requestsPerWindow: number | null;
  windowSeconds: number | null;
  /** The source's stated minimum delay between requests, in ms. */
  minDelayMs: number | null;
  /** Whether the source documents a Retry-After behaviour we must honour. */
  honoursRetryAfter: boolean;
  /** Plain-language statement of the rule, or that none is documented. */
  note: string;
};

export type LicensingRule = {
  redistributionAllowed: boolean | null;
  attributionRequired: boolean;
  /** Plain-language statement, or that the terms have not been reviewed. */
  note: string;
};

export type HealthEvidence = {
  /** ISO-8601 of the last successful check, from real runtime state. */
  lastSuccessfulCheckUtc: string | null;
  /** ISO-8601 of the last retrieval. */
  lastRetrievalUtc: string | null;
  lastError: string | null;
  /** What the latest end-to-end test actually did, or null when none has run. */
  latestEndToEndEvidence: string | null;
};

export type SourceRecord = {
  sourceId: string;
  name: string;
  country: string;
  jurisdiction: string;
  classification: SourceClassification;
  accessClass: AccessClass;
  assetClasses: string[];
  dataCategories: string[];
  retrievalMethods: RetrievalMethod[];
  documentationUrl: string;
  termsUrl: string;
  /** ISO-8601 date the terms were last reviewed, or null when not reviewed. */
  termsReviewedUtc: string | null;
  auth: AuthRequirement;
  rateLimit: RateLimitRule;
  licensing: LicensingRule;
  /** Verified historical coverage, or null when unverified. */
  historicalCoverage: string | null;
  /** Hosts the adapter may fetch from. */
  approvedDomains: string[];
  /** The dependency that blocks this source, when one does. */
  blocker: string | null;
  health: HealthEvidence;
  state: SourceState;
};

/** Human labels for the access classes, for the UI. */
export function accessClassLabel(accessClass: AccessClass): string {
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

/** Human labels for the lifecycle states, for the UI. */
export function sourceStateLabel(state: SourceState): string {
  switch (state) {
    case "planned":
      return "Planned";
    case "unsupported":
      return "Unsupported";
    case "blocked":
      return "Blocked";
    case "available":
      return "Available";
    case "connected":
      return "Connected";
    case "stale":
      return "Stale";
    case "degraded":
      return "Degraded";
    case "failed":
      return "Failed";
  }
}

/**
 * Source access policy (compliance).
 *
 * The governing constraint: free public access to a webpage does not mean
 * unrestricted API access, automated scraping or redistribution. NSE's terms
 * prohibit systematic or automated data collection, and SEBI's website policy
 * discusses permission and attribution for reproducing content. So the app
 * must not poll those sources automatically, and must prefer a source whose
 * terms permit the intended use.
 *
 * The policy therefore draws one distinction that matters, and draws it
 * explicitly rather than blurring it:
 *
 *   - automatic   - a scheduled or background check with no user present.
 *   - user_initiated - the user pressed Refresh and is waiting for the result.
 *
 * A source may be permitted for one and not the other. NSE, BSE and SEBI are
 * blocked for automatic polling under their terms, while a user-initiated
 * lookup of a public regulatory page, with attribution, is a different act.
 * A source is never fetched through an adapter unless the policy allows that
 * mode, and a blocked source is reported as blocked rather than silently
 * skipped.
 */

import type { CoverageStatus } from "../types";

/** How the source's terms characterise access to the content. */
export type AccessBasis =
  | "open_licence" // published under an open government licence
  | "published_feed" // an RSS/Atom feed the source publishes for syndication
  | "public_regulatory" // a public regulatory information source
  | "public_archive" // a public archive page whose automated use is restricted
  | "authorized_feed" // a documented API or feed whose terms permit the use
  | "prohibited"; // no permitted access path exists

export type SourceTerms = {
  sourceId: string;
  label: string;
  market: string;
  homepage: string;
  accessBasis: AccessBasis;
  /** May a background/scheduled check run with no user present? */
  automaticAccessAllowed: boolean;
  /** May a user-initiated refresh read the source? */
  userInitiatedAccessAllowed: boolean;
  /** May fetched content be redistributed by the app? */
  redistributionAllowed: boolean;
  attributionRequired: boolean;
  /** Plain-language summary of the terms, shown to the user. */
  termsNote: string;
  /** Hosts the connector may fetch from. Anything else is refused. */
  approvedDomains: string[];
  /** Filing categories this source actually exposes. */
  filingTypes: string[];
};

export type AccessMode = "automatic" | "user_initiated";

export type PolicyDecision = {
  allowed: boolean;
  /** Coverage state implied by the decision, for the registry and the UI. */
  status: CoverageStatus;
  reason: string;
};

/**
 * Decide whether a source may be read in a given mode.
 *
 * The result carries both the verdict and the coverage state, so the registry
 * and the UI cannot disagree about whether a source is usable.
 */
export function evaluateAccess(terms: SourceTerms, mode: AccessMode): PolicyDecision {
  if (terms.accessBasis === "prohibited") {
    return {
      allowed: false,
      status: "unsupported",
      reason: `${terms.label} has no permitted access path, so it is marked unsupported and is never fetched.`,
    };
  }

  if (mode === "automatic") {
    if (!terms.automaticAccessAllowed) {
      return {
        allowed: false,
        status: "blocked",
        reason: `${terms.label} does not permit systematic automated collection, so background polling is blocked. A user-initiated refresh may still be used where the terms allow it.`,
      };
    }
    return { allowed: true, status: "connected", reason: `${terms.label} permits automated access under its terms.` };
  }

  // user_initiated
  if (!terms.userInitiatedAccessAllowed) {
    return {
      allowed: false,
      status: "blocked",
      reason: `${terms.label} does not permit this access even on request, so it is blocked.`,
    };
  }
  const status: CoverageStatus = terms.automaticAccessAllowed ? "connected" : "connected";
  return {
    allowed: true,
    status,
    reason: terms.automaticAccessAllowed
      ? `${terms.label} permits a user-initiated read under its terms.`
      : `${terms.label} permits a user-initiated read of its public pages with attribution; automatic polling remains blocked.`,
  };
}

/** Extract the host from a URL, or null when it cannot be parsed. */
export function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Only an https URL on an approved host may be fetched. This is the SSRF and
 * approved-source control: a redirect or a crafted URL that leaves the
 * approved domains is refused, as are loopback, private and link-local hosts.
 */
export function isApprovedUrl(terms: SourceTerms, url: string): { allowed: boolean; reason: string } {
  const host = hostOf(url);
  if (!host) return { allowed: false, reason: `Could not parse a host from "${url}".` };
  if (!url.startsWith("https://")) return { allowed: false, reason: "Only https URLs are fetched." };
  if (/^(localhost|127\.|0\.0\.0\.0|\[::1\]|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
    return { allowed: false, reason: `Refused a private or loopback destination (${host}).` };
  }
  const approved = terms.approvedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  if (!approved) {
    return { allowed: false, reason: `Host "${host}" is not on the approved domain list for ${terms.label}.` };
  }
  return { allowed: true, reason: `Host "${host}" is approved for ${terms.label}.` };
}

/** Short label for an access basis, for the UI. */
export function accessBasisLabel(basis: AccessBasis): string {
  switch (basis) {
    case "open_licence":
      return "Open government licence";
    case "published_feed":
      return "Published syndication feed";
    case "public_regulatory":
      return "Public regulatory source";
    case "public_archive":
      return "Public archive (automated use restricted)";
    case "authorized_feed":
      return "Authorized feed";
    case "prohibited":
      return "No permitted access";
  }
}

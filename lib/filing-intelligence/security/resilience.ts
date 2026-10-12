/**
 * Resilience and safe fallback (Prompt 6, section 5).
 *
 * Every failure mode has an explicit behaviour. The rule that runs through all
 * of them, and the reason this module exists, is the last one: an error is never
 * converted into a plausible-looking financial number.
 */

export type FailureMode =
  | "source_unavailable"
  | "rate_limited"
  | "authentication_failure"
  | "malformed_document"
  | "partial_extraction"
  | "missing_period"
  | "failed_calculation"
  | "failed_translation"
  | "stale_cache";

export type FallbackBehaviour = {
  mode: FailureMode;
  label: string;
  /** What the app does. */
  behaviour: string[];
  /** What the user is shown. */
  userSees: string;
  /** What the app must never do. */
  never: string;
  /** Whether the failure is retried. */
  retried: boolean;
  /** Whether publication is blocked. */
  blocksPublication: boolean;
};

export const FALLBACKS: FallbackBehaviour[] = [
  {
    mode: "source_unavailable",
    label: "Source unavailable",
    behaviour: [
      "The job fails and is retried on a backoff with jitter, up to its maximum.",
      "The last verified check time is not advanced, so the source reads as stale.",
      "After the retries are exhausted the job is dead-lettered and reported.",
    ],
    userSees: "The source's last error and its last verified check, shown separately, with the manual fallback from the coverage matrix.",
    never: "Never present the previous result as a fresh fetch.",
    retried: true,
    blocksPublication: false,
  },
  {
    mode: "rate_limited",
    label: "Rate limited",
    behaviour: [
      "The rate limiter refuses a request that would exceed the documented limit.",
      "A Retry-After value is honoured in preference to the exponential delay.",
      "The cadence is lowered rather than the identity being changed.",
    ],
    userSees: "That the source is rate limited and that the next check is scheduled.",
    never: "Never rotate an identity, a key or an address to get around the limit.",
    retried: true,
    blocksPublication: false,
  },
  {
    mode: "authentication_failure",
    label: "Authentication failure",
    behaviour: [
      "A 401 or 403 is treated as an access decision, not a transient failure, so it is not retried.",
      "The source is marked blocked with the reason.",
    ],
    userSees: "That the source refused the request, and what the dependency is.",
    never: "Never retry a refusal as though it were an outage, and never attempt to bypass it.",
    retried: false,
    blocksPublication: false,
  },
  {
    mode: "malformed_document",
    label: "Malformed document",
    behaviour: [
      "The format is validated against the file signature, and a mismatch is reported.",
      "A document over the size ceiling is discarded rather than parsed.",
      "A parser that cannot read the content returns unextractable with the reason.",
    ],
    userSees: "That the document could not be read, and why.",
    never: "Never parse a document that failed validation as though it were valid.",
    retried: false,
    blocksPublication: true,
  },
  {
    mode: "partial_extraction",
    label: "Partial extraction",
    behaviour: [
      "Analysis is limited to the readable portions.",
      "The incompleteness is disclosed on the report.",
      "A claim depending on an unreadable section is withheld.",
    ],
    userSees: "A partial report with the gaps listed and the withheld claims counted.",
    never: "Never fill an unreadable section with a plausible value.",
    retried: false,
    blocksPublication: false,
  },
  {
    mode: "missing_period",
    label: "Missing financial period",
    behaviour: [
      "A calculation whose input is absent returns insufficient_inputs rather than a number.",
      "A period comparison across differing bases or period types is blocked outright.",
    ],
    userSees: "That the figure is unavailable, and what would be needed to compute it.",
    never: "Never substitute a nearby period's figure for the missing one.",
    retried: false,
    blocksPublication: false,
  },
  {
    mode: "failed_calculation",
    label: "Failed calculation",
    behaviour: [
      "A zero denominator is reported as undefined, and a cross-currency comparison is blocked without a documented rate.",
      "A calculation that did not validate cannot back a published claim.",
    ],
    userSees: "The reason the calculation is undefined or blocked.",
    never: "Never emit Infinity, NaN, or a zero standing in for an undefined result.",
    retried: false,
    blocksPublication: true,
  },
  {
    mode: "failed_translation",
    label: "Failed translation",
    behaviour: [
      "The translation is validated against the source across nine protected categories.",
      "On failure the translation is suppressed and the authoritative report is retained.",
    ],
    userSees: "That the translation is unavailable, with the reason, and the English report.",
    never: "Never show a translation that changed a figure, a sign, a period, an identifier or a caveat.",
    retried: false,
    blocksPublication: false,
  },
  {
    mode: "stale_cache",
    label: "Stale cached data",
    behaviour: [
      "Freshness is computed from the last verified check and shown in plain language.",
      "A cached result is labelled as cached rather than presented as current.",
    ],
    userSees: "The freshness line, and whether the data is cached, current or stale.",
    never: "Never present cached data as a fresh result.",
    retried: false,
    blocksPublication: false,
  },
];

export function fallbackFor(mode: FailureMode): FallbackBehaviour {
  const fallback = FALLBACKS.find((entry) => entry.mode === mode);
  if (!fallback) throw new Error(`No fallback is defined for "${mode}".`);
  return fallback;
}

/** The failures that block publication, for the gate. */
export function blockingFailures(): FailureMode[] {
  return FALLBACKS.filter((entry) => entry.blocksPublication).map((entry) => entry.mode);
}

/** The one rule every fallback shares. */
export const RESILIENCE_PRINCIPLE =
  "No failure is ever converted into a plausible-looking financial number. Where a value cannot be produced, the report says so, and any claim depending on it is withheld rather than guessed.";

export type ResilienceSummary = {
  total: number;
  retried: number;
  blocking: number;
  principle: string;
  statement: string;
};

export function summariseResilience(): ResilienceSummary {
  return {
    total: FALLBACKS.length,
    retried: FALLBACKS.filter((entry) => entry.retried).length,
    blocking: FALLBACKS.filter((entry) => entry.blocksPublication).length,
    principle: RESILIENCE_PRINCIPLE,
    statement: `${FALLBACKS.length} failure modes have an explicit behaviour: ${FALLBACKS.filter((e) => e.retried).length} are retried, ${FALLBACKS.filter((e) => e.blocksPublication).length} block publication, and every one of them states what must never happen.`,
  };
}

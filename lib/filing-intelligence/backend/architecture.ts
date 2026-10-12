/**
 * Architecture decision (Prompt 7, section 1).
 *
 * The original PRD describes a multilingual web platform with Next.js,
 * PostgreSQL, scheduled jobs, durable queues, object storage and row-level
 * security. The current AnalyzerX app is offline-first with no backend. This
 * module compares the three options against the same criteria and records a
 * recommendation. It does NOT change the architecture: the app stays
 * offline-first, and any backend is optional and additive.
 */

export type ArchitectureOption = "A_android_only" | "B_optional_backend" | "C_full_web_platform";

export type CriterionScore = {
  criterion: string;
  score: "best" | "good" | "mixed" | "poor";
  note: string;
};

export type ArchitectureAssessment = {
  option: ArchitectureOption;
  label: string;
  summary: string;
  scores: CriterionScore[];
  /** What it costs to run at zero. */
  recurringCost: string;
  /** What it can do that the others cannot. */
  enables: string[];
  /** What it cannot do. */
  cannot: string[];
  /** The conditions under which it becomes the right choice. */
  chooseWhen: string;
};

export const ARCHITECTURE_OPTIONS: ArchitectureAssessment[] = [
  {
    option: "A_android_only",
    label: "A · Android-only app",
    summary: "What exists today. All retrieval, parsing, calculation and reporting happen on the device, and nothing leaves it but the requests to official sources.",
    scores: [
      { criterion: "Cost", score: "best", note: "Zero recurring cost beyond the device and the sources." },
      { criterion: "Reliability", score: "good", note: "No server to fail, but no checking while the app is closed." },
      { criterion: "Maintenance", score: "best", note: "One codebase, one release channel." },
      { criterion: "Privacy", score: "best", note: "No server receives anything." },
      { criterion: "Complexity", score: "best", note: "No infrastructure, no migrations, no secrets to rotate." },
      { criterion: "Rate limits", score: "mixed", note: "Bound by what one device may ask of a source." },
      { criterion: "Scheduled execution", score: "poor", note: "Cannot run while the app is closed." },
      { criterion: "Storage", score: "mixed", note: "Bounded by the device's own storage." },
      { criterion: "Multi-user", score: "poor", note: "Single-user by construction." },
    ],
    recurringCost: "Zero.",
    enables: ["Full local analysis", "Every permitted Indian source", "No account required"],
    cannot: ["Detect a filing while the app is closed", "Serve more than one user from shared state", "Share a report between devices"],
    chooseWhen: "Always. This is the baseline, and it must keep working whatever else is added.",
  },
  {
    option: "B_optional_backend",
    label: "B · Android app with an optional minimal backend",
    summary: "The app stays the product. A small backend adds closed-app checking, shared filing metadata and, optionally, accounts — and the app works fully without it.",
    scores: [
      { criterion: "Cost", score: "good", note: "Zero on verified free tiers, with a stated point at which they stop being enough." },
      { criterion: "Reliability", score: "mixed", note: "A free tier sleeps, pauses and expires, so it can never be the only path." },
      { criterion: "Maintenance", score: "mixed", note: "Adds migrations, secrets, backups and a second release channel." },
      { criterion: "Privacy", score: "good", note: "Only what a feature genuinely needs is sent, and watchlists stay on the device." },
      { criterion: "Complexity", score: "mixed", note: "More moving parts than A, far fewer than C." },
      { criterion: "Rate limits", score: "good", note: "A server can hold a documented source limit centrally instead of per device." },
      { criterion: "Scheduled execution", score: "good", note: "A daily schedule is achievable at zero cost; sub-daily needs a paid plan on some hosts." },
      { criterion: "Storage", score: "good", note: "Object storage with no egress fee is available on a free tier." },
      { criterion: "Multi-user", score: "mixed", note: "Possible, but accounts bring legal and privacy obligations." },
    ],
    recurringCost: "Zero within the verified free tiers, with named failure points.",
    enables: ["Closed-app filing detection", "Shared filing metadata and versions", "Server-side source health", "Optional accounts"],
    cannot: ["Guarantee execution timing on a free scheduler", "Serve live prices without a licensed feed"],
    chooseWhen: "When closed-app detection or shared metadata is genuinely needed, and the free-tier failure points are acceptable.",
  },
  {
    option: "C_full_web_platform",
    label: "C · Full web platform plus Android client",
    summary: "The PRD's original shape. A web frontend, a backend, a database, queues and object storage, with the Android app as one client.",
    scores: [
      { criterion: "Cost", score: "mixed", note: "Achievable at zero only while every free tier holds; the first one to fail forces a decision." },
      { criterion: "Reliability", score: "good", note: "More redundancy is possible, and more to go wrong." },
      { criterion: "Maintenance", score: "poor", note: "Two frontends, a backend, a database and a queue to maintain." },
      { criterion: "Privacy", score: "mixed", note: "More data passes through more places." },
      { criterion: "Complexity", score: "poor", note: "The largest surface by a wide margin." },
      { criterion: "Rate limits", score: "good", note: "Central control over source requests." },
      { criterion: "Scheduled execution", score: "good", note: "Full scheduling and durable queues." },
      { criterion: "Storage", score: "good", note: "Object storage and a database of filing history." },
      { criterion: "Multi-user", score: "best", note: "Designed for it, with row-level security." },
    ],
    recurringCost: "Zero only while every free tier holds; realistically the first to break.",
    enables: ["Everything B does", "A browser experience", "Row-level security across many users", "Durable queues"],
    cannot: ["Be built and verified without deploying and testing each component"],
    chooseWhen: "Only when a browser product and many users are actually required. Not for a single-user analysis tool.",
  },
];

export type ArchitectureRecommendation = {
  recommended: ArchitectureOption;
  /** The option the app must keep working under, whatever is added. */
  baseline: ArchitectureOption;
  rationale: string[];
  /** What must NOT happen. */
  guardrails: string[];
};

/**
 * The recommendation, with the reasoning and the guardrails.
 */
export function recommendArchitecture(): ArchitectureRecommendation {
  return {
    recommended: "B_optional_backend",
    baseline: "A_android_only",
    rationale: [
      "The app already works offline-first, and that is its strength. A backend is only justified by a capability the device genuinely cannot provide.",
      "The one capability the device cannot provide is checking a source while the app is closed. That is the only reason a backend is worth its cost.",
      "Option B adds exactly that and nothing more, so the maintenance burden stays proportionate to the benefit.",
      "Option C would be justified by a browser product and many users. Neither exists today, so building it would be cost without a requirement.",
      "The device already parses, calculates, validates and reports. Duplicating any of that on a server would add a second source of truth for the same figures.",
    ],
    guardrails: [
      "The Android app must build and work fully with no backend configured. This is an acceptance criterion, not an aspiration.",
      "No analysis is moved to the server. The server discovers and stores; the device analyses.",
      "No privileged key is ever placed in the Android client.",
      "No component is described as existing until it has been deployed and tested.",
    ],
  };
}

/** What each option needs, for the comparison table. */
export function architectureComparisonTable(): string {
  const lines = ["Architecture comparison:", ""];
  for (const option of ARCHITECTURE_OPTIONS) {
    lines.push(`${option.label}`);
    lines.push(`  ${option.summary}`);
    lines.push(`  Recurring cost: ${option.recurringCost}`);
    for (const score of option.scores) lines.push(`  ${score.criterion.padEnd(20)} ${score.score.padEnd(6)} ${score.note}`);
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Free-tier register (Prompt 7, section 2).
 *
 * Every limit below was read from the provider's own current documentation, and
 * each entry carries the page it came from and the date it was checked. Nothing
 * here is assumed or remembered: where a figure was not confirmed, the entry
 * says so rather than guessing.
 *
 * One warning the prompt makes, and this module repeats: a free tier is not a
 * commitment. It can change, sleep, pause or expire, so no free tier may be an
 * undocumented single point of failure.
 */

export type CostModel =
  | "permanently_free_software" // open-source, runs anywhere
  | "free_self_hosted" // free software, but you pay for hardware and electricity
  | "free_hosted_tier" // a hosted free tier with published quotas
  | "trial" // time-limited
  | "requires_payment_details" // free to start but a card is required
  | "paid"; // no free path

export function costModelLabel(model: CostModel): string {
  switch (model) {
    case "permanently_free_software":
      return "Permanently free software";
    case "free_self_hosted":
      return "Free self-hosted (hardware and electricity cost)";
    case "free_hosted_tier":
      return "Free hosted tier with quotas";
    case "trial":
      return "Trial";
    case "requires_payment_details":
      return "Requires payment details";
    case "paid":
      return "Paid";
  }
}

export type ProviderFact = {
  provider: string;
  role: string;
  costModel: CostModel;
  /** The published limits, as read from the provider's own documentation. */
  limits: { resource: string; included: string }[];
  /** The constraint that most affects this design. */
  keyConstraint: string;
  /** Where the figure came from. */
  sourceUrl: string;
  /** The date the documentation was checked. */
  checkedUtc: string;
  /** True when a card or payment method is required to use the free tier. */
  requiresPaymentDetails: boolean;
  /** True when the provider pauses or expires idle resources. */
  pausesWhenIdle: boolean;
};

export const PROVIDER_FACTS: ProviderFact[] = [
  {
    provider: "Supabase",
    role: "PostgreSQL database, object storage, authentication",
    costModel: "free_hosted_tier",
    limits: [
      { resource: "Database size", included: "500 MB per project" },
      { resource: "File storage", included: "1 GB" },
      { resource: "Egress", included: "5 GB uncached, 5 GB cached" },
      { resource: "Monthly active users", included: "50,000" },
      { resource: "Edge function invocations", included: "500,000 per month" },
      { resource: "API requests", included: "Unlimited" },
      { resource: "Active projects", included: "2" },
      { resource: "Maximum file upload", included: "50 MB" },
    ],
    keyConstraint: "A free project is paused after one week of inactivity, and the free plan has no automatic backups.",
    sourceUrl: "https://supabase.com/pricing",
    checkedUtc: "2026-10-12",
    requiresPaymentDetails: false,
    pausesWhenIdle: true,
  },
  {
    provider: "Vercel (Hobby)",
    role: "Web hosting and scheduled functions",
    costModel: "free_hosted_tier",
    limits: [
      { resource: "Fast data transfer", included: "100 GB per month" },
      { resource: "Function invocations", included: "1,000,000 per month" },
      { resource: "Active CPU", included: "4 CPU-hours per month" },
      { resource: "Function maximum duration", included: "300 seconds" },
      { resource: "Cron jobs per project", included: "100" },
    ],
    keyConstraint:
      "On the Hobby plan a cron job may run only ONCE PER DAY. A more frequent expression fails at deployment, and timing precision is about an hour. This directly constrains any sub-daily schedule.",
    sourceUrl: "https://vercel.com/docs/cron-jobs/usage-and-pricing",
    checkedUtc: "2026-10-12",
    requiresPaymentDetails: false,
    pausesWhenIdle: false,
  },
  {
    provider: "Cloudflare R2",
    role: "Object storage for documents and artifacts",
    costModel: "free_hosted_tier",
    limits: [
      { resource: "Storage", included: "10 GB-month per month" },
      { resource: "Class A operations (write, list)", included: "1,000,000 per month" },
      { resource: "Class B operations (read)", included: "10,000,000 per month" },
      { resource: "Egress", included: "Free, with no egress fee at any volume" },
    ],
    keyConstraint: "The free tier applies to Standard storage only, and Infrequent Access storage has a 30-day minimum duration.",
    sourceUrl: "https://developers.cloudflare.com/r2/pricing/",
    checkedUtc: "2026-10-12",
    requiresPaymentDetails: false,
    pausesWhenIdle: false,
  },
  {
    provider: "Cloudflare D1",
    role: "SQLite database, an alternative to a hosted Postgres",
    costModel: "free_hosted_tier",
    limits: [
      { resource: "Storage", included: "5 GB total" },
      { resource: "Rows read", included: "5,000,000 per day" },
      { resource: "Rows written", included: "100,000 per day" },
    ],
    keyConstraint: "Writes are the tight constraint at 100,000 rows per day, which is ample for filing metadata but not for bulk document text.",
    sourceUrl: "https://www.cloudflare.com/pricing.md",
    checkedUtc: "2026-10-12",
    requiresPaymentDetails: false,
    pausesWhenIdle: false,
  },
  {
    provider: "Cloudflare Workers",
    role: "Serverless API endpoints",
    costModel: "free_hosted_tier",
    limits: [
      { resource: "Requests", included: "100,000 per day" },
      { resource: "CPU time", included: "10 ms per request" },
    ],
    keyConstraint: "A 10 ms CPU budget per request means heavy parsing must not run in a Worker; it belongs on the device or in a longer-running job.",
    sourceUrl: "https://www.cloudflare.com/pricing.md",
    checkedUtc: "2026-10-12",
    requiresPaymentDetails: false,
    pausesWhenIdle: false,
  },
  {
    provider: "Cloudflare Queues",
    role: "Durable job queue",
    costModel: "free_hosted_tier",
    limits: [{ resource: "Operations", included: "10,000 operations per day" }],
    keyConstraint: "10,000 queue operations per day bounds how many jobs can be enqueued, which is enough for a daily discovery sweep but not for per-document fan-out at scale.",
    sourceUrl: "https://www.cloudflare.com/pricing.md",
    checkedUtc: "2026-10-12",
    requiresPaymentDetails: false,
    pausesWhenIdle: false,
  },
  {
    provider: "GitHub Actions",
    role: "Scheduled job runner (a free scheduler)",
    costModel: "free_hosted_tier",
    limits: [
      { resource: "Minutes, public repositories", included: "Free, standard runners" },
      { resource: "Minutes, private repositories", included: "2,000 per month on GitHub Free" },
      { resource: "Artifact storage", included: "500 MB on GitHub Free" },
    ],
    keyConstraint:
      "Minutes are free and uncapped on public repositories, which makes a scheduled workflow a genuine zero-cost scheduler. From March 2026 self-hosted runner usage consumes plan quota.",
    sourceUrl: "https://docs.github.com/en/billing/concepts/product-billing/github-actions",
    checkedUtc: "2026-10-12",
    requiresPaymentDetails: false,
    pausesWhenIdle: false,
  },
  {
    provider: "PostgreSQL",
    role: "The database engine itself",
    costModel: "permanently_free_software",
    limits: [{ resource: "Licence", included: "Open source, no per-seat or per-core fee" }],
    keyConstraint: "Free software, but running it yourself means paying for a machine and electricity. A hosted free tier avoids that at the cost of the quotas above.",
    sourceUrl: "https://www.postgresql.org/about/licence/",
    checkedUtc: "2026-10-12",
    requiresPaymentDetails: false,
    pausesWhenIdle: false,
  },
];

export function providerFact(provider: string): ProviderFact | undefined {
  return PROVIDER_FACTS.find((entry) => entry.provider === provider);
}

/** The providers whose free tier pauses or expires idle resources. */
export function pausingProviders(): ProviderFact[] {
  return PROVIDER_FACTS.filter((entry) => entry.pausesWhenIdle);
}

/** The warning that must accompany every free-tier claim. */
export const FREE_TIER_WARNING =
  "A free tier is not a commitment. Any of these limits can change, and a hosted free tier can pause, throttle or expire. No free tier may be an undocumented single point of failure, and the app must keep working without any of them.";

export type FreeTierSummary = {
  total: number;
  byModel: { model: CostModel; label: string; count: number }[];
  requiringPayment: string[];
  pausing: string[];
  warning: string;
};

export function summariseFreeTiers(): FreeTierSummary {
  const counts = new Map<CostModel, number>();
  for (const entry of PROVIDER_FACTS) counts.set(entry.costModel, (counts.get(entry.costModel) ?? 0) + 1);
  return {
    total: PROVIDER_FACTS.length,
    byModel: [...counts.entries()].map(([model, count]) => ({ model, label: costModelLabel(model), count })),
    requiringPayment: PROVIDER_FACTS.filter((entry) => entry.requiresPaymentDetails).map((entry) => entry.provider),
    pausing: pausingProviders().map((entry) => entry.provider),
    warning: FREE_TIER_WARNING,
  };
}

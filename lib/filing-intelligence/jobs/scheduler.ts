/**
 * Update scheduling (Prompt 5, section 3).
 *
 * Different data changes at different rates, so the cadence differs by
 * category, and every cadence sits inside the source's own limits rather than
 * being chosen for convenience. The floor is explicit: nothing is polled
 * continuously and no schedule is aggressive.
 *
 * A schedule is a minimum interval, not a promise. Android cannot guarantee
 * exact execution, and the scheduler says so rather than implying precision it
 * does not have.
 */

import type { DataCategory } from "../markets/types";

export type ScheduleTier = "regulatory" | "financial_results" | "announcements" | "prices";

export type Schedule = {
  tier: ScheduleTier;
  label: string;
  categories: DataCategory[];
  /** The minimum interval between checks, in minutes. */
  intervalMinutes: number;
  /** The source limit this respects. */
  withinSourceLimit: string;
  /** Why this cadence, in plain language. */
  rationale: string;
};

export const SCHEDULES: Schedule[] = [
  {
    tier: "regulatory",
    label: "Infrequently updated regulatory documents",
    categories: ["regulatory_orders", "annual_reports", "audited_statements"],
    intervalMinutes: 24 * 60,
    withinSourceLimit: "One request per source per day, far below any published limit.",
    rationale: "Orders and annual reports are published rarely, so a daily check loses nothing and avoids needless requests.",
  },
  {
    tier: "financial_results",
    label: "Periodic financial results",
    categories: ["quarterly_results", "shareholding_patterns", "fundamental_ratios"],
    intervalMinutes: 6 * 60,
    withinSourceLimit: "Four requests per source per day.",
    rationale: "Results arrive in known reporting windows, so a six-hourly check catches them without polling.",
  },
  {
    tier: "announcements",
    label: "Corporate announcements",
    categories: ["corporate_announcements", "corporate_actions", "company_identity", "company_metadata"],
    intervalMinutes: 60,
    withinSourceLimit: "Twenty-four requests per source per day, and only on a user-initiated refresh where the terms require it.",
    rationale: "Announcements are the most time-sensitive category, so an hourly check is the fastest cadence that still respects the sources.",
  },
  {
    tier: "prices",
    label: "Market prices",
    categories: ["live_prices", "historical_prices", "index_data"],
    intervalMinutes: 15,
    withinSourceLimit: "A licensed feed is required; there is no zero-cost permitted live feed.",
    rationale: "Prices need a licensed provider. Without one, this tier is not scheduled at all rather than faked.",
  },
];

/** The minimum interval any tier may use. Nothing is polled continuously. */
export const MINIMUM_INTERVAL_MINUTES = 15;

export function scheduleForTier(tier: ScheduleTier): Schedule {
  const schedule = SCHEDULES.find((entry) => entry.tier === tier);
  if (!schedule) throw new Error(`No schedule is defined for tier "${tier}".`);
  return schedule;
}

/** The schedule covering a data category, or null when none applies. */
export function scheduleForCategory(category: DataCategory): Schedule | null {
  return SCHEDULES.find((entry) => entry.categories.includes(category)) ?? null;
}

/** Whether a category is schedulable at zero cost, and why not when it is not. */
export function schedulableAtZeroCost(category: DataCategory): { schedulable: boolean; reason: string } {
  const schedule = scheduleForCategory(category);
  if (!schedule) return { schedulable: false, reason: "No schedule covers this category." };
  if (schedule.tier === "prices") {
    return { schedulable: false, reason: "Prices require a licensed feed, so this category is not scheduled at zero cost." };
  }
  return { schedulable: true, reason: `Scheduled every ${Math.round(schedule.intervalMinutes / 60)} hour(s).` };
}

export type DueAssessment = {
  due: boolean;
  minutesUntilDue: number;
  reason: string;
};

/**
 * Whether a job is due, given the last successful check.
 *
 * A job that has never run is due. A job inside its interval is not, and the
 * wait is reported so the UI can say when the next check is expected.
 */
export function assessDue(tier: ScheduleTier, lastCheckUtc: string | null, now = new Date()): DueAssessment {
  const schedule = scheduleForTier(tier);
  const interval = Math.max(MINIMUM_INTERVAL_MINUTES, schedule.intervalMinutes);
  if (!lastCheckUtc) return { due: true, minutesUntilDue: 0, reason: "No check has been recorded yet, so this is due." };
  const last = new Date(lastCheckUtc);
  if (Number.isNaN(last.getTime())) return { due: true, minutesUntilDue: 0, reason: "The recorded check time could not be read, so this is treated as due." };
  const elapsedMinutes = (now.getTime() - last.getTime()) / 60_000;
  if (elapsedMinutes >= interval) {
    return { due: true, minutesUntilDue: 0, reason: `The last check was ${Math.round(elapsedMinutes)} minutes ago, beyond the ${interval}-minute interval.` };
  }
  return {
    due: false,
    minutesUntilDue: Math.round(interval - elapsedMinutes),
    reason: `Next check in about ${Math.round(interval - elapsedMinutes)} minutes.`,
  };
}

/** The default job definitions for a market, one per tier, for the tiers that are schedulable. */
export function defaultDefinitionsForMarket(
  marketId: string,
  sourceIds: string[],
  scope = "default",
): {
  kind: "source_health_check" | "filing_discovery";
  sourceId: string;
  marketId: string;
  scope: string;
  intervalMinutes: number;
  maxRetries: number;
}[] {
  const definitions: { kind: "source_health_check" | "filing_discovery"; sourceId: string; marketId: string; scope: string; intervalMinutes: number; maxRetries: number }[] = [];
  for (const sourceId of sourceIds) {
    for (const tier of ["announcements", "financial_results", "regulatory"] as ScheduleTier[]) {
      definitions.push({
        kind: "filing_discovery",
        sourceId,
        marketId,
        scope: `${tier}:${scope}`,
        intervalMinutes: scheduleForTier(tier).intervalMinutes,
        maxRetries: 3,
      });
    }
    definitions.push({ kind: "source_health_check", sourceId, marketId, scope, intervalMinutes: scheduleForTier("announcements").intervalMinutes, maxRetries: 2 });
  }
  return definitions;
}

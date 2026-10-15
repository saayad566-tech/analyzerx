/**
 * Plain-English activity log — pure core.
 *
 * The app records what it does, and what goes wrong, in one human-readable file
 * (`AI_RND_Activity_Log.txt`) so a person can read it without a debugger. Everything here is pure
 * and side-effect free, so it is unit-testable without the native toolchain; the file/device IO
 * lives in `lib/activity-log.ts`.
 *
 * Two rules hold everywhere:
 *   1. Never record a secret. Credential-looking values are redacted before an entry is stored.
 *   2. Never throw. A logging failure must not become the failure it was trying to record.
 */

export type ActivityLevel = "info" | "success" | "warning" | "error";

export type ActivityEntry = {
  /** ISO timestamp. */
  at: string;
  level: ActivityLevel;
  /** One plain-English sentence. */
  message: string;
  /** Optional extra context, already redacted. */
  detail?: string;
};

/** The on-device file the log is written to. */
export const ACTIVITY_LOG_FILENAME = "AI_RND_Activity_Log.txt";

/** Keep the log bounded so it can never grow without limit on a phone. */
export const ACTIVITY_LOG_LIMIT = 500;

const LEVEL_WORD: Record<ActivityLevel, string> = {
  info: "Note",
  success: "Done",
  warning: "Warning",
  error: "Error",
};

// --- redaction ---------------------------------------------------------------------------------

/**
 * Patterns that must never reach the log. Ordered most-specific first.
 * A partial credential is still credential material, so prefixes are redacted too.
 */
/** Field names whose value is always credential material, whatever form the value takes. */
const KEY_NAMES = "token|secret|password|passwd|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization";

const REDACTIONS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, replacement: "Bearer [redacted]" },
  // `token=…`, `api_key: "…"` — keep the field name so the reader knows what was omitted.
  { pattern: new RegExp(`\\b(${KEY_NAMES})\\b\\s*[:=]\\s*["']?[^\\s"',;]{4,}`, "gi"), replacement: "$1 [redacted]" },
  // `token <value>` with no separator — only when the value is long enough to be a credential,
  // so ordinary prose like "token present" or "token management" is left alone.
  { pattern: new RegExp(`\\b(${KEY_NAMES})\\b\\s+["']?[A-Za-z0-9._~+/=-]{20,}`, "gi"), replacement: "$1 [redacted]" },
  // JWTs of any segment count (a two-segment `eyJ…` value is still a credential).
  { pattern: /\beyJ[A-Za-z0-9_-]{6,}(?:\.[A-Za-z0-9_-]+)*\b/g, replacement: "[jwt redacted]" },
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: "[email redacted]" },
  { pattern: /\b[A-Fa-f0-9]{32,}\b/g, replacement: "[hex secret redacted]" },
  { pattern: /\b[A-Za-z0-9_-]{40,}\b/g, replacement: "[long value redacted]" },
];

/** Remove credential-shaped substrings from free text. */
export function redact(text: string): string {
  let out = text;
  for (const { pattern, replacement } of REDACTIONS) out = out.replace(pattern, replacement);
  return out;
}

// --- plain English -----------------------------------------------------------------------------

/**
 * Turn an unknown thrown value into a readable sentence and optional detail.
 * Common network/runtime failures get a human explanation instead of a stack.
 */
export function describeError(error: unknown): { message: string; detail?: string } {
  if (error instanceof Error) {
    const raw = `${error.name}: ${error.message}`;
    const friendly = friendlyMessage(error.message);
    return { message: friendly ?? `${error.name} — ${error.message}`, detail: raw !== error.message ? redact(raw) : redact(error.stack ?? raw) };
  }
  if (typeof error === "string") return { message: friendlyMessage(error) ?? error };
  try {
    return { message: "An unexpected value was thrown.", detail: redact(JSON.stringify(error) ?? String(error)) };
  } catch {
    return { message: "An unexpected, unprintable value was thrown." };
  }
}

function friendlyMessage(message: string): string | null {
  const text = message.toLowerCase();
  if (/network request failed|failed to fetch|fetch failed|enotfound|econnrefused/.test(text)) return "The network request could not be completed. Check the connection and try again.";
  if (/timeout|timed out|aborted/.test(text)) return "The request took too long and was stopped.";
  if (/401|unauthori[sz]ed/.test(text)) return "The session is no longer valid. Sign in again to continue.";
  if (/403|forbidden/.test(text)) return "This source refused the request. It may need a credential or a higher access tier.";
  if (/404|not found/.test(text)) return "The requested item was not found.";
  if (/429|rate limit|too many requests/.test(text)) return "The source is rate-limiting requests. It will be retried shortly.";
  if (/5\d\d|server error/.test(text)) return "The source reported a server error. This is usually temporary.";
  if (/out of memory|enomem|allocation failed/.test(text)) return "The device ran low on memory during this operation.";
  if (/quota|storage full|no space/.test(text)) return "There is not enough free storage to finish this operation.";
  if (/permission denied|eacces/.test(text)) return "The app was not allowed to access what it needed.";
  return null;
}

/** Format a single entry as one readable line. */
export function formatEntry(entry: ActivityEntry): string {
  const stamp = entry.at.replace("T", " ").replace(/\.\d+Z?$/, " UTC").replace(/Z$/, " UTC");
  const head = `${stamp} — ${LEVEL_WORD[entry.level]}: ${entry.message}`;
  return entry.detail ? `${head}\n    ${entry.detail}` : head;
}

/** Format the whole log, newest last, with a short header. */
export function formatLog(entries: ActivityEntry[]): string {
  const header = [
    "AnalyzerX activity log",
    "Plain-English record of what the app did and anything that went wrong.",
    "No credentials, tokens or personal identifiers are written here.",
    `Entries: ${entries.length}`,
    "",
  ].join("\n");
  return `${header}${entries.map(formatEntry).join("\n")}\n`;
}

/** Keep only the most recent `limit` entries. */
export function trimEntries(entries: ActivityEntry[], limit = ACTIVITY_LOG_LIMIT): ActivityEntry[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  return entries.length <= limit ? entries.slice() : entries.slice(entries.length - limit);
}

/** Build an entry, redacting both message and detail. */
export function makeEntry(level: ActivityLevel, message: string, detail?: string, at = new Date().toISOString()): ActivityEntry {
  const entry: ActivityEntry = { at, level, message: redact(message).slice(0, 400) };
  if (detail) entry.detail = redact(detail).slice(0, 2_000);
  return entry;
}

/** A ready-to-file bug report body (markdown) for a GitHub issue. */
export function summarizeForIssue(input: { entries: ActivityEntry[]; crash?: { message: string; at: string } | null; appVersion?: string | null; market?: string | null }): { title: string; body: string } {
  const recent = trimEntries(input.entries, 40);
  const title = input.crash ? `Crash: ${input.crash.message.slice(0, 80)}` : `Diagnostics report: ${recent.filter((e) => e.level === "error").length} recent error(s)`;
  const body = [
    "### What happened",
    input.crash ? `A screen error was recorded at ${input.crash.at}.` : "A diagnostics report was generated from the on-device activity log.",
    "",
    "### Context",
    `- App version: ${input.appVersion ?? "unknown"}`,
    `- Market: ${input.market ?? "unknown"}`,
    "",
    "### Recent activity (redacted)",
    "```",
    recent.map(formatEntry).join("\n") || "(no entries)",
    "```",
    "",
    "_Generated by AnalyzerX Diagnostics. Credentials and personal identifiers are redacted before this text is produced._",
  ].join("\n");
  return { title, body };
}

import { describe, expect, it } from "vitest";

import {
  ACTIVITY_LOG_FILENAME,
  ACTIVITY_LOG_LIMIT,
  describeError,
  formatEntry,
  formatLog,
  makeEntry,
  redact,
  summarizeForIssue,
  trimEntries,
  type ActivityEntry,
} from "../lib/activity-log-core";

describe("activity log: secrets and personal data never reach the log", () => {
  it("names the on-device file the brief asks for", () => {
    expect(ACTIVITY_LOG_FILENAME).toBe("AI_RND_Activity_Log.txt");
  });

  it("redacts a token prefix and a full bearer credential", () => {
    expect(redact("Session token present (eyJhbGciOiJIUzI1NiJ9.abc)")).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(redact("Authorization: Bearer sk-live-abcdefghijklmnop")).not.toContain("sk-live-abcdefghijklmnop");
  });

  it("redacts key=value credentials but keeps the key name", () => {
    const out = redact('api_key="abcdef1234567890"');
    expect(out).toContain("api_key");
    expect(out).not.toContain("abcdef1234567890");
    expect(out).toContain("[redacted]");
  });

  it("redacts an email address", () => {
    expect(redact("signed in as akshya.vats.9@gmail.com")).not.toContain("akshya.vats.9@gmail.com");
    expect(redact("signed in as akshya.vats.9@gmail.com")).toContain("[email redacted]");
  });

  it("redacts a JWT and a long hex secret", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    expect(redact(jwt)).not.toContain("SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV");
    expect(redact("digest 9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318")).toContain("[hex secret redacted]");
  });

  it("redacts through makeEntry, on both message and detail", () => {
    const entry = makeEntry("info", "stored token abcdef1234567890abcdef1234567890", "user akshya.vats.9@gmail.com", "2026-10-15T10:00:00.000Z");
    expect(entry.message).not.toContain("abcdef1234567890abcdef1234567890");
    expect(entry.detail ?? "").not.toContain("akshya.vats.9@gmail.com");
  });
});

describe("activity log: plain English", () => {
  it("turns a network failure into a readable sentence", () => {
    expect(describeError(new Error("Network request failed")).message).toBe("The network request could not be completed. Check the connection and try again.");
  });

  it("explains auth, rate-limit and server errors", () => {
    expect(describeError(new Error("HTTP 401 Unauthorized")).message).toMatch(/sign in again/i);
    expect(describeError(new Error("429 Too Many Requests")).message).toMatch(/rate-limiting/i);
    expect(describeError(new Error("500 Internal Server Error")).message).toMatch(/server error/i);
    expect(describeError(new Error("timed out after 30000 ms")).message).toMatch(/took too long/i);
  });

  it("keeps an unfamiliar error message rather than inventing one", () => {
    const out = describeError(new Error("Widget registry desynchronised"));
    expect(out.message).toContain("Widget registry desynchronised");
  });

  it("handles non-Error thrown values without throwing", () => {
    expect(describeError("plain string").message).toContain("plain string");
    expect(describeError({ weird: true }).message.length).toBeGreaterThan(0);
    expect(describeError(null).message.length).toBeGreaterThan(0);
  });
});

describe("activity log: formatting and bounds", () => {
  it("formats one entry as a single readable line", () => {
    const line = formatEntry({ at: "2026-10-15T10:30:00.000Z", level: "error", message: "Screen recovered after an error: Network request failed" });
    expect(line).toBe("2026-10-15 10:30:00 UTC — Error: Screen recovered after an error: Network request failed");
  });

  it("formats the whole log with a header and a privacy statement", () => {
    const log = formatLog([{ at: "2026-10-15T10:30:00.000Z", level: "success", message: "Installed the India resource pack" }]);
    expect(log).toContain("AnalyzerX activity log");
    expect(log).toContain("No credentials, tokens or personal identifiers");
    expect(log).toContain("Done: Installed the India resource pack");
  });

  it("keeps only the most recent entries", () => {
    const entries: ActivityEntry[] = Array.from({ length: 600 }, (_, i) => ({ at: `2026-10-15T10:00:${String(i % 60).padStart(2, "0")}.000Z`, level: "info", message: `entry ${i}` }));
    const trimmed = trimEntries(entries, 10);
    expect(trimmed).toHaveLength(10);
    expect(trimmed[trimmed.length - 1].message).toBe("entry 599");
    expect(trimEntries(entries)).toHaveLength(ACTIVITY_LOG_LIMIT);
    expect(trimEntries(entries, 0)).toHaveLength(0);
  });
});

describe("activity log: bug report", () => {
  it("builds a redacted issue body with context and no secrets", () => {
    const entries = [makeEntry("error", "Screen recovered after an error: Network request failed", "token abcdef1234567890abcdef1234567890", "2026-10-15T10:30:00.000Z")];
    const report = summarizeForIssue({ entries, crash: { message: "Network request failed", at: "2026-10-15T10:30:00.000Z" }, appVersion: "3.2.0", market: "IN" });
    expect(report.title).toContain("Crash");
    expect(report.body).toContain("App version: 3.2.0");
    expect(report.body).toContain("Market: IN");
    expect(report.body).not.toContain("abcdef1234567890abcdef1234567890");
    expect(report.body).toContain("redacted before this text is produced");
  });

  it("describes a report with no crash as a diagnostics report", () => {
    const report = summarizeForIssue({ entries: [makeEntry("info", "Opened Diagnostics")] });
    expect(report.title).toMatch(/Diagnostics report/);
    expect(report.body).toContain("Opened Diagnostics");
  });
});

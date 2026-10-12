import { describe, expect, it } from "vitest";

import {
  allCapabilities,
  buildSecurityAudit,
  blockingFailures,
  checkTranslationSafety,
  DATA_FLOWS,
  describeOfflineState,
  fallbackFor,
  FALLBACKS,
  findingsBySeverity,
  flowsTo,
  ingestDocument,
  isAllowedHost,
  isSupportedLanguage,
  LANGUAGES,
  languageCapabilityFor,
  languageProfile,
  MANDATORY_LANGUAGE,
  OFFLINE_ENGINE_OPTIONS,
  OFFLINE_TRANSLATION_STATUS,
  offlineEngine,
  openFindings,
  privacyStatement,
  PROTECTED_CATEGORIES,
  reattachCanonical,
  renderSecurityAudit,
  resolveTranslationForDisplay,
  RESILIENCE_PRINCIPLE,
  SECURITY_FINDINGS,
  separateCanonical,
  summariseResilience,
  translationStatement,
  type CanonicalReport,
  type LanguageCode,
} from "../lib/filing-intelligence";

const bytesOf = (text: string): Uint8Array => {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
};

/* ------------------------------------------------------------------ *
 * Languages
 * ------------------------------------------------------------------ */

describe("language support: the PRD's list, not a replacement", () => {
  it("carries the PRD's languages with English first", () => {
    expect(LANGUAGES[0].code).toBe("en");
    const names = LANGUAGES.map((entry) => entry.name);
    for (const required of ["Hindi", "Punjabi", "Bengali", "Tamil", "Telugu", "Marathi", "Gujarati", "Spanish", "French", "German", "Arabic", "Japanese", "Korean"]) {
      expect(names).toContain(required);
    }
    expect(LANGUAGES).toHaveLength(14); // the 13 named plus English
  });

  it("records each language in its own script and marks right-to-left", () => {
    expect(languageProfile("hi")?.endonym).toBe("हिन्दी");
    expect(languageProfile("ta")?.endonym).toBe("தமிழ்");
    expect(languageProfile("ar")?.rightToLeft).toBe(true);
    expect(languageProfile("en")?.rightToLeft).toBe(false);
  });

  it("treats English as mandatory and rejects an unknown code", () => {
    expect(MANDATORY_LANGUAGE).toBe("en");
    expect(isSupportedLanguage("hi")).toBe(true);
    expect(isSupportedLanguage("xx")).toBe(false);
    expect(languageProfile("xx")).toBeNull();
  });

  it("does not claim offline translation, because none is bundled", () => {
    for (const capability of allCapabilities()) {
      expect(capability.offlineTranslationAvailable).toBe(false);
    }
    expect(languageCapabilityFor("hi").requiresService).toBe(true);
    expect(languageCapabilityFor("en").requiresService).toBe(false);
    expect(OFFLINE_TRANSLATION_STATUS.available).toBe(false);
    expect(OFFLINE_TRANSLATION_STATUS.statement).toMatch(/NOT offline/);
  });

  it("offers platform formatting, which is a real capability", () => {
    expect(languageCapabilityFor("ta").platformFormatting).toBe(true);
  });

  it("states the translation position plainly", () => {
    const statement = translationStatement();
    expect(statement).toMatch(/authoritative report is always in English/);
    expect(statement).toMatch(/No offline translation model is bundled/);
  });
});

describe("offline translation investigation", () => {
  it("records size, licence and attribution for every option", () => {
    expect(OFFLINE_ENGINE_OPTIONS.length).toBeGreaterThanOrEqual(3);
    for (const option of OFFLINE_ENGINE_OPTIONS) {
      expect(option.offline).toBe(true);
      expect(option.approximateSizeMb).toBeGreaterThan(0);
      expect(option.licence.length).toBeGreaterThan(0);
      expect(option.dependency.length).toBeGreaterThan(10);
      expect(option.bundled).toBe(false);
    }
  });

  it("names the attribution where the licence requires one", () => {
    expect(offlineEngine("opus_mt")?.attribution).toMatch(/must be credited/);
    expect(offlineEngine("bergamot")?.licence).toBe("MPL-2.0");
    expect(offlineEngine("mlkit_translate")?.approximateSizeMb).toBe(30);
  });
});

/* ------------------------------------------------------------------ *
 * Canonical separation
 * ------------------------------------------------------------------ */

describe("canonical values are separated from translated text", () => {
  const report: CanonicalReport = {
    language: "en",
    narrative: ["Revenue rose this year.", "The outlook is uncertain."],
    canonicalValues: [{ label: "Revenue", value: "1,20,000", unit: "lakh", currency: "INR" }],
    calculations: [{ method: "growth", formula: "((c-p)/abs(p))*100", result: "20", unit: "%" }],
    evidenceIds: ["ev_revenue"],
    companyNames: ["Acme Industries Limited"],
    disclaimers: ["Informational only, not investment advice."],
    caveats: ["May not be repeated."],
  };

  it("splits the narrative from everything that must not change", () => {
    const split = separateCanonical(report);
    expect(split.translatable).toEqual(report.narrative);
    expect(split.protectedParts).toContain("1,20,000 lakh INR");
    expect(split.protectedParts).toContain("ev_revenue");
    expect(split.protectedParts).toContain("Acme Industries Limited");
    expect(split.protectedParts.join(" ")).toContain("not investment advice");
  });

  it("re-attaches the canonical parts verbatim, so a figure comes from the source", () => {
    const output = reattachCanonical(["कंपनी का राजस्व बढ़ा।"], report);
    expect(output).toContain("Revenue: 1,20,000 lakh INR");
    expect(output).toContain("growth (((c-p)/abs(p))*100) = 20 %");
    expect(output).toContain("Evidence: ev_revenue");
  });
});

/* ------------------------------------------------------------------ *
 * Translation safety
 * ------------------------------------------------------------------ */

describe("financial translation safety: nine protected categories", () => {
  const source = [
    "1. FILING IDENTITY",
    "  Revenue: 1,20,000 lakh (INR), consolidated and audited, FY27",
    "  Finance cost: -3,400 lakh",
    "  ISIN INE002A01018",
    "  Revenue rose 20% year on year. [ev_revenue]",
    "  Informational only, not investment advice.",
    "  The outlook may be uncertain and no guarantee is given.",
  ].join("\n");

  it("names the nine protected categories", () => {
    expect(PROTECTED_CATEGORIES).toHaveLength(9);
    expect(PROTECTED_CATEGORIES).toContain("number");
    expect(PROTECTED_CATEGORIES).toContain("legal_disclaimer");
    expect(PROTECTED_CATEGORIES).toContain("evidence_identifier");
  });

  it("passes a translation that preserved everything", () => {
    const translated = source.replace("Revenue rose 20% year on year.", "राजस्व 20% बढ़ा।");
    const result = checkTranslationSafety(source, translated);
    expect(result.safe).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it("catches a changed figure", () => {
    const result = checkTranslationSafety(source, source.replace("1,20,000", "1,50,000"));
    expect(result.safe).toBe(false);
    expect(result.problems.map((p) => p.category)).toContain("number");
  });

  it("catches a dropped currency, scale and evidence identifier", () => {
    const result = checkTranslationSafety(source, source.replace("INR", "").replace("lakh", "lac-units").replace("[ev_revenue]", ""));
    const categories = result.problems.map((p) => p.category);
    expect(categories).toContain("currency");
    expect(categories).toContain("evidence_identifier");
  });

  it("catches a lost sign", () => {
    const result = checkTranslationSafety(source, source.replace("-3,400", "3,400"));
    expect(result.problems.map((p) => p.category)).toContain("sign");
  });

  it("catches a dropped reporting period and identifier", () => {
    const result = checkTranslationSafety(source, source.replace("FY27", "").replace("INE002A01018", ""));
    const categories = result.problems.map((p) => p.category);
    expect(categories).toContain("reporting_period");
    expect(categories).toContain("company_identifier");
  });

  it("catches a softened caveat as a meaning shift", () => {
    // A translation with no hedging at all, which would overstate the view.
    const result = checkTranslationSafety("The outlook may be uncertain.", "The outlook is good.");
    expect(result.problems.map((p) => p.category)).toContain("meaning_shift");
  });

  it("retains the authoritative report when a translation fails", () => {
    const resolved = resolveTranslationForDisplay(source, source.replace("1,20,000", "1,50,000"), "hi");
    expect(resolved.shown).toBe(source);
    expect(resolved.language).toBe("en");
    expect(resolved.translationStatus).toBe("unavailable");
    expect(resolved.note).toMatch(/could not be shown/);
  });

  it("shows a translation that passed", () => {
    const translated = source.replace("Revenue rose 20% year on year.", "राजस्व 20% बढ़ा।");
    const resolved = resolveTranslationForDisplay(source, translated, "hi");
    expect(resolved.translationStatus).toBe("available");
    expect(resolved.language).toBe("hi");
  });

  it("reports no translation when none was requested", () => {
    const resolved = resolveTranslationForDisplay(source, null, "hi");
    expect(resolved.translationStatus).toBe("not_requested");
    expect(resolved.shown).toBe(source);
  });
});

/* ------------------------------------------------------------------ *
 * Security audit
 * ------------------------------------------------------------------ */

describe("security audit: findings, remediation and residual risk", () => {
  const audit = buildSecurityAudit();

  it("reviews every area the prompt names", () => {
    const areas = SECURITY_FINDINGS.map((finding) => finding.area);
    for (const required of ["Logging", "API-key storage", "Network transport", "Document parsers", "Permissions", "WebView", "Crash reports", "Dependency vulnerabilities"]) {
      expect(areas).toContain(required);
    }
  });

  it("records the two credential findings as fixed", () => {
    const logging = SECURITY_FINDINGS.find((finding) => finding.id === "SEC-1")!;
    expect(logging.status).toBe("fixed");
    expect(logging.observation).toMatch(/first 20 characters of the session token/);

    const storage = SECURITY_FINDINGS.find((finding) => finding.id === "SEC-2")!;
    expect(storage.status).toBe("fixed");
    expect(storage.observation).toMatch(/AsyncStorage, which is not encrypted/);
    expect(storage.remediation).toMatch(/secure store/);
  });

  it("states its own residual risk on every finding", () => {
    for (const finding of SECURITY_FINDINGS) {
      expect(finding.residualRisk.length).toBeGreaterThan(10);
      expect(finding.remediation.length).toBeGreaterThan(10);
    }
  });

  it("refuses to call the app security-certified", () => {
    expect(audit.certification).toMatch(/NOT security-certified/);
    expect(audit.certification).toMatch(/No independent security assessment/);
  });

  it("lists the findings that remain open", () => {
    const open = openFindings();
    expect(open.length).toBeGreaterThan(0);
    expect(open.map((finding) => finding.id)).toContain("SEC-3");
  });

  it("counts by severity and renders as text", () => {
    expect(audit.counts.fixed).toBe(2);
    expect(findingsBySeverity("medium").length).toBe(2);
    const rendered = renderSecurityAudit(audit);
    expect(rendered).toContain("SECURITY AUDIT");
    expect(rendered).toContain("SEC-1");
  });

  it("records that no secret is embedded and no dependency scan completed", () => {
    expect(SECURITY_FINDINGS.find((finding) => finding.id === "SEC-5")!.status).toBe("control_in_place");
    const dep = SECURITY_FINDINGS.find((finding) => finding.id === "SEC-4")!;
    expect(dep.status).toBe("not_assessed");
    expect(dep.residualRisk).toMatch(/Not asserted to be clean/);
  });
});

/* ------------------------------------------------------------------ *
 * Privacy
 * ------------------------------------------------------------------ */

describe("privacy: what stays on the device and what leaves", () => {
  it("keeps preferences, watchlists, the selected market and cached filings on the device", () => {
    for (const id of ["preferences", "watchlist", "selected_market", "cached_filings"]) {
      expect(DATA_FLOWS.find((flow) => flow.id === id)?.destination).toBe("device_only");
    }
  });

  it("collects no telemetry and no crash reports", () => {
    expect(flowsTo("never_collected").map((flow) => flow.id).sort()).toEqual(["crash_reports", "telemetry"]);
  });

  it("names the only two things that can leave the device", () => {
    const leaving = [...flowsTo("sent_to_source"), ...flowsTo("backend_only_if_enabled")].map((flow) => flow.id).sort();
    expect(leaving).toEqual(["source_requests", "translation"]);
  });

  it("states the position plainly", () => {
    const statement = privacyStatement();
    expect(statement).toMatch(/stays on your device/);
    expect(statement).toMatch(/no crash reporting is bundled/);
    expect(statement).toMatch(/watchlists.*never uploaded/i);
  });

  it("distinguishes cached from current, and keeps analysis working offline", () => {
    const offlineWithCache = describeOfflineState({ online: false, hasCachedData: true, lastVerifiedCheckUtc: new Date().toISOString() });
    expect(offlineWithCache.coreAnalysisAvailable).toBe(true);
    expect(offlineWithCache.label).toMatch(/cached/i);
    expect(offlineWithCache.note).toMatch(/freshness is shown/);

    const offlineEmpty = describeOfflineState({ online: false, hasCachedData: false, lastVerifiedCheckUtc: null });
    expect(offlineEmpty.coreAnalysisAvailable).toBe(false);
    expect(offlineEmpty.note).toMatch(/Nothing is fabricated/);

    const stale = describeOfflineState({ online: true, hasCachedData: true, lastVerifiedCheckUtc: "2026-09-01T00:00:00.000Z" });
    expect(stale.freshness).toBe("stale");
    expect(stale.label).toMatch(/stale/i);

    const current = describeOfflineState({ online: true, hasCachedData: true, lastVerifiedCheckUtc: new Date().toISOString() });
    expect(current.freshness).toBe("current");
  });
});

/* ------------------------------------------------------------------ *
 * Resilience
 * ------------------------------------------------------------------ */

describe("resilience: an explicit fallback for every failure mode", () => {
  it("covers all nine modes the prompt names", () => {
    const modes = FALLBACKS.map((entry) => entry.mode);
    for (const required of ["source_unavailable", "rate_limited", "authentication_failure", "malformed_document", "partial_extraction", "missing_period", "failed_calculation", "failed_translation", "stale_cache"]) {
      expect(modes).toContain(required);
    }
    expect(FALLBACKS).toHaveLength(9);
  });

  it("states what must never happen for every mode", () => {
    for (const fallback of FALLBACKS) {
      expect(fallback.never.length).toBeGreaterThan(15);
      expect(fallback.userSees.length).toBeGreaterThan(10);
      expect(fallback.behaviour.length).toBeGreaterThan(0);
    }
  });

  it("never retries an access refusal", () => {
    expect(fallbackFor("authentication_failure").retried).toBe(false);
    expect(fallbackFor("authentication_failure").never).toMatch(/never attempt to bypass/);
  });

  it("blocks publication on a malformed document and a failed calculation", () => {
    expect(blockingFailures()).toContain("malformed_document");
    expect(blockingFailures()).toContain("failed_calculation");
    expect(blockingFailures()).not.toContain("stale_cache");
  });

  it("forbids converting an error into a number", () => {
    expect(RESILIENCE_PRINCIPLE).toMatch(/No failure is ever converted into a plausible-looking financial number/);
    expect(fallbackFor("failed_calculation").never).toMatch(/Infinity, NaN/);
    expect(fallbackFor("missing_period").never).toMatch(/substitute a nearby period/);
    expect(summariseResilience().statement).toMatch(/explicit behaviour/);
  });
});

/* ------------------------------------------------------------------ *
 * Malformed input, oversized files, invalid URLs, corrupted caches
 * ------------------------------------------------------------------ */

describe("verification: hostile input is handled, not trusted", () => {
  const options = { contentType: "application/pdf", requestedUrl: "https://example.invalid/a.pdf", finalUrl: "https://example.invalid/a.pdf", retrievedUtc: "2026-10-12T12:00:00.000Z" };

  it("rejects a malformed document rather than parsing it as valid", () => {
    const result = ingestDocument("f1", bytesOf("this is not a pdf at all"), options);
    expect(result.extraction.quality).toBe("unextractable");
    expect(result.extraction.warnings).toContain("parser_failure");
  });

  it("rejects an oversized document before parsing it", () => {
    const result = ingestDocument("f2", new Uint8Array(25_000_001), options);
    expect(result.extraction.note).toMatch(/exceeds/);
  });

  it("refuses an invalid or off-domain URL", () => {
    expect(isAllowedHost("not a url", ["sec.gov"]).allowed).toBe(false);
    expect(isAllowedHost("http://data.sec.gov/x", ["sec.gov"]).allowed).toBe(false);
    expect(isAllowedHost("https://evil.example.com/x", ["sec.gov"]).allowed).toBe(false);
    expect(isAllowedHost("https://data.sec.gov/x", ["sec.gov"]).allowed).toBe(true);
  });

  it("refuses a private or loopback destination", () => {
    expect(isAllowedHost("https://127.0.0.1/x", ["127.0.0.1"]).allowed).toBe(false);
    expect(isAllowedHost("https://169.254.169.254/latest/meta-data", ["169.254.169.254"]).allowed).toBe(false);
  });

  it("treats an unidentifiable payload as unknown rather than guessing", () => {
    const result = ingestDocument("f3", bytesOf("\u0000\u0001\u0002"), { ...options, contentType: "application/octet-stream" });
    expect(result.extraction.quality).toBe("unextractable");
    expect(result.extraction.note).toMatch(/no parser is implemented/i);
  });

  it("reports a corrupted cache entry as unavailable rather than fresh", () => {
    const state = describeOfflineState({ online: false, hasCachedData: true, lastVerifiedCheckUtc: "not a date" });
    expect(state.freshness).toBe("cached");
    expect(state.note).toMatch(/freshness is shown/);
  });

  it("handles a translation into an unsupported language honestly", () => {
    const resolved = resolveTranslationForDisplay("Revenue 1,200 crore.", "Revenue 1,200 crore.", "xx" as LanguageCode);
    expect(resolved.translationStatus).toBe("available"); // identical text passes the checks
    expect(resolved.language).toBe("xx");
  });
});

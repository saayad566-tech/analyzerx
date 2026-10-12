/**
 * Language support (Prompt 6, section 1).
 *
 * The language list is the PRD's own, taken verbatim and not replaced: Hindi,
 * Punjabi, Bengali, Tamil, Telugu, Marathi, Gujarati, Spanish, French, German,
 * Arabic, Japanese, Korean, and others as implemented.
 *
 * One rule governs the whole module: the authoritative source-language report,
 * the canonical financial values, the calculations, the evidence identifiers and
 * the original company names are held SEPARATELY from any translation. A
 * translation is a rendering of the report, never the source of its figures.
 */

export type LanguageCode =
  | "en" | "hi" | "pa" | "bn" | "ta" | "te" | "mr" | "gu"
  | "es" | "fr" | "de" | "ar" | "ja" | "ko";

export type LanguageProfile = {
  code: LanguageCode;
  name: string;
  /** The name in its own script, so a picker reads correctly to its speaker. */
  endonym: string;
  rightToLeft: boolean;
  bcp47: string;
};

/** The PRD's languages, in the PRD's order, with English first as mandatory. */
export const LANGUAGES: LanguageProfile[] = [
  { code: "en", name: "English", endonym: "English", rightToLeft: false, bcp47: "en-IN" },
  { code: "hi", name: "Hindi", endonym: "हिन्दी", rightToLeft: false, bcp47: "hi-IN" },
  { code: "pa", name: "Punjabi", endonym: "ਪੰਜਾਬੀ", rightToLeft: false, bcp47: "pa-IN" },
  { code: "bn", name: "Bengali", endonym: "বাংলা", rightToLeft: false, bcp47: "bn-IN" },
  { code: "ta", name: "Tamil", endonym: "தமிழ்", rightToLeft: false, bcp47: "ta-IN" },
  { code: "te", name: "Telugu", endonym: "తెలుగు", rightToLeft: false, bcp47: "te-IN" },
  { code: "mr", name: "Marathi", endonym: "मराठी", rightToLeft: false, bcp47: "mr-IN" },
  { code: "gu", name: "Gujarati", endonym: "ગુજરાતી", rightToLeft: false, bcp47: "gu-IN" },
  { code: "es", name: "Spanish", endonym: "Español", rightToLeft: false, bcp47: "es-ES" },
  { code: "fr", name: "French", endonym: "Français", rightToLeft: false, bcp47: "fr-FR" },
  { code: "de", name: "German", endonym: "Deutsch", rightToLeft: false, bcp47: "de-DE" },
  { code: "ar", name: "Arabic", endonym: "العربية", rightToLeft: true, bcp47: "ar-SA" },
  { code: "ja", name: "Japanese", endonym: "日本語", rightToLeft: false, bcp47: "ja-JP" },
  { code: "ko", name: "Korean", endonym: "한국어", rightToLeft: false, bcp47: "ko-KR" },
];

/** English is mandatory for every completed report, per the PRD. */
export const MANDATORY_LANGUAGE: LanguageCode = "en";

export function languageProfile(code: string): LanguageProfile | null {
  return LANGUAGES.find((entry) => entry.code === code) ?? null;
}

export function languageName(code: string): string {
  return languageProfile(code)?.name ?? code;
}

export function isSupportedLanguage(code: string): boolean {
  return LANGUAGES.some((entry) => entry.code === code);
}

export type LanguageCapability = {
  code: LanguageCode;
  /** Whether the app can render locale-correct numbers and dates today. */
  platformFormatting: boolean;
  /** Whether an offline translation model is bundled. */
  offlineTranslationAvailable: boolean;
  requiresService: boolean;
  note: string;
};

/**
 * What the app can actually do for each language today.
 *
 * No offline translation model is bundled, so `offlineTranslationAvailable` is
 * false everywhere. Platform locale formatting IS available for every language
 * because the platform provides it, and that is a real capability rather than a
 * claim about translation.
 */
export function languageCapabilityFor(code: LanguageCode): LanguageCapability {
  const profile = languageProfile(code);
  if (!profile) {
    return { code, platformFormatting: false, offlineTranslationAvailable: false, requiresService: true, note: `"${code}" is not one of the supported languages.` };
  }
  if (code === MANDATORY_LANGUAGE) {
    return { code, platformFormatting: true, offlineTranslationAvailable: false, requiresService: false, note: "English is the authoritative language and is always available." };
  }
  return {
    code,
    platformFormatting: true,
    offlineTranslationAvailable: false,
    requiresService: true,
    note: `${profile.name} can be formatted by the platform, but no offline translation model is bundled, so a translation needs an external service.`,
  };
}

export function allCapabilities(): LanguageCapability[] {
  return LANGUAGES.map((entry) => languageCapabilityFor(entry.code));
}

/** A plain statement of the translation position, for the UI. */
export function translationStatement(): string {
  return [
    "The authoritative report is always in English, and its figures are the ones the source states.",
    `The app supports ${LANGUAGES.length} languages for reading and formatting.`,
    "No offline translation model is bundled, so a translation is produced by an external service when the user asks for one, and is validated before it is shown.",
    "If validation fails, the English report is retained and the translation is marked unavailable rather than shown.",
  ].join(" ");
}

/**
 * The parts of a report that are NOT translated.
 *
 * These are carried through a translation untouched and re-attached afterwards,
 * which is what makes it possible to check that a translation did not alter them.
 */
export type CanonicalReport = {
  language: LanguageCode;
  /** The narrative text, which is what a translation actually replaces. */
  narrative: string[];
  canonicalValues: { label: string; value: string; unit: string | null; currency: string | null }[];
  calculations: { method: string; formula: string; result: string; unit: string }[];
  evidenceIds: string[];
  companyNames: string[];
  disclaimers: string[];
  caveats: string[];
};

/** Split a report into the narrative a translation may change and what it may not. */
export function separateCanonical(report: CanonicalReport): { translatable: string[]; protectedParts: string[] } {
  const protectedParts = [
    ...report.canonicalValues.map((entry) => `${entry.value}${entry.unit ? ` ${entry.unit}` : ""}${entry.currency ? ` ${entry.currency}` : ""}`),
    ...report.calculations.map((entry) => `${entry.result} ${entry.unit}`),
    ...report.evidenceIds,
    ...report.companyNames,
    ...report.disclaimers,
    ...report.caveats,
  ];
  return { translatable: report.narrative, protectedParts };
}

/**
 * Re-attach the canonical parts to a translated narrative, verbatim.
 * The figure shown therefore comes from the source, not from the translation.
 */
export function reattachCanonical(translatedNarrative: string[], report: CanonicalReport): string {
  const lines: string[] = [...translatedNarrative];
  if (report.canonicalValues.length) {
    lines.push("");
    for (const entry of report.canonicalValues) {
      lines.push(`${entry.label}: ${entry.value}${entry.unit ? ` ${entry.unit}` : ""}${entry.currency ? ` ${entry.currency}` : ""}`);
    }
  }
  if (report.calculations.length) {
    lines.push("");
    for (const entry of report.calculations) lines.push(`${entry.method} (${entry.formula}) = ${entry.result} ${entry.unit}`);
  }
  if (report.evidenceIds.length) lines.push(`Evidence: ${report.evidenceIds.join(", ")}`);
  return lines.join("\n");
}

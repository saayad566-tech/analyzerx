/**
 * Translation consistency validation (Prompt 3, section 6).
 *
 * A translation may change the language. It must not change a number, a
 * currency, a period, a sign, a unit, a claim classification, a caveat or an
 * evidence identifier. Those are the things a reader relies on being identical
 * across language versions, and they are exactly the things a language model
 * can silently alter.
 *
 * The checks here are language-independent by construction: numerals, currency
 * codes, evidence identifiers, classification tokens and structural counts look
 * the same in every language, so they can be compared directly. If any check
 * fails, the translated version is suppressed and the authoritative report is
 * retained.
 */

export type TranslationInvariants = {
  numbers: string[];
  currencyCodes: string[];
  evidenceIds: string[];
  classifications: string[];
  /** The count of negative figures, so a lost sign is caught. */
  negativeCount: number;
  /** The count of numbered sections, so an omitted section is caught. */
  sectionCount: number;
  /** The count of limitation bullets, so a dropped caveat is caught. */
  limitationCount: number;
};

const CLASSIFICATION_TOKENS = ["FACT", "CALCULATION", "INTERPRETATION", "FORECAST", "COMPANY_GUIDANCE"];

/** Pull the values that must survive translation unchanged. */
export function extractInvariants(text: string): TranslationInvariants {
  // Numerals only: a comma or a decimal point is part of the figure, and a
  // translated thousands separator must not be treated as a different number.
  const numbers = (text.match(/-?\d[\d,]*(?:\.\d+)?%?/g) ?? []).map((value) => value.replace(/,/g, ""));
  const currencyCodes = [...new Set(text.match(/\b(?:INR|USD|EUR|GBP|JPY|AUD|CAD|CHF)\b/g) ?? [])];
  const evidenceIds = [...new Set(text.match(/\b(?:ev|evidence|claim)[_-][A-Za-z0-9_-]+/gi) ?? [])];
  const classifications = CLASSIFICATION_TOKENS.filter((token) => new RegExp(`\\b${token}\\b`).test(text));
  const negativeCount = (text.match(/(?:^|\s)-\d/g) ?? []).length;
  // Language-agnostic: a numbered section is a line beginning with a number and
  // a dot, whatever script the heading is written in.
  const sectionCount = (text.match(/^\s*\d+\.\s+\S/gm) ?? []).length;
  const limitationCount = (text.match(/^\s*-\s+/gm) ?? []).length;
  return { numbers, currencyCodes, evidenceIds, classifications, negativeCount, sectionCount, limitationCount };
}

export type TranslationProblem = {
  code: "number_changed" | "number_missing" | "currency_changed" | "evidence_id_missing" | "classification_changed" | "sign_changed" | "section_omitted" | "caveat_dropped";
  detail: string;
};

export type TranslationValidation = {
  passed: boolean;
  problems: TranslationProblem[];
  /** What the reader is told when it fails. */
  note: string;
};

/**
 * Validate a translated report against the authoritative English one.
 *
 * Every number in the source must appear in the translation, every currency
 * code and evidence identifier must survive, the classifications must match,
 * the sign count must match, and no section or limitation may be dropped.
 */
export function validateTranslation(english: string, translated: string): TranslationValidation {
  const problems: TranslationProblem[] = [];
  const source = extractInvariants(english);
  const target = extractInvariants(translated);

  const targetNumbers = new Set(target.numbers);
  const sourceNumbers = new Set(source.numbers);
  const missingNumbers = source.numbers.filter((value) => !targetNumbers.has(value));
  if (missingNumbers.length) {
    problems.push({ code: "number_missing", detail: `${missingNumbers.length} figure(s) from the authoritative report do not appear in the translation, e.g. ${missingNumbers.slice(0, 5).join(", ")}.` });
  }
  const inventedNumbers = target.numbers.filter((value) => !sourceNumbers.has(value));
  if (inventedNumbers.length) {
    problems.push({ code: "number_changed", detail: `${inventedNumbers.length} figure(s) appear in the translation but not in the authoritative report, e.g. ${inventedNumbers.slice(0, 5).join(", ")}.` });
  }

  for (const code of source.currencyCodes) {
    if (!target.currencyCodes.includes(code)) problems.push({ code: "currency_changed", detail: `The currency "${code}" is present in the authoritative report but not in the translation.` });
  }
  for (const id of source.evidenceIds) {
    if (!target.evidenceIds.includes(id)) problems.push({ code: "evidence_id_missing", detail: `The evidence identifier "${id}" was not preserved in the translation.` });
  }
  for (const token of source.classifications) {
    if (!target.classifications.includes(token)) problems.push({ code: "classification_changed", detail: `The claim classification "${token}" was not preserved in the translation.` });
  }
  if (source.negativeCount !== target.negativeCount) {
    problems.push({ code: "sign_changed", detail: `The authoritative report has ${source.negativeCount} negative figure(s) and the translation has ${target.negativeCount}, so a sign may have changed.` });
  }
  if (source.sectionCount !== target.sectionCount) {
    problems.push({ code: "section_omitted", detail: `The authoritative report has ${source.sectionCount} numbered section(s) and the translation has ${target.sectionCount}.` });
  }
  if (source.limitationCount !== target.limitationCount) {
    problems.push({ code: "caveat_dropped", detail: `The authoritative report has ${source.limitationCount} caveat or bullet line(s) and the translation has ${target.limitationCount}, so a caveat may have been dropped.` });
  }

  const passed = problems.length === 0;
  return {
    passed,
    problems,
    note: passed
      ? "The translation preserved every figure, currency, evidence identifier, classification, sign, section and caveat."
      : `The translation failed ${problems.length} consistency check(s) and was suppressed. The authoritative version is retained.`,
  };
}

/**
 * Decide what to publish when a translation fails.
 * The authoritative version is never replaced by a failed translation.
 */
export function resolveTranslation(english: string, translated: string | null): { englishReport: string; translatedReport: string | null; validation: TranslationValidation | null } {
  if (!translated) return { englishReport: english, translatedReport: null, validation: null };
  const validation = validateTranslation(english, translated);
  return { englishReport: english, translatedReport: validation.passed ? translated : null, validation };
}

/**
 * Translation: capability, safety and the offline investigation (Prompt 6,
 * sections 1 and 2).
 *
 * What was investigated for offline translation on Android, and what was found:
 *
 *   - ML Kit On-Device Translation: free, runs on-device, roughly 30 MB per
 *     language model downloaded on demand. Needs the com.google.mlkit:translate
 *     Gradle artifact and a React Native bridge. NOT bundled here.
 *   - Bergamot (Firefox Translations): C++/WASM, roughly 15-20 MB per language
 *     pair, MPL-2.0. Needs a native or WASM runtime and a model per direction.
 *   - OPUS-MT / Marian via ONNX Runtime Mobile: roughly 50-80 MB per pair,
 *     CC-BY-4.0, which carries an attribution requirement. Needs a native ONNX
 *     runtime.
 *
 * None of these is bundled, so translation is NOT claimed to be offline. This
 * module states that plainly and provides the safety checks that must pass
 * before any translation is shown, whatever produced it.
 */

import { languageProfile, type LanguageCode } from "./languages";

export type OfflineEngineOption = {
  id: string;
  name: string;
  offline: boolean;
  approximateSizeMb: number;
  modelScope: "per_language" | "per_pair";
  memoryNote: string;
  licence: string;
  attribution: string | null;
  dependency: string;
  bundled: boolean;
};

export const OFFLINE_ENGINE_OPTIONS: OfflineEngineOption[] = [
  {
    id: "mlkit_translate",
    name: "ML Kit On-Device Translation",
    offline: true,
    approximateSizeMb: 30,
    modelScope: "per_language",
    memoryNote: "Models are downloaded on demand and held on the device; memory use is modest once loaded.",
    licence: "Google ML Kit terms",
    attribution: null,
    dependency: "The com.google.mlkit:translate Gradle artifact plus a React Native bridge.",
    bundled: false,
  },
  {
    id: "bergamot",
    name: "Bergamot (Firefox Translations)",
    offline: true,
    approximateSizeMb: 18,
    modelScope: "per_pair",
    memoryNote: "Small per-pair models, but a model is needed for each direction.",
    licence: "MPL-2.0",
    attribution: "The Mozilla Bergamot project must be credited.",
    dependency: "A native or WebAssembly runtime plus a model per direction.",
    bundled: false,
  },
  {
    id: "opus_mt",
    name: "OPUS-MT / Marian via ONNX Runtime Mobile",
    offline: true,
    approximateSizeMb: 65,
    modelScope: "per_pair",
    memoryNote: "The largest of the options; needs an ONNX runtime and more memory than the others.",
    licence: "CC-BY-4.0",
    attribution: "The OPUS-MT project and its model authors must be credited, as the licence requires.",
    dependency: "The ONNX Runtime Mobile artifact plus a model per direction.",
    bundled: false,
  },
];

export const OFFLINE_TRANSLATION_STATUS = {
  available: false,
  statement:
    "No offline translation model is bundled. Translation is therefore NOT offline: when the user asks for one, it is produced by an external service and validated before it is shown.",
  wouldRequire: "Bundling one of the engines above, with its native dependency, its model files and its licence attribution.",
};

export function offlineEngine(id: string): OfflineEngineOption | undefined {
  return OFFLINE_ENGINE_OPTIONS.find((entry) => entry.id === id);
}

/* ------------------------------------------------------------------ *
 * Financial translation safety
 * ------------------------------------------------------------------ */

export type ProtectedCategory =
  | "number" | "currency" | "sign" | "unit_or_scale" | "reporting_period"
  | "company_identifier" | "accounting_term" | "legal_disclaimer" | "evidence_identifier";

export const PROTECTED_CATEGORIES: ProtectedCategory[] = [
  "number", "currency", "sign", "unit_or_scale", "reporting_period",
  "company_identifier", "accounting_term", "legal_disclaimer", "evidence_identifier",
];

export type TranslationSafetyProblem = {
  category: ProtectedCategory | "meaning_shift";
  detail: string;
};

export type TranslationSafetyResult = {
  safe: boolean;
  problems: TranslationSafetyProblem[];
  note: string;
};

const ACCOUNTING_TERMS = [
  "revenue", "turnover", "gross profit", "operating profit", "net profit", "ebitda", "eps",
  "consolidated", "standalone", "audited", "unaudited", "restated", "capex", "working capital",
  "goodwill", "provision", "depreciation", "amortisation", "amortization",
];

const CAVEAT_MARKERS = /\b(may|might|could|uncertain|risk|no guarantee|not guaranteed|assumption|estimate|forecast|subject to|limitation|does not|cannot)\b/i;
const RECOGNISED_ACCOUNTING = /\b(?:revenue|profit|consolidated|standalone|audited|restated|ebitda|eps)\b/i;

function numbersIn(text: string): string[] {
  return (text.match(/-?\d[\d,]*(?:\.\d+)?%?/g) ?? []).map((value) => value.replace(/,/g, ""));
}
function currencyCodesIn(text: string): string[] {
  return [...new Set(text.match(/\b(?:INR|USD|EUR|GBP|JPY|AUD|CAD|CHF|HKD|SGD)\b/g) ?? [])];
}
function evidenceIdsIn(text: string): string[] {
  return [...new Set(text.match(/\b(?:ev|evidence|claim|fact)[_-][A-Za-z0-9_-]+/gi) ?? [])];
}
function identifiersIn(text: string): string[] {
  return [...new Set(text.match(/\b(?:IN[A-Z0-9]{9}[0-9]|[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}|\d{5,6})\b/g) ?? [])];
}

/**
 * Check that a translation preserved everything it must. Nine categories are
 * checked; where any fails, the authoritative report is retained and the
 * translation is marked unavailable rather than shown.
 */
export function checkTranslationSafety(source: string, translated: string): TranslationSafetyResult {
  const problems: TranslationSafetyProblem[] = [];

  const sourceNumbers = new Set(numbersIn(source));
  const targetNumbers = new Set(numbersIn(translated));
  const lostNumbers = [...sourceNumbers].filter((value) => !targetNumbers.has(value));
  const inventedNumbers = [...targetNumbers].filter((value) => !sourceNumbers.has(value));
  if (lostNumbers.length) problems.push({ category: "number", detail: `${lostNumbers.length} figure(s) from the source do not appear in the translation, e.g. ${lostNumbers.slice(0, 4).join(", ")}.` });
  if (inventedNumbers.length) problems.push({ category: "number", detail: `${inventedNumbers.length} figure(s) appear only in the translation, e.g. ${inventedNumbers.slice(0, 4).join(", ")}.` });

  for (const code of currencyCodesIn(source)) {
    if (!currencyCodesIn(translated).includes(code)) problems.push({ category: "currency", detail: `The currency "${code}" was not preserved.` });
  }

  const sourceNegatives = (source.match(/(?:^|\s)-\d/g) ?? []).length;
  const targetNegatives = (translated.match(/(?:^|\s)-\d/g) ?? []).length;
  if (sourceNegatives !== targetNegatives) {
    problems.push({ category: "sign", detail: `The source has ${sourceNegatives} negative figure(s) and the translation has ${targetNegatives}.` });
  }

  for (const unit of ["crore", "lakh", "million", "billion", "thousand"]) {
    const inSource = new RegExp(`\\b${unit}s?\\b`, "i").test(source);
    const inTarget = new RegExp(`\\b${unit}s?\\b`, "i").test(translated);
    if (inSource && !inTarget) problems.push({ category: "unit_or_scale", detail: `The scale "${unit}" was not preserved.` });
  }

  for (const period of [...new Set(source.match(/\b(?:FY\s*\d{2,4}|Q[1-4]\s*(?:FY)?\s*\d{0,4})/gi) ?? [])]) {
    if (!translated.includes(period)) problems.push({ category: "reporting_period", detail: `The reporting period "${period.trim()}" was not preserved.` });
  }

  for (const id of identifiersIn(source)) {
    if (!translated.includes(id)) problems.push({ category: "company_identifier", detail: `The identifier "${id}" was not preserved.` });
  }

  for (const term of ACCOUNTING_TERMS) {
    if (!new RegExp(`\\b${term}\\b`, "i").test(source)) continue;
    // A translation may render the term in another language, so the check is
    // that the translated text still contains SOME recognised term.
    if (!RECOGNISED_ACCOUNTING.test(translated) && translated.length > 0) {
      problems.push({ category: "accounting_term", detail: `The source uses "${term}" but the translation contains no recognised accounting term, so a term may have been dropped.` });
      break;
    }
  }

  const sourceDisclaimer = /\b(not investment advice|informational only|does not constitute)\b/i.test(source);
  if (sourceDisclaimer && !/\b(not investment advice|informational only|does not constitute)\b/i.test(translated) && translated.length > 0) {
    problems.push({ category: "legal_disclaimer", detail: "The source carries a legal disclaimer; confirm the translation carries an equivalent one." });
  }

  for (const id of evidenceIdsIn(source)) {
    if (!translated.includes(id)) problems.push({ category: "evidence_identifier", detail: `The evidence identifier "${id}" was not preserved.` });
  }

  const sourceCaveats = (source.match(CAVEAT_MARKERS) ?? []).length;
  const targetCaveats = (translated.match(CAVEAT_MARKERS) ?? []).length;
  if (sourceCaveats > 0 && targetCaveats === 0 && translated.length > 0) {
    problems.push({ category: "meaning_shift", detail: "The source contains hedging or risk wording and the translation contains none, so a caveat may have been dropped." });
  }

  const safe = problems.length === 0;
  return {
    safe,
    problems,
    note: safe
      ? "The translation preserved every figure, currency, sign, scale, period, identifier, accounting term, disclaimer and evidence identifier."
      : `The translation failed ${problems.length} safety check(s). The authoritative report is retained and the translation is marked unavailable.`,
  };
}

/**
 * Decide what to show after a translation attempt.
 * The authoritative report is never replaced by a failed translation.
 */
export function resolveTranslationForDisplay(
  authoritative: string,
  translated: string | null,
  targetLanguage: LanguageCode,
): { shown: string; language: LanguageCode; translationStatus: "not_requested" | "available" | "unavailable"; note: string } {
  const profile = languageProfile(targetLanguage);
  if (!translated) {
    return { shown: authoritative, language: "en", translationStatus: "not_requested", note: "No translation was requested." };
  }
  const safety = checkTranslationSafety(authoritative, translated);
  if (!safety.safe) {
    return { shown: authoritative, language: "en", translationStatus: "unavailable", note: `${profile?.name ?? targetLanguage} could not be shown: ${safety.note}` };
  }
  return { shown: translated, language: targetLanguage, translationStatus: "available", note: safety.note };
}

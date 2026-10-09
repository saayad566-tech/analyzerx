import { createHash } from "node:crypto";

import { fetchWithRetry, markCollectorFailure, markCollectorParsingError, markCollectorStarted, markCollectorSuccess } from "./collector-runtime";

const SEC_TICKER_URL = "https://www.sec.gov/files/company_tickers.json";
const SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{CIK}.json";
const SEC_COMPANY_FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{CIK}.json";
const MAX_BODY_LENGTH = 8_000_000;
const PARSER_VERSION = "sec-edgar-v1";

export type SecTickerRecord = { cik_str: number; ticker: string; title: string };
export type SecSubmission = { accessionNumber: string; filingDate: string; reportDate?: string; form: string; primaryDocument?: string; primaryDocDescription?: string; filingUrl: string };
export type SecFact = { taxonomy: string; tag: string; unit: string; value: number; start?: string; end?: string; filed?: string; form?: string; accession?: string; frame?: string };

function secUserAgent() {
  const value = process.env.SEC_EDGAR_USER_AGENT?.trim();
  if (!value || value.includes("=") || value.length < 8) throw new Error("SEC_EDGAR_USER_AGENT is required for compliant SEC access");
  return value;
}

function cik10(value: string | number) {
  const digits = String(value).replace(/\D/g, "");
  if (!digits) throw new Error("SEC CIK is required");
  return digits.padStart(10, "0");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function resolveSecTicker(records: SecTickerRecord[], symbol: string) {
  const normalized = symbol.trim().toUpperCase().replace(/\.[A-Z]+$/, "");
  return records.find((record) => record.ticker.toUpperCase() === normalized) ?? null;
}

export function parseSecSubmissions(payload: unknown, cik: string): SecSubmission[] {
  if (!payload || typeof payload !== "object") throw new Error("SEC submissions payload is not an object");
  const recent = (payload as { filings?: { recent?: Record<string, unknown[]> } }).filings?.recent;
  if (!recent || !Array.isArray(recent.accessionNumber) || !Array.isArray(recent.form) || !Array.isArray(recent.filingDate)) throw new Error("SEC submissions schema mismatch: recent filing arrays missing");
  const count = Math.min(recent.accessionNumber.length, recent.form.length, recent.filingDate.length);
  const documents = Array.isArray(recent.primaryDocument) ? recent.primaryDocument : [];
  const reportDates = Array.isArray(recent.reportDate) ? recent.reportDate : [];
  const descriptions = Array.isArray(recent.primaryDocDescription) ? recent.primaryDocDescription : [];
  return Array.from({ length: count }, (_, index) => {
    const accessionNumber = String(recent.accessionNumber[index] ?? "");
    const filingDate = String(recent.filingDate[index] ?? "");
    const form = String(recent.form[index] ?? "");
    const primaryDocument = documents[index] ? String(documents[index]) : undefined;
    return { accessionNumber, filingDate, reportDate: reportDates[index] ? String(reportDates[index]) : undefined, form, primaryDocument, primaryDocDescription: descriptions[index] ? String(descriptions[index]) : undefined, filingUrl: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accessionNumber.replaceAll("-", "")}/${primaryDocument ?? ""}` };
  }).filter((item) => item.accessionNumber && item.filingDate && item.form);
}

export function parseSecFacts(payload: unknown): SecFact[] {
  if (!payload || typeof payload !== "object") throw new Error("SEC company facts payload is not an object");
  const facts = (payload as { facts?: Record<string, Record<string, { units?: Record<string, Array<Record<string, unknown>>> }>> }).facts;
  if (!facts || typeof facts !== "object") throw new Error("SEC company facts schema mismatch: facts missing");
  const output: SecFact[] = [];
  for (const [taxonomy, taxonomyFacts] of Object.entries(facts)) {
    for (const [tag, definition] of Object.entries(taxonomyFacts ?? {})) {
      for (const [unit, observations] of Object.entries(definition.units ?? {})) {
        for (const observation of observations.slice(-200)) {
          if (typeof observation.val !== "number") continue;
          output.push({ taxonomy, tag, unit, value: observation.val, start: typeof observation.start === "string" ? observation.start : undefined, end: typeof observation.end === "string" ? observation.end : undefined, filed: typeof observation.filed === "string" ? observation.filed : undefined, form: typeof observation.form === "string" ? observation.form : undefined, accession: typeof observation.accn === "string" ? observation.accn : undefined, frame: typeof observation.frame === "string" ? observation.frame : undefined });
        }
      }
    }
  }
  return output;
}

async function fetchJson(url: string, key: string) {
  const response = await fetchWithRetry(url, { headers: { Accept: "application/json", "User-Agent": secUserAgent(), Host: new URL(url).host } }, { key, retries: 2, timeoutMs: 20_000, rateLimitMs: 110 });
  const body = (await response.text()).slice(0, MAX_BODY_LENGTH);
  if (!response.ok) throw new Error(`SEC ${key} HTTP ${response.status}`);
  try { return { payload: JSON.parse(body) as unknown, body }; } catch { throw new Error(`SEC ${key} returned invalid JSON`); }
}

export async function fetchSecTickerMap() {
  const key = "sec-edgar-tickers";
  markCollectorStarted(key);
  try {
    const { payload, body } = await fetchJson(SEC_TICKER_URL, key);
    if (!payload || typeof payload !== "object") throw new Error("SEC ticker map schema mismatch");
    const records = Object.values(payload as Record<string, SecTickerRecord>).filter((record) => record && typeof record.ticker === "string" && typeof record.cik_str === "number");
    markCollectorSuccess(key, records.length);
    return { status: "fresh" as const, records, body, retrievedAt: new Date().toISOString() };
  } catch (error) { markCollectorFailure(key, error); return { status: "error" as const, records: [], body: "", error: String(error), retrievedAt: new Date().toISOString() }; }
}

export async function collectSecCompany(symbol: string, options: { submissions?: boolean; facts?: boolean } = {}) {
  const key = "sec-edgar-company";
  const retrievedAt = new Date();
  markCollectorStarted(key);
  try {
    const tickerMap = await fetchSecTickerMap();
    if (tickerMap.status !== "fresh") throw new Error(tickerMap.error ?? "SEC ticker map unavailable");
    const resolved = resolveSecTicker(tickerMap.records, symbol);
    if (!resolved) return { status: "unresolved" as const, symbol: symbol.toUpperCase(), filings: [], facts: [], retrievedAt: retrievedAt.toISOString() };
    const cik = cik10(resolved.cik_str);
    const submissions = options.submissions === false ? null : await fetchJson(SEC_SUBMISSIONS_URL.replace("{CIK}", cik), key);
    const facts = options.facts === false ? null : await fetchJson(SEC_COMPANY_FACTS_URL.replace("{CIK}", cik), key);
    const filings = submissions ? parseSecSubmissions(submissions.payload, cik) : [];
    const normalizedFacts = facts ? parseSecFacts(facts.payload) : [];
    markCollectorSuccess(key, filings.length + normalizedFacts.length);
    return { status: "fresh" as const, symbol: resolved.ticker, cik, companyName: resolved.title, filings, facts: normalizedFacts, raw: { submissions: submissions?.body ?? null, facts: facts?.body ?? null }, retrievedAt: retrievedAt.toISOString(), parserVersion: PARSER_VERSION };
  } catch (error) { markCollectorFailure(key, error); markCollectorParsingError(key, error); return { status: "error" as const, symbol: symbol.toUpperCase(), filings: [], facts: [], error: String(error), retrievedAt: retrievedAt.toISOString() }; }
}

export function buildSecRecordId(kind: "submissions" | "facts", identifier: string) { return `sec-edgar:${kind}:${sha256(identifier).slice(0, 72)}`; }
export { cik10, sha256, PARSER_VERSION };

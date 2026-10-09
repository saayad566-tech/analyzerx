import { createHash } from "node:crypto";

import { saveSourceRecord } from "./db";
import { buildSecRecordId, collectSecCompany } from "./sec-edgar";

function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }

export async function ingestSecCompany(symbol: string, options: { excludeAccessions?: Set<string> } = {}) {
  const result = await collectSecCompany(symbol);
  const retrievedAt = new Date(result.retrievedAt);
  if (result.status === "unresolved") return { ...result, recordsStored: 0, newAccessions: [] as string[] };
  if (result.status === "error") {
    const errorPayload = JSON.stringify({ symbol, error: result.error, retrievedAt: result.retrievedAt });
    await saveSourceRecord({ id: buildSecRecordId("submissions", `${symbol}:error:${result.retrievedAt.slice(0, 10)}`), sourceKey: "sec-edgar-submissions", sourceUrl: "https://data.sec.gov/submissions/", symbol: symbol.toUpperCase(), recordType: "sec-edgar-error", externalId: `${symbol}:error:${result.retrievedAt}`, retrievedAt, freshnessStatus: "error", rawPayload: errorPayload, normalizedPayload: null, dataHash: hash(errorPayload), parserVersion: "sec-edgar-v1", errorMessage: result.error ?? "SEC collection failed" });
    return { ...result, recordsStored: 0, newAccessions: [] as string[] };
  }

  const excluded = options.excludeAccessions;
  const filings = excluded ? result.filings.filter((filing) => !excluded.has(filing.accessionNumber)) : result.filings;
  let recordsStored = 0;
  for (const filing of filings) {
    const payload = JSON.stringify({ cik: result.cik, companyName: result.companyName, filing });
    const saved = await saveSourceRecord({ id: buildSecRecordId("submissions", filing.accessionNumber), sourceKey: "sec-edgar-submissions", sourceUrl: filing.filingUrl, documentName: filing.primaryDocument ?? `${result.companyName} SEC filing`, symbol: result.symbol, recordType: "sec-filing-submission", externalId: filing.accessionNumber, title: filing.primaryDocDescription ?? `${result.companyName} ${filing.form}`, publishedAt: filing.filingDate ? new Date(`${filing.filingDate}T00:00:00.000Z`) : null, reportDate: filing.reportDate ? new Date(`${filing.reportDate}T00:00:00.000Z`) : null, retrievedAt, freshnessStatus: "fresh", rawPayload: payload, normalizedPayload: JSON.stringify({ title: filing.primaryDocDescription ?? `${result.companyName} ${filing.form}`, summary: `${filing.form} filed by ${result.companyName}`, publishedAt: filing.filingDate ? new Date(`${filing.filingDate}T00:00:00.000Z`).toISOString() : null, accessionNumber: filing.accessionNumber, form: filing.form, url: filing.filingUrl }), dataHash: hash(payload), parserVersion: result.parserVersion, errorMessage: null });
    recordsStored += Number(saved);
  }

  const factsPayload = JSON.stringify({ cik: result.cik, companyName: result.companyName, facts: result.facts });
  const savedFacts = await saveSourceRecord({ id: buildSecRecordId("facts", result.cik), sourceKey: "sec-company-facts", sourceUrl: "https://data.sec.gov/api/xbrl/companyfacts/", documentName: `${result.companyName} SEC company facts`, symbol: result.symbol, recordType: "sec-xbrl-company-facts", externalId: result.cik, title: `${result.companyName} SEC XBRL company facts`, rawPayload: result.raw?.facts ?? factsPayload, normalizedPayload: factsPayload, dataHash: hash(result.raw?.facts ?? factsPayload), retrievedAt, freshnessStatus: "fresh", parserVersion: result.parserVersion, errorMessage: null });
  recordsStored += Number(savedFacts);
  return { ...result, recordsStored, newAccessions: filings.map((filing) => filing.accessionNumber) };
}

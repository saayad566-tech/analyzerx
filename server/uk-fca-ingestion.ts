import { createHash } from "node:crypto";

import { saveSourceRecord } from "./db";
import { collectFcaIssuer } from "./uk-fca";

function stableId(value: string) { return `uk-fca:${createHash("sha256").update(value).digest("hex").slice(0, 72)}`; }
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }

export async function ingestFcaIssuer(query: string) {
  const result = await collectFcaIssuer(query);
  if (result.status !== "fresh") return { ...result, recordsStored: 0 };
  const issuer = result.issuer;
  let recordsStored = 0;
  for (const disclosure of result.disclosures) {
    const payload = JSON.stringify(disclosure);
    const saved = await saveSourceRecord({ id: stableId(disclosure.id), sourceKey: "uk-fca-nsm", sourceUrl: disclosure.documentUrl, symbol: issuer.symbol, recordType: "uk-fca-disclosure", externalId: disclosure.id, title: disclosure.headline, publishedAt: new Date(disclosure.filedAt), retrievedAt: new Date(result.retrievedAt), freshnessStatus: "fresh", rawPayload: payload, normalizedPayload: JSON.stringify({ title: disclosure.headline, summary: `${disclosure.category ?? "Regulatory disclosure"} filed by ${disclosure.issuerName}`, publishedAt: disclosure.filedAt, url: disclosure.documentUrl, category: disclosure.category, issuerLei: disclosure.issuerLei, relatedIssuers: disclosure.relatedIssuers, isCorrection: disclosure.isCorrection }), dataHash: hash(payload), parserVersion: "uk-fca-nsm-v1", errorMessage: null });
    recordsStored += Number(saved);
  }
  return { ...result, recordsStored };
}

import { createHash } from "node:crypto";

import { saveSourceRecord } from "./db";
import { fetchNseInstitutionalFlows } from "./nse-flows";
import { fetchSecTickerMap } from "./sec-edgar";
import { getSourceCatalog, type SourceDescriptor } from "./source-catalog";
import { fetchWithRetry, markCollectorFailure, markCollectorParsingError, markCollectorStarted, markCollectorSuccess } from "./collector-runtime";

const MAX_BODY_LENGTH = 2_000_000;

function stableId(sourceKey: string, externalId: string) {
  return createHash("sha256").update(`${sourceKey}:${externalId}`).digest("hex").slice(0, 96);
}

function pageTitle(body: string) {
  const match = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.replace(/\s+/g, " ").trim().slice(0, 500) || null;
}

function stripMarkup(value: string) {
  return decodeXml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 2_000);
}

export function extractHtmlTables(body: string) {
  return [...body.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].slice(0, 20).map((tableMatch) => {
    const rows = [...tableMatch[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].slice(0, 200).map((rowMatch) => [...rowMatch[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map((cell) => stripMarkup(cell[1])).filter(Boolean)).filter((row) => row.length > 0);
    return rows;
  }).filter((table) => table.length > 0);
}

function sourceByKey(sourceKey: string): SourceDescriptor | undefined {
  return getSourceCatalog().find((source) => source.key === sourceKey);
}

function decodeXml(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
}

export function parseRssItems(xml: string) {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => {
    const block = match[1];
    const read = (tag: string) => decodeXml(block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] ?? "");
    const title = read("title");
    const description = read("description");
    const link = read("link");
    const guid = read("guid") || link || title;
    const pubDate = read("pubDate");
    return { title, description, link, guid, pubDate };
  }).filter((item) => item.title || item.description || item.link);
}

export async function ingestCatalogSource(sourceKey: string) {
  const source = sourceByKey(sourceKey);
  if (!source) throw new Error(`Unknown source: ${sourceKey}`);
  const retrievedAt = new Date();
  markCollectorStarted(sourceKey);
  if (!source.url) {
    const result = { sourceKey, status: "unavailable" as const, error: "No source URL configured" };
    markCollectorFailure(sourceKey, result.error, result.error);
    return result;
  }

  if (sourceKey === "sec-edgar-tickers") {
    try {
      const result = await fetchSecTickerMap();
      if (result.status !== "fresh") throw new Error(result.error ?? "SEC ticker map unavailable");
      const rawPayload = result.body.slice(0, MAX_BODY_LENGTH);
      await saveSourceRecord({ id: stableId(sourceKey, "company-tickers"), sourceKey, sourceUrl: source.url, documentName: "company_tickers.json", recordType: "sec-ticker-map", externalId: "company-tickers", retrievedAt, freshnessStatus: "fresh", rawPayload, normalizedPayload: JSON.stringify({ records: result.records, retrievedAt: result.retrievedAt }), dataHash: createHash("sha256").update(rawPayload).digest("hex"), parserVersion: "sec-edgar-v1", errorMessage: null });
      markCollectorSuccess(sourceKey, result.records.length);
      return { sourceKey, status: "fresh" as const, records: result.records.length, source: source.url, retrievedAt: retrievedAt.toISOString() };
    } catch (error) {
      markCollectorFailure(sourceKey, error);
      return { sourceKey, status: "error" as const, error: String(error), retrievedAt: retrievedAt.toISOString() };
    }
  }

  if (sourceKey === "nse-announcements-rss") {
    try {
      const response = await fetchWithRetry(source.url, { headers: { Accept: "application/rss+xml, application/xml, text/xml" } }, { key: sourceKey });
      const body = (await response.text()).slice(0, MAX_BODY_LENGTH);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const items = parseRssItems(body);
      let stored = 0;
      for (const item of items) {
        const itemPayload = JSON.stringify(item);
        const publishedAt = item.pubDate ? new Date(item.pubDate) : null;
        await saveSourceRecord({
          id: stableId(sourceKey, item.guid),
          sourceKey,
          sourceUrl: item.link || source.url,
          documentName: "Online_announcements.xml",
          recordType: "corporate-announcement",
          externalId: item.guid,
          title: item.title || null,
          publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
          retrievedAt,
          freshnessStatus: "fresh",
          rawPayload: itemPayload,
          dataHash: createHash("sha256").update(itemPayload).digest("hex"),
          parserVersion: "nse-rss-v1",
          normalizedPayload: JSON.stringify({ title: item.title, description: item.description, url: item.link, publishedAt: item.pubDate }),
          errorMessage: null,
        });
        stored += 1;
      }
      markCollectorSuccess(sourceKey, stored);
      return { sourceKey, status: "fresh" as const, itemsFound: items.length, itemsStored: stored, source: source.url, retrievedAt: retrievedAt.toISOString() };
    } catch (error) {
      markCollectorFailure(sourceKey, error);
      return { sourceKey, status: "error" as const, error: String(error), retrievedAt: retrievedAt.toISOString() };
    }
  }

  if (sourceKey === "nse-fii-dii") {
    const report = await fetchNseInstitutionalFlows();
    const rawPayload = JSON.stringify(report).slice(0, MAX_BODY_LENGTH);
    await saveSourceRecord({
      id: stableId(sourceKey, report.reportDate ?? retrievedAt.toISOString()),
      sourceKey,
      sourceUrl: report.source,
      documentName: "nse-fii-dii-report",
      recordType: "institutional-flow-report",
      externalId: report.reportDate,
      reportDate: report.reportDate ? new Date(`${report.reportDate}T00:00:00.000Z`) : null,
      retrievedAt,
      freshnessStatus: report.status,
      rawPayload,
      dataHash: createHash("sha256").update(rawPayload).digest("hex"),
      parserVersion: "nse-flow-v1",
      normalizedPayload: JSON.stringify(report.rows),
      errorMessage: report.error,
    });
    markCollectorSuccess(sourceKey, report.rows.length);
    return report;
  }

  try {
    const response = await fetchWithRetry(source.url, { headers: { Accept: "text/html,application/xhtml+xml" } }, { key: sourceKey });
    const body = (await response.text()).slice(0, MAX_BODY_LENGTH);
    const status = response.ok ? "fresh" : "error";
    const externalId = `${response.status}:${retrievedAt.toISOString().slice(0, 10)}`;
    await saveSourceRecord({
      id: stableId(sourceKey, externalId),
      sourceKey,
      sourceUrl: source.url,
      documentName: source.name.slice(0, 255),
      recordType: "official-source-page",
      externalId,
      title: pageTitle(body),
      retrievedAt,
      freshnessStatus: status,
      rawPayload: body,
      dataHash: createHash("sha256").update(body).digest("hex"),
      parserVersion: "official-page-v1",
      normalizedPayload: JSON.stringify({ httpStatus: response.status, contentType: response.headers.get("content-type") ?? "", title: pageTitle(body), tables: extractHtmlTables(body) }),
      errorMessage: response.ok ? null : `HTTP ${response.status}`,
    });
    markCollectorSuccess(sourceKey, 1);
    return { sourceKey, status, httpStatus: response.status, title: pageTitle(body), retrievedAt: retrievedAt.toISOString() };
  } catch (error) {
    markCollectorFailure(sourceKey, error);
    markCollectorParsingError(sourceKey, error);
    return { sourceKey, status: "error" as const, error: String(error), retrievedAt: retrievedAt.toISOString() };
  }
}

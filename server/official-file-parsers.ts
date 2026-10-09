import { createHash } from "node:crypto";

export type OfficialFileStatus = "parsed" | "stale" | "unavailable" | "schema-mismatch";
export type OfficialFileProvenance = { sourceUrl: string; retrievedAt: string; reportDate: string | null; dataHash: string; parserVersion: string };
export type OfficialFileResult<T> = { status: OfficialFileStatus; rows: T[]; warnings: string[]; provenance: OfficialFileProvenance };

export type NseInstitutionalRow = { segment: string; participant: "FII/FPI" | "DII"; buyValue: number; sellValue: number; netValue: number; reportDate: string | null };
export type NsdlSectorRow = { sector: string; aucPreviousInrCr: number | null; netInvestmentPeriodInrCr: number | null; aucCurrentInrCr: number | null; reportDate: string | null; reportPeriodLabel: string | null };
export type AmfiPortfolioRow = { disclosureType: "fortnightly" | "monthly" | "half-yearly"; period: string | null; scheme: string | null; amc: string | null; security: string; isin: string | null; units: number | null; marketValueInr: number | null; weightPct: number | null };

const num = (value: string | undefined) => {
  if (!value) return null;
  const cleaned = value.replace(/[,₹%\s]/g, "").replace(/[()]/g, "-");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};
const clean = (value: string | undefined) => (value ?? "").replace(/^\uFEFF/, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
const hash = (body: string) => createHash("sha256").update(body).digest("hex");
const provenance = (sourceUrl: string, body: string, reportDate: string | null, parserVersion: string): OfficialFileProvenance => ({ sourceUrl, retrievedAt: new Date().toISOString(), reportDate, dataHash: hash(body), parserVersion });
const splitCsv = (line: string) => line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map((value) => clean(value.replace(/^\"|\"$/g, "")));
const rowsFromCsv = (body: string) => body.split(/\r?\n/).map(splitCsv).filter((row) => row.some(Boolean));
const headerIndex = (headers: string[], names: string[]) => headers.findIndex((header) => names.some((name) => slug(header).includes(slug(name))));

export function parseNseInstitutionalCsv(body: string, sourceUrl: string, reportDate: string | null = null): OfficialFileResult<NseInstitutionalRow> {
  const rows = rowsFromCsv(body);
  const headerAt = rows.findIndex((row) => row.some((cell) => /buy|purchase/i.test(cell)) && row.some((cell) => /sell|sale/i.test(cell)));
  const headers = headerAt >= 0 ? rows[headerAt] : [];
  const participantIndex = headerIndex(headers, ["participant", "category", "investor"]);
  const buyIndex = headerIndex(headers, ["buy", "purchase"]);
  const sellIndex = headerIndex(headers, ["sell", "sale"]);
  const netIndex = headerIndex(headers, ["net"]);
  const segmentIndex = headerIndex(headers, ["segment", "market"]);
  const warnings: string[] = [];
  if (headerAt < 0 || participantIndex < 0 || buyIndex < 0 || sellIndex < 0) {
    warnings.push("NSE institutional CSV schema did not expose participant, buy, and sell columns.");
    return { status: "schema-mismatch", rows: [], warnings, provenance: provenance(sourceUrl, body, reportDate, "nse-institutional-csv-v1") };
  }
  const parsed = rows.slice(headerAt + 1).map((row) => {
    const participantRaw = row[participantIndex] ?? "";
    const participant = /dii|domestic/i.test(participantRaw) ? "DII" : /fii|fpi|foreign/i.test(participantRaw) ? "FII/FPI" : null;
    const buyValue = num(row[buyIndex]);
    const sellValue = num(row[sellIndex]);
    if (!participant || buyValue === null || sellValue === null) return null;
    return { segment: row[segmentIndex] ?? "Capital Market", participant, buyValue, sellValue, netValue: netIndex >= 0 && num(row[netIndex]) !== null ? (num(row[netIndex]) as number) : buyValue - sellValue, reportDate };
  }).filter((row): row is NseInstitutionalRow => Boolean(row));
  if (!parsed.length) warnings.push("NSE institutional CSV contained no participant rows after schema validation.");
  return { status: parsed.length ? "parsed" : "schema-mismatch", rows: parsed, warnings, provenance: provenance(sourceUrl, body, reportDate, "nse-institutional-csv-v1") };
}

export function parseNsdlSectorHtml(body: string, sourceUrl: string, reportDate: string | null = null, reportPeriodLabel: string | null = null): OfficialFileResult<NsdlSectorRow> {
  const table = body.match(/<table\b[^>]*>[\s\S]*?<\/table>/i)?.[0] ?? body;
  const trs = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => [...match[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map((cell) => clean(cell[1]))).filter((row) => row.length >= 4);
  const header = trs.find((row) => row.some((cell) => /sector/i.test(cell)) && row.some((cell) => /auc|investment/i.test(cell)));
  const warnings: string[] = [];
  if (!header) {
    warnings.push("NSDL report did not expose a sector/AUC/investment header row.");
    return { status: "schema-mismatch", rows: [], warnings, provenance: provenance(sourceUrl, body, reportDate, "nsdl-sector-html-v1") };
  }
  const sectorIndex = header.findIndex((cell) => /sector/i.test(cell));
  const data = trs.slice(trs.indexOf(header) + 1).map((row): NsdlSectorRow | null => {
    const sector = row[sectorIndex] ?? "";
    if (!sector || /grand total|note:/i.test(sector)) return null;
    const values: number[] = row.filter((cell, index) => index !== sectorIndex).map((cell) => num(cell)).filter((v): v is number => v !== null);
    if (values.length >= 3 && /^sr\.?\s*no|serial/i.test(header[0] ?? "")) values.shift();
    if (values.length < 2) return null;
    const netInvestmentPeriodInrCr = values.length >= 4 ? (values[1] ?? 0) + (values[2] ?? 0) : values[1] ?? null;
    const aucCurrentInrCr = values.length >= 3 ? values[values.length - 1] ?? null : null;
    return { sector, aucPreviousInrCr: values[0] ?? null, netInvestmentPeriodInrCr, aucCurrentInrCr, reportDate, reportPeriodLabel };
  }).filter((row): row is NsdlSectorRow => Boolean(row));
  if (!data.length) warnings.push("NSDL report contained no sector rows after validation.");
  return { status: data.length ? "parsed" : "schema-mismatch", rows: data, warnings, provenance: provenance(sourceUrl, body, reportDate, "nsdl-sector-html-v1") };
}

export function parseAmfiPortfolioCsv(body: string, sourceUrl: string, disclosureType: AmfiPortfolioRow["disclosureType"], period: string | null = null): OfficialFileResult<AmfiPortfolioRow> {
  const rows = rowsFromCsv(body);
  const headerAt = rows.findIndex((row) => row.some((cell) => /security|company|instrument/i.test(cell)) && row.some((cell) => /isin|value|units|weight/i.test(cell)));
  const headers = headerAt >= 0 ? rows[headerAt] : [];
  const securityIndex = headerIndex(headers, ["security", "company", "instrument"]);
  const isinIndex = headerIndex(headers, ["isin"]);
  const unitsIndex = headerIndex(headers, ["units", "quantity"]);
  const valueIndex = headerIndex(headers, ["market value", "value"]);
  const weightIndex = headerIndex(headers, ["weight"]);
  const schemeIndex = headerIndex(headers, ["scheme", "fund"]);
  const amcIndex = headerIndex(headers, ["amc", "asset management"]);
  const warnings: string[] = [];
  if (headerAt < 0 || securityIndex < 0) {
    warnings.push("AMFI portfolio file did not expose a security/company/instrument column.");
    return { status: "schema-mismatch", rows: [], warnings, provenance: provenance(sourceUrl, body, period, "amfi-portfolio-csv-v1") };
  }
  const data = rows.slice(headerAt + 1).map((row) => {
    const security = row[securityIndex] ?? "";
    if (!security || /^total|^grand total/i.test(security)) return null;
    return { disclosureType, period, scheme: schemeIndex >= 0 ? row[schemeIndex] ?? null : null, amc: amcIndex >= 0 ? row[amcIndex] ?? null : null, security, isin: isinIndex >= 0 ? row[isinIndex] ?? null : null, units: unitsIndex >= 0 ? num(row[unitsIndex]) : null, marketValueInr: valueIndex >= 0 ? num(row[valueIndex]) : null, weightPct: weightIndex >= 0 ? num(row[weightIndex]) : null };
  }).filter((row): row is AmfiPortfolioRow => Boolean(row));
  if (!data.length) warnings.push("AMFI portfolio file contained no security rows after validation.");
  return { status: data.length ? "parsed" : "schema-mismatch", rows: data, warnings, provenance: provenance(sourceUrl, body, period, "amfi-portfolio-csv-v1") };
}

export function parseResolvedOfficialFile(input: { sourceKey: "nse-fii-dii" | "nsdl-fpi-sector" | "amfi-portfolio-disclosure"; body: string; sourceUrl: string; reportDate?: string | null; reportPeriodLabel?: string | null; disclosureType?: AmfiPortfolioRow["disclosureType"]; period?: string | null }) {
  if (input.sourceKey === "nse-fii-dii") return parseNseInstitutionalCsv(input.body, input.sourceUrl, input.reportDate ?? null);
  if (input.sourceKey === "nsdl-fpi-sector") return parseNsdlSectorHtml(input.body, input.sourceUrl, input.reportDate ?? null, input.reportPeriodLabel ?? null);
  return parseAmfiPortfolioCsv(input.body, input.sourceUrl, input.disclosureType ?? "monthly", input.period ?? input.reportDate ?? null);
}

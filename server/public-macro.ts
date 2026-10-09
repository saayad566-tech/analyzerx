export type PublicMacroObservation = {
  source: "ECB" | "OECD";
  seriesId: string;
  period: string;
  value: number | null;
  unit: string | null;
  frequency: string | null;
  dimensions: Record<string, string>;
  sourceUrl: string;
};

function splitCsvLine(line: string) {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { fields.push(current); current = ""; }
    else current += char;
  }
  fields.push(current);
  return fields.map((value) => value.trim());
}

function parseCsv(text: string) {
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).map(splitCsvLine);
}

function numberOrNull(value: string | undefined) {
  if (!value || value === ".." || value.toLowerCase() === "nan") return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRows(text: string, source: "ECB" | "OECD", sourceUrl: string, periodNames: string[], valueNames: string[], unitNames: string[], frequencyNames: string[], seriesNames: string[]) {
  const rows = parseCsv(text);
  const header = rows[0] ?? [];
  const indexOf = (...names: string[]) => names.map((name) => header.findIndex((item) => item.toUpperCase() === name)).find((index) => index >= 0) ?? -1;
  const periodIndex = indexOf(...periodNames);
  const valueIndex = indexOf(...valueNames);
  const unitIndex = indexOf(...unitNames);
  const frequencyIndex = indexOf(...frequencyNames);
  const seriesIndex = indexOf(...seriesNames);
  if (periodIndex < 0 || valueIndex < 0) return [];
  return rows.slice(1).flatMap((row): PublicMacroObservation[] => {
    const period = row[periodIndex] ?? "";
    if (!period) return [];
    const dimensions: Record<string, string> = {};
    header.forEach((name, index) => { if (name && index !== valueIndex && row[index]) dimensions[name] = row[index]; });
    return [{ source, seriesId: seriesIndex >= 0 ? row[seriesIndex] ?? source : source, period, value: numberOrNull(row[valueIndex]), unit: unitIndex >= 0 ? row[unitIndex] ?? null : null, frequency: frequencyIndex >= 0 ? row[frequencyIndex] ?? null : null, dimensions, sourceUrl }];
  });
}

export function parseEcbSdmxCsv(text: string, sourceUrl = "https://data-api.ecb.europa.eu/service/data") {
  return parseRows(text, "ECB", sourceUrl, ["TIME_PERIOD", "TIME_PERIOD_START"], ["OBS_VALUE", "VALUE"], ["UNIT", "UNIT_MEASURE"], ["FREQ", "FREQUENCY"], ["KEY", "SERIES_KEY", "DATAFLOW"]);
}

export function parseOecdSdmxCsv(text: string, sourceUrl = "https://sdmx.oecd.org/public/rest/v1/data") {
  return parseRows(text, "OECD", sourceUrl, ["TIME_PERIOD", "TIME"], ["OBS_VALUE", "VALUE"], ["UNIT_MEASURE", "UNIT"], ["FREQ", "FREQUENCY"], ["SERIES_KEY", "SERIES", "DATAFLOW"]);
}

export function summarizePublicMacro(observations: PublicMacroObservation[]) {
  const valid = observations.filter((item) => item.value !== null && Number.isFinite(item.value));
  return {
    source: observations[0]?.source ?? null,
    count: observations.length,
    validCount: valid.length,
    latestPeriod: observations.map((item) => item.period).sort().at(-1) ?? null,
    latestValue: [...valid].sort((left, right) => left.period.localeCompare(right.period)).at(-1)?.value ?? null,
    units: [...new Set(observations.map((item) => item.unit).filter((unit): unit is string => Boolean(unit)))],
  };
}

function periodToDate(period: string) {
  const normalized = /^\d{4}-\d{2}$/.test(period) ? `${period}-01` : /^\d{4}$/.test(period) ? `${period}-12-31` : period;
  const parsed = new Date(`${normalized}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function assessMacroFreshness(observations: PublicMacroObservation[], now = new Date()) {
  const latestPeriod = summarizePublicMacro(observations).latestPeriod;
  if (!latestPeriod) return { status: "unavailable" as const, ageDays: null };
  const date = periodToDate(latestPeriod);
  if (!date) return { status: "stale" as const, ageDays: null };
  const ageDays = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
  return { status: ageDays <= 45 ? "fresh" as const : "stale" as const, ageDays };
}

export type PublicMacroProviderHealth = {
  status: "live" | "stale" | "unavailable";
  sourceUrl: string;
  observations: PublicMacroObservation[];
  summary: ReturnType<typeof summarizePublicMacro>;
  freshness: { status: "fresh" | "stale" | "unavailable"; ageDays: number | null };
  latencyMs: number | null;
  error: string | null;
};

export type PublicMacroContext = {
  checkedAt: string;
  ecb: PublicMacroProviderHealth;
  oecd: PublicMacroProviderHealth;
};

async function fetchCsv(url: string) {
  const startedAt = Date.now();
  const response = await fetch(url, { headers: { Accept: "text/csv,application/json", "User-Agent": "AnalyzerX/1.0" }, signal: AbortSignal.timeout(12_000) });
  const latencyMs = Date.now() - startedAt;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { text: await response.text(), latencyMs };
}

function health(sourceUrl: string, observations: PublicMacroObservation[], latencyMs: number | null, error: string | null): PublicMacroProviderHealth {
  const summary = summarizePublicMacro(observations);
  const freshness = assessMacroFreshness(observations);
  const status = !observations.length || !summary.validCount ? "unavailable" : freshness.status === "stale" ? "stale" : "live";
  return { status, sourceUrl, observations: observations.slice(-24), summary, freshness, latencyMs, error: error ?? (!observations.length ? "No parseable observations" : !summary.validCount ? "Only null or non-numeric observations" : null) };
}

export async function fetchPublicMacroContext(): Promise<PublicMacroContext> {
  const ecbUrl = "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=csvdata&startPeriod=2026-01-01";
  const oecdUrl = "https://sdmx.oecd.org/public/rest/v1/data/OECD.SDD.STES,DSD_STES@DF_FINMARK,/.?startPeriod=2026-01&format=csvfile";
  const [ecbResult, oecdResult] = await Promise.allSettled([fetchCsv(ecbUrl), fetchCsv(oecdUrl)]);
  const ecbObservations = ecbResult.status === "fulfilled" ? parseEcbSdmxCsv(ecbResult.value.text, ecbUrl) : [];
  const oecdObservations = oecdResult.status === "fulfilled" ? parseOecdSdmxCsv(oecdResult.value.text, oecdUrl) : [];
  return {
    checkedAt: new Date().toISOString(),
    ecb: health(ecbUrl, ecbObservations, ecbResult.status === "fulfilled" ? ecbResult.value.latencyMs : null, ecbResult.status === "rejected" ? String(ecbResult.reason) : null),
    oecd: health(oecdUrl, oecdObservations, oecdResult.status === "fulfilled" ? oecdResult.value.latencyMs : null, oecdResult.status === "rejected" ? String(oecdResult.reason) : null),
  };
}

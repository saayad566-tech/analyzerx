import type { Href } from "expo-router";

export type ResearchEvidenceNavigationInput = {
  kind: string;
  label: string;
  source?: string | null;
  url?: string | null;
  payload?: Record<string, unknown> | null;
};

export type ResearchEvidenceNavigation =
  | { type: "route"; href: Href; label: string }
  | { type: "external"; url: string; label: string }
  | { type: "unavailable"; label: string; reason: string };

function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function safeSymbol(payload: Record<string, unknown> | null | undefined): string | null {
  const value = payload?.symbol ?? payload?.resolvedSymbol;
  return typeof value === "string" && /^[A-Za-z0-9.-]{1,20}$/.test(value) ? value.toUpperCase() : null;
}

export function getResearchEvidenceNavigation(input: ResearchEvidenceNavigationInput): ResearchEvidenceNavigation {
  const payload = input.payload ?? {};
  const symbol = safeSymbol(payload);
  if (input.kind === "filing" && symbol) return { type: "route", href: { pathname: "/filings/[symbol]", params: { symbol } }, label: "Open filing details" };
  if (input.kind === "flow") return { type: "route", href: "/(tabs)/flows", label: "Open Market Flows" };
  if (input.kind === "fundamental" && symbol) return { type: "route", href: { pathname: "/company/[symbol]", params: { symbol } }, label: "Open company context" };
  const url = safeUrl(input.url ?? payload.url ?? payload.sourceUrl);
  if (url) return { type: "external", url, label: "Open original source" };
  return { type: "unavailable", label: "Source unavailable", reason: "No validated destination was returned for this evidence." };
}

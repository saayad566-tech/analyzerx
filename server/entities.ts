import { createHash } from "node:crypto";
import { getEntityBySymbol, getEntityByAlias, upsertEntity } from "./db";
import type { Entity } from "../drizzle/schema";

export type EntityResolution = { entity: Entity | null; status: "verified" | "partial" | "unresolved"; reason: string };

const knownNames: Record<string, { name: string; exchange?: string; sector?: string }> = {
  LT: { name: "Larsen & Toubro", exchange: "NSE", sector: "Engineering & construction" },
  WAAREEENER: { name: "Waaree Energies", exchange: "NSE", sector: "Renewable energy" },
  TITAGARH: { name: "Titagarh Rail Systems", exchange: "NSE", sector: "Capital goods" },
  HAL: { name: "Hindustan Aeronautics", exchange: "NSE", sector: "Defence" },
  RELIANCE: { name: "Reliance Industries", exchange: "NSE", sector: "Diversified" },
  TATAMOTORS: { name: "Tata Motors", exchange: "NSE", sector: "Automobiles" },
};

function normalize(value: string) { return value.trim().toUpperCase().replace(/[^A-Z0-9.-]+/g, ""); }
function entityId(symbol: string) { return `entity-${createHash("sha256").update(normalize(symbol)).digest("hex").slice(0, 80)}`; }

export function buildEntity(symbol: string, options: { name?: string; exchange?: string; sector?: string; aliases?: string[]; sourceRecordId?: string; sourceUrl?: string; confidenceScore?: number } = {}) {
  const canonicalSymbol = normalize(symbol);
  const known = knownNames[canonicalSymbol];
  const canonicalName = options.name?.trim() || known?.name || canonicalSymbol;
  const aliases = [...new Set([canonicalSymbol, canonicalName, ...(options.aliases ?? [])].map(normalize).filter(Boolean))];
  return { id: entityId(canonicalSymbol), canonicalSymbol, canonicalName, entityType: "company" as const, exchange: options.exchange ?? known?.exchange ?? null, country: "India", sector: options.sector ?? known?.sector ?? null, resolutionStatus: known || options.name ? "partial" as const : "unresolved" as const, aliasesJson: JSON.stringify(aliases), identifiersJson: JSON.stringify({ symbol: canonicalSymbol, exchange: options.exchange ?? known?.exchange ?? null }), sourceRecordId: options.sourceRecordId ?? null, sourceUrl: options.sourceUrl ?? null, confidenceScore: Math.max(0, Math.min(100, options.confidenceScore ?? (known ? 85 : options.name ? 65 : 20))), lastVerifiedAt: options.sourceUrl ? new Date() : null };
}

export async function resolveEntity(input: string): Promise<EntityResolution> {
  const normalized = normalize(input);
  if (!normalized) return { entity: null, status: "unresolved", reason: "The entity input is empty." };
  const direct = await getEntityBySymbol(normalized);
  if (direct) return { entity: direct, status: direct.resolutionStatus === "inactive" ? "unresolved" : direct.resolutionStatus, reason: direct.resolutionStatus === "inactive" ? "The exact entity is persisted but marked inactive." : "Matched the canonical entity symbol." };
  const alias = await getEntityByAlias(normalized);
  if (alias) return { entity: alias, status: alias.resolutionStatus === "inactive" ? "unresolved" : alias.resolutionStatus, reason: alias.resolutionStatus === "inactive" ? "The exact alias resolves to an inactive entity." : "Matched an exact persisted alias; no fuzzy merge was performed." };
  const known = knownNames[normalized];
  if (known) {
    const created = buildEntity(normalized, known);
    await upsertEntity(created);
    const persisted = await getEntityBySymbol(normalized);
    return { entity: persisted ?? null, status: "partial", reason: "Created from the bounded verified symbol directory; additional source confirmation is still required." };
  }
  return { entity: null, status: "unresolved", reason: "No exact canonical symbol or alias is persisted; the platform will not silently merge this input." };
}

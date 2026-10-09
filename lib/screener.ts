export type FilterKey =
  | "quality"
  | "growth"
  | "balance"
  | "cash"
  | "valuation"
  | "expansion"
  | "capacityExpansion"
  | "newSector"
  | "orderBook"
  | "largeOrder"
  | "corporateFinancial"
  | "macroTechnical";

export type ScreenerCandidate = {
  symbol: string;
  name: string;
  sector: string;
  metricsAvailable: boolean;
  redFlags: string[];
  evidence: string[];
  expansionSignal: boolean;
  triggerKeys: FilterKey[];
  verifiedFilters?: FilterKey[];
};

export function passesResearchFilter(candidate: ScreenerCandidate, enabledFilters: FilterKey[]) {
  if (enabledFilters.length === 0) return true;
  return enabledFilters.every((filter) => {
    if (filter === "quality" || filter === "growth" || filter === "balance" || filter === "cash" || filter === "valuation") {
      return candidate.metricsAvailable && candidate.verifiedFilters?.includes(filter) === true;
    }
    if (filter === "expansion") return candidate.expansionSignal;
    return candidate.triggerKeys.includes(filter);
  });
}

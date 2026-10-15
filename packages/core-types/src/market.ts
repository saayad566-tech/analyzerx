/**
 * The market identifiers AnalyzerX can be scoped to.
 *
 * Declared here — in the shared package — so both the application and the quant engine depend on
 * the same union. The engine must never import from the application's own `lib/`.
 */
export type MarketId = "IN" | "US" | "GB" | "CA" | "AU" | "JP" | "SG" | "HK" | "DE" | "FR";

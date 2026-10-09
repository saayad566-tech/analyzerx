export type InstitutionalSource = {
  id: string;
  publisher: string;
  sourceType: "exchange" | "company-ir" | "regulator" | "government" | "market-data";
  url: string;
  modules: string[];
  priority: "primary" | "fallback";
  accessNote: string;
};

export const INSTITUTIONAL_SOURCE_CATALOG: InstitutionalSource[] = [
  { id: "nse-corporate-filings", publisher: "NSE India", sourceType: "exchange", url: "https://www.nseindia.com/companies-listing/corporate-filings-annual-reports", modules: ["filings", "financials", "corporate-actions", "ownership", "regulatory"], priority: "primary", accessNote: "Prefer official downloadable filings/XBRL; respect rate limits and exchange access policies." },
  { id: "bse-corporate-filings", publisher: "BSE India", sourceType: "exchange", url: "https://www.bseindia.com/corporates/Comp_Resultsnew.aspx", modules: ["filings", "financials", "corporate-actions", "ownership", "regulatory"], priority: "primary", accessNote: "Use dated exchange disclosures and retain the filing or announcement reference." },
  { id: "company-investor-relations", publisher: "Issuer investor-relations site", sourceType: "company-ir", url: "", modules: ["filings", "earnings-call", "financials", "corporate-actions"], priority: "primary", accessNote: "Resolve the issuer’s official investor-relations URL before retrieval; never substitute an unrelated company page." },
  { id: "mca-company-master", publisher: "Ministry of Corporate Affairs", sourceType: "government", url: "https://www.mca.gov.in/", modules: ["new-entity", "corporate-actions"], priority: "fallback", accessNote: "Useful for incorporation and charge records; availability and access may require an interactive session." },
  { id: "sebi-orders", publisher: "SEBI", sourceType: "regulator", url: "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes", modules: ["regulatory"], priority: "primary", accessNote: "Use dated orders/releases and retain thread-level status." },
  { id: "company-ir-earnings", publisher: "Issuer investor-relations site", sourceType: "company-ir", url: "", modules: ["earnings-call"], priority: "primary", accessNote: "Latest call transcript/audio and investor presentation; if missing, use the most recent dated call and disclose the gap." },
  { id: "quartr-events", publisher: "Quartr", sourceType: "market-data", url: "https://quartr.com/", modules: ["earnings-call"], priority: "fallback", accessNote: "Use only when the attached/configured source is available; label the source tier." },
  { id: "exchange-shareholding", publisher: "NSE/BSE exchange filings", sourceType: "exchange", url: "", modules: ["ownership"], priority: "primary", accessNote: "Require latest quarter, prior quarter, and promoter-pledge disclosure dates." },
  { id: "exchange-regulatory", publisher: "NSE/BSE exchange disclosures", sourceType: "exchange", url: "", modules: ["regulatory"], priority: "primary", accessNote: "Track each proceeding independently with status and last update." },
];

export function sourcesRequiredFor(module: string): InstitutionalSource[] {
  return INSTITUTIONAL_SOURCE_CATALOG.filter((source) => source.modules.includes(module));
}

export function requiredSourceNote(module: string): string {
  const names = sourcesRequiredFor(module).map((source) => source.publisher).join(", ");
  return `Requires a named, dated record from: ${names || "an official primary source"}.`;
}

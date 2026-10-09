import { getSourceCatalog } from "./source-catalog";
import { ingestCatalogSource } from "./source-ingestion";

export type CollectorStatus = "ready" | "page-snapshot" | "blocked-unresolved-download";

export type NseCollectorDescriptor = {
  key: string;
  dataset: string;
  status: CollectorStatus;
  sourceKey: string;
  capabilities: string[];
  limitation: string;
};

const collectors: NseCollectorDescriptor[] = [
  { key: "fii-dii", dataset: "FII/FPI and DII activity", status: "ready", sourceKey: "nse-fii-dii", capabilities: ["daily", "JSON/CSV normalization", "business-day freshness"], limitation: "Direct NSE machine-readable endpoint must be authorized and configured; otherwise the NSE-sourced fallback is used." },
  { key: "bhavcopy", dataset: "CM-UDiFF bhavcopy", status: "blocked-unresolved-download", sourceKey: "nse-all-reports", capabilities: ["source catalog", "provenance storage"], limitation: "Current dynamic download link must be resolved and validated before automated collection; obsolete hard-coded URLs are not used." },
  { key: "delivery", dataset: "Security-wise delivery", status: "blocked-unresolved-download", sourceKey: "nse-all-reports", capabilities: ["source catalog", "provenance storage"], limitation: "Current dynamic download link must be resolved and validated before automated collection." },
  { key: "bulk-deals", dataset: "Bulk deals", status: "blocked-unresolved-download", sourceKey: "nse-all-reports", capabilities: ["source catalog", "provenance storage"], limitation: "Current dynamic download link must be resolved and validated before automated collection." },
  { key: "block-deals", dataset: "Block deals", status: "blocked-unresolved-download", sourceKey: "nse-all-reports", capabilities: ["source catalog", "provenance storage"], limitation: "Current dynamic download link must be resolved and validated before automated collection." },
  { key: "announcements-rss", dataset: "Corporate announcements RSS", status: "ready", sourceKey: "nse-announcements-rss", capabilities: ["RSS", "incremental GUID deduplication", "raw provenance"], limitation: "The official feed may be intermittently protected; access restrictions are reported rather than bypassed." },
  { key: "announcements", dataset: "Corporate announcements", status: "page-snapshot", sourceKey: "nse-announcements", capabilities: ["page snapshot", "raw provenance"], limitation: "Document attachments and current network download mechanisms require separate validated resolution." },
  { key: "corporate-actions", dataset: "Corporate actions", status: "page-snapshot", sourceKey: "nse-actions", capabilities: ["page snapshot", "raw provenance"], limitation: "Page metadata is collectible; full action records require the current official data endpoint." },
  { key: "results", dataset: "Financial results", status: "page-snapshot", sourceKey: "nse-results", capabilities: ["page snapshot", "raw provenance"], limitation: "Full result documents require current official filing/download resolution." },
  { key: "shareholding", dataset: "Shareholding patterns", status: "page-snapshot", sourceKey: "nse-shareholding", capabilities: ["page snapshot", "quarterly freshness"], limitation: "Full structured shareholding records require current official download resolution." },
  { key: "board-meetings", dataset: "Board meetings", status: "page-snapshot", sourceKey: "nse-board-meetings", capabilities: ["page snapshot", "raw provenance"], limitation: "Full meeting attachments require current official filing/download resolution." },
];

export function getNseCollectorRegistry() {
  const sources = getSourceCatalog();
  return collectors.map((collector) => ({ ...collector, configured: sources.some((source) => source.key === collector.sourceKey && source.configured) }));
}

export async function runNseCollector(key: string) {
  const collector = collectors.find((item) => item.key === key);
  if (!collector) throw new Error(`Unknown NSE collector: ${key}`);
  if (collector.status === "blocked-unresolved-download") return { ...collector, executed: false, status: collector.status };
  const result = await ingestCatalogSource(collector.sourceKey);
  return { ...collector, executed: true, result };
}

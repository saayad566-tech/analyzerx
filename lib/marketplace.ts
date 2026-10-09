export type MarketplaceCategory = "data" | "research" | "analysis" | "portfolio" | "news" | "reports" | "assistant" | "operations";
export type MarketplacePlatform = "windows-x64" | "linux-x64" | "macos-arm64" | "android-arm64" | "cpu";
export type MarketplaceBackend = "cuda" | "rocm" | "mps" | "gpu" | "npu" | "cpu" | "unknown";
export type CompatibilityStatus = "recommended" | "reduced" | "unsupported" | "not-installed";
export type InstallState = "not-installed" | "installing" | "installed" | "updating" | "failed";

export interface MarketplaceHardwareProfile {
  platform: MarketplacePlatform;
  os: string;
  architecture: string;
  cpuModel: string | null;
  cpuCores: number | null;
  totalMemoryBytes: number | null;
  freeStorageBytes: number | null;
  backend: MarketplaceBackend;
  gpuName: string | null;
  vramBytes: number | null;
  driverVersion: string | null;
  hostConnected: boolean;
  capturedAt: string;
}

export interface MarketplaceArtifact {
  id: string;
  url: string | null;
  sha256: string | null;
  sizeBytes: number | null;
  license: string;
  attribution: string;
  redistribution: "allowed" | "restricted" | "verify-first";
}

export interface MarketplaceTool {
  id: string;
  name: string;
  category: MarketplaceCategory;
  publisher: string;
  description: string;
  capabilities: readonly string[];
  platforms: readonly MarketplacePlatform[];
  backends: readonly MarketplaceBackend[];
  minRamBytes: number | null;
  minStorageBytes: number | null;
  version: string;
  releaseChannel: "verified" | "candidate" | "runtime-pending";
  runtime: string;
  artifact: MarketplaceArtifact;
  sourceUrl: string;
  safetyNote: string;
  existingAnalyzerXCapability: string;
}

export interface MarketplaceToolAssessment {
  tool: MarketplaceTool;
  status: CompatibilityStatus;
  score: number;
  reasons: string[];
  installState: InstallState;
}

export const MARKETPLACE_TOOLS: readonly MarketplaceTool[] = [
  {
    id: "yfinance-market-data",
    name: "Market Data Research Connector",
    category: "data",
    publisher: "AnalyzerX verified connector",
    description: "Research-oriented quote, OHLCV, sector, industry, search, news, and screening enrichment for symbols not covered by primary providers.",
    capabilities: ["quotes", "OHLCV", "sector discovery", "search", "research news"],
    platforms: ["windows-x64", "linux-x64", "macos-arm64", "cpu"],
    backends: ["cpu", "cuda", "rocm", "mps"],
    minRamBytes: 2_000_000_000,
    minStorageBytes: 500_000_000,
    version: "1.0.0",
    releaseChannel: "candidate",
    runtime: "Python + yfinance",
    artifact: { id: "yfinance-1.6.0", url: "https://pypi.org/project/yfinance/", sha256: "c32c45b42480d64981e89d65da3f480fd6910fe1972d7e78f1e2d91b45d9ee1b", sizeBytes: 173_500, license: "Apache-2.0", attribution: "Ran Aroussi / yfinance contributors", redistribution: "verify-first" },
    sourceUrl: "https://pypi.org/project/yfinance/",
    safetyNote: "Research and educational use only; Yahoo terms and live-data licensing boundaries apply. It never overrides verified NSE/BSE sources.",
    existingAnalyzerXCapability: "Global fallback market data and symbol research",
  },
  {
    id: "pandas-ta-indicators",
    name: "Technical Signal Library",
    category: "analysis",
    publisher: "AnalyzerX verified connector",
    description: "Computes reproducible technical indicators over source-backed OHLCV records for charts, screeners, and research reports.",
    capabilities: ["130+ indicators", "MACD", "Bollinger Bands", "VWAP", "strategy groups"],
    platforms: ["windows-x64", "linux-x64", "macos-arm64", "android-arm64", "cpu"],
    backends: ["cpu", "cuda", "rocm", "mps"],
    minRamBytes: 1_000_000_000,
    minStorageBytes: 100_000_000,
    version: "0.2.67",
    releaseChannel: "verified",
    runtime: "Python + pandas-ta",
    artifact: { id: "pandas-ta-mit", url: "https://github.com/Data-Analisis/Technical-Analysis-Indicators---Pandas", sha256: null, sizeBytes: 2_000_000, license: "MIT", attribution: "Pandas TA contributors", redistribution: "allowed" },
    sourceUrl: "https://github.com/Data-Analisis/Technical-Analysis-Indicators---Pandas",
    safetyNote: "Indicators are derived calculations and do not establish a trading signal or guarantee.",
    existingAnalyzerXCapability: "Charts, screeners, market snapshots, and report trends",
  },
  {
    id: "finbert-financial-sentiment",
    name: "Financial Sentiment Analyzer",
    category: "news",
    publisher: "ProsusAI / AnalyzerX adapter",
    description: "Local financial-domain sentiment classification for verified news and filing excerpts, with evidence attached to each label.",
    capabilities: ["positive/neutral/negative", "confidence score", "batch news ranking", "offline re-ranking"],
    platforms: ["windows-x64", "linux-x64", "macos-arm64", "cpu"],
    backends: ["cuda", "rocm", "mps", "cpu"],
    minRamBytes: 4_000_000_000,
    minStorageBytes: 2_000_000_000,
    version: "1.0.0",
    releaseChannel: "candidate",
    runtime: "Python + Transformers + PyTorch",
    artifact: { id: "ProsusAI-finbert", url: "https://huggingface.co/ProsusAI/finbert", sha256: null, sizeBytes: 500_000_000, license: "Review model card terms", attribution: "ProsusAI", redistribution: "verify-first" },
    sourceUrl: "https://huggingface.co/ProsusAI/finbert",
    safetyNote: "Sentiment is evidence, not an investment recommendation; input articles must retain their original sources.",
    existingAnalyzerXCapability: "News impact scoring and archive sentiment filters",
  },
  {
    id: "sec-edgar-filing-research",
    name: "SEC Filing & XBRL Research",
    category: "research",
    publisher: "AnalyzerX official-source adapter",
    description: "Rate-limited SEC EDGAR JSON, RSS, index, and filing retrieval for global-company research where SEC coverage applies.",
    capabilities: ["company submissions", "XBRL facts", "filing RSS", "filing timeline", "source preservation"],
    platforms: ["windows-x64", "linux-x64", "macos-arm64", "android-arm64", "cpu"],
    backends: ["cpu", "cuda", "rocm", "mps"],
    minRamBytes: 1_000_000_000,
    minStorageBytes: 500_000_000,
    version: "1.0.0",
    releaseChannel: "verified",
    runtime: "Python + SEC HTTPS/RSS adapters",
    artifact: { id: "sec-edgar-contract", url: "https://www.sec.gov/about/developer-resources", sha256: null, sizeBytes: null, license: "U.S. SEC public data terms", attribution: "U.S. Securities and Exchange Commission", redistribution: "allowed" },
    sourceUrl: "https://www.sec.gov/about/developer-resources",
    safetyNote: "Requests must identify themselves, cache efficiently, and stay within SEC fair-access limits; this does not expand Indian filing coverage.",
    existingAnalyzerXCapability: "Filing evidence, fundamentals, reports, and event projections",
  },
  {
    id: "grounded-research-assistant",
    name: "Grounded Research Assistant",
    category: "assistant",
    publisher: "AnalyzerX Local AI",
    description: "Hardware-aware local assistant for navigation, source-backed extraction, chart explanation, and research question routing without inventing unavailable values.",
    capabilities: ["plain-English questions", "local summarization", "source citations", "app actions", "offline context"],
    platforms: ["windows-x64", "linux-x64", "macos-arm64", "android-arm64", "cpu"],
    backends: ["cuda", "rocm", "mps", "cpu"],
    minRamBytes: 2_000_000_000,
    minStorageBytes: 1_000_000_000,
    version: "1.0.0",
    releaseChannel: "verified",
    runtime: "AnalyzerX Local AI adapter",
    artifact: { id: "analyzerx-local-assistant-contract", url: null, sha256: null, sizeBytes: null, license: "AnalyzerX runtime", attribution: "AnalyzerX", redistribution: "restricted" },
    sourceUrl: "https://marketevent-i4bj664j.manus.space/local-ai",
    safetyNote: "Local inference is only used when a verified model/runtime is loaded; unavailable data stays unavailable.",
    existingAnalyzerXCapability: "Assistant, Local AI model switching, and grounded market chat",
  },
  {
    id: "android-market-data-sync",
    name: "Android Market Data Sync",
    category: "data",
    publisher: "AnalyzerX mobile runtime",
    description: "Battery-aware Android sync for source-backed quotes, news, watchlists, alerts, and cached research context.",
    capabilities: ["background-safe refresh", "offline cache", "provider cooldowns", "push-ready alerts"],
    platforms: ["android-arm64"],
    backends: ["cpu", "unknown"],
    minRamBytes: 1_000_000_000,
    minStorageBytes: 100_000_000,
    version: "1.0.0",
    releaseChannel: "verified",
    runtime: "AnalyzerX Expo/Android runtime",
    artifact: { id: "analyzerx-android-data-sync", url: null, sha256: null, sizeBytes: null, license: "AnalyzerX runtime", attribution: "AnalyzerX", redistribution: "restricted" },
    sourceUrl: "https://marketevent-i4bj664j.manus.space/",
    safetyNote: "Android background execution is battery- and OS-controlled; server polling remains the always-on source for timely alerts.",
    existingAnalyzerXCapability: "Live Events, News, Watchlists, Alerts, and Market Flows",
  },
  {
    id: "android-technical-analysis",
    name: "Android Technical Analysis",
    category: "analysis",
    publisher: "AnalyzerX mobile runtime",
    description: "Offline-friendly indicator calculations over cached source-backed OHLCV data for charts and screening context.",
    capabilities: ["moving averages", "momentum", "volatility", "trend context", "low-memory mode"],
    platforms: ["android-arm64"],
    backends: ["cpu", "unknown"],
    minRamBytes: 1_000_000_000,
    minStorageBytes: 50_000_000,
    version: "1.0.0",
    releaseChannel: "verified",
    runtime: "AnalyzerX TypeScript runtime",
    artifact: { id: "analyzerx-android-indicators", url: null, sha256: null, sizeBytes: null, license: "AnalyzerX runtime", attribution: "AnalyzerX", redistribution: "restricted" },
    sourceUrl: "https://marketevent-i4bj664j.manus.space/",
    safetyNote: "Indicators are derived context only and never replace verified quotes, fundamentals, or investment judgment.",
    existingAnalyzerXCapability: "Charts, Screener, Sector Intelligence, and Company Detail",
  },
  {
    id: "android-local-sentiment",
    name: "Android Local News Re-ranker",
    category: "news",
    publisher: "AnalyzerX Local AI",
    description: "Uses an installed Android-compatible local model when available to re-rank verified news; otherwise deterministic extraction remains active.",
    capabilities: ["headline classification", "entity linking", "impact re-ranking", "offline recent cache"],
    platforms: ["android-arm64"],
    backends: ["cpu", "gpu", "npu", "unknown"],
    minRamBytes: 2_000_000_000,
    minStorageBytes: 600_000_000,
    version: "1.0.0",
    releaseChannel: "candidate",
    runtime: "LiteRT-LM / verified local model policy",
    artifact: { id: "analyzerx-android-local-news-contract", url: null, sha256: null, sizeBytes: null, license: "AnalyzerX runtime plus selected model terms", attribution: "AnalyzerX", redistribution: "restricted" },
    sourceUrl: "https://marketevent-i4bj664j.manus.space/local-ai",
    safetyNote: "The local model is an optional re-ranker. Source retrieval and truth grounding remain server/provider responsibilities.",
    existingAnalyzerXCapability: "News feed, article detail, sentiment filters, and impact scoring",
  },
  {
    id: "android-report-reader",
    name: "Android Report Reader",
    category: "reports",
    publisher: "AnalyzerX mobile runtime",
    description: "On-device report navigation, chart reading, evidence lookup, and PDF/CSV sharing with encrypted local telemetry controls.",
    capabilities: ["PDF reading", "chart context", "evidence navigation", "CSV export", "share sheet"],
    platforms: ["android-arm64"],
    backends: ["cpu", "unknown"],
    minRamBytes: 1_000_000_000,
    minStorageBytes: 100_000_000,
    version: "1.0.0",
    releaseChannel: "verified",
    runtime: "Expo FileSystem + AnalyzerX report runtime",
    artifact: { id: "analyzerx-android-report-reader", url: null, sha256: null, sizeBytes: null, license: "AnalyzerX runtime", attribution: "AnalyzerX", redistribution: "restricted" },
    sourceUrl: "https://marketevent-i4bj664j.manus.space/",
    safetyNote: "Reports show source, period, score, confidence, and evidence gaps; local viewing never fills missing values.",
    existingAnalyzerXCapability: "Research Workspace, reports, Local AI telemetry, and history",
  },
  {
    id: "institutional-flow-parser",
    name: "Institutional Flow File Parser",
    category: "data",
    publisher: "AnalyzerX official-source adapter",
    description: "Validates authorized NSE, NSDL, AMFI, and other disclosed files for FII/FPI, DII, ownership, and portfolio evidence with periodic semantics.",
    capabilities: ["CSV/HTML schema validation", "source hash", "freshness", "period labels", "stale handling"],
    platforms: ["windows-x64", "linux-x64", "macos-arm64", "android-arm64", "cpu"],
    backends: ["cpu", "cuda", "rocm", "mps"],
    minRamBytes: 1_000_000_000,
    minStorageBytes: 500_000_000,
    version: "1.0.0",
    releaseChannel: "verified",
    runtime: "AnalyzerX typed file parser",
    artifact: { id: "analyzerx-official-file-parsers", url: null, sha256: null, sizeBytes: null, license: "AnalyzerX runtime", attribution: "AnalyzerX", redistribution: "restricted" },
    sourceUrl: "https://www.nseindia.com/reports/fii-dii",
    safetyNote: "Only authorized machine-readable payloads are accepted; no stock-level or intraday inference is created from aggregate files.",
    existingAnalyzerXCapability: "Market Flows, Sector Intelligence, ownership evidence, and alerts",
  },
];

export function detectMarketplacePlatform(platformOs: string): MarketplacePlatform {
  if (platformOs === "android") return "android-arm64";
  if (platformOs === "ios") return "macos-arm64";
  return "cpu";
}

export function createFallbackMarketplaceProfile(platformOs = "unknown"): MarketplaceHardwareProfile {
  return { platform: detectMarketplacePlatform(platformOs), os: platformOs, architecture: "unknown", cpuModel: null, cpuCores: null, totalMemoryBytes: null, freeStorageBytes: null, backend: "unknown", gpuName: null, vramBytes: null, driverVersion: null, hostConnected: false, capturedAt: new Date().toISOString() };
}

export function assessMarketplaceTool(tool: MarketplaceTool, profile: MarketplaceHardwareProfile, installState: InstallState = "not-installed"): MarketplaceToolAssessment {
  const reasons: string[] = [];
  let score = 0;
  if (!tool.platforms.includes(profile.platform) && !tool.platforms.includes("cpu")) reasons.push(`This tool is not published for ${profile.platform}.`); else score += 25;
  if (tool.backends.includes(profile.backend)) score += 25; else if (profile.backend === "unknown") reasons.push("The local host has not reported an execution backend yet."); else reasons.push(`The ${profile.backend} backend is not validated for this tool.`);
  if (tool.minRamBytes !== null && profile.totalMemoryBytes !== null) { if (profile.totalMemoryBytes >= tool.minRamBytes) score += 20; else reasons.push(`Recommended system memory is at least ${Math.round(tool.minRamBytes / 1_000_000_000)} GB.`); } else reasons.push("System memory has not been reported by a connected host.");
  if (tool.minStorageBytes !== null && profile.freeStorageBytes !== null) { if (profile.freeStorageBytes >= tool.minStorageBytes) score += 20; else reasons.push(`Free storage should be at least ${Math.round(tool.minStorageBytes / 1_000_000_000)} GB.`); } else reasons.push("Free storage has not been reported by a connected host.");
  if (tool.releaseChannel === "verified") score += 10; else reasons.push(tool.releaseChannel === "candidate" ? "This adapter is a candidate and needs additional runtime validation." : "Runtime or artifact validation is pending.");
  if (tool.artifact.redistribution !== "allowed") reasons.push("License and redistribution terms require review before installation.");
  const unsupported = reasons.some((reason) => reason.includes("not published") || reason.includes("not validated"));
  return { tool, status: unsupported ? "unsupported" : installState !== "not-installed" ? "recommended" : reasons.length ? "reduced" : "recommended", score: Math.min(100, score), reasons, installState };
}

export function recommendMarketplaceTools(profile: MarketplaceHardwareProfile, installedIds: string[] = []): MarketplaceToolAssessment[] {
  return MARKETPLACE_TOOLS.map((tool) => assessMarketplaceTool(tool, profile, installedIds.includes(tool.id) ? "installed" : "not-installed")).sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name));
}

/**
 * Filing Intelligence - on-device implementation of the Global AI Financial
 * Filing Intelligence Platform PRD v1.0.
 *
 * Scope note, stated honestly: the PRD describes a multilingual web platform
 * with a server backend, a scheduler, a queue and object storage. AnalyzerX is
 * an offline-first mobile client with no backend, so this module implements the
 * parts of the PRD that are meaningful and verifiable on-device - the data
 * contracts, the deterministic calculation engine, the evidence and claim
 * model with its validators, the source registry with honest coverage states,
 * the verification panel, the eleven-section report and the safe-fallback
 * behaviour - and leaves the server-side concerns (scheduler, queue, object
 * storage, row-level security) out rather than faking them.
 */

export * from "./types";
export * from "./calculations";
export * from "./evidence";
export * from "./registry";
export * from "./report";
export * from "./from-announcement";
export * from "./company-search";
export * from "./connectors/policy";
export * from "./connectors/types";
export * from "./markets";
export * from "./verification";
export * from "./ingestion";
export * from "./sources/types";
export * from "./sources/state";
export * from "./sources/catalog";
export * from "./net/http";
export * from "./connectors/sec-edgar";
export * from "./connectors/rss";
export * from "./connectors/registry";
export * from "./connectors/cache";
export * from "./connectors/refresh";

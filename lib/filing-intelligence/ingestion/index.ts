/**
 * Ingestion pipeline (Prompt 2).
 *
 * Discovery -> retrieval envelope -> format validation -> parsing -> financial
 * tables -> version and integrity -> local store, with provenance carried
 * throughout. It reuses the connectors and the source registry from Prompt 1.
 */

export * from "./types";
export * from "./discovery";
export * from "./table";
export * from "./version";
export * from "./store";
export * from "./ocr";
export * from "./pipeline";
export * from "./parsers/detect";
export * from "./parsers/text";
export * from "./parsers/structured";
export * from "./parsers/pdf";

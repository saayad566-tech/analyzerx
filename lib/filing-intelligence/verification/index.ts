/**
 * Verification layer (Prompt 3).
 *
 * Evidence verification and the eleven-section report engine, extending the
 * existing Filing Intelligence module rather than replacing it: the claim
 * taxonomy, deep citation validation, deterministic metrics with decimal-safe
 * arithmetic, the section contract, the publication gate, translation
 * consistency, and the evidence audit report.
 */

export * from "./decimals";
export * from "./locators";
export * from "./ratios";
export * from "./citations";
export * from "./taxonomy";
export * from "./sections";
export * from "./gate";
export * from "./language";
export * from "./audit";

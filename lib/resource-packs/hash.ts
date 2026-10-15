/**
 * Compatibility shim.
 *
 * The SHA-256 implementation lives in `packages/quant-engine` so that the resource-pack integrity
 * path and the signal-history hash chain share a single implementation, and so the dependency
 * direction stays one-way (app → packages). The public API is unchanged.
 */
export { sha256Bytes, sha256Hex, sha256HexSync, sha256Text, toHex, utf8Bytes } from "../../packages/quant-engine/src/hash";

/**
 * Minimal ambient declaration for pako, which ships no types.
 * Only the surface this project uses is declared, so a wrong call fails to
 * compile rather than silently returning any.
 */
declare module "pako" {
  export function inflate(data: Uint8Array, options?: { raw?: boolean }): Uint8Array;
  export function deflate(data: Uint8Array, options?: { raw?: boolean; level?: number }): Uint8Array;
}

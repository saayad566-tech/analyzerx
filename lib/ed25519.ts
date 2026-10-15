/**
 * Ed25519 signature verification, implemented in pure TypeScript.
 *
 * Why this exists rather than a library call: `jose` is already a dependency but it is
 * used only on the server and delegates to `crypto.subtle`, whose Ed25519 support varies
 * by React Native runtime. A manifest verifier that silently cannot verify is worse than
 * none, so this module provides a path that works in every runtime and does not depend on
 * a native crypto implementation being present.
 *
 * Only VERIFICATION is implemented. Signing stays in the CI pipeline with the private
 * key, which is the whole point of the scheme — the client never holds a signing key.
 *
 * Correctness is established against the RFC 8032 section 7.1 test vectors, which are the
 * published reference values for this curve. A hand-written curve implementation that
 * passes those vectors is doing the arithmetic the standard specifies.
 *
 * Algorithm (RFC 8032, Ed25519 verification):
 *   - decode the 32-byte public key as a compressed Edwards point A
 *   - decode the 64-byte signature as R (32 bytes) || S (32 bytes)
 *   - reject unless S < L
 *   - h = SHA-512(R || A || M) mod L
 *   - accept iff [S]B == R + [h]A
 */
import { sha512 } from "./sha512";

/* ------------------------------------------------------------------ *
 * Field and group arithmetic (mod p = 2^255 - 19)
 * ------------------------------------------------------------------ */

const P = (1n << 255n) - 19n;
const L = (1n << 252n) + 27742317777372353535851937790883648493n; // group order
const D = 37095705934669439343138083508754565189542113879843219016388785533085940283555n; // -121665/121666
const SQRT_M1 = 19681161376707505956807079304988542015446066515923890162744021073123829784752n;

const mod = (a: bigint, m: bigint = P): bigint => ((a % m) + m) % m;

function powMod(base: bigint, exp: bigint, m: bigint = P): bigint {
  let result = 1n;
  let b = mod(base, m);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = mod(result * b, m);
    b = mod(b * b, m);
    e >>= 1n;
  }
  return result;
}

const invert = (a: bigint): bigint => powMod(a, P - 2n);

/** A point in extended homogeneous coordinates (X : Y : Z : T), with x = X/Z, y = Y/Z. */
type Point = { x: bigint; y: bigint; z: bigint; t: bigint };

const IDENTITY: Point = { x: 0n, y: 1n, z: 1n, t: 0n };

/** The curve's base point B. */
const BASE: Point = (() => {
  const y = mod(4n * invert(5n));
  const x = recoverX(y, 0);
  return { x, y, z: 1n, t: mod(x * y) };
})();

/** Recover the x coordinate for a given y, choosing the even root or its negation. */
function recoverX(y: bigint, sign: number): bigint {
  const y2 = mod(y * y);
  const u = mod(y2 - 1n);
  const v = mod(D * y2 + 1n);
  // Candidate root of u/v: (u/v)^((p+3)/8)
  let x = mod(powMod(mod(u * invert(v)), (P + 3n) / 8n));
  if (mod(v * x * x - u) !== 0n) x = mod(x * SQRT_M1);
  if (mod(v * x * x - u) !== 0n) throw new Error("Ed25519: point is not on the curve");
  if (Number(x & 1n) !== (sign & 1)) x = mod(-x);
  return x;
}

/** Unified addition (the curve is complete with d non-square, so this is total). */
function add(a: Point, b: Point): Point {
  const A = mod((a.y - a.x) * (b.y - b.x));
  const B = mod((a.y + a.x) * (b.y + b.x));
  const C = mod(2n * a.t * b.t * D);
  const Dd = mod(2n * a.z * b.z);
  const E = mod(B - A);
  const F = mod(Dd - C);
  const G = mod(Dd + C);
  const H = mod(B + A);
  return { x: mod(E * F), y: mod(G * H), z: mod(F * G), t: mod(E * H) };
}

/** Double-and-add scalar multiplication. Not constant time; this is a verifier. */
function mul(k: bigint, p: Point): Point {
  let result = IDENTITY;
  let addend = p;
  let n = k;
  while (n > 0n) {
    if (n & 1n) result = add(result, addend);
    addend = add(addend, addend);
    n >>= 1n;
  }
  return result;
}

function equals(a: Point, b: Point): boolean {
  // Compare x1/z1 == x2/z2 and y1/z1 == y2/z2 without inverting.
  return mod(a.x * b.z - b.x * a.z) === 0n && mod(a.y * b.z - b.y * a.z) === 0n;
}

/* ------------------------------------------------------------------ *
 * Encoding
 * ------------------------------------------------------------------ */

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().replace(/^0x/i, "");
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) {
    throw new Error("Ed25519: expected an even-length hex string");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function base64ToBytes(value: string): Uint8Array {
  const clean = value.replace(/\s+/g, "");
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(clean);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }
  throw new Error("Ed25519: no base64 decoder is available in this runtime");
}

/**
 * Little-endian decode of a byte string into a bigint.
 *
 * The length is taken from the input rather than assumed. This matters: the same function
 * decodes a 32-byte point coordinate and the 64-byte SHA-512 digest that produces `h`.
 * An earlier version hardcoded 32 bytes, so `h` was computed from only the low half of
 * the digest and every signature failed to verify.
 */
function decodeScalar(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let i = bytes.length - 1; i >= 0; i -= 1) value = (value << 8n) | BigInt(bytes[i]);
  return value;
}

/** Decode a compressed point. The high bit of the last byte carries the sign of x. */
function decodePoint(bytes: Uint8Array): Point {
  if (bytes.length !== 32) throw new Error("Ed25519: a point must be 32 bytes");
  const sign = (bytes[31] >> 7) & 1;
  const copy = Uint8Array.from(bytes);
  copy[31] &= 0x7f;
  const y = decodeScalar(copy);
  if (y >= P) throw new Error("Ed25519: point y is not a canonical field element");
  const x = recoverX(y, sign);
  return { x, y, z: 1n, t: mod(x * y) };
}

/* ------------------------------------------------------------------ *
 * Verification
 * ------------------------------------------------------------------ */

export type VerifyResult = { valid: boolean; reason?: string };

/**
 * Verify an Ed25519 signature.
 *
 * Returns a result rather than throwing, so a caller can distinguish "the signature is
 * wrong" from "the input was malformed" while still refusing both.
 */
export function verifyEd25519(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): VerifyResult {
  if (publicKey.length !== 32) return { valid: false, reason: `Public key must be 32 bytes, got ${publicKey.length}.` };
  if (signature.length !== 64) return { valid: false, reason: `Signature must be 64 bytes, got ${signature.length}.` };

  const rBytes = signature.subarray(0, 32);
  const sBytes = signature.subarray(32, 64);
  const s = decodeScalar(sBytes);
  // Reject a non-canonical S. Without this, a signature can be malleated into a second
  // valid form, which would let a rejected payload be replayed as a different one.
  if (s >= L) return { valid: false, reason: "Signature scalar S is not canonical (S >= L)." };

  let a: Point;
  let r: Point;
  try {
    a = decodePoint(publicKey);
    r = decodePoint(rBytes);
  } catch (error) {
    return { valid: false, reason: error instanceof Error ? error.message : "Point decoding failed." };
  }

  // h = SHA-512(R || A || M) mod L
  const hInput = new Uint8Array(64 + message.length);
  hInput.set(rBytes, 0);
  hInput.set(publicKey, 32);
  hInput.set(message, 64);
  const h = mod(decodeScalar(sha512(hInput)), L);

  const left = mul(s, BASE);
  const right = add(r, mul(h, a));
  if (!equals(left, right)) return { valid: false, reason: "Signature does not match the public key for this payload." };
  return { valid: true };
}

/** Convenience wrapper taking hex strings, for callers holding encoded values. */
export function verifyEd25519Hex(signatureHex: string, message: Uint8Array, publicKeyHex: string): VerifyResult {
  try {
    return verifyEd25519(hexToBytes(signatureHex), message, hexToBytes(publicKeyHex));
  } catch (error) {
    return { valid: false, reason: error instanceof Error ? error.message : "Malformed signature input." };
  }
}

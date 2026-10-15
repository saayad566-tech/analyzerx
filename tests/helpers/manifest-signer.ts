/**
 * Ed25519 signing, for tests only.
 *
 * The application must never hold a signing key — the whole point of the manifest scheme
 * is that the private key stays in CI. So signing lives here, in the test tree, and is
 * built from the same primitives the verifier uses, which means a signature produced here
 * and accepted by `verifyEd25519` exercises the real verification path rather than a
 * stub.
 *
 * This is the RFC 8032 signing procedure:
 *   h = SHA-512(seed); a = clamp(h[0..32]); prefix = h[32..64]
 *   A = encode([a]B)
 *   r = SHA-512(prefix || M) mod L
 *   R = encode([r]B)
 *   k = SHA-512(R || A || M) mod L
 *   S = (r + k*a) mod L ; signature = R || S
 */
import { sha512 } from "../../lib/sha512";
import { bytesToHex, hexToBytes } from "../../lib/ed25519";

const P = (1n << 255n) - 19n;
const L = (1n << 252n) + 27742317777372353535851937790883648493n;
const D = 37095705934669439343138083508754565189542113879843219016388785533085940283555n;
const SQRT_M1 = 19681161376707505956807079304988542015446066515923890162744021073123829784752n;

const mod = (a: bigint, m: bigint = P): bigint => ((a % m) + m) % m;
function powMod(base: bigint, exp: bigint, m: bigint = P): bigint {
  let r = 1n, b = mod(base, m), e = exp;
  while (e > 0n) { if (e & 1n) r = mod(r * b, m); b = mod(b * b, m); e >>= 1n; }
  return r;
}
const invert = (a: bigint): bigint => powMod(a, P - 2n);

type Point = { x: bigint; y: bigint; z: bigint; t: bigint };
const IDENTITY: Point = { x: 0n, y: 1n, z: 1n, t: 0n };

function recoverX(y: bigint, sign: number): bigint {
  const y2 = mod(y * y), u = mod(y2 - 1n), v = mod(D * y2 + 1n);
  let x = mod(powMod(mod(u * invert(v)), (P + 3n) / 8n));
  if (mod(v * x * x - u) !== 0n) x = mod(x * SQRT_M1);
  if (mod(v * x * x - u) !== 0n) throw new Error("signer: point is not on the curve");
  if (Number(x & 1n) !== (sign & 1)) x = mod(-x);
  return x;
}

function add(a: Point, b: Point): Point {
  const A = mod((a.y - a.x) * (b.y - b.x));
  const B = mod((a.y + a.x) * (b.y + b.x));
  const C = mod(2n * a.t * b.t * D);
  const Dd = mod(2n * a.z * b.z);
  const E = mod(B - A), F = mod(Dd - C), G = mod(Dd + C), H = mod(B + A);
  return { x: mod(E * F), y: mod(G * H), z: mod(F * G), t: mod(E * H) };
}

function mul(k: bigint, p: Point): Point {
  let r = IDENTITY, a = p, n = k;
  while (n > 0n) { if (n & 1n) r = add(r, a); a = add(a, a); n >>= 1n; }
  return r;
}

const By = mod(4n * invert(5n));
const BASE: Point = { x: recoverX(By, 0), y: By, z: 1n, t: mod(recoverX(By, 0) * By) };

/** Compress a point: little-endian y, with the sign of x in the top bit. */
function encodePoint(p: Point): Uint8Array {
  const zInv = invert(p.z);
  const x = mod(p.x * zInv);
  const y = mod(p.y * zInv);
  const out = new Uint8Array(32);
  let value = y;
  for (let i = 0; i < 32; i += 1) { out[i] = Number(value & 0xffn); value >>= 8n; }
  out[31] |= Number(x & 1n) << 7;
  return out;
}

function leToBigInt(bytes: Uint8Array): bigint {
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i -= 1) v = (v << 8n) | BigInt(bytes[i]);
  return v;
}

function bigIntToLE32(value: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let v = value;
  for (let i = 0; i < 32; i += 1) { out[i] = Number(v & 0xffn); v >>= 8n; }
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

/** Derive the public key from a 32-byte seed. */
export function publicKeyFromSeed(seedHex: string): string {
  const seed = hexToBytes(seedHex);
  if (seed.length !== 32) throw new Error("signer: seed must be 32 bytes");
  const h = sha512(seed);
  const a = clampScalar(h.subarray(0, 32));
  return bytesToHex(encodePoint(mul(a, BASE)));
}

function clampScalar(bytes: Uint8Array): bigint {
  const copy = Uint8Array.from(bytes);
  copy[0] &= 248;
  copy[31] &= 127;
  copy[31] |= 64;
  return leToBigInt(copy);
}

/** Sign a message with a 32-byte seed. Returns the 64-byte signature as hex. */
export function signEd25519(seedHex: string, message: Uint8Array): string {
  const seed = hexToBytes(seedHex);
  if (seed.length !== 32) throw new Error("signer: seed must be 32 bytes");
  const h = sha512(seed);
  const a = clampScalar(h.subarray(0, 32));
  const prefix = h.subarray(32, 64);

  const A = encodePoint(mul(a, BASE));
  const r = mod(leToBigInt(sha512(concat(prefix, message))), L);
  const R = encodePoint(mul(r, BASE));
  const k = mod(leToBigInt(sha512(concat(R, A, message))), L);
  const S = mod(r + k * a, L);
  return bytesToHex(concat(R, bigIntToLE32(S)));
}

/** Sign a payload object the same way the client verifies it: over canonical bytes. */
export function signPayload(seedHex: string, payload: unknown, canonicalize: (value: unknown) => string): { payload: unknown; signature: { algorithm: "Ed25519"; keyId: string; signature: string } } {
  const message = new TextEncoder().encode(canonicalize(payload));
  return {
    payload,
    signature: { algorithm: "Ed25519", keyId: "analyzerx-manifest-test-1", signature: signEd25519(seedHex, message) },
  };
}

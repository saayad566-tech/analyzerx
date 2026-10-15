/**
 * Byte helpers shared by the resource-pack runtime.
 *
 * Pure and dependency-free so they can be unit-tested and reused on every platform (React Native,
 * web, Node).
 */

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Encode bytes as standard base64 (no line breaks). */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.byteLength; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.byteLength ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.byteLength ? bytes[i + 2] : 0;
    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.byteLength ? BASE64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.byteLength ? BASE64_ALPHABET[b2 & 0x3f] : "=";
  }
  return out;
}

/** Decode standard base64 into bytes. Throws on malformed input. */
export function base64ToBytes(base64: string): Uint8Array {
  const cleaned = base64.replace(/\s+/g, "");
  const lookup = new Int16Array(128).fill(-1);
  for (let i = 0; i < BASE64_ALPHABET.length; i += 1) lookup[BASE64_ALPHABET.charCodeAt(i)] = i;
  const padding = cleaned.endsWith("==") ? 2 : cleaned.endsWith("=") ? 1 : 0;
  const length = (cleaned.length / 4) * 3 - padding;
  if (!Number.isInteger(length) || length < 0) throw new Error("Malformed base64 input.");
  const out = new Uint8Array(length);
  let outIndex = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const c0 = lookup[cleaned.charCodeAt(i)];
    const c1 = lookup[cleaned.charCodeAt(i + 1)];
    const c2 = cleaned.charCodeAt(i + 2) === 61 ? 0 : lookup[cleaned.charCodeAt(i + 2)];
    const c3 = cleaned.charCodeAt(i + 3) === 61 ? 0 : lookup[cleaned.charCodeAt(i + 3)];
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) throw new Error("Malformed base64 input.");
    const triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (outIndex < length) out[outIndex++] = (triple >> 16) & 0xff;
    if (outIndex < length) out[outIndex++] = (triple >> 8) & 0xff;
    if (outIndex < length) out[outIndex++] = triple & 0xff;
  }
  return out;
}

/** UTF-8 encode a string. */
export function utf8ToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** UTF-8 decode bytes. */
export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** Concatenate byte arrays in order. */
export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

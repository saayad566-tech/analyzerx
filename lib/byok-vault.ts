/**
 * Bring-your-own-key vault.
 *
 * The gap this fills: the app had no on-device store for a user's own provider API keys.
 * A key entered for a provider was either sent to a paired workstation runner or held in
 * a server environment variable — there was nowhere to keep one locally, encrypted, with
 * no cloud dependency.
 *
 * Design:
 *
 *  - A 256-bit master key is generated on the device and held in the platform keystore
 *    via expo-secure-store (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), so it never leaves the
 *    device and is not readable while the device is locked.
 *  - If the user prefers a passphrase, the master key is instead derived with PBKDF2
 *    (SHA-256, 210,000 iterations, per-vault random salt). The passphrase is never stored.
 *  - Each provider key is sealed with AES-256-GCM under a fresh 12-byte IV. Only the
 *    ciphertext, IV and algorithm tag are written to storage; plaintext is never persisted.
 *  - Decryption is authenticated, so a tampered ciphertext fails loudly rather than
 *    returning a corrupted key.
 *
 * Nothing here reaches the network. There is no cloud escrow and no recovery path, which
 * is the correct trade for a credential: if the device is wiped, the keys are gone and
 * must be re-entered.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const VAULT_KEY = "analyzerx.byok.v1.master";
const VAULT_SALT = "analyzerx.byok.v1.salt";
const VAULT_STORE = "analyzerx.byok.v1.entries";
const PBKDF2_ITERATIONS = 210_000;

export type VaultMode = "device" | "passphrase" | "locked";

export type VaultEntry = {
  provider: string;
  /** A display-only hint. Never the full key. */
  masked: string;
  addedAt: string;
};

type SealedEntry = {
  provider: string;
  iv: string;
  ciphertext: string;
  addedAt: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

/** True when this build can actually encrypt. Callers must check rather than assume. */
export function vaultAvailable(): boolean {
  return Boolean(globalThis.crypto?.subtle && globalThis.crypto?.getRandomValues);
}

function requireCrypto() {
  if (!vaultAvailable()) {
    throw new Error("This build has no WebCrypto implementation, so keys cannot be encrypted at rest. The vault is unavailable rather than storing a key in the clear.");
  }
}

/** A display hint that reveals at most the last four characters. */
export function maskKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 4) return "••••";
  return `${"•".repeat(Math.min(12, trimmed.length - 4))}${trimmed.slice(-4)}`;
}

async function readEntries(): Promise<SealedEntry[]> {
  const raw = await AsyncStorage.getItem(VAULT_STORE);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is SealedEntry =>
      Boolean(entry && typeof entry === "object"
        && typeof (entry as SealedEntry).provider === "string"
        && typeof (entry as SealedEntry).iv === "string"
        && typeof (entry as SealedEntry).ciphertext === "string"));
  } catch {
    // A corrupted store must not silently become an empty vault that then overwrites
    // real entries on the next write.
    throw new Error("The local key vault is unreadable. Clear the vault and re-enter your keys.");
  }
}

async function writeEntries(entries: SealedEntry[]): Promise<void> {
  await AsyncStorage.setItem(VAULT_STORE, JSON.stringify(entries));
}

/** Generate and keystore a fresh device-bound master key. */
async function createDeviceKey(): Promise<CryptoKey> {
  requireCrypto();
  const raw = new Uint8Array(32);
  globalThis.crypto.getRandomValues(raw);
  await SecureStore.setItemAsync(VAULT_KEY, bytesToBase64(raw), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return globalThis.crypto.subtle.importKey("raw", raw as unknown as ArrayBuffer, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function loadDeviceKey(): Promise<CryptoKey | null> {
  const encoded = await SecureStore.getItemAsync(VAULT_KEY);
  if (!encoded) return null;
  requireCrypto();
  return globalThis.crypto.subtle.importKey("raw", base64ToBytes(encoded) as unknown as ArrayBuffer, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/**
 * Initialise the vault with a device-bound key.
 *
 * Idempotent: calling it when a vault already exists returns the existing mode rather
 * than replacing the key and orphaning every stored entry.
 */
export async function initDeviceVault(): Promise<VaultMode> {
  requireCrypto();
  const existing = await loadDeviceKey();
  if (existing) return "device";
  await createDeviceKey();
  return "device";
}

/**
 * Initialise the vault from a passphrase with PBKDF2.
 *
 * The salt is created once and reused, so the same passphrase re-derives the same key on
 * a later unlock. The passphrase itself is never written anywhere.
 */
export async function initPassphraseVault(passphrase: string): Promise<VaultMode> {
  requireCrypto();
  if (passphrase.trim().length < 12) {
    throw new Error("Choose a passphrase of at least 12 characters. It cannot be recovered if forgotten.");
  }
  let salt = await AsyncStorage.getItem(VAULT_SALT);
  if (!salt) {
    const raw = new Uint8Array(16);
    globalThis.crypto.getRandomValues(raw);
    salt = bytesToBase64(raw);
    await AsyncStorage.setItem(VAULT_SALT, salt);
  }
  const material = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase) as unknown as ArrayBuffer,
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await globalThis.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: base64ToBytes(salt) as unknown as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  // The derived key is held for this session only; a fresh unlock re-derives it.
  sessionKey = key;
  return "passphrase";
}

let sessionKey: CryptoKey | null = null;

async function activeKey(): Promise<CryptoKey> {
  if (sessionKey) return sessionKey;
  const deviceKey = await loadDeviceKey();
  if (deviceKey) return deviceKey;
  throw new Error("The key vault is locked. Unlock it with your passphrase before reading or writing keys.");
}

/** The vault's current mode, without unlocking it. */
export async function vaultStatus(): Promise<{ mode: VaultMode; entries: number; available: boolean }> {
  const available = vaultAvailable();
  const entries = await readEntries().catch(() => []);
  if (!available) return { mode: "locked", entries: entries.length, available };
  if (sessionKey) return { mode: "passphrase", entries: entries.length, available };
  const deviceKey = await loadDeviceKey();
  return { mode: deviceKey ? "device" : "locked", entries: entries.length, available };
}

/** Lock the vault, discarding any in-memory passphrase-derived key. */
export function lockVault(): void {
  sessionKey = null;
}

/**
 * Store a provider key, encrypted.
 *
 * Replaces any existing entry for the same provider.
 */
export async function setProviderKey(provider: string, apiKey: string): Promise<VaultEntry> {
  const name = provider.trim().toLowerCase();
  const secret = apiKey.trim();
  if (!name) throw new Error("A provider name is required.");
  if (!secret) throw new Error("A key value is required.");
  const key = await activeKey();
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(secret) as unknown as ArrayBuffer,
  );
  const entry: SealedEntry = {
    provider: name,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    addedAt: new Date().toISOString(),
  };
  const entries = await readEntries();
  await writeEntries([...entries.filter((existing) => existing.provider !== name), entry]);
  return { provider: name, masked: maskKey(secret), addedAt: entry.addedAt };
}

/**
 * Read a provider key.
 *
 * This is the only function that returns plaintext, and it is deliberately not used by
 * any listing surface.
 */
export async function getProviderKey(provider: string): Promise<string | null> {
  const name = provider.trim().toLowerCase();
  const entries = await readEntries();
  const entry = entries.find((candidate) => candidate.provider === name);
  if (!entry) return null;
  const key = await activeKey();
  try {
    const plaintext = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(entry.iv) as unknown as ArrayBuffer },
      key,
      base64ToBytes(entry.ciphertext) as unknown as ArrayBuffer,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    // AES-GCM authenticates, so a failure here means the ciphertext was altered or the
    // key is wrong. Never fall back to returning anything.
    throw new Error(`The stored key for ${name} could not be decrypted. It may have been tampered with, or the vault key changed.`);
  }
}

/** List stored providers with a masked hint. Never returns plaintext. */
export async function listProviderKeys(): Promise<VaultEntry[]> {
  const entries = await readEntries();
  const key = await activeKey();
  const listed: VaultEntry[] = [];
  for (const entry of entries) {
    try {
      const plaintext = await globalThis.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64ToBytes(entry.iv) as unknown as ArrayBuffer },
        key,
        base64ToBytes(entry.ciphertext) as unknown as ArrayBuffer,
      );
      listed.push({ provider: entry.provider, masked: maskKey(new TextDecoder().decode(plaintext)), addedAt: entry.addedAt });
    } catch {
      listed.push({ provider: entry.provider, masked: "unreadable", addedAt: entry.addedAt });
    }
  }
  return listed;
}

/** Remove one provider key. Returns true when an entry was removed. */
export async function deleteProviderKey(provider: string): Promise<boolean> {
  const name = provider.trim().toLowerCase();
  const entries = await readEntries();
  const remaining = entries.filter((entry) => entry.provider !== name);
  if (remaining.length === entries.length) return false;
  await writeEntries(remaining);
  return true;
}

/**
 * Destroy the vault: every sealed entry, the salt and the device master key.
 *
 * Deliberately irreversible. There is no escrow, so this is the only way to be certain a
 * key is gone.
 */
export async function destroyVault(): Promise<void> {
  sessionKey = null;
  await AsyncStorage.multiRemove([VAULT_STORE, VAULT_SALT]);
  await SecureStore.deleteItemAsync(VAULT_KEY).catch(() => undefined);
}

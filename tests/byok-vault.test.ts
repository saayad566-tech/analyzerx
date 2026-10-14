/**
 * Bring-your-own-key vault.
 *
 * These assert the properties that matter for a credential store, not just that a
 * round-trip works:
 *
 *  - a stored key comes back byte-identical
 *  - the plaintext is NEVER written to storage; only ciphertext, IV and a tag
 *  - a listing reveals at most the last four characters
 *  - a tampered ciphertext fails loudly rather than returning a wrong key
 *  - empty input is rejected rather than silently stored
 *  - destroying the vault really removes the entries
 *
 * `expo-secure-store` and AsyncStorage are mocked, because the point is the crypto and
 * the storage discipline, not the platform bindings.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// vi.hoisted runs before the vi.mock factories are hoisted into place, so the maps exist
// when the factory closes over them. A plain top-level const would be undefined here.
const { asyncStore, secureStore } = vi.hoisted(() => ({
  asyncStore: new Map<string, string>(),
  secureStore: new Map<string, string>(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => asyncStore.get(key) ?? null,
    setItem: async (key: string, value: string) => { asyncStore.set(key, value); },
    removeItem: async (key: string) => { asyncStore.delete(key); },
    multiRemove: async (keys: string[]) => { for (const key of keys) asyncStore.delete(key); },
  },
}));

vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "when-unlocked-this-device-only",
  getItemAsync: async (key: string) => secureStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { secureStore.set(key, value); },
  deleteItemAsync: async (key: string) => { secureStore.delete(key); },
}));

import {
  initDeviceVault,
  setProviderKey,
  getProviderKey,
  listProviderKeys,
  deleteProviderKey,
  destroyVault,
  vaultStatus,
  maskKey,
  vaultAvailable,
} from "../lib/byok-vault";

const STORE_KEY = "analyzerx.byok.v1.entries";

beforeEach(async () => {
  asyncStore.clear();
  secureStore.clear();
  await initDeviceVault();
});

describe("masked display", () => {
  it("never reveals more than the last four characters", () => {
    const key = "sk-live-abcdefghijklmnop1234";
    const masked = maskKey(key);
    expect(masked.endsWith("1234")).toBe(true);
    expect(masked).not.toContain("abcdefghijklmnop");
    expect(masked.length).toBeLessThan(key.length);
  });

  it("masks a very short key entirely", () => {
    expect(maskKey("abc")).toBe("••••");
    expect(maskKey("")).toBe("••••");
  });
});

describe("round trip", () => {
  it("returns a stored key byte-identical", async () => {
    const secret = "sk-test-0123456789abcdefghij";
    await setProviderKey("finnhub", secret);
    expect(await getProviderKey("finnhub")).toBe(secret);
  });

  it("normalises the provider name", async () => {
    await setProviderKey("  FINNHUB  ", "sk-test-0123456789abcdefghij");
    expect(await getProviderKey("finnhub")).not.toBeNull();
  });

  it("replaces rather than duplicates an existing provider", async () => {
    await setProviderKey("finnhub", "sk-first-0123456789abcdef");
    await setProviderKey("finnhub", "sk-second-0123456789abcdef");
    const listed = await listProviderKeys();
    expect(listed.filter((entry) => entry.provider === "finnhub")).toHaveLength(1);
    expect(await getProviderKey("finnhub")).toBe("sk-second-0123456789abcdef");
  });

  it("returns null for a provider that was never stored", async () => {
    expect(await getProviderKey("nobody")).toBeNull();
  });
});

describe("storage discipline", () => {
  it("never writes the plaintext to storage", async () => {
    const secret = "sk-secret-0123456789abcdefghij";
    await setProviderKey("finnhub", secret);
    const raw = asyncStore.get(STORE_KEY) ?? "";
    expect(raw.length).toBeGreaterThan(0);
    expect(raw, "the plaintext key was written to storage").not.toContain(secret);
    // The keystore holds the master key, never the provider key.
    for (const value of secureStore.values()) {
      expect(value).not.toContain(secret);
    }
  });

  it("stores ciphertext, an IV and a tag, not the key itself", async () => {
    await setProviderKey("finnhub", "sk-secret-0123456789abcdefghij");
    const entries = JSON.parse(asyncStore.get(STORE_KEY) ?? "[]") as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(1);
    expect(typeof entries[0].ciphertext).toBe("string");
    expect(typeof entries[0].iv).toBe("string");
    expect(Object.keys(entries[0])).not.toContain("key");
    expect(Object.keys(entries[0])).not.toContain("plaintext");
  });

  it("uses a fresh IV per write, so the same key seals differently", async () => {
    await setProviderKey("a", "sk-same-0123456789abcdefghij");
    const first = JSON.parse(asyncStore.get(STORE_KEY) ?? "[]") as Array<Record<string, unknown>>;
    await setProviderKey("b", "sk-same-0123456789abcdefghij");
    const second = JSON.parse(asyncStore.get(STORE_KEY) ?? "[]") as Array<Record<string, unknown>>;
    expect(first[0].iv).not.toBe(second[1].iv);
    expect(first[0].ciphertext).not.toBe(second[1].ciphertext);
  });
});

describe("listing", () => {
  it("lists providers masked and never in the clear", async () => {
    await setProviderKey("finnhub", "sk-aaaa-0123456789abcdef");
    await setProviderKey("coingecko", "cg-bbbb-0123456789abcdef");
    const listed = await listProviderKeys();
    expect(listed.map((entry) => entry.provider).sort()).toEqual(["coingecko", "finnhub"]);
    for (const entry of listed) {
      expect(entry.masked).toContain("•");
    }
    const blob = JSON.stringify(listed);
    expect(blob).not.toContain("0123456789abcdef");
  });
});

describe("tamper resistance", () => {
  it("fails loudly when the ciphertext is altered", async () => {
    await setProviderKey("finnhub", "sk-secret-0123456789abcdefghij");
    const entries = JSON.parse(asyncStore.get(STORE_KEY) ?? "[]") as Array<Record<string, unknown>>;
    const sealed = entries[0].ciphertext as string;
    entries[0].ciphertext = sealed.slice(0, -4) + (sealed.endsWith("AAAA") ? "BBBB" : "AAAA");
    asyncStore.set(STORE_KEY, JSON.stringify(entries));
    await expect(getProviderKey("finnhub")).rejects.toThrow();
  });

  it("reports an unreadable entry as unreadable rather than as a key", async () => {
    await setProviderKey("finnhub", "sk-secret-0123456789abcdefghij");
    const entries = JSON.parse(asyncStore.get(STORE_KEY) ?? "[]") as Array<Record<string, unknown>>;
    entries[0].ciphertext = "AAAA";
    asyncStore.set(STORE_KEY, JSON.stringify(entries));
    const listed = await listProviderKeys();
    expect(listed[0].masked).toBe("unreadable");
  });
});

describe("input validation", () => {
  it("rejects an empty key", async () => {
    await expect(setProviderKey("finnhub", "   ")).rejects.toThrow();
  });

  it("rejects an empty provider name", async () => {
    await expect(setProviderKey("   ", "sk-x-0123456789abcdefghij")).rejects.toThrow();
  });
});

describe("lifecycle", () => {
  it("reports a device vault after init and counts its entries", async () => {
    await setProviderKey("finnhub", "sk-aaaa-0123456789abcdef");
    const status = await vaultStatus();
    expect(status.mode).toBe("device");
    expect(status.entries).toBe(1);
  });

  it("deletes one provider without touching the others", async () => {
    await setProviderKey("finnhub", "sk-aaaa-0123456789abcdef");
    await setProviderKey("coingecko", "cg-bbbb-0123456789abcdef");
    expect(await deleteProviderKey("finnhub")).toBe(true);
    expect(await deleteProviderKey("finnhub")).toBe(false);
    expect(await getProviderKey("finnhub")).toBeNull();
    expect(await getProviderKey("coingecko")).not.toBeNull();
  });

  it("destroys every entry and the master key", async () => {
    await setProviderKey("finnhub", "sk-aaaa-0123456789abcdef");
    await destroyVault();
    expect(asyncStore.has(STORE_KEY)).toBe(false);
    expect(secureStore.size).toBe(0);
    const status = await vaultStatus();
    expect(status.entries).toBe(0);
    expect(status.mode).toBe("locked");
  });

  it("reports crypto availability rather than assuming it", () => {
    expect(typeof vaultAvailable()).toBe("boolean");
  });
});

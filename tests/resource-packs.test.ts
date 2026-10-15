import { describe, expect, it } from "vitest";

import { sha256Hex, sha256HexSync, toHex } from "../lib/resource-packs/hash";
import { base64ToBytes, bytesToBase64, concatBytes, bytesToUtf8, utf8ToBytes } from "../lib/resource-packs/bytes";
import {
  MarketScopeError,
  PackValidationError,
  assembleDataset,
  assertMarketScope,
  canonicalManifestBody,
  decodeDataset,
  formatBytes,
  isPackComplete,
  packDirectoryName,
  packPresence,
  parseIndex,
  parsePackManifest,
  planDownload,
  resolvePackEntry,
  totalChunkBytes,
  verifyChunkBody,
  verifyChunks,
  verifyDataset,
  verifyHex,
  verifyManifestDigest,
} from "../lib/resource-packs/core";
import { ASSET_REPOSITORY, chunkUrl, indexUrl, manifestUrl } from "../lib/resource-packs/registry";
import type { PackManifest } from "../lib/resource-packs/types";

// --- fixtures ---------------------------------------------------------------------------------

async function makeFixture(): Promise<{ manifest: PackManifest; chunks: Map<string, Uint8Array> }> {
  const eventsBytes = utf8ToBytes(JSON.stringify([{ id: "a" }, { id: "b" }, { id: "c" }]));
  const flowsBytes = utf8ToBytes(`${JSON.stringify({ id: "f1" })}\n${JSON.stringify({ id: "f2" })}\n`);
  const eventsA = eventsBytes.subarray(0, 9);
  const eventsB = eventsBytes.subarray(9);
  const bodies: Record<string, Uint8Array> = {
    "packs/US/events.000.bin": eventsA,
    "packs/US/events.001.bin": eventsB,
    "packs/US/flows.000.bin": flowsBytes,
  };
  const datasets = [
    {
      name: "events",
      bytes: eventsBytes.byteLength,
      sha256: sha256HexSync(eventsBytes),
      encoding: "json" as const,
      chunks: [
        { index: 0, file: "packs/US/events.000.bin", bytes: eventsA.byteLength, sha256: sha256HexSync(eventsA) },
        { index: 1, file: "packs/US/events.001.bin", bytes: eventsB.byteLength, sha256: sha256HexSync(eventsB) },
      ],
    },
    {
      name: "flows",
      bytes: flowsBytes.byteLength,
      sha256: sha256HexSync(flowsBytes),
      encoding: "jsonl" as const,
      chunks: [{ index: 0, file: "packs/US/flows.000.bin", bytes: flowsBytes.byteLength, sha256: sha256HexSync(flowsBytes) }],
    },
  ];
  const body = {
    schemaVersion: 1 as const,
    marketId: "US" as const,
    packVersion: "2026.10.15",
    generatedAt: "2026-10-15T00:00:00Z",
    chunkBytes: 4 * 1024 * 1024,
    datasets,
    totalBytes: eventsBytes.byteLength + flowsBytes.byteLength,
    sha256: "0".repeat(64),
  };
  const digest = await sha256Hex(utf8ToBytes(canonicalManifestBody(body)));
  return { manifest: { ...body, sha256: digest }, chunks: new Map(Object.entries(bodies)) };
}

// --- hash -------------------------------------------------------------------------------------

describe("sha256 (FIPS 180-4 vectors)", () => {
  it("matches the published vectors", async () => {
    expect(sha256HexSync(utf8ToBytes(""))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256HexSync(utf8ToBytes("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256HexSync(utf8ToBytes("The quick brown fox jumps over the lazy dog"))).toBe("d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592");
  });

  it("hashes multi-block input and returns the same value sync or async", async () => {
    const big = new Uint8Array(1000).fill(97);
    expect(sha256HexSync(big)).toBe("41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3");
    expect(await sha256Hex(big)).toBe(sha256HexSync(big));
  });

  it("handles the padding boundary at length ≡ 55 (mod 64)", () => {
    // Regression: a naive `(len + 9) >> 6 + 1` padding over-allocates one block here and
    // produces a wrong digest. These lengths are exactly on that boundary.
    const vectors: [number, string][] = [
      [55, "9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318"],
      [56, "b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a"],
      [119, "31eba51c313a5c08226adf18d4a359cfdfd8d2e816b13f4af952f7ea6584dcfb"],
      [2295, "42ff0571f41e442abcaf576aa6941484497aee2bd09808cb5205b491c7f1f53b"],
    ];
    for (const [len, expected] of vectors) expect(sha256HexSync(new Uint8Array(len).fill(97))).toBe(expected);
  });

  it("encodes bytes as lowercase hex", () => {
    expect(toHex(new Uint8Array([0, 15, 255]))).toBe("000fff");
  });
});

// --- bytes ------------------------------------------------------------------------------------

describe("byte helpers", () => {
  it("round-trips base64", () => {
    const raw = new Uint8Array([0, 1, 2, 250, 255, 128, 7, 63, 64]);
    expect(Array.from(base64ToBytes(bytesToBase64(raw)))).toEqual(Array.from(raw));
  });

  it("rejects malformed base64", () => {
    expect(() => base64ToBytes("****")).toThrow();
  });

  it("concatenates and decodes utf8", () => {
    const joined = concatBytes([utf8ToBytes("AnalyzerX "), utf8ToBytes("India")]);
    expect(bytesToUtf8(joined)).toBe("AnalyzerX India");
  });
});

// --- manifest validation ----------------------------------------------------------------------

describe("resource-pack manifest contract", () => {
  it("accepts a well-formed manifest and rejects a bad totalBytes", async () => {
    const { manifest } = await makeFixture();
    expect(parsePackManifest(manifest).marketId).toBe("US");
    expect(() => parsePackManifest({ ...manifest, totalBytes: 1 })).toThrow(PackValidationError);
  });

  it("rejects an unknown market and a malformed digest", async () => {
    const { manifest } = await makeFixture();
    expect(() => parsePackManifest({ ...manifest, marketId: "ZZ" })).toThrow(PackValidationError);
    expect(() => parsePackManifest({ ...manifest, sha256: "nothex" })).toThrow(PackValidationError);
  });

  it("verifies the manifest self-digest", async () => {
    const { manifest } = await makeFixture();
    expect(await verifyManifestDigest(manifest, sha256Hex)).toBe(true);
    expect(await verifyManifestDigest({ ...manifest, packVersion: "tampered" }, sha256Hex)).toBe(false);
  });
});

// --- market isolation -------------------------------------------------------------------------

describe("market isolation in pack resolution", () => {
  const index = { schemaVersion: 1 as const, generatedAt: "2026-10-15T00:00:00Z", packs: [{ marketId: "IN" as const, packVersion: "1", manifestPath: "manifests/IN.json", totalBytes: 10, datasetNames: ["events"] }] };

  it("never resolves a market to another market's pack", () => {
    expect(resolvePackEntry(index, "IN")?.manifestPath).toBe("manifests/IN.json");
    expect(resolvePackEntry(index, "US")).toBeNull();
    expect(resolvePackEntry(index, "GB")).toBeNull();
  });

  it("throws when a pack is asked to serve a different market", async () => {
    const { manifest } = await makeFixture();
    expect(() => assertMarketScope(manifest, "IN")).toThrow(MarketScopeError);
    expect(() => assertMarketScope(manifest, "US")).not.toThrow();
  });

  it("validates an index and rejects an empty pack list", () => {
    expect(parseIndex(index).packs).toHaveLength(1);
    expect(() => parseIndex({ schemaVersion: 1, generatedAt: "x", packs: [] })).toThrow(PackValidationError);
  });
});

// --- planning and integrity -------------------------------------------------------------------

describe("download planning and integrity", () => {
  it("orders chunks by dataset then index", async () => {
    const { manifest } = await makeFixture();
    expect(planDownload(manifest).map((ref) => ref.file)).toEqual(["packs/US/events.000.bin", "packs/US/events.001.bin", "packs/US/flows.000.bin"]);
    expect(totalChunkBytes(manifest)).toBe(manifest.totalBytes);
  });

  it("accepts intact chunks and detects corruption and truncation", async () => {
    const { manifest, chunks } = await makeFixture();
    const good = await verifyChunks(manifest, chunks, sha256Hex);
    expect(good.ok).toBe(true);
    expect(good.verifiedBytes).toBe(manifest.totalBytes);

    const corrupt = new Map(chunks);
    corrupt.set("packs/US/events.001.bin", new Uint8Array([1, 2, 3]));
    const bad = await verifyChunks(manifest, corrupt, sha256Hex);
    expect(bad.ok).toBe(false);
    expect(bad.failures[0].file).toBe("packs/US/events.001.bin");
  });

  it("compares digests without short-circuiting on the first difference", () => {
    expect(verifyHex("ab", "ab")).toBe(true);
    expect(verifyHex("ab", "ac")).toBe(false);
    expect(verifyHex("ab", "abc")).toBe(false);
  });

  it("verifies a single chunk body with and without a length check", async () => {
    const bytes = utf8ToBytes("chunk");
    const digest = sha256HexSync(bytes);
    expect(await verifyChunkBody(bytes, digest)).toBe(true);
    expect(await verifyChunkBody(bytes, digest, 99)).toBe(false);
  });

  it("reassembles a dataset and verifies it, then decodes json and jsonl", async () => {
    const { manifest, chunks } = await makeFixture();
    const events = assembleDataset("events", manifest, chunks);
    expect(await verifyDataset("events", events, manifest, sha256Hex)).toBe(true);
    expect(decodeDataset("events", events, manifest)).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const flows = assembleDataset("flows", manifest, chunks);
    expect((decodeDataset("flows", flows, manifest) as unknown[]).length).toBe(2);
  });

  it("reports presence and completeness for resume", async () => {
    const { manifest } = await makeFixture();
    const partial = new Set(["packs/US/events.000.bin"]);
    const presence = packPresence(manifest, partial);
    expect(presence.done).toBe(1);
    expect(presence.missing).toHaveLength(2);
    const full = new Set(planDownload(manifest).map((ref) => ref.file));
    expect(isPackComplete(manifest, full)).toBe(true);
    expect(packPresence(manifest, full).fraction).toBe(1);
  });
});

// --- registry + formatting --------------------------------------------------------------------

describe("registry and formatting", () => {
  it("builds asset URLs inside the separate assets repository", () => {
    expect(ASSET_REPOSITORY.repo).toBe("analyzerx-assets");
    expect(indexUrl()).toBe(`https://raw.githubusercontent.com/${ASSET_REPOSITORY.owner}/${ASSET_REPOSITORY.repo}/${ASSET_REPOSITORY.ref}/manifests/index.json`);
    expect(chunkUrl("packs/IN/events.000.bin").endsWith("/packs/IN/events.000.bin")).toBe(true);
    expect(manifestUrl("manifests/US.json").endsWith("/manifests/US.json")).toBe(true);
  });

  it("honours a base-url override for mirrors and tests", () => {
    expect(indexUrl("https://mirror.example/")).toBe("https://mirror.example/manifests/index.json");
  });

  it("formats bytes and builds safe directory names", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(4 * 1024 * 1024)).toBe("4.2 MB");
    expect(packDirectoryName("IN", "2026.10.15")).toBe("IN-2026.10.15");
    expect(packDirectoryName("IN", "v/../evil")).toBe("IN-v_.._evil");
  });
});

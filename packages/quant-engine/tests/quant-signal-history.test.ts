import { describe, expect, it } from "vitest";

import { sha256HexSync, sha256Text, toHex, utf8Bytes } from "../src/hash";
import {
  GENESIS_HASH, appendSignal, digestInputs, evaluateRecord, exportHistory, hashRecord, parseHistory,
  serializeHistory, verifyChain, type SignalRecord,
} from "../src/signal-history";

const draft = (over: Partial<Parameters<typeof appendSignal>[1]> = {}) => ({
  recordedAt: 1_700_000_000_000,
  marketId: "IN" as const,
  strategyId: "magic-formula",
  strategyName: "Greenblatt Magic Formula",
  kind: "rank" as const,
  suggestions: [{ symbol: "ACME", referencePrice: 100, score: 92.5, detail: "combined rank 3" }],
  inputDigest: "abc123",
  ...over,
});

describe("SHA-256 matches the published test vectors", () => {
  it("hashes the FIPS 180-4 vectors", () => {
    expect(sha256Text("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Text("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Text("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("handles the padding boundary where the length is 55 mod 64", () => {
    // 55 bytes is the case that needs the ceil() rounding; a naive `>>6 + 1` appends an extra block.
    // 55 and 56 must therefore differ, and both must be stable and 64 hex characters.
    const fiftyFive = sha256Text("a".repeat(55));
    const fiftySix = sha256Text("a".repeat(56));
    expect(fiftyFive).toHaveLength(64);
    expect(fiftySix).toHaveLength(64);
    expect(fiftyFive).not.toBe(fiftySix);
    // 64 bytes is the next block boundary and must not collide either.
    expect(sha256Text("a".repeat(64))).not.toBe(sha256Text("a".repeat(63)));
  });

  it("encodes UTF-8 without TextEncoder, including multi-byte characters", () => {
    expect(Array.from(utf8Bytes("abc"))).toEqual([97, 98, 99]);
    expect(Array.from(utf8Bytes("é"))).toEqual([0xc3, 0xa9]); // 2 bytes
    expect(Array.from(utf8Bytes("₹"))).toEqual([0xe2, 0x82, 0xb9]); // 3 bytes
    expect(Array.from(utf8Bytes("𝄞"))).toEqual([0xf0, 0x9d, 0x84, 0x9e]); // 4 bytes, surrogate pair
    expect(sha256Text("₹")).toBe(sha256HexSync(utf8Bytes("₹")));
    expect(toHex(utf8Bytes("A"))).toBe("41");
  });
});

describe("input digests are stable and order-independent", () => {
  it("produces the same digest regardless of key order", () => {
    expect(digestInputs({ a: 1, b: 2, c: 3 })).toBe(digestInputs({ c: 3, a: 1, b: 2 }));
    expect(digestInputs({ nested: { z: 1, y: 2 } })).toBe(digestInputs({ nested: { y: 2, z: 1 } }));
  });

  it("produces different digests for different values", () => {
    expect(digestInputs({ a: 1 })).not.toBe(digestInputs({ a: 2 }));
    expect(digestInputs([1, 2])).not.toBe(digestInputs([2, 1]));
    expect(digestInputs(null)).not.toBe(digestInputs(0));
  });
});

describe("the signal history is append-only and linked", () => {
  it("links the first record to genesis and each later one to its predecessor", () => {
    const first = appendSignal([], draft());
    expect(first.seq).toBe(1);
    expect(first.previousHash).toBe(GENESIS_HASH);
    expect(first.hash).toBe(hashRecord(first));
    expect(first.recordedAtIso).toBe(new Date(1_700_000_000_000).toISOString());

    const second = appendSignal([first], draft({ recordedAt: 1_700_000_086_400 }));
    expect(second.seq).toBe(2);
    expect(second.previousHash).toBe(first.hash);
    expect(second.hash).not.toBe(first.hash);
  });

  it("verifies a well-formed chain", () => {
    let chain: SignalRecord[] = [];
    for (let i = 0; i < 5; i += 1) chain = [...chain, appendSignal(chain, draft({ recordedAt: 1_700_000_000_000 + i * 86_400_000 }))];
    const result = verifyChain(chain);
    expect(result.valid).toBe(true);
    expect(result.records).toBe(5);
    expect(result.brokenAt).toBeNull();
  });

  it("detects an edited record", () => {
    let chain: SignalRecord[] = [];
    for (let i = 0; i < 3; i += 1) chain = [...chain, appendSignal(chain, draft({ recordedAt: 1_700_000_000_000 + i * 1_000 }))];
    // Someone rewrites history: a suggestion is changed but the hash is left alone.
    const tampered = [...chain];
    tampered[1] = { ...tampered[1], suggestions: [{ symbol: "ACME", referencePrice: 100, score: 99, detail: "fabricated" }] };
    const result = verifyChain(tampered);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2);
    expect(result.reason).toContain("does not match its hash");
  });

  it("detects a removed record", () => {
    let chain: SignalRecord[] = [];
    for (let i = 0; i < 4; i += 1) chain = [...chain, appendSignal(chain, draft({ recordedAt: 1_700_000_000_000 + i * 1_000 }))];
    const withGap = [chain[0], chain[2], chain[3]]; // the second record is deleted
    const result = verifyChain(withGap);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(3);
    expect(result.reason).toContain("sequence number");
  });

  it("detects a record rewritten and re-sealed", () => {
    let chain: SignalRecord[] = [];
    for (let i = 0; i < 3; i += 1) chain = [...chain, appendSignal(chain, draft({ recordedAt: 1_700_000_000_000 + i * 1_000 }))];
    // The realistic attack: alter a record *and* re-seal it, so it looks internally consistent.
    const rewritten = { ...chain[0], suggestions: [{ symbol: "ACME", referencePrice: 100, score: 999, detail: "rewritten" }] };
    const resealed: SignalRecord = { ...rewritten, hash: hashRecord(rewritten) };
    const result = verifyChain([resealed, chain[1], chain[2]]);
    expect(result.valid).toBe(false);
    // The re-sealed record passes its own check, so the break surfaces at the *next* link — which is
    // exactly why the chain is worth having.
    expect(result.brokenAt).toBe(2);
    expect(result.reason).toContain("link to the previous record");
  });

  it("detects a hash field edited on its own", () => {
    let chain: SignalRecord[] = [];
    for (let i = 0; i < 3; i += 1) chain = [...chain, appendSignal(chain, draft({ recordedAt: 1_700_000_000_000 + i * 1_000 }))];
    const relinked = [...chain];
    relinked[0] = { ...relinked[0], hash: "f".repeat(64) };
    const result = verifyChain(relinked);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
    expect(result.reason).toContain("does not match its hash");
  });
});

describe("publishing and reading back the history", () => {
  it("round-trips through the published artefact", () => {
    let chain: SignalRecord[] = [];
    for (let i = 0; i < 3; i += 1) chain = [...chain, appendSignal(chain, draft({ recordedAt: 1_700_000_000_000 + i * 1_000 }))];
    const text = serializeHistory(chain, 1_700_500_000_000);
    const parsed = parseHistory(text)!;
    expect(parsed).not.toBeNull();
    expect(parsed).toHaveLength(3);
    expect(parsed[2].suggestions[0].referencePrice).toBe(100);
    // A parsed artefact must still verify — otherwise publication would be worthless.
    expect(verifyChain(parsed).valid).toBe(true);
  });

  it("reports the head hash and record count", () => {
    let chain: SignalRecord[] = [];
    for (let i = 0; i < 3; i += 1) chain = [...chain, appendSignal(chain, draft({ recordedAt: 1_700_000_000_000 + i * 1_000 }))];
    const published = exportHistory(chain, 1_700_500_000_000);
    expect(published.format).toBe("analyzerx.signal-history.v1");
    expect(published.records).toBe(3);
    expect(published.headHash).toBe(chain[2].hash);
    expect(published.publishedAt).toBe(new Date(1_700_500_000_000).toISOString());
  });

  it("reports genesis for an empty history", () => {
    expect(exportHistory([]).headHash).toBe(GENESIS_HASH);
    expect(verifyChain([]).valid).toBe(true);
  });

  it("rejects a malformed artefact rather than trusting it", () => {
    expect(parseHistory("not json")).toBeNull();
    expect(parseHistory("{}")).toBeNull();
    expect(parseHistory(JSON.stringify({ chain: [{ seq: "one" }] }))).toBeNull();
    expect(parseHistory(JSON.stringify({ chain: [{ seq: 1, recordedAt: 1, hash: "a", previousHash: "b", strategyId: "s", marketId: "IN", suggestions: [{ notSymbol: 1 }] }] }))).toBeNull();
  });
});

describe("evaluating a past suggestion at a later date", () => {
  const build = () => {
    const chain = [
      appendSignal([], draft({
        recordedAt: 1_700_000_000_000,
        suggestions: [
          { symbol: "ACME", referencePrice: 100, score: 90, detail: "rank 1" },
          { symbol: "BETA", referencePrice: 50, score: 80, detail: "rank 2" },
          { symbol: "GAMMA", referencePrice: null, score: 70, detail: "no price recorded" },
        ],
      })),
    ];
    return chain[0];
  };

  it("measures the return from the recorded publication price", () => {
    const record = build();
    const report = evaluateRecord(record, { ACME: 130, BETA: 40, GAMMA: 10 }, 1_700_000_000_000 + 30 * 86_400_000);
    expect(report.outcomes[0].returnPct).toBeCloseTo(30, 6); // 130 / 100
    expect(report.outcomes[1].returnPct).toBeCloseTo(-20, 6); // 40 / 50
    expect(report.hits).toBe(1);
    expect(report.misses).toBe(1);
    expect(report.elapsedDays).toBeCloseTo(30, 6);
  });

  it("refuses to evaluate a suggestion with no recorded price", () => {
    const record = build();
    const report = evaluateRecord(record, { ACME: 130, BETA: 40, GAMMA: 10 }, 1_700_000_000_000);
    const gamma = report.outcomes.find((outcome) => outcome.symbol === "GAMMA")!;
    expect(gamma.status).toBe("no-price");
    expect(gamma.returnPct).toBeNull();
  });

  it("marks a suggestion with no later price as not evaluable", () => {
    const record = build();
    const report = evaluateRecord(record, { ACME: 130 }, 1_700_000_000_000);
    expect(report.outcomes.find((outcome) => outcome.symbol === "BETA")!.status).toBe("no-price");
    // The average is taken only over what could actually be evaluated.
    expect(report.averageReturnPct).toBeCloseTo(30, 6);
  });

  it("never writes back into the published record", () => {
    const record = build();
    const before = JSON.stringify(record);
    evaluateRecord(record, { ACME: 130, BETA: 40 }, 1_700_000_000_000);
    expect(JSON.stringify(record)).toBe(before);
    expect(record.hash).toBe(hashRecord(record));
  });
});

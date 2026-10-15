# Signed market-data manifest — specification

This document defines the manifest format, the key-pinning strategy, and the signing
workflow that turns a country's lifecycle from `queued` into a verified `installed` pack.

## 1. Why signing

A market pack is a large file the app downloads and then reads as data. Without a
signature, anything able to answer the request — a compromised CDN edge, a hostile
network, a misconfigured mirror — could substitute its own pack, and the app would render
it as fact. The manifest is the root of that trust: it names each pack's URL and hash, and
it is signed by a key the client already pins.

The client therefore treats the manifest as untrusted until verified, and **fails closed**:

- an unsigned manifest is refused
- a manifest signed by a key id not in the pinned set is refused
- a manifest whose signature does not match its payload is refused
- an expired manifest is refused
- any entry whose URL is not `https://` is refused
- any entry without a well-formed SHA-256 is refused

There is no plain-HTTP fallback and no trust-on-first-use mode. If the manifest cannot be
verified, the app says so and serves the last verified copy from cache instead.

## 2. Format

```json
{
  "payload": {
    "manifestVersion": 1,
    "generatedAt": "2026-10-15T00:00:00Z",
    "expiresAt": "2026-11-15T00:00:00Z",
    "markets": {
      "IN": {
        "version": "1.0.4",
        "minAppVersion": "3.0.0",
        "url": "https://github.com/…/india-1.0.4.bin.gz",
        "sizeBytes": 94371840,
        "sha256": "9f2c…"
      },
      "US": {
        "version": "1.0.2",
        "minAppVersion": "3.0.0",
        "sizeBytes": 188743680,
        "sha256": "…",
        "parts": [
          { "index": 1, "url": "https://…/us-1.0.2-part1", "sizeBytes": 94371840, "sha256": "…" },
          { "index": 2, "url": "https://…/us-1.0.2-part2", "sizeBytes": 94371840, "sha256": "…" }
        ]
      }
    }
  },
  "signature": {
    "algorithm": "Ed25519",
    "keyId": "analyzerx-manifest-2026",
    "signature": "e556…"
  }
}
```

**Payload fields**

| Field | Meaning |
|---|---|
| `manifestVersion` | Schema version of the manifest itself. Only `1` is accepted. |
| `generatedAt` | ISO-8601. Informational, but validated as a timestamp. |
| `expiresAt` | ISO-8601. A manifest past this instant is refused, so a leaked old manifest cannot be replayed indefinitely. |
| `markets` | One entry per country, keyed by market id. |

**Per-market entry**

| Field | Meaning |
|---|---|
| `version` | Data version of the pack, `major.minor.patch`. Compared against the installed version. |
| `minAppVersion` | Lowest app version that can parse this pack. Checked **before** downloading, so an incompatible pack is never fetched and half-read. |
| `url` | Absolute HTTPS URL, for a single-file pack. |
| `sizeBytes` | Exact size, for progress. Must be positive. |
| `sha256` | 64 lowercase hex characters. Verified after download, before install. |
| `parts` | Optional. When present, replaces `url`/`sha256`. Indices must be **contiguous from 1** with no duplicates, so a download cannot silently skip a part. |

A pack is either one file (`url` + `sha256`) or several parts (`parts`). It may not be
both, and it may not be neither.

## 3. Canonical serialization

The signature covers a **deterministic** encoding of the payload, not the bytes the server
happened to send. The client re-serializes before verifying:

- object keys sorted at every level
- no insignificant whitespace
- array order preserved, because part order is meaningful
- members whose value is `undefined` are omitted
- a non-finite number is an error rather than a silent `null`

Without this, a server that reordered a key or pretty-printed the JSON would break every
signature. The rule is: **sign `canonicalize(payload)`, verify `canonicalize(payload)`.**

## 4. Key pinning and rotation

Public verification keys are compiled into the app in `PINNED_MANIFEST_KEYS`
(`lib/market-manifest.ts`), keyed by `keyId`. Only public keys ship; the private key never
leaves CI.

Rotation without forcing an app update:

1. Generate a new key pair.
2. Add the new **public** key to `PINNED_MANIFEST_KEYS` and ship it in a normal release.
3. After that release is widely installed, begin signing with the new key id.
4. Remove the old public key once the minimum supported app version pins only the new one.

A manifest signed by an id not in the pinned set is refused outright, so an attacker cannot
introduce their own key.

## 5. Signing workflow (CI)

The private key is stored as a CI secret and never written to the repository.

```bash
# One-time: generate the key pair. Keep the private key in a secret store.
openssl genpkey -algorithm ED25519 -out manifest-signing.pem
openssl pkey -in manifest-signing.pem -pubout -out manifest-signing.pub.pem
# The public key hex (32 bytes) is what goes into PINNED_MANIFEST_KEYS.
```

Signing a manifest:

```bash
# 1. Build the payload, then canonicalize it EXACTLY as the client does.
node scripts/canonicalize-manifest.mjs market-manifest.payload.json > canonical.bin

# 2. Sign the canonical bytes.
openssl pkeyutl -sign -inkey manifest-signing.pem -rawin -in canonical.bin -out signature.bin

# 3. Wrap into the published manifest.
node scripts/assemble-manifest.mjs canonical.bin signature.bin <keyId> > market-manifest.json
```

Publish `market-manifest.json` as a GitHub Release asset under a stable tag so the app's
`DEFAULT_MANIFEST_URL` always resolves to the newest one. The app never fetches a pack URL
that did not come out of a verified manifest.

## 6. Client behaviour

`lib/market-manifest-client.ts`:

1. **Refuse a non-HTTPS manifest URL** before making any request.
2. **Fetch with a hard timeout** (default 5 s) via `AbortController`, so the request is
   genuinely cancelled rather than abandoned — a slow response cannot arrive later and be
   mistaken for fresh.
3. **Verify the signature first**, over the canonical payload, before reading any entry.
4. **Cache only after verification**, so the cache cannot be poisoned by a bad response.
5. **Fall back to the cache on any failure**, marking the result `stale` and attaching the
   reason, so the UI can say "showing last known data" rather than crashing or pretending
   the fetch succeeded.
6. **Attempt once per call.** There is no retry loop on the launch path.

## 7. From manifest to lifecycle

`planMarketPacks` maps each country's diff onto the lifecycle state machine:

| Remote vs local | Lifecycle state | What the user sees |
|---|---|---|
| No local pack | `queued` | Ready to download, with the size |
| Remote newer | `update-available` | Update available, with both versions |
| Equal | `installed` | Up to date |
| Local newer | `installed` | Installed copy is newer; nothing offered |
| `minAppVersion` unmet | `not-downloaded` | Needs a newer app; not downloaded |

The download itself then runs `queued → downloading → verifying → installed`, and the
`verifying → installed` step is gated on the SHA-256 in this manifest matching the bytes
actually written to disk.

## 8. Verification status

- Ed25519 verification (`lib/ed25519.ts`) is validated against the **RFC 8032 §7.1 test
  vectors**, and the test-only signer (`tests/helpers/manifest-signer.ts`) reproduces the
  published signatures for those vectors. Both halves agree with the standard.
- SHA-512 (`lib/sha512.ts`) is validated against the **NIST test vectors**.
- Manifest verification, tamper rejection, version diffing and offline fallback are
  covered by 32 checks run against the real modules.
- The private key, the CI signing step and the hosted packs **do not exist yet**. The
  `keyId` currently pinned is the RFC 8032 test key so the verification path is exercised
  end to end; it must be replaced with the production public key before any pack is
  published. Until then every country reaches `queued` and stops, because there is nothing
  to download.

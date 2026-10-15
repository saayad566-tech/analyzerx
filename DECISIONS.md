# DECISIONS.md

| # | Decision | Why | Alternatives rejected |
|---|---|---|---|
| 1 | Pure core + platform adapters for resource packs | Unit-testable in plain Node; no RN coupling in logic | Importing expo-file-system everywhere (untestable) |
| 2 | Asset packs shipped as **separate repo** `analyzerx-assets` | Keeps code repo small; user's explicit requirement | Bundling assets in code repo (size) |
| 3 | Chunk size 4 MiB | Well under GitHub's 100 MB/file and 25 MB web-upload limits; matches existing CI split | 100 MB single files |
| 4 | SHA-256 per chunk **and** per assembled file | Detects both transit corruption and ordering/mixing errors | Size-only checks |
| 5 | Atomic activation (temp dir -> final rename) | A partial/corrupt pack must never be readable | In-place writes |
| 6 | Unsupported markets return **empty** data + notice | Truthfulness; no cross-market rows ever | Falling back to India data (the defect) |
| 7 | Add `marketId` to flows + graph procedures | Server must scope like the client does | Client-side filtering only |
| 8 | Add **no** new dependencies | Keep install/CI stable; zod/expo-crypto/expo-file-system already present | New HTTP/zip libs |
| 9 | Publish via GitHub MCP to a branch + PR | Non-destructive; keeps history reviewable | Force-push to main |

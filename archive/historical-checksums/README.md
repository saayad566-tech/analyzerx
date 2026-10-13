# Historical artifact checksums

This directory holds checksum metadata for build artifacts that are **not**
present in the repository. It exists so that such files are explicitly marked as
historical and cannot be mistaken for a current release artifact, while their
contents are preserved rather than deleted.

## `AnalyzerX-1.0.1-updated.apk.sha256`

```
e3a6e39e4ada5837e0a012f41a5ac2c2ed38004e020c9bbacc18a71d8e5e8971  AnalyzerX-1.0.1-updated.apk
```

**Status: provenance not established.** This file was found at the repository
root with no corresponding APK anywhere in the tree.

What was checked (13 October 2026):

- No `*.apk` file named `AnalyzerX-1.0.1-updated.apk` exists in the repository.
- The GitHub release/tag history for `saayad566-tech/analyzerx` contains **no
  1.0.1 release or tag**; the earliest retained CI artifact tag is
  `apk-1.4.0-13`, and the version sequence runs `1.4.0` → `3.2.0`.
- The name does not follow the current CI naming convention
  (`app-release.apk` / `analyzerx-<version>.apk`), so it was not produced by the
  current workflow.

Because the artifact is unavailable and its origin cannot be verified, the file
was **retained** and relocated here rather than deleted, and **no checksum was
fabricated or regenerated**. If the corresponding APK is ever located, verify it
against the value above before treating this as authoritative.

Newly generated checksum metadata must never refer to a nonexistent artifact:
`scripts/checksum-artifact.mjs` refuses to write a checksum for a missing or
empty file, and `scripts/release-readiness.mjs` fails if any `*.apk.sha256`
outside this `archive/` directory lacks a matching artifact.

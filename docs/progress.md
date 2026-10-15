# AnalyzerX — progress

Updated at the end of every slice. A slice is finished only when its check has been run
and its real output recorded here.

## Done

### Slice 1 — orphans and dead wiring
- Removed three Expo-starter components that nothing imported: `components/hello-wave.tsx`,
  `components/parallax-scroll-view.tsx`, `components/external-link.tsx`.
- Checked and dismissed two false alarms: `lib/forge-shelf-filesystem.ts` IS imported by
  `lib/forge-shelf.ts` (a naive grep missed the `./` relative form), and
  `app/workstation-runner/index.tsx` IS reachable from `app/account.tsx`.
- `app/dev/theme-lab.tsx` no longer renders outside `__DEV__`.

### Slice 2 — features built but not surfaced
- **Natural-language screener now has a UI.** `lib/nl-screener.ts` was built and tested
  but nothing imported it. `components/nl-screener-panel.tsx` is now wired into the
  Screener screen. It shows the parse BEFORE running, lists anything it could not
  understand rather than dropping it, and screens only the selected market's own seed
  symbols against that market's own price history.
- **Indicators now have a screen.** `/chart` renders candlesticks with 8 timeframes and
  overlay/panel indicators, linked from the company screen and registered in
  `lib/app-inventory.ts`.
- `priceHistory()` now returns full OHLCV bars; it previously discarded open, high, low
  and volume, which made candlesticks and every volume indicator impossible.

### Slice 3 — artifact size (mandate §4)
- **Per-ABI APK splits enabled.** The universal APK carried both architectures and
  measured 111 MB, over GitHub's 100 MB per-file limit, which is why the release step had
  to chop it into parts. `android/app/build.gradle` now sets `splits.abi` for
  `arm64-v8a` and `x86_64` with `universalApk false`.
- The workflow signs, checksums and publishes **every** per-ABI APK, not just the first,
  and stages each on the artifact branch.

### Slice 4 — keyboard (reported defect)
- `app/general-chat.tsx` used the pre-edge-to-edge keyboard assumption and never applied
  the keyboard inset, so its composer sat under the keyboard on Android. Fixed.

## Checks run

| Check | Result |
|---|---|
| Indicator engine, 48 assertions | PASS (local) |
| NL screener engine, 24 assertions | PASS (local) |
| Chart geometry, 22 assertions | PASS (local) |
| `pnpm check` (strict tsc) | PASS (CI run 107) |
| Full test suite | PASS (CI run 107) |
| Market isolation gate | PASS (CI run 107) |
| Emulator verification | PASS (run 50) |

## Next

1. Re-run CI with the ABI splits and confirm both APKs are under 100 MB and both install.
2. Slice 6 — country data packs (signed manifest, resumable in-app download, hash check).
3. Slice 7 — in-app news reader.
4. Slice 12 — triage the 247 unticked lines in `todo.md` against the current tree.

## Blockers

- **ARM64 hardware execution**: no physical device and the emulator is x86_64, so the
  arm64 APK is built and verified as an artifact but never executed on real arm64
  hardware.
- **Production database**: the migration is verified against a real MariaDB 11 instance
  built locally, not against the production instance, which is not reachable from here.
- **Release signing**: the build is debug-signed and v2-only because
  `ANDROID_KEYSTORE_BASE64` is not set. Play will reject a debug-signed APK. The workflow
  already supports the release key; the secret must be added by the repository owner.

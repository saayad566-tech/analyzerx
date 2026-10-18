# Expo → Bare React Native migration plan

**Status: COMPLETE — zero `expo-*` / `@expo/*` packages remain in `package.json`.**

---

## Why this document was rewritten

The previous version described Stage 2 (peripheral swaps) and Stage 3 (routing) as **pending**.
`package.json` proved both were **already done**. That staleness is a real hazard: anyone executing
the old plan as written would redo finished work and could break a working tree. The stages below now
record what is actually true.

## Verification standard (unchanged, and still binding)

`tsc` proves types, not behaviour. A navigation rewrite and native-project regeneration cannot be
validated in the build sandbox (no emulator, no device, and the pod's 2 GB ceiling cannot complete an
Android build). Every stage ends with `tsc` + the test suite, and **the stages marked NEEDS DEVICE
additionally require a device or CI run** before they can be called done. A stage is not "complete"
on a green type-check alone.

---

## Stage 1 — DONE (verified: tsc 0 errors, 293 tests passing)

`@expo/vector-icons` → `react-native-vector-icons`

- 39 files rewritten.
- `keyof typeof Ionicons.glyphMap` replaced by `IoniconName` in `lib/icon-names.ts`.
- Native step: `apply from: file("../../node_modules/react-native-vector-icons/fonts.gradle")` in
  `android/app/build.gradle`. Without it icons render blank at runtime — a failure `tsc` cannot detect.

## Stage 2 — DONE (previously marked pending — it was already complete)

Every replacement is present in `package.json`:

| Expo package | Replacement | Present |
|---|---|---|
| `expo-clipboard` | `@react-native-clipboard/clipboard` | ✅ |
| `expo-haptics` | `react-native-haptic-feedback` | ✅ |
| `expo-device` | `react-native-device-info` | ✅ |
| `expo-sharing` | `react-native-share` | ✅ |
| `expo-secure-store` | `react-native-keychain` | ✅ |
| `expo-file-system` | `react-native-fs` | ✅ |
| `expo-print` | `react-native-print` | ✅ |
| `expo-web-browser` | `react-native-inappbrowser-reborn` | ✅ |
| `expo-document-picker` | `@react-native-documents/picker` | ✅ |
| `expo-image-picker` | `react-native-image-picker` | ✅ |
| `expo-constants`, `expo-linking`, `expo-status-bar`, `expo-symbols`, `expo-battery` | removed / mapped | ✅ |

## Stage 3 — DONE in code (previously marked NEEDS DEVICE — the code is complete)

`expo-router` (43 files) → `@react-navigation/native` + `/native-stack` + `/bottom-tabs` + `/elements`.

**`expo-router` is absent from `package.json`.** The navigation tree is declarative. Type-level
correctness is established; **behavioural correctness still requires a device run** — a back-stack or
deep-link regression is exactly what `tsc` cannot see.

## Stage 4 — config DONE · native project NEEDS DEVICE

- `babel.config.js` → `@react-native/babel-preset` ✅ (no longer `babel-preset-expo`)
- `metro.base.js` → `@react-native/metro-config` ✅ (no longer `expo/metro-config`)
- `tsconfig.json` → 0 expo references ✅
- `app.config.ts`, `expo-env.d.ts`, `plugins/with-analyzerx-local-ai.*`, `expo-modules-autolinking` — **purged** ✅
- **NEEDS DEVICE:** `android/app/src/main/java/.../MainActivity.kt` and `MainApplication` previously
  imported `expo.modules.*`; confirm the bare equivalents build and boot.

## Stage 5 — DONE on this branch (the final four packages)

| Package | Replacement | Notes |
|---|---|---|
| `expo-audio` | `react-native-audio-recorder-player` via `lib/platform/audio.ts` | **recording only** — see below |
| `expo-notifications` | `@react-native-firebase/messaging` + `@notifee/react-native` via `lib/platform/notifications.ts` | FCM with graceful fallback |
| `eslint-config-expo` | `@react-native/eslint-config/flat` | dev-only, lint-only |
| `expo` (core) | removed | nothing left depends on it |

Both new modules follow the existing **`lib/platform/*` adapter pattern** — screens never import a
native library directly. Only two call sites changed:
`app/market-chat.tsx` (audio) and `app/_layout.tsx` (notifications).

### Finding: `expo-audio` was recording only

A grep across `app/`, `components/`, `hooks/`, `lib/` and `packages/` found **no audio playback call
site**. `react-native-track-player` was therefore **not** added — an unused dependency is bloat. Add
it together with the playback feature that needs it.

### Decision: FCM, and what it costs

Push now requires a Firebase project (`google-services.json` / `GoogleService-Info.plist`). This is a
**new external credential requirement**, explicitly authorised.

**Degradation is by design:** if Firebase is not configured, `getPushTokenAsync()` resolves to `null`,
push registration is skipped, and the app keeps working with local notifications only — the same
behaviour the Expo path had (KNOWN_ISSUES K13). Nothing in the new module can throw a cold start.

---

## Remaining work

1. **Device or CI verification** of Stages 3–4 and the two new wrappers. Not possible in the build
   sandbox — see the verification standard above.
2. **Add `google-services.json`** to `android/app/`, or accept local-notifications-only.
3. **`babel.config.js` still inlines `EXPO_PUBLIC_*`.** Functional, not broken — the inlining plugin
   keeps those env vars working. Rename the prefix to a non-Expo name when convenient.
4. **`todo.md` is 141 KB / 1,856 lines at the repo root.** Move it to an issue tracker or split it by
   area — it is dead weight in every clone and every agent context window.
5. **Run `tsc` + the test suite on this branch in CI.** Not runnable in the build sandbox.

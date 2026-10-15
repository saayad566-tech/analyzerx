# Expo → Bare React Native migration plan

Target: zero `expo-*` / `@expo/*` dependencies. Authorised by the user; the deadlock over the 25
framework packages is resolved.

**Verification constraint that shapes the whole plan.** `tsc` proves types, not behaviour. A navigation
rewrite and native-project regeneration cannot be validated in the build sandbox (no emulator, no
device, and the pod's 2 GB ceiling cannot complete an Android build). Every stage below therefore ends
with `tsc` + the 293-test suite, and **Stage 3 and 4 additionally require a device or CI run** before
they can be called done. A stage is not "complete" on a green type-check alone.

## Stage 1 — DONE (verified: tsc 0 errors, 293 tests passing)
`@expo/vector-icons` → `react-native-vector-icons`
- 39 files rewritten: `import { Ionicons } from "@expo/vector-icons"` → `import Ionicons from "react-native-vector-icons/Ionicons"`.
- `keyof typeof Ionicons.glyphMap` (an Expo-only type) replaced by `IoniconName` in `lib/icon-names.ts`,
  derived from the component's own props so the call sites stay type-checked.
- Native step added: `apply from: file("../../node_modules/react-native-vector-icons/fonts.gradle")`
  in `android/app/build.gradle`, which bundles the icon fonts into the APK. Without it the icons render
  as blank glyphs at runtime — a failure `tsc` cannot detect.
- `@types/react-native-vector-icons` added as a devDependency.

## Stage 2 — peripheral library swaps (mechanical, tsc-verifiable)
Each: add the replacement, rewrite imports, adapt the API, remove the Expo package, `tsc`.

| Expo package | Replacement | Sites | API mapping |
|---|---|---|---|
| `expo-clipboard` | `@react-native-clipboard/clipboard` | 4 | `setStringAsync`/`getStringAsync` → `setString`/`getString` |
| `expo-haptics` | `react-native-haptic-feedback` | 1 | `impactAsync` → `trigger` |
| `expo-device` | `react-native-device-info` | 1 | `Device.modelName` → `getModel()` |
| `expo-sharing` | `react-native-share` | 5 | `shareAsync(uri)` → `Share.open({ url })`; `isAvailableAsync()` → `Share.isPackageInstalled` check |
| `expo-secure-store` | `react-native-keychain` | 3 | `setItemAsync`/`getItemAsync`/`deleteItemAsync` → `setGenericPassword`/`getGenericPassword`/`resetGenericPassword` |
| `expo-file-system` | `react-native-fs` | 7 | `documentDirectory` → `RNFS.DocumentDirectoryPath`; `writeAsStringAsync` → `writeFile`; `readAsStringAsync` → `readFile`; `deleteAsync` → `unlink`; `getInfoAsync` → `stat`; `makeDirectoryAsync` → `mkdir`; `getFreeDiskStorageAsync` → `getFSInfo`; `createDownloadResumable` → `downloadFile` |
| `expo-constants` | `react-native-device-info` + a build-time constant | 2 | `Constants.expoConfig` → injected constants |
| `expo-linking` | `react-native` `Linking` | 3 | `openURL` → `Linking.openURL` |
| `expo-status-bar` | `react-native` `StatusBar` | 1 | same API |
| `expo-symbols` | `react-native-vector-icons` | 2 | SF Symbols have no bare equivalent; map to the closest icon |
| `expo-battery`, `expo-print`, `expo-web-browser`, `expo-document-picker`, `expo-image-picker`, `expo-notifications`, `expo-audio` | `react-native-device-info`, `react-native-print`, `react-native-inappbrowser-reborn`, `@react-native-documents/picker`, `react-native-image-picker`, `@notifee/react-native` + FCM, `react-native-track-player` | 1–2 each | per-package |

## Stage 3 — routing rewrite (architectural, NEEDS DEVICE VERIFICATION)
`expo-router` (43 files) → `@react-navigation/native` + `@react-navigation/native-stack`.
This is not an import swap. expo-router is **file-based** (`app/(tabs)/index.tsx`, `app/company/[symbol].tsx`);
React Navigation is a **declarative navigator tree**. Every route, tab bar, deep link, dynamic segment
and back behaviour must be re-expressed. tsc will confirm the types and cannot confirm that a single
navigation works. **Must be verified on a device.**

## Stage 4 — native project + config (NEEDS DEVICE VERIFICATION)
- `android/app/src/main/java/.../MainActivity.kt` currently imports `expo.modules.splashscreen.SplashScreenManager`
  and `expo.modules.ReactActivityDelegateWrapper`; `MainApplication` likewise. These must be replaced
  with the bare React Native equivalents, and `android/settings.gradle` / `build.gradle` moved off
  `expo-modules-autolinking`.
- Purge `app.config.ts`, `plugins/with-analyzerx-local-ai.*`, `expo-env.d.ts`, and move `babel.config.js`
  off `babel-preset-expo`, `metro.config.js` off `expo/metro-config`, `tsconfig.json` off `expo/tsconfig.base`.
- Regenerating this native project is the step that cannot be done blind: it is what makes the APK
  buildable, and there is no way to prove it here.

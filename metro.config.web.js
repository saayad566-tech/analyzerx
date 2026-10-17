/**
 * Metro configuration for the web / desktop (Electron) bundle.
 *
 * The app targets Android natively and web through `react-native-web`. This config extends the bare
 * React Native config with the three things a web bundle needs:
 *   1. the `web` platform, resolved first;
 *   2. `react-native` aliased to `react-native-web`;
 *   3. a stub for the native-only modules that ship no browser build, so the bundle resolves instead
 *      of failing — each stub throws a labelled "not available on desktop" error rather than
 *      returning a fake value.
 *
 * Android keeps using `metro.config.js`; nothing here is loaded for a native build.
 */
const path = require("path");
const base = require("./metro.config.js");

/** Native modules with no browser implementation. Resolved to the stub below on web. */
const NATIVE_ONLY = new Set([
  "react-native-udp",
  "react-native-fs",
  "react-native-keychain",
  "react-native-print",
  "react-native-image-picker",
  "@react-native-documents/picker",
  "react-native-inappbrowser-reborn",
  "react-native-haptic-feedback",
  "react-native-share",
  "react-native-device-info",
  "expo-notifications",
  "expo-audio",
]);

const STUB = path.join(__dirname, "desktop", "web-module-stub.js");
const baseResolve = base.resolver.resolveRequest;

module.exports = {
  ...base,
  resolver: {
    ...base.resolver,
    platforms: ["web", "ios", "android", "native"],
    resolveRequest: (context, moduleName, platform) => {
      if (platform === "web") {
        if (NATIVE_ONLY.has(moduleName)) {
          return { type: "sourceFile", filePath: STUB };
        }
        if (moduleName === "react-native") {
          return context.resolveRequest(context, "react-native-web", platform);
        }
      }
      return baseResolve(context, moduleName, platform);
    },
  },
};

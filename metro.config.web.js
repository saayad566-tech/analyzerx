/**
 * Metro configuration for the web / desktop (Electron) bundle.
 *
 * The app targets Android natively and web through `react-native-web`. This config wraps the shared
 * resolver (`metro.base.js`) with three things a web bundle needs:
 *   1. the `web` platform, resolved first;
 *   2. `react-native` aliased to `react-native-web`;
 *   3. a stub for the native-only modules that ship no browser build, so the bundle resolves instead
 *      of failing — each stub throws a labelled "not available on desktop" error rather than
 *      returning a fake value.
 *
 * NativeWind is deliberately **not** applied here. Its Metro integration serves `global.css` as a
 * virtual file that cannot be SHA-1'd during a one-shot web bundle ("Failed to get the SHA-1 for
 * …web.css"). Instead `pnpm web:bundle` generates the stylesheet with the Tailwind CLI and links it
 * from `index.html`, and every `.css` import resolves to an empty module (see `web-css-stub.js`).
 *
 * Android keeps using `metro.config.js`; nothing here is loaded for a native build.
 */
const path = require("path");
const base = require("./metro.base.js");

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
  "@react-native-firebase/messaging",
  "@notifee/react-native",
  "react-native-audio-recorder-player",
]);

const MODULE_STUB = path.join(__dirname, "desktop", "web-module-stub.js");
const CSS_STUB = path.join(__dirname, "desktop", "web-css-stub.js");
const baseResolve = base.resolver.resolveRequest;

module.exports = {
  ...base,
  resolver: {
    ...base.resolver,
    platforms: ["web", "ios", "android", "native"],
    resolveRequest: (context, moduleName, platform) => {
      if (platform === "web") {
        if (NATIVE_ONLY.has(moduleName)) {
          return { type: "sourceFile", filePath: MODULE_STUB };
        }
        if (moduleName.endsWith(".css")) {
          return { type: "sourceFile", filePath: CSS_STUB };
        }
        if (moduleName === "react-native") {
          return context.resolveRequest(context, "react-native-web", platform);
        }
      }
      return baseResolve(context, moduleName, platform);
    },
  },
};

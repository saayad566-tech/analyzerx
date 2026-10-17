// Shared bare React Native Metro configuration.
//
// `expo/metro-config` previously supplied the defaults, resolved the tsconfig `paths` aliases, and
// redirected a handful of React Native specifiers. A bare project must do all three itself.
//
// This module is the unwrapped config (no NativeWind). `metro.config.js` and `metro.config.web.js`
// each wrap it with their own NativeWind options, so the native and web bundles resolve through one
// implementation.
const path = require("path");
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");

const root = __dirname;

// Mirrors `compilerOptions.paths` in tsconfig.json:
//   "@/*"       -> "./*"
//   "@shared/*" -> "./shared/*"
const PATH_ALIASES = [
  ["@shared/", path.join(root, "shared") + path.sep],
  ["@/", root + path.sep],
];

// Specifiers that React Native's own package.json does not export correctly.
// `react-native/asset-registry` has no `./asset-registry` export; the `./*` wildcard maps it to
// `./asset-registry`, which does not exist in the published package. Every bundled asset (any
// required .png) resolves through it, so without this redirect asset bundling fails outright.
const SPECIFIER_REDIRECTS = {
  "react-native/asset-registry": "@react-native/assets-registry/registry",
};

function resolveAlias(moduleName) {
  for (const [prefix, target] of PATH_ALIASES) {
    if (moduleName.startsWith(prefix)) {
      return path.join(target, moduleName.slice(prefix.length));
    }
  }
  return null;
}

const defaultConfig = getDefaultConfig(root);
const upstreamResolveRequest = defaultConfig.resolver && defaultConfig.resolver.resolveRequest;

module.exports = mergeConfig(defaultConfig, {
  // The workspace packages are source-linked, so Metro must watch and resolve them.
  watchFolders: [path.join(root, "packages")],
  resolver: {
    resolveRequest: (context, moduleName, platform) => {
      const redirect = SPECIFIER_REDIRECTS[moduleName];
      if (redirect) return context.resolveRequest(context, redirect, platform);

      const aliased = resolveAlias(moduleName);
      if (aliased) {
        // Resolve the project-root alias from the project root, not the importing module.
        return context.resolveRequest(
          { ...context, originModulePath: path.join(root, "index.js") },
          aliased,
          platform,
        );
      }

      // Chain to the React Native default resolver: it handles `react-native/*` subpath resolution
      // that the bare default does not. Replacing it breaks those paths.
      if (upstreamResolveRequest) return upstreamResolveRequest(context, moduleName, platform);
      return context.resolveRequest(context, moduleName, platform);
    },
  },
});

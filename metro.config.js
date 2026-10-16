// Bare React Native Metro configuration.
//
// `expo/metro-config` previously supplied the defaults *and* resolved the tsconfig `paths` aliases.
// The React Native defaults are equivalent for a bare project, but they do not read tsconfig, so the
// `@/` and `@shared/` aliases are resolved here.
//
// IMPORTANT: the React Native default config installs its own `resolveRequest` (it handles
// `react-native/*` subpath resolution — e.g. `react-native/asset-registry`, which every bundled PNG
// asset requires). A custom `resolveRequest` *replaces* it, so the original is captured and chained
// to for every module that is not an alias. Replacing it outright breaks asset bundling.
const path = require("path");
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");
const { withNativeWind } = require("nativewind/metro");

const root = __dirname;

// Mirrors `compilerOptions.paths` in tsconfig.json:
//   "@/*"       -> "./*"
//   "@shared/*" -> "./shared/*"
const PATH_ALIASES = [
  ["@shared/", path.join(root, "shared") + path.sep],
  ["@/", root + path.sep],
];

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

const base = mergeConfig(defaultConfig, {
  // The workspace packages are source-linked, so Metro must watch and resolve them.
  watchFolders: [path.join(root, "packages")],
  resolver: {
    resolveRequest: (context, moduleName, platform) => {
      const aliased = resolveAlias(moduleName);
      if (aliased) {
        // The alias target is a project path; resolve it relative to the project root.
        return context.resolveRequest(
          { ...context, originModulePath: path.join(root, "index.js") },
          aliased,
          platform,
        );
      }
      if (upstreamResolveRequest) return upstreamResolveRequest(context, moduleName, platform);
      return context.resolveRequest(context, moduleName, platform);
    },
  },
});

module.exports = withNativeWind(base, {
  input: "./global.css",
  // Keep CSS virtual during production export to avoid Metro hashing a file
  // that NativeWind may regenerate or remove while the bundle is being built.
  forceWriteFileSystem: false,
});

// Bare React Native Metro configuration. `expo/metro-config` previously supplied the defaults; the
// React Native defaults are equivalent for a bare project, and NativeWind still wraps the result.
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = mergeConfig(getDefaultConfig(__dirname), {
  // The workspace packages are source-linked, so Metro must watch and resolve them.
  watchFolders: [__dirname + "/packages"],
});

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Keep CSS virtual during production export to avoid Metro hashing a file
  // that NativeWind may regenerate or remove while the bundle is being built.
  forceWriteFileSystem: false,
});

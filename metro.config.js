const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Keep CSS virtual during production export to avoid Metro hashing a file
  // that NativeWind may regenerate or remove while the bundle is being built.
  forceWriteFileSystem: false,
});

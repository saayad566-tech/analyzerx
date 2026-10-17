// Bare React Native Metro configuration (Android / iOS / native).
//
// The resolver lives in `metro.base.js`; this file only adds the NativeWind transform. The web /
// desktop build uses `metro.config.web.js`, which wraps the same base with `forceWriteFileSystem:
// true` (the web bundle needs NativeWind's CSS written to disk; the native build keeps it virtual).
const { withNativeWind } = require("nativewind/metro");
const base = require("./metro.base.js");

module.exports = withNativeWind(base, {
  input: "./global.css",
  // Keep CSS virtual during production export to avoid Metro hashing a file
  // that NativeWind may regenerate or remove while the bundle is being built.
  forceWriteFileSystem: false,
});

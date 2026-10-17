/**
 * Web stub for native-only modules.
 *
 * Metro resolves the web bundle against this file for any module that has no browser implementation
 * (see NATIVE_ONLY in `metro.config.web.js`). Every export is a function that throws a labelled error
 * rather than returning a fake value, so a surface that reaches it reports "unavailable on desktop"
 * instead of silently pretending to work. The desktop platform adapters in `lib/platform/*.web.ts`
 * replace this stub for the adapters that have a real browser implementation.
 */
const MODULE = "a native module with no desktop implementation";
function unavailable() {
  throw new Error(`Not available on desktop: ${MODULE}`);
}
const handler = { get: () => unavailable, apply: unavailable };
module.exports = new Proxy(unavailable, handler);

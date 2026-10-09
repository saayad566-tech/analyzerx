# Tidio Integration Findings

The supplied Tidio script is loaded through a client-side component mounted in the Expo root layout. The loader is guarded by `Platform.OS === "web"`, checks for an existing script ID to avoid duplicate injection, loads the HTTPS script asynchronously, and cleans up the element during unmount. Native Android and iOS runtimes do not access `document` and do not execute the widget loader.

TypeScript, the full Vitest suite, and lint passed after the integration. The web preview rendered the Market Event Intelligence Live Events page normally and displayed the existing tracker UI. The Tidio launcher was not visible in the captured preview, so third-party widget rendering may be delayed, blocked by the preview environment, or require the Tidio account/site configuration. The script injection itself is not treated as proof that the external chat service is available.

// https://docs.expo.dev/guides/using-eslint/
import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

export default defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // The Expo preset configures only the Node import resolver, which resolves a
    // bare specifier to a literal path and does not follow a package's `exports`
    // map. `@modelcontextprotocol/sdk` exposes its client entry points only
    // through `exports` (e.g. "./client/stdio.js" -> "./dist/cjs/client/stdio.js"),
    // so the Node resolver reports them as unresolved even though Node and
    // TypeScript both resolve them. Add a resolver that follows Node's own
    // resolution (including `exports`) instead of disabling the rule.
    settings: {
      "import/resolver": {
        "node-exports": {},
        node: {
          extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json", ".node"],
        },
      },
    },
  },
]);

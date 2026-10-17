// Flat ESLint configuration.
//
// `eslint-config-expo` supplies the React / React Native / TypeScript rule set and is a lint-only
// devDependency — the app itself is a bare React Native project (see MIGRATION_PLAN.md).
import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

export default defineConfig([
  expoConfig,
  {
    // Node build scripts and the root config files run on Node, not on a device, so the Node
    // globals they legitimately use (`Buffer`, `process`, `__dirname`, ...) are declared here
    // rather than being reported as `no-undef`.
    files: [
      "scripts/**/*.{js,mjs,cjs}",
      "desktop/**/*.{js,cjs,mjs}",
      "**/*.config.js",
      "**/*.config.*.js",
      "eslint.config.js",
    ],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        process: "readonly",
        console: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        module: "readonly",
        require: "readonly",
        global: "readonly",
      },
    },
  },
  {
    // `@modelcontextprotocol/sdk` exposes its subpaths through a package `exports` map that uses a
    // wildcard (`"./*"`). The default `node` resolver does not follow wildcard exports, so those
    // two imports were reported as unresolved even though `tsc` and Node both resolve them. The
    // TypeScript resolver (already present via `eslint-config-expo`) resolves them exactly as
    // `tsc` does. This is a resolver configuration, not a suppression.
    settings: {
      "import/resolver": {
        typescript: { project: "./tsconfig.json" },
        node: true,
      },
    },
  },
  {
    // `@modelcontextprotocol/sdk` publishes its subpaths through an `exports` map that uses a
    // wildcard (`"./*": { "import": "./dist/esm/*", "require": "./dist/cjs/*" }`). Both specifiers
    // below resolve under `tsc` (`pnpm check` is clean) and at runtime — verified with
    // `require.resolve("@modelcontextprotocol/sdk/client/stdio.js")`, which returns
    // `.../dist/cjs/client/stdio.js`. Neither the node nor the TypeScript ESLint resolver follows
    // wildcard `exports`, so the rule reported a false "unresolved". This is a resolver
    // limitation, not an unresolved module, so the rule is scoped off for this package only
    // (the regex is anchored to the package, not a blanket rule disable).
    files: ["server/india-stock-mcp.ts"],
    rules: {
      "import/no-unresolved": ["error", { ignore: ["^@modelcontextprotocol/sdk/"] }],
    },
  },
  {
    ignores: ["dist/*"],
  },
]);

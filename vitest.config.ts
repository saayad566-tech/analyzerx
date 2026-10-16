import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * The application imports through the `@/` alias declared in `tsconfig.json` `paths`. Vite does not
 * read tsconfig `paths` on its own, so the same mapping is declared here. Without it, any test that
 * (directly or transitively) imports through `@/` fails to load — which is what the CI was doing.
 *
 * Only the alias is declared: environment and test discovery keep Vite's defaults so that which
 * tests run does not change.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      "@shared": path.join(root, "shared"),
    },
  },
});

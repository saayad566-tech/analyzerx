#!/usr/bin/env node
/**
 * Static market-isolation guard.
 *
 * Fails the build when a file silently defaults a market to India. This is the
 * enforcement half of the isolation work: the rules already existed in prose, and a
 * rule that is not checked is not a rule.
 *
 * What counts as a violation:
 *   ?? "IN"        a nullish fallback to India
 *   || "IN"        a falsy fallback to India
 *   x = "IN"       an assignment default to India (NOT ===, !==, ==, !=)
 *   .default("IN") a tRPC/zod input defaulting to India
 *
 * What does NOT: comparisons (`=== "IN"`), the declared default constant, and the
 * India-only allow-list below, where India genuinely is the only correct market.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
// Staged enforcement: by default this reports and exits 0, so it can run in CI as a
// visible, honest count without blocking on work that is still in progress. Pass
// --strict to make any finding fail the build. Flip CI to --strict once the count is 0.
const STRICT = process.argv.includes("--strict");
const SCAN_DIRS = ["server", "lib", "app", "components", "shared", "hooks"];
const EXT = /\.(ts|tsx|mjs|js)$/;

/**
 * Files where India is legitimately the only market. Every entry needs a reason.
 * This list is deliberately small; anything added here is a promise that the file
 * cannot leak Indian data into another market's view.
 */
const ALLOW_ALL = new Set([
  "lib/market-regions.ts",   // declares DEFAULT_MARKET_ID and the India profile itself
  "lib/market-registry.ts",  // country reference data; ISO2 codes are not market defaults
  "lib/market-coverage.ts",  // India is the deepest market; the literal is a comparison
  "lib/market-schema.ts",    // defines the market enum itself
]);

/**
 * Files excused ONLY for the assignment-default rule (a parameter default like
 * `marketId: MarketId = "IN"`). A `?? "IN"` in the same file still fails. Each of
 * these is a tracked next step, listed in docs/PLAN.md Phase B.
 */
const ALLOW_ASSIGNMENT_DEFAULT = new Set([
  "server/news-tracker.ts",
  "server/optional-providers.ts",
  "server/live-smart-alerts.ts",
  "server/market-chat.ts",
  "lib/open-data/engine.ts",
  "lib/open-data/core.ts",
  "lib/open-data/fundamentals.ts",
  "lib/open-data/link.ts",
  "lib/pdf.ts",
]);

/** True when this file+rule pair is explicitly excused. */
function isAllowed(file, ruleId) {
  if (ALLOW_ALL.has(file)) return true;
  return ruleId === "assignment-default" && ALLOW_ASSIGNMENT_DEFAULT.has(file);
}

// Precise patterns: a comparison is not a fallback.
const PATTERNS = [
  { id: "nullish-fallback", re: /\?\?\s*["']IN["']/g, note: '?? "IN" silently treats a missing market as India' },
  { id: "falsy-fallback", re: /\|\|\s*["']IN["']/g, note: '|| "IN" silently treats an absent market as India' },
  { id: "assignment-default", re: /(?<![=!<>+\-*/%&|^])=(?!=)\s*["']IN["']/g, note: '= "IN" defaults a market variable to India' },
  { id: "schema-default", re: /\.default\(\s*["']IN["']\s*\)/g, note: '.default("IN") makes India the server-side default' },
];

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git" || entry === "dist" || entry === "build") continue;
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, out);
    else if (EXT.test(entry)) out.push(full);
  }
  return out;
}

const findings = [];
for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file).split(sep).join("/");
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      // Ignore comments: the rule is about code, not about prose describing it.
      const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
      for (const { id, re, note } of PATTERNS) {
        re.lastIndex = 0;
        if (re.test(code) && !isAllowed(rel, id)) findings.push({ file: rel, line: index + 1, id, note, text: line.trim().slice(0, 120) });
      }
    });
  }
}

if (findings.length === 0) {
  console.log("market-isolation: PASS - no silent India fallbacks outside the allow-list.");
  process.exit(0);
}

console.error(`market-isolation: ${STRICT ? "FAIL" : "REPORT"} - ${findings.length} silent India fallback(s) outside the allow-list.\n`);
const byFile = new Map();
for (const f of findings) {
  if (!byFile.has(f.file)) byFile.set(f.file, []);
  byFile.get(f.file).push(f);
}
for (const [file, items] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.error(`${file}  (${items.length})`);
  for (const item of items.slice(0, 6)) console.error(`  ${item.line}:${item.id}  ${item.text}`);
}
console.error(`\nFix the cause, or excuse the file+rule in scripts/check-market-isolation.mjs with a reason.`);
process.exit(STRICT ? 1 : 0);

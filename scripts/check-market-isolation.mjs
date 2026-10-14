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
// STRICT BY DEFAULT: every silent India fallback fails the build. Pass --report to
// downgrade to a warning (kept for local triage only; CI never uses it).
const STRICT = !process.argv.includes("--report");
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
const ALLOW_ASSIGNMENT_DEFAULT = new Set([]);

/**
 * Genuinely India-only code, excused per file AND per rule, each with a stated reason.
 *
 * These are not oversights. They are surfaces that exist only for India because no free
 * equivalent exists for any other market, and each is gated at its call site so no other
 * market can reach it. The reasons are printed with the pass result so the excuses stay
 * auditable.
 */
const ALLOW_WITH_REASON = new Map([
  [
    "lib/open-data/link.ts|call-argument-default",
    "The market.indianSnapshot local procedure is India by definition — its name says so and it is only invoked for the India market. It reads NSE/Indian snapshots and must not be generalised.",
  ],
  [
    "server/sector-intelligence.ts|call-argument-default",
    "getSectorConstituents is built on the NSE FII/DII feed and the Indian research universe, neither of which has a free equivalent. It takes no market and is reached only through the market.sectorConstituents handler, which returns an explicit unsupported state for every market other than IN.",
  ],
]);

/** True when this file+rule pair is explicitly excused. */
function isAllowed(file, ruleId) {
  if (ALLOW_ALL.has(file)) return true;
  if (ALLOW_WITH_REASON.has(`${file}|${ruleId}`)) return true;
  return ruleId === "assignment-default" && ALLOW_ASSIGNMENT_DEFAULT.has(file);
}

// Precise patterns: a comparison is not a fallback.
const PATTERNS = [
  { id: "nullish-fallback", re: /\?\?\s*["']IN["']/g, note: '?? "IN" silently treats a missing market as India' },
  { id: "falsy-fallback", re: /\|\|\s*["']IN["']/g, note: '|| "IN" silently treats an absent market as India' },
  { id: "assignment-default", re: /(?<![=!<>+\-*/%&|^])=(?!=)\s*["']IN["']/g, note: '= "IN" defaults a market variable to India' },
  { id: "india-constant-fallback", re: /\?\?\s*[A-Z_][A-Z0-9_]*\.IN\b/g, note: "?? SOMETHING.IN falls back to an India-scoped constant" },
  { id: "schema-default", re: /\.default\(\s*["']IN["']\s*\)/g, note: '.default("IN") makes India the server-side default' },
  // A default passed as an argument is just as dangerous as one assigned, and the
  // assignment rule above cannot see it. This exact shape caused a live leak:
  //   str(input, "marketId", "IN")
  // in lib/open-data/link.ts, so a call with no market silently resolved to India and
  // the Screener showed NIFTY 50 for every market.
  { id: "call-argument-default", re: /,\s*["']IN["']\s*\)/g, note: 'a "IN" argument default silently treats a missing market as India' },
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
      // Ignore comments: the rule is about code, not prose describing it. Also skip
      // the interior lines of a multi-line block comment, which start with "*".
      const trimmed = line.trim();
      const code = trimmed.startsWith("*") || trimmed.startsWith("/*")
        ? ""
        : line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
      for (const { id, re, note } of PATTERNS) {
        re.lastIndex = 0;
        if (re.test(code) && !isAllowed(rel, id)) findings.push({ file: rel, line: index + 1, id, note, text: line.trim().slice(0, 120) });
      }
    });
  }
}

if (findings.length === 0) {
  console.log("market-isolation: PASS - no silent India fallbacks outside the allow-list.");
if (ALLOW_WITH_REASON.size) {
  console.log("  Excused, with reasons (India-only by design, gated at the call site):");
  for (const [key, reason] of ALLOW_WITH_REASON) console.log(`    ${key}\n      ${reason}`);
}
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

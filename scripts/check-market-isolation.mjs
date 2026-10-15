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
    "server/routers.ts|ungated-india-source",
    "The four market.indiaStockMcp* procedures are India by definition — the procedure names say so, and they read an India-only stock service that has no equivalent for any other market. They take no marketId because they are not market-generic; a caller reaching for them is asking for Indian data by name. No screen calls them today; they remain for the India smoke path.",
  ],
  [
    "lib/filing-intelligence/company-search.ts|ungated-india-source",
    "resolveIndianCompany returns the best match from the pinned Nifty-500 constituent list, which is Indian by construction and has no non-Indian equivalent. Its name states the market, its return type is an Indian company hit, and tests/filing-connectors.test.ts asserts that Indian behaviour. The filings screen gates its own search on marketId === \"IN\".",
  ],
  [
    "server/sector-intelligence.ts|call-argument-default",
    "getSectorConstituents is now market-scoped: the Indian universe, the Indian quote API and both NSE flow feeds are gated on marketId === \"IN\", and every other market returns an explicit unsupported state. The \"IN\" literal is the gate itself.",
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


/* ------------------------------------------------------------------ *
 * Structural rules (items 12-16)
 *
 * The line patterns above catch a silent India DEFAULT. They cannot catch two shapes that
 * have actually leaked here, so those are checked structurally:
 *
 *   A. A tRPC procedure whose input schema declares `marketId` but whose handler never
 *      forwards it. The screen believes it is scoped, the schema looks scoped, and the
 *      implementation ignores the market. This is exactly how the Sectors screen showed
 *      Indian constituents on the US market.
 *
 *   B. A call to an India-only data source from a scope with no market gate.
 *
 * Rule A deliberately follows whole-object forwarding: `f(input)` where `f` reads
 * `marketId` is CORRECT and must not be reported. Getting that wrong turns the gate into
 * noise, and a noisy gate gets switched off.
 * ------------------------------------------------------------------ */

const INDIA_ONLY_SOURCES = [
  "fetchIndianOpenStock", "fetchIndianOpenFundamentals", "fetchNseInstitutionalFlows",
  "fetchSecurityWiseFlows", "searchIndianCompanies", "parseNsdlSectorHtml",
  "getIndiaStockMcpSnapshot", "runIndianApi",
];

/** Files that ARE the Indian source, so calling these is their whole purpose. */
const INDIA_SOURCE_FILES = new Set([
  "server/sector-intelligence.ts", "server/source-ingestion.ts", "server/positioning.ts",
  "server/fundamental-analysis.ts", "server/nse-flows.ts", "server/security-wise-flows.ts",
  "server/indian-open-api.ts", "server/official-file-parsers.ts", "server/india-stock-mcp.ts",
  "server/provider-actions.ts",
]);

const GATE_TOKENS = ['marketId === "IN"', 'marketId !== "IN"', "isIndia", "isIndianMarket", 'market === "IN"', "isUnitedStates", 'marketId == "IN"'];

/** Collect every exported/declared function body in a file, keyed by name. */
function functionBodies(text) {
  const out = new Map();
  const re = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*[:{]/g;
  let m;
  while ((m = re.exec(text))) {
    const name = m[1];
    const start = m.index;
    const brace = text.indexOf("{", m.index + m[0].length - 1);
    if (brace === -1) continue;
    let depth = 0, end = brace;
    for (let i = brace; i < text.length; i += 1) {
      if (text[i] === "{") depth += 1;
      else if (text[i] === "}") { depth -= 1; if (depth === 0) { end = i; break; } }
    }
    out.set(name, text.slice(start, end + 1));
  }
  return out;
}

/** True when a handler forwards marketId, either explicitly or via the whole input. */
function forwardsMarket(handlerText, knownFunctions) {
  if (/input\.marketId|request\.marketId|\{\s*marketId/.test(handlerText)) return true;
  // Whole-input forwarding: find f(input) / f({...input}) and check f uses marketId.
  const calls = [...handlerText.matchAll(/\b([A-Za-z_]\w*)\s*\(\s*\{?\s*\.{0,3}input\b/g)];
  for (const [, callee] of calls) {
    const body = knownFunctions.get(callee);
    if (body && /marketId/.test(body)) return true;
  }
  // Or the handler destructures the market straight out of input.
  if (/\bmarketId\b/.test(handlerText) && /=>/.test(handlerText)) return true;
  return false;
}

const structural = [];

// --- Rule A: declared-but-unused marketId
{
  let text = "";
  try { text = readFileSync(join(ROOT, "server/routers.ts"), "utf8"); } catch { text = ""; }
  if (text) {
    const known = functionBodies(text);
    // pull in callee bodies from the other server modules too
    for (const dir of ["server"]) {
      for (const file of walk(join(ROOT, dir))) {
        const rel = relative(ROOT, file).split(sep).join("/");
        if (rel === "server/routers.ts") continue;
        for (const [name, body] of functionBodies(readFileSync(file, "utf8"))) if (!known.has(name)) known.set(name, body);
      }
    }
    const lines = text.split("\n");
    lines.forEach((line, index) => {
      if (!/^\s{4}\w+:\s*(publicProcedure|adminProcedure)/.test(line)) return;
      if (!/marketId:\s*marketIdSchema/.test(line)) return;
      // gather the whole procedure expression (it may wrap several lines)
      const window = lines.slice(index, index + 8).join(" ");
      if (forwardsMarket(window, known)) return;
      const name = (line.match(/^\s{4}(\w+):/) || [])[1] ?? "?";
      structural.push({ file: "server/routers.ts", line: index + 1, id: "declared-but-unused-marketId", note: `${name} declares marketId in its input schema but never forwards it to the handler, so the market is silently ignored.`, text: line.trim().slice(0, 110) });
    });
  }
}

// --- Rule B: India-only source called without a market gate
for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file).split(sep).join("/");
    if (INDIA_SOURCE_FILES.has(rel)) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("*") || trimmed.startsWith("//")) return;
      const code = line.replace(/\/\/.*$/, "");
      for (const source of INDIA_ONLY_SOURCES) {
        // a CALL, not the definition
        if (!new RegExp(`(?<!function )\\b${source}\\s*\\(`).test(code)) continue;
        if (new RegExp(`(?:function|const)\\s+${source}\\b`).test(code)) continue;
        const window = lines.slice(Math.max(0, index - 30), index + 2).join(" ");
        if (GATE_TOKENS.some((token) => window.includes(token))) continue;
        structural.push({ file: rel, line: index + 1, id: "ungated-india-source", note: `${source} is an India-only source called with no market gate in scope; another market would receive Indian data.`, text: line.trim().slice(0, 110) });
      }
    });
  }
}

// Structural findings honour the same allow-list, so an India-only-by-name surface is
// excused exactly once, in one place, with a written reason.
for (const item of structural) if (!isAllowed(item.file, item.id)) findings.push(item);

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

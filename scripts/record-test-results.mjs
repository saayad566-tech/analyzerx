import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/*
 * Records the result of a real test run as `artifacts/test-results.json`.
 *
 * The file is deliberately NOT committed (it is git-ignored): a checked-in copy
 * would go stale and let the release-readiness gate report "tests passed"
 * regardless of the current run. Instead the file is produced per run from
 * Vitest's own JSON report and bound to the source revision, so the gate can
 * reject evidence that does not belong to the revision under review.
 *
 * Usage:
 *   node scripts/record-test-results.mjs <vitest-json-report> [more-reports...]
 *
 * Multiple reports are aggregated, so a suite split into shards still produces a
 * single, complete result. The report is written by:
 *   npx vitest run --reporter=default --reporter=json --outputFile.json=<file>
 */

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argValue = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
};
const ROOT = path.resolve(argValue("--root") ?? path.resolve(SELF_DIR, ".."));
const OUT = argValue("--out") ?? path.join(ROOT, "artifacts", "test-results.json");

const reports = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--root" && argv[i - 1] !== "--out");
if (reports.length === 0) {
  console.error("Usage: node scripts/record-test-results.mjs <vitest-json-report> [more-reports...]");
  process.exit(1);
}

let passed = 0;
let failed = 0;
let skipped = 0;
let total = 0;
let testSuites = 0;
let files = 0;
const consumed = [];

for (const rel of reports) {
  const full = path.resolve(rel);
  if (!fs.existsSync(full)) {
    console.error(`Report not found: ${rel}`);
    process.exit(1);
  }
  const j = JSON.parse(fs.readFileSync(full, "utf8"));
  passed += j.numPassedTests ?? 0;
  failed += j.numFailedTests ?? 0;
  skipped += (j.numPendingTests ?? 0) + (j.numTodoTests ?? 0);
  total += j.numTotalTests ?? 0;
  testSuites += j.numTotalTestSuites ?? 0;
  // Vitest's JSON report has one entry in `testResults` per test file.
  files += Array.isArray(j.testResults) ? j.testResults.length : 0;
  consumed.push(path.relative(ROOT, full));
}

function currentRevision() {
  if (process.env.ANALYZERX_SOURCE_REVISION) return process.env.ANALYZERX_SOURCE_REVISION;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}
const commit = currentRevision();

const record = {
  source: reports.length > 1 ? `vitest run, aggregated from ${reports.length} shard reports` : "vitest run",
  tool: (() => {
    try {
      return `vitest ${JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules/vitest/package.json"), "utf8")).version}`;
    } catch {
      return "vitest";
    }
  })(),
  commit,
  passed,
  failed,
  skipped,
  total,
  testFiles: files,
  testSuites,
  recordedAt: new Date().toISOString(),
  rawReports: consumed,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(record, null, 2)}\n`);

console.log(JSON.stringify(record, null, 2));
// Fail the recording itself if the run had failures, so a red suite cannot be
// quietly recorded as evidence.
process.exit(failed > 0 ? 1 : 0);

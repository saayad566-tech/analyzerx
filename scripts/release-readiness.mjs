import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));

function gitRevision() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

/*
 * Release-readiness gate.
 *
 * Aggregates the checks that decide whether a release may be called ready, and
 * reports each with one of four statuses:
 *   PASS         the check ran and passed
 *   FAIL         the check ran and failed
 *   BLOCKED      an external prerequisite prevented the check
 *   NOT VERIFIED no sufficient evidence exists
 *
 * It deliberately does NOT treat typechecking and unit tests alone as
 * release-ready: physical-device QA is reported as NOT VERIFIED until real
 * evidence is recorded, and it never counts as a pass. A skipped device test can
 * never appear as passed.
 *
 * Usage:
 *   node scripts/release-readiness.mjs [--root <dir>] [--artifact <apk>] [--json]
 */

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}
const root = path.resolve(argValue("--root") ?? process.cwd());
const emitJson = args.includes("--json");
const artifact = argValue("--artifact");

const results = [];
const record = (id, label, status, detail) => results.push({ id, label, status, detail });
const exists = (rel) => fs.existsSync(path.join(root, rel));

/* 1. Release identity — delegate to the single verifier. */
try {
  const verifyArgs = [path.join(SELF_DIR, "verify-release.mjs"), "--root", root, "--json"];
  if (artifact) verifyArgs.push("--artifact", artifact);
  const out = execFileSync("node", verifyArgs, { cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  const parsed = JSON.parse(out);
  const fails = parsed.results.filter((r) => r.status === "FAIL");
  record("identity", "Release identity (version, manifest, config, CI)", fails.length ? "FAIL" : "PASS", fails.length ? fails.map((f) => f.detail).join("; ") : `authoritative ${parsed.version} (code ${parsed.androidVersionCode})`);
} catch (error) {
  // execFileSync throws on non-zero exit; capture the structured output if present.
  const stdout = error.stdout ? error.stdout.toString() : "";
  let detail = `verify-release.mjs failed: ${error.message}`;
  try {
    const parsed = JSON.parse(stdout);
    detail = parsed.results.filter((r) => r.status === "FAIL").map((f) => f.detail).join("; ") || detail;
  } catch {
    /* keep default detail */
  }
  record("identity", "Release identity (version, manifest, config, CI)", "FAIL", detail);
}

/* 2. Artifact + checksum. */
if (!artifact) {
  record("artifact", "Artifact and checksum", "NOT VERIFIED", "no artifact supplied; pass --artifact <apk>");
} else if (!exists(artifact)) {
  record("artifact", "Artifact and checksum", "FAIL", `artifact not found: ${artifact}`);
} else {
  const size = fs.statSync(path.resolve(root, artifact)).size;
  record("artifact", "Artifact and checksum", size > 0 ? "PASS" : "FAIL", `${artifact} = ${size} bytes (checksum validated by verify-release.mjs)`);
}

/* 3. Orphan checksum metadata — no *.apk.sha256 may exist without its artifact. */
function findOrphans(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "archive") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findOrphans(full, acc);
    else if (entry.name.endsWith(".apk.sha256")) {
      const base = full.slice(0, -".sha256".length);
      if (!fs.existsSync(base)) acc.push(path.relative(root, full));
    }
  }
  return acc;
}
const orphans = findOrphans(root, []);
record("orphans", "No orphaned checksum metadata", orphans.length ? "FAIL" : "PASS", orphans.length ? `checksums without artifacts: ${orphans.join(", ")}` : "every *.apk.sha256 has a matching artifact");

/* 4. Local-AI release profile config. */
try {
  execFileSync("node", [path.join(SELF_DIR, "verify-local-ai-release-config.mjs"), "--root", root], { cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  record("localai", "Local-AI release profile config", "PASS", "EAS profile, app config and workflow agree with the source");
} catch (error) {
  record("localai", "Local-AI release profile config", "FAIL", (error.stdout ? error.stdout.toString() : error.message).trim());
}

/* 5. Automated tests — this gate cannot itself run the suite; it reports what is known.
 *    The evidence must be bound to the current revision: a stale or unrelated
 *    record must not be able to report a pass. */
const testEvidence = path.join(root, "artifacts", "test-results.json");
const currentRevision = process.env.ANALYZERX_SOURCE_REVISION ?? gitRevision();
if (fs.existsSync(testEvidence)) {
  try {
    const t = JSON.parse(fs.readFileSync(testEvidence, "utf8"));
    if (!t.commit) {
      record("tests", "Automated test evidence", "NOT VERIFIED", "evidence has no `commit` field; it cannot be tied to a revision");
    } else if (currentRevision && t.commit !== currentRevision) {
      record("tests", "Automated test evidence", "NOT VERIFIED", `evidence is for revision ${String(t.commit).slice(0, 12)}, current revision is ${String(currentRevision).slice(0, 12)}; re-run the suite and re-record`);
    } else {
      record("tests", "Automated test evidence", t.failed > 0 ? "FAIL" : "PASS", `${t.passed} passed, ${t.failed} failed, ${t.skipped} skipped @ ${String(t.commit).slice(0, 12)}${t.source ? ` (${t.source})` : ""}`);
    }
  } catch {
    record("tests", "Automated test evidence", "NOT VERIFIED", "test-results.json present but unreadable");
  }
} else {
  record("tests", "Automated test evidence", "NOT VERIFIED", "no artifacts/test-results.json for this revision; run the suite via scripts/record-test-results.mjs");
}

/* 6. Physical-device QA — must never be a pass unless real evidence exists. */
const deviceEvidence = path.join(root, "docs", "device-qa-evidence.json");
if (fs.existsSync(deviceEvidence)) {
  try {
    const d = JSON.parse(fs.readFileSync(deviceEvidence, "utf8"));
    const done = d.executed === true && d.device && d.apkSha256;
    record("device", "Physical-device QA", done ? (d.failed > 0 ? "FAIL" : "PASS") : "NOT VERIFIED", done ? `device ${d.device}, apk ${d.apkSha256}` : "evidence file present but incomplete (needs executed, device, apkSha256)");
  } catch {
    record("device", "Physical-device QA", "NOT VERIFIED", "device-qa-evidence.json present but unreadable");
  }
} else {
  record("device", "Physical-device QA", "NOT VERIFIED", "no physical-device QA evidence recorded; see docs/analyzerx-device-qa-checklist.md (PENDING REAL-DEVICE EXECUTION)");
}

/* report */
const counts = results.reduce((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});
const failed = results.filter((r) => r.status === "FAIL");
const notVerified = results.filter((r) => r.status === "NOT VERIFIED");
const blocked = results.filter((r) => r.status === "BLOCKED");
// Two distinct modes, so a release decision cannot be read out of a technical run:
//   default            -> technical verification; exits non-zero only on FAIL
//   --require-complete -> release approval; also exits non-zero while any
//                         BLOCKED or NOT VERIFIED gate remains open
const requireComplete = args.includes("--require-complete");

const overall = failed.length ? "not-ready" : notVerified.length || blocked.length ? "ready-pending-evidence" : "ready";
if (emitJson) {
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), mode: requireComplete ? "release-approval" : "technical-verification", status: overall, results }, null, 2));
} else {
  for (const r of results) console.log(`${r.status.padEnd(13)} ${r.label} — ${r.detail}`);
  console.log("");
  console.log(`Release readiness (${requireComplete ? "release approval" : "technical verification"}): ${failed.length ? "FAILED" : "checks passed"} (PASS ${counts.PASS ?? 0}, FAIL ${counts.FAIL ?? 0}, BLOCKED ${counts.BLOCKED ?? 0}, NOT VERIFIED ${counts["NOT VERIFIED"] ?? 0})`);
  if (!failed.length && (notVerified.length || blocked.length)) {
    console.log("Passing repository checks alone is NOT a release decision: the BLOCKED and NOT VERIFIED items above must be closed with real evidence.");
  }
}

const unresolved = requireComplete ? failed.length + blocked.length + notVerified.length : failed.length;
process.exit(unresolved ? 1 : 0);

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { findReleaseVersionLiterals } from "./lib/release-version-scan.mjs";

/*
 * Release verification.
 *
 * The single source of truth for the release identity is `release-version.json`.
 * This script does not carry its own copy of the version (the previous version of
 * this file hardcoded "1.4.0", so it could pass while validating the wrong
 * release). It reads the authoritative file and then fails if any other
 * release-facing file disagrees with it.
 *
 * Results use four statuses, reported separately:
 *   PASS         the check ran and passed
 *   FAIL         the check ran and failed
 *   BLOCKED      an external prerequisite prevented the check
 *   NOT VERIFIED no sufficient evidence exists
 *
 * A missing verification tool is reported as NOT VERIFIED; it is never treated as
 * proof that signing is valid.
 *
 * Usage:
 *   node scripts/verify-release.mjs [--root <dir>] [--artifact <apk>] [--checksum <file>] [--json]
 */

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}
const root = path.resolve(argValue("--root") ?? process.cwd());
const emitJson = args.includes("--json");

const results = [];
function record(id, label, status, detail) {
  results.push({ id, label, status, detail });
}
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
const readText = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(root, rel));

/* ---------- 1. authoritative source ---------- */
const SOURCE = "release-version.json";
let source = null;
try {
  source = readJson(SOURCE);
  if (!source || typeof source.version !== "string" || !/^\d+\.\d+\.\d+/.test(source.version)) {
    throw new Error("missing or malformed `version`");
  }
  if (!Number.isInteger(source.androidVersionCode)) {
    throw new Error("missing or malformed `androidVersionCode` (must be an integer)");
  }
  record("source", `Authoritative version (${SOURCE})`, "PASS", `version=${source.version}, androidVersionCode=${source.androidVersionCode}`);
} catch (error) {
  record("source", `Authoritative version (${SOURCE})`, "FAIL", `cannot read authoritative release version: ${error.message}`);
}

const VERSION = source?.version ?? null;
const CODE = source?.androidVersionCode ?? null;

/* ---------- 2. package.json agreement ---------- */
try {
  const pkg = readJson("package.json");
  if (!VERSION) record("package", "package.json version agreement", "NOT VERIFIED", "no authoritative version to compare against");
  else if (pkg.version === VERSION) record("package", "package.json version agreement", "PASS", `package.json version = ${pkg.version}`);
  else record("package", "package.json version agreement", "FAIL", `package.json version ${pkg.version} != authoritative ${VERSION}`);
} catch (error) {
  record("package", "package.json version agreement", "FAIL", `cannot read package.json: ${error.message}`);
}

/* ---------- 3. release manifest ---------- */
try {
  const manifest = readJson("release-manifest.json");
  const problems = [];
  if (VERSION && manifest.version !== VERSION) problems.push(`manifest version ${manifest.version} != ${VERSION}`);
  if (CODE !== null && manifest.androidVersionCode !== CODE) problems.push(`manifest androidVersionCode ${manifest.androidVersionCode} != ${CODE}`);
  if (manifest.releaseVersionSource && manifest.releaseVersionSource !== SOURCE) problems.push(`manifest releaseVersionSource ${manifest.releaseVersionSource} != ${SOURCE}`);
  const missingFiles = Object.values(manifest.requiredFeatures ?? {}).flat().filter((f) => !exists(f));
  const source_ = Object.values(manifest.requiredFeatures ?? {}).flat().filter((f) => exists(f)).map((f) => readText(f)).join("\n");
  const missingMarkers = (manifest.requiredSourceMarkers ?? []).filter((m) => !source_.includes(m));
  if (problems.length || missingFiles.length || missingMarkers.length) {
    record("manifest", "Release manifest agreement", "FAIL", [...problems, ...missingFiles.map((f) => `missing file ${f}`), ...missingMarkers.map((m) => `missing marker ${m}`)].join("; "));
  } else {
    record("manifest", "Release manifest agreement", "PASS", `version, version code, ${Object.keys(manifest.requiredFeatures ?? {}).length} feature groups and ${manifest.requiredSourceMarkers?.length ?? 0} markers validated`);
  }
} catch (error) {
  record("manifest", "Release manifest agreement", "FAIL", `cannot read release-manifest.json: ${error.message}`);
}

/* ---------- 4. EAS profiles ---------- */
try {
  const eas = readJson("eas.json");
  const problems = [];
  const profiles = Object.entries(eas.build ?? {});
  for (const [name, profile] of profiles) {
    const env = profile?.env ?? {};
    if (!("ANALYZERX_RELEASE_VERSION" in env)) continue;
    if (VERSION && env.ANALYZERX_RELEASE_VERSION !== VERSION) problems.push(`${name}.ANALYZERX_RELEASE_VERSION ${env.ANALYZERX_RELEASE_VERSION} != ${VERSION}`);
    if (CODE !== null && env.ANALYZERX_ANDROID_VERSION_CODE !== String(CODE)) problems.push(`${name}.ANALYZERX_ANDROID_VERSION_CODE ${env.ANALYZERX_ANDROID_VERSION_CODE} != ${CODE}`);
  }
  if (problems.length) record("eas", "EAS release profile agreement", "FAIL", problems.join("; "));
  else record("eas", "EAS release profile agreement", "PASS", "every versioned EAS profile matches the authoritative version");
} catch (error) {
  record("eas", "EAS release profile agreement", "FAIL", `cannot read eas.json: ${error.message}`);
}

/* ---------- 5. app config consumes the source ---------- */
try {
  const appConfig = readText("app.config.ts");
  const importsSource = appConfig.includes(`from "./${SOURCE}"`);
  const hardcodes = /const releaseVersion\s*=\s*"/.test(appConfig);
  if (importsSource && !hardcodes) record("appconfig", "app.config.ts consumes the source", "PASS", `imports ./${SOURCE}; no hardcoded releaseVersion literal`);
  else record("appconfig", "app.config.ts consumes the source", "FAIL", [importsSource ? null : `does not import ./${SOURCE}`, hardcodes ? "still hardcodes a releaseVersion literal" : null].filter(Boolean).join("; "));
} catch (error) {
  record("appconfig", "app.config.ts consumes the source", "FAIL", `cannot read app.config.ts: ${error.message}`);
}

/* ---------- 6. CI workflow derives the version and carries no conflicting literal ---------- */
try {
  const wf = readText(".github/workflows/android-apk.yml");
  const derives = wf.includes(SOURCE);
  const conflicting = VERSION ? findReleaseVersionLiterals(wf).filter((v) => v !== VERSION) : [];
  if (derives && conflicting.length === 0) record("ci", "CI workflow version identity", "PASS", `derives version from ${SOURCE}; no conflicting version literal`);
  else record("ci", "CI workflow version identity", "FAIL", [derives ? null : `does not reference ${SOURCE}`, conflicting.length ? `conflicting literals: ${[...new Set(conflicting)].join(", ")}` : null].filter(Boolean).join("; "));
} catch (error) {
  record("ci", "CI workflow version identity", "FAIL", `cannot read .github/workflows/android-apk.yml: ${error.message}`);
}

/* ---------- 6b. Android project derives the version from the source ---------- */
// The APK's own versionName/versionCode come from android/app/build.gradle, not
// from app.config.ts, because CI builds with Gradle directly (no expo prebuild).
// If this file pins a literal version, the shipped artifact drifts from the
// release identity — which is exactly what shipped 1.4.0 as "3.2.0".
try {
  const gradle = readText("android/app/build.gradle");
  const referencesSource = gradle.includes("release-version.json");
  const hardcodedName = /versionName\s+["']\d+\.\d+\.\d+/.test(gradle);
  const hardcodedCode = /versionCode\s+\d+/.test(gradle);
  if (referencesSource && !hardcodedName && !hardcodedCode) {
    record("android-version", "Android project version identity", "PASS", "android/app/build.gradle reads versionName/versionCode from release-version.json");
  } else {
    record("android-version", "Android project version identity", "FAIL", [
      referencesSource ? null : "build.gradle does not read release-version.json",
      hardcodedName ? "build.gradle hardcodes a versionName literal" : null,
      hardcodedCode ? "build.gradle hardcodes a versionCode literal" : null,
    ].filter(Boolean).join("; "));
  }
} catch (error) {
  record("android-version", "Android project version identity", "NOT VERIFIED", `cannot read android/app/build.gradle: ${error.message}`);
}

/* ---------- 7. artifact + checksum ---------- */
const defaultArtifact = "android/app/build/outputs/apk/release/app-release.apk";
const artifactRel = argValue("--artifact") ?? (exists(defaultArtifact) ? defaultArtifact : null);
if (!artifactRel) {
  record("artifact", "Artifact existence and size", "NOT VERIFIED", "no APK artifact supplied or present in the workspace; build the artifact and pass --artifact <path>");
  record("checksum", "SHA-256 checksum against the actual artifact", "NOT VERIFIED", "no artifact available to hash");
} else {
  const artifactPath = path.resolve(root, artifactRel);
  if (!fs.existsSync(artifactPath)) {
    record("artifact", "Artifact existence and size", "FAIL", `artifact not found: ${artifactRel}`);
    record("checksum", "SHA-256 checksum against the actual artifact", "NOT VERIFIED", "artifact missing");
  } else {
    const size = fs.statSync(artifactPath).size;
    record("artifact", "Artifact existence and size", size > 0 ? "PASS" : "FAIL", `${artifactRel} = ${size} bytes`);
    const checksumRel = argValue("--checksum") ?? `${artifactRel}.sha256`;
    const checksumPath = path.resolve(root, checksumRel);
    if (!fs.existsSync(checksumPath)) {
      record("checksum", "SHA-256 checksum against the actual artifact", "NOT VERIFIED", `checksum file not found: ${checksumRel}`);
    } else {
      const computed = crypto.createHash("sha256").update(fs.readFileSync(artifactPath)).digest("hex");
      const published = fs.readFileSync(checksumPath, "utf8").trim().split(/\s+/)[0];
      record("checksum", "SHA-256 checksum against the actual artifact", computed === published ? "PASS" : "FAIL", computed === published ? `sha256 ${computed}` : `computed ${computed} != published ${published}`);
    }
  }
}

/* ---------- 8. signing evidence ---------- */
function which(bin) {
  try {
    execFileSync("sh", ["-c", `command -v ${bin}`], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
if (!artifactRel || !fs.existsSync(path.resolve(root, artifactRel))) {
  record("signing", "Signing verification", "NOT VERIFIED", "no artifact available to verify");
} else if (!which("apksigner")) {
  record("signing", "Signing verification", "NOT VERIFIED", "apksigner is not available in this environment; signing is not confirmed");
} else {
  try {
    execFileSync("apksigner", ["verify", "--verbose", path.resolve(root, artifactRel)], { stdio: "pipe" });
    record("signing", "Signing verification", "PASS", "apksigner verify succeeded");
  } catch (error) {
    record("signing", "Signing verification", "FAIL", `apksigner verify failed: ${error.message}`);
  }
}

/* ---------- 9. source revision ---------- */
let revision = process.env.ANALYZERX_SOURCE_REVISION ?? null;
if (!revision) {
  try {
    revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    revision = null;
  }
}
record("revision", "Source revision identity", revision ? "PASS" : "NOT VERIFIED", revision ?? "no git repository and ANALYZERX_SOURCE_REVISION is not set");

/* ---------- report ---------- */
const counts = results.reduce((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});
const failed = results.filter((r) => r.status === "FAIL");

if (emitJson) {
  const artifactOut = {
    product: "AnalyzerX",
    version: VERSION,
    androidVersionCode: CODE,
    sourceRevision: revision ?? "unavailable",
    manifestVersion: (() => {
      try { return readJson("release-manifest.json").manifestVersion; } catch { return null; }
    })(),
    generatedAt: new Date().toISOString(),
    status: failed.length ? "verification-failed" : "identity-verified",
    results,
  };
  console.log(JSON.stringify(artifactOut, null, 2));
} else {
  for (const r of results) console.log(`${r.status.padEnd(13)} ${r.label} — ${r.detail}`);
  console.log("");
  console.log(`AnalyzerX release verification: ${failed.length ? "FAILED" : "PASSED"} (PASS ${counts.PASS ?? 0}, FAIL ${counts.FAIL ?? 0}, BLOCKED ${counts.BLOCKED ?? 0}, NOT VERIFIED ${counts["NOT VERIFIED"] ?? 0})`);
  if (VERSION) console.log(`Authoritative release: ${VERSION} (version code ${CODE}).`);
}

// Persist a machine-readable record for the release process (best effort).
try {
  const out = path.join(root, "artifacts", `analyzerx-${VERSION ?? "unknown"}-release-verification.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify({ version: VERSION, androidVersionCode: CODE, sourceRevision: revision ?? "unavailable", status: failed.length ? "verification-failed" : "identity-verified", results }, null, 2)}\n`);
} catch {
  /* non-fatal: the console report is the source of truth */
}

process.exit(failed.length ? 1 : 0);

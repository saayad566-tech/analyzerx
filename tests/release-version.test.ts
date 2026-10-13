import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

/*
 * Release-version consistency tests.
 *
 * These run the real scripts (`scripts/verify-release.mjs` and
 * `scripts/release-readiness.mjs`) against small fixture directories, so they
 * test the shipped verification logic rather than a copy of it.
 *
 * The fixture uses a sentinel version (9.9.9) so that a script that had a
 * hardcoded version baked in would fail these tests instead of passing.
 */

const REPO_ROOT = process.cwd();
const SENTINEL = "9.9.9";
const SENTINEL_CODE = 9999;

const FIXTURE_APP_CONFIG = [
  'import "./scripts/load-env.js";',
  'import releaseIdentity from "./release-version.json";',
  'const enableNativeLocalAI = process.env.ANALYZERX_ENABLE_NATIVE_LOCAL_AI !== "false";',
  "const releaseVersion = releaseIdentity.version;",
  'const plugins = enableNativeLocalAI ? ["./plugins/with-analyzerx-local-ai.js"] : [];',
  "export default { version: releaseVersion, plugins };",
].join("\n");

const FIXTURE_WORKFLOW = [
  "name: build",
  "on: [workflow_dispatch]",
  "jobs:",
  "  build:",
  "    steps:",
  "      - run: node -e 'require(\"./release-version.json\")'",
  "      - run: echo done",
].join("\n");

type FixtureCtx = { dir: string; write: (rel: string, content: unknown) => void };

function writeFixture(mutate: (ctx: FixtureCtx) => void = () => {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "analyzerx-release-"));
  const write = (rel: string, content: unknown) => {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`);
  };
  write("release-version.json", { version: SENTINEL, androidVersionCode: SENTINEL_CODE, iosBuildNumber: String(SENTINEL_CODE) });
  write("package.json", { name: "app-template", version: SENTINEL, private: true });
  write("release-manifest.json", {
    manifestVersion: 1,
    product: "AnalyzerX",
    version: SENTINEL,
    androidVersionCode: SENTINEL_CODE,
    releaseVersionSource: "release-version.json",
    requiredFeatures: { releaseProfiles: ["release-version.json"] },
    requiredSourceMarkers: [],
  });
  write("eas.json", {
    build: {
      "analyzerx-local-ai": {
        env: { ANALYZERX_RELEASE_VERSION: SENTINEL, ANALYZERX_ANDROID_VERSION_CODE: String(SENTINEL_CODE), ANALYZERX_IOS_BUILD_NUMBER: String(SENTINEL_CODE), ANALYZERX_ENABLE_NATIVE_LOCAL_AI: "true" },
      },
    },
  });
  write("app.config.ts", FIXTURE_APP_CONFIG);
  write(".github/workflows/android-apk.yml", FIXTURE_WORKFLOW);
  mutate({ dir, write });
  return dir;
}

function runVerify(dir: string) {
  return spawnSync("node", [path.join(REPO_ROOT, "scripts/verify-release.mjs"), "--root", dir, "--json"], { encoding: "utf8" });
}
function runReadiness(dir: string) {
  return spawnSync("node", [path.join(REPO_ROOT, "scripts/release-readiness.mjs"), "--root", dir, "--json"], { encoding: "utf8" });
}
function runReadinessArgs(dir: string, extra: string[] = [], env: Record<string, string> = {}) {
  return spawnSync("node", [path.join(REPO_ROOT, "scripts/release-readiness.mjs"), "--root", dir, "--json", ...extra], { encoding: "utf8", env: { ...process.env, ...env } });
}
function testStatus(stdout: string) {
  const parsed = JSON.parse(stdout) as { results: { id: string; status: string }[] };
  return parsed.results.find((x) => x.id === "tests")?.status;
}

describe("release-version verification", () => {
  it("passes for correct, consistent metadata", () => {
    const dir = writeFixture();
    const r = runVerify(dir);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const parsed = JSON.parse(r.stdout) as { version: string; androidVersionCode: number; results: { status: string }[] };
    expect(parsed.version).toBe(SENTINEL);
    expect(parsed.androidVersionCode).toBe(SENTINEL_CODE);
    expect(parsed.results.some((x) => x.status === "FAIL")).toBe(false);
  });

  it("fails when package.json disagrees with the authoritative version", () => {
    const dir = writeFixture(({ write }) => write("package.json", { name: "app-template", version: "1.0.0", private: true }));
    const r = runVerify(dir);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain("package.json version");
    expect(r.stdout).toContain("FAIL");
  });

  it("fails when the release manifest version code disagrees", () => {
    const dir = writeFixture(({ dir: d }) => {
      const m = JSON.parse(fs.readFileSync(path.join(d, "release-manifest.json"), "utf8"));
      m.androidVersionCode = 1;
      fs.writeFileSync(path.join(d, "release-manifest.json"), JSON.stringify(m, null, 2));
    });
    const r = runVerify(dir);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain("androidVersionCode");
  });

  it("fails when an EAS profile disagrees", () => {
    const dir = writeFixture(({ write }) =>
      write("eas.json", { build: { "analyzerx-local-ai": { env: { ANALYZERX_RELEASE_VERSION: "2.0.0", ANALYZERX_ANDROID_VERSION_CODE: "2000", ANALYZERX_ENABLE_NATIVE_LOCAL_AI: "true" } } } }),
    );
    const r = runVerify(dir);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain("EAS");
  });

  it("fails when the CI workflow carries a conflicting version literal", () => {
    const dir = writeFixture(({ dir: d }) => {
      const wf = fs.readFileSync(path.join(d, ".github/workflows/android-apk.yml"), "utf8");
      fs.writeFileSync(path.join(d, ".github/workflows/android-apk.yml"), `${wf}\n# tag v1.4.0\n`);
    });
    const r = runVerify(dir);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain("conflicting");
  });

  it("fails clearly when the authoritative version file is missing", () => {
    const dir = writeFixture(({ dir: d }) => fs.rmSync(path.join(d, "release-version.json")));
    const r = runVerify(dir);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain("authoritative release version");
  });

  it("fails clearly when the authoritative version file is malformed", () => {
    const dir = writeFixture(({ dir: d }) => fs.writeFileSync(path.join(d, "release-version.json"), "{ not json"));
    const r = runVerify(dir);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain("authoritative release version");
  });

  it("fails when the app config does not consume the source", () => {
    const dir = writeFixture(({ dir: d }) => fs.writeFileSync(path.join(d, "app.config.ts"), 'const releaseVersion = "9.9.9";\n'));
    const r = runVerify(dir);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain("app.config.ts");
  });

  it("passes for the real repository metadata", () => {
    const r = spawnSync("node", [path.join(REPO_ROOT, "scripts/verify-release.mjs"), "--root", REPO_ROOT], { encoding: "utf8" });
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });
});

describe("release-readiness gate", () => {
  it("reports NOT VERIFIED (not pass) for device QA and does not fail on a clean fixture", () => {
    const dir = writeFixture();
    const r = runReadiness(dir);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const parsed = JSON.parse(r.stdout) as { status: string; results: { id: string; status: string }[] };
    const device = parsed.results.find((x) => x.id === "device");
    expect(device?.status).toBe("NOT VERIFIED");
    expect(parsed.status).toBe("ready-pending-evidence");
  });

  it("fails when an orphaned checksum has no matching artifact", () => {
    const dir = writeFixture(({ dir: d }) => fs.writeFileSync(path.join(d, "some-artifact.apk.sha256"), "deadbeef  some-artifact.apk\n"));
    const r = runReadiness(dir);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain("some-artifact.apk.sha256");
  });
});

describe("release-readiness test-evidence binding", () => {
  const writeEvidence = (dir: string, commit: string | null, failed = 0) => {
    const p = path.join(dir, "artifacts");
    fs.mkdirSync(p, { recursive: true });
    fs.writeFileSync(path.join(p, "test-results.json"), JSON.stringify({ passed: 10, failed, skipped: 0, commit }));
  };

  it("accepts evidence bound to the current revision", () => {
    const dir = writeFixture();
    writeEvidence(dir, "abc123");
    const r = runReadinessArgs(dir, [], { ANALYZERX_SOURCE_REVISION: "abc123" });
    expect(testStatus(r.stdout)).toBe("PASS");
  });

  it("rejects evidence bound to a different revision (stale evidence)", () => {
    const dir = writeFixture();
    writeEvidence(dir, "oldrev");
    const r = runReadinessArgs(dir, [], { ANALYZERX_SOURCE_REVISION: "newrev" });
    expect(testStatus(r.stdout)).toBe("NOT VERIFIED");
  });

  it("rejects evidence with no revision binding", () => {
    const dir = writeFixture();
    writeEvidence(dir, null);
    const r = runReadinessArgs(dir, [], { ANALYZERX_SOURCE_REVISION: "newrev" });
    expect(testStatus(r.stdout)).toBe("NOT VERIFIED");
  });

  it("reports a recorded failing run as FAIL", () => {
    const dir = writeFixture();
    writeEvidence(dir, "abc123", 2);
    const r = runReadinessArgs(dir, [], { ANALYZERX_SOURCE_REVISION: "abc123" });
    expect(testStatus(r.stdout)).toBe("FAIL");
    expect(r.status).not.toBe(0);
  });

  it("--require-complete fails while any gate is NOT VERIFIED", () => {
    const dir = writeFixture();
    writeEvidence(dir, "abc123");
    const technical = runReadinessArgs(dir, [], { ANALYZERX_SOURCE_REVISION: "abc123" });
    const approval = runReadinessArgs(dir, ["--require-complete"], { ANALYZERX_SOURCE_REVISION: "abc123" });
    expect(technical.status).toBe(0); // technical verification passes
    expect(approval.status).not.toBe(0); // release approval does not (device QA open)
  });
});

describe("record-test-results", () => {
  const raw = (dir: string, name: string, passed: number, failed: number, pending: number) => {
    const p = path.join(dir, name);
    fs.writeFileSync(
      p,
      JSON.stringify({ numPassedTests: passed, numFailedTests: failed, numPendingTests: pending, numTotalTests: passed + failed + pending, numTotalTestSuites: 1, numPassedTestSuites: failed ? 0 : 1, numFailedTestSuites: failed ? 1 : 0 }),
    );
    return p;
  };

  it("aggregates vitest reports and binds the commit", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "afx-rec-"));
    const out = path.join(dir, "out.json");
    const r = spawnSync(
      "node",
      [path.join(REPO_ROOT, "scripts/record-test-results.mjs"), raw(dir, "a.json", 5, 0, 1), raw(dir, "b.json", 7, 0, 2), "--out", out],
      { encoding: "utf8", env: { ...process.env, ANALYZERX_SOURCE_REVISION: "revX" } },
    );
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const rec = JSON.parse(fs.readFileSync(out, "utf8")) as { passed: number; skipped: number; commit: string };
    expect(rec.passed).toBe(12);
    expect(rec.skipped).toBe(3);
    expect(rec.commit).toBe("revX");
  });

  it("exits non-zero when the recorded run has failures", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "afx-rec2-"));
    const r = spawnSync("node", [path.join(REPO_ROOT, "scripts/record-test-results.mjs"), raw(dir, "a.json", 1, 1, 0), "--out", path.join(dir, "o.json")], { encoding: "utf8" });
    expect(r.status).not.toBe(0);
  });
});

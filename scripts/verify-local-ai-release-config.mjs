import fs from "node:fs";
import path from "node:path";
import { findReleaseVersionLiterals } from "./lib/release-version-scan.mjs";

/*
 * Local-AI release profile verification.
 *
 * Previously this script read a `strategy.matrix` block from the Android workflow
 * that does not exist (the workflow has no matrix), so it threw on every run, and
 * it asserted the stale 1.4.0/1400 identity. It now validates the Local-AI release
 * profile against the single source of truth (`release-version.json`) and against
 * the app configuration, and it is wired into CI (`pnpm release:verify:local-ai`).
 */

const root = path.resolve(process.argv.includes("--root") ? process.argv[process.argv.indexOf("--root") + 1] : process.cwd());
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const readJson = (rel) => JSON.parse(read(rel));

const failures = [];
const source = readJson("release-version.json");

/* 1. The EAS Local-AI profile must match the authoritative version. */
const eas = readJson("eas.json");
const localAiProfiles = Object.entries(eas.build ?? {}).filter(([, profile]) => profile?.env?.ANALYZERX_ENABLE_NATIVE_LOCAL_AI === "true");
if (localAiProfiles.length === 0) {
  failures.push("no EAS build profile enables ANALYZERX_ENABLE_NATIVE_LOCAL_AI");
}
for (const [name, profile] of localAiProfiles) {
  const env = profile.env ?? {};
  if (env.ANALYZERX_RELEASE_VERSION !== source.version) failures.push(`${name}: ANALYZERX_RELEASE_VERSION ${env.ANALYZERX_RELEASE_VERSION} != ${source.version}`);
  if (env.ANALYZERX_ANDROID_VERSION_CODE !== String(source.androidVersionCode)) failures.push(`${name}: ANALYZERX_ANDROID_VERSION_CODE ${env.ANALYZERX_ANDROID_VERSION_CODE} != ${source.androidVersionCode}`);
  if (env.ANALYZERX_IOS_BUILD_NUMBER !== String(source.iosBuildNumber)) failures.push(`${name}: ANALYZERX_IOS_BUILD_NUMBER ${env.ANALYZERX_IOS_BUILD_NUMBER} != ${source.iosBuildNumber}`);
}

/* 2. The app config must enable native Local AI by default and consume the version source. */
const appConfig = read("app.config.ts");
if (!appConfig.includes('ANALYZERX_ENABLE_NATIVE_LOCAL_AI !== "false"')) {
  failures.push("app.config.ts no longer enables native Local AI by default");
}
if (!appConfig.includes("./release-version.json")) {
  failures.push("app.config.ts does not consume release-version.json");
}
if (!appConfig.includes("./plugins/with-analyzerx-local-ai.js")) {
  failures.push("app.config.ts does not register the native Local AI plugin");
}

/* 3. The CI workflow must not pin a conflicting version literal. */
const workflow = read(".github/workflows/android-apk.yml");
for (const v of findReleaseVersionLiterals(workflow)) {
  if (v !== source.version) failures.push(`.github/workflows/android-apk.yml contains conflicting version literal ${v}`);
}

if (failures.length) {
  console.error(`Local AI release profile verification FAILED (${failures.length} problem(s)):`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`Local AI release profile verified against ${source.version} (version code ${source.androidVersionCode}).`);

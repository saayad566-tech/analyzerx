import fs from "node:fs";
import path from "node:path";

/**
 * Verifies that the Local AI release profile and the app version identity agree.
 *
 * package.json is the single authoritative version source; the EAS profile name,
 * its env values and the derived Android version code are all checked against it
 * so a release can never be built under a mismatched identity. (The previous
 * implementation read a workflow matrix that no longer exists and imported a
 * `yaml` package that is not a dependency, so it could not run at all.)
 */

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = String(pkg.version);
const [major = 0, minor = 0, patch = 0] = version.split(".").map((part) => Number.parseInt(part, 10) || 0);
const versionCode = String(major * 1000 + minor * 100 + patch);
const profileName = `analyzerx-${version}-local-ai`;

const eas = JSON.parse(fs.readFileSync(path.join(root, "eas.json"), "utf8"));
const profile = eas.build?.[profileName];
const problems = [];

if (!profile) {
  problems.push(`missing EAS build profile "${profileName}"`);
} else {
  if (profile.env?.ANALYZERX_ENABLE_NATIVE_LOCAL_AI !== "true") problems.push("profile does not enable native Local AI");
  if (profile.env?.ANALYZERX_RELEASE_VERSION !== version) problems.push(`profile release version is not ${version}`);
  if (profile.env?.ANALYZERX_ANDROID_VERSION_CODE !== versionCode) problems.push(`profile android versionCode is not ${versionCode}`);
}

const workflowPath = path.join(root, ".github/workflows/android-apk.yml");
if (!fs.existsSync(workflowPath)) problems.push("missing Android release workflow");

if (problems.length) {
  console.error("Local AI release configuration is inconsistent:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(`Local AI release configuration verified for AnalyzerX ${version} (${profileName}, versionCode ${versionCode}).`);

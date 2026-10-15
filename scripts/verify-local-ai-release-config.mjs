import fs from "node:fs";
import yaml from "yaml";

// The release profile is validated against the workflow matrix, which is the single source of truth
// for how the APK is built. The former EAS profile file is gone: the build uses Gradle directly and
// never invoked EAS, so validating a profile that nothing consumed proved nothing.
const workflow = yaml.parse(
  fs.readFileSync(".github/workflows/android-apk.yml", "utf8"),
);
const profiles = workflow.jobs["build-apk"].strategy.matrix.include;
const localAiProfile = profiles.find(
  (profile) => profile.profile === "analyzerx-1.4.0-local-ai",
);

if (
  !localAiProfile ||
  localAiProfile.nativeLocalAI !== "true" ||
  localAiProfile.androidVersionCode !== "1400" ||
  localAiProfile.release !== "1.4.0"
) {
  throw new Error("The Local AI Android workflow profile is missing or inconsistent.");
}

const steps = workflow.jobs["build-apk"].steps.map((step) => step.run ?? "").join("\n");
if (!/gradlew\s+assembleRelease/.test(steps)) {
  throw new Error("The APK workflow no longer builds through Gradle.");
}
if (/\beas\b|expo\s+export/.test(steps)) {
  throw new Error("The APK workflow must not invoke EAS or a web export step.");
}

console.log("Local AI release profile and Gradle build path verified.");

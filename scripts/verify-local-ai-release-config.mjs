import fs from "node:fs";
import yaml from "yaml";

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

const eas = JSON.parse(fs.readFileSync("eas.json", "utf8"));
const easLocalAi = eas.build["analyzerx-1.4.0-local-ai"];
if (
  !easLocalAi ||
  easLocalAi.env.ANALYZERX_ENABLE_NATIVE_LOCAL_AI !== "true" ||
  easLocalAi.env.ANALYZERX_ANDROID_VERSION_CODE !== "1400"
) {
  throw new Error("The Local AI EAS profile is missing or inconsistent.");
}

console.log("Local AI release profile and workflow matrix verified.");

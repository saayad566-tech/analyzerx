import { withAndroidManifest, withAppBuildGradle, withDangerousMod, withMainApplication, type ConfigPlugin } from "@expo/config-plugins";
import fs from "node:fs";
import path from "node:path";

const PACKAGE_NAME = "com.app.marketeventintelligence";
const BRIDGE_PACKAGE = `${PACKAGE_NAME}.localai`;
const LITERTLM_DEPENDENCY = "implementation 'com.google.ai.edge.litertlm:litertlm-android:0.16.0'";

function ensureLine(source: string, line: string): string {
  return source.includes(line) ? source : `${source.trimEnd()}\n${line}\n`;
}

const withAnalyzerXLocalAI: ConfigPlugin = (config) => {
  config = withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language === "groovy") {
      mod.modResults.contents = ensureLine(mod.modResults.contents, `    ${LITERTLM_DEPENDENCY}`);
    }
    return mod;
  });

  config = withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (application) {
      const existing = application["meta-data"] ?? [];
      const names = new Set(existing.map((item) => item.$?.["android:name"]));
      if (!names.has("com.google.ai.edge.litertlm.USE_GPU")) {
        existing.push({ $: { "android:name": "com.google.ai.edge.litertlm.USE_GPU", "android:value": "true" } });
      }
      if (!names.has("com.google.ai.edge.litertlm.USE_NPU")) {
        existing.push({ $: { "android:name": "com.google.ai.edge.litertlm.USE_NPU", "android:value": "true" } });
      }
      application["meta-data"] = existing;
    }
    return mod;
  });

  config = withMainApplication(config, (mod) => {
    let contents = mod.modResults.contents;
    const importLine = `import ${BRIDGE_PACKAGE}.AnalyzerXLocalAIPackage`;
    contents = ensureLine(contents, importLine);
    const addLine = "add(AnalyzerXLocalAIPackage())";
    if (!contents.includes(addLine)) {
      contents = contents.replace(/(PackageList\(this\)\.packages\.apply\s*\{)/, `$1\n              ${addLine}`);
    }
    mod.modResults.contents = contents;
    return mod;
  });

  config = withDangerousMod(config, ["android", async (mod) => {
    const projectRoot = mod.modRequest.projectRoot;
    const sourceRoot = path.join(projectRoot, "plugins", "local-ai-android");
    const targetRoot = path.join(projectRoot, "android", "app", "src", "main", "java", ...BRIDGE_PACKAGE.split("."));
    fs.mkdirSync(targetRoot, { recursive: true });
    for (const file of ["AnalyzerXLocalAIModule.kt", "AnalyzerXLocalAIPackage.kt"]) {
      fs.copyFileSync(path.join(sourceRoot, file), path.join(targetRoot, file));
    }
    return mod;
  }]);

  return config;
};

export default withAnalyzerXLocalAI;

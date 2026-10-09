const { withAndroidManifest, withAppBuildGradle, withDangerousMod, withMainApplication } = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_NAME = "com.app.marketeventintelligence";
const BRIDGE_PACKAGE = `${PACKAGE_NAME}.localai`;
const LITERTLM_COORDINATE = "com.google.ai.edge.litertlm:litertlm-android:0.16.0";

function ensureDependency(source) {
  const escapedCoordinate = LITERTLM_COORDINATE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const danglingDependency = new RegExp(`\\n\\s*implementation ['"]${escapedCoordinate}['"]\\s*$`);
  const normalized = source.replace(danglingDependency, "");
  if (normalized.includes(LITERTLM_COORDINATE)) return normalized;
  const dependencyBlock = /dependencies\s*\{/;
  if (!dependencyBlock.test(normalized)) throw new Error("AnalyzerX Local AI plugin could not find the Android dependencies block.");
  return normalized.replace(dependencyBlock, (match) => `${match}\n    implementation("${LITERTLM_COORDINATE}")`);
}

function ensureLiteRtCompilerCompatibility(source) {
  const metadataFlag = "-Xskip-metadata-version-check";
  if (source.includes(metadataFlag)) return source;
  return `${source.trimEnd()}\n\n// LiteRT-LM 0.16 is compiled with newer Kotlin metadata. This is scoped to app compilation; Expo's root Kotlin/KSP toolchain remains unchanged.\ntasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {\n  compilerOptions.freeCompilerArgs.add(\"${metadataFlag}\")\n}\n`;
}

function ensureImport(source, importLine) {
  if (source.includes(importLine)) return source;
  const lines = source.split("\n");
  const packageIndex = lines.findIndex((line) => line.startsWith("package "));
  let insertAt = packageIndex + 1;
  while (insertAt < lines.length && (lines[insertAt].startsWith("\n") || lines[insertAt].startsWith("import ") || lines[insertAt].trim() === "")) insertAt += 1;
  const importLines = lines.slice(packageIndex + 1, insertAt).filter((line) => line.startsWith("import "));
  const importStart = packageIndex + 1;
  const lastImportOffset = importLines.length;
  lines.splice(importStart + lastImportOffset, 0, importLine);
  return lines.join("\n");
}

module.exports = function withAnalyzerXLocalAI(config) {
  config = withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language === "groovy") {
      mod.modResults.contents = ensureLiteRtCompilerCompatibility(ensureDependency(mod.modResults.contents));
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
      const nativeLibraries = application["uses-native-library"] ?? [];
      const libraryNames = new Set(nativeLibraries.map((item) => item.$?.["android:name"]));
      for (const name of ["libvndksupport.so", "libOpenCL.so"]) {
        if (!libraryNames.has(name)) nativeLibraries.push({ $: { "android:name": name, "android:required": "false" } });
      }
      application["uses-native-library"] = nativeLibraries;
    }
    return mod;
  });

  config = withMainApplication(config, (mod) => {
    let contents = mod.modResults.contents;
    const importLine = `import ${BRIDGE_PACKAGE}.AnalyzerXLocalAIPackage`;
    const llamaImportLine = `import ${BRIDGE_PACKAGE}.AnalyzerXLlamaCppPackage`;
    contents = ensureImport(contents, importLine);
    contents = ensureImport(contents, llamaImportLine);
    const addLine = "add(AnalyzerXLocalAIPackage())";
    if (!contents.includes(addLine)) {
      contents = contents.replace(/(PackageList\(this\)\.packages\.apply\s*\{)/, `$1\n              ${addLine}`);
    }
    const llamaAddLine = "add(AnalyzerXLlamaCppPackage())";
    if (!contents.includes(llamaAddLine)) {
      contents = contents.replace(/(PackageList\(this\)\.packages\.apply\s*\{)/, `$1\n              ${llamaAddLine}`);
    }
    mod.modResults.contents = contents;
    return mod;
  });

  config = withDangerousMod(config, ["android", async (mod) => {
    const projectRoot = mod.modRequest.projectRoot;
    const sourceRoot = path.join(projectRoot, "plugins", "local-ai-android");
    const targetRoot = path.join(projectRoot, "android", "app", "src", "main", "java", ...BRIDGE_PACKAGE.split("."));
    fs.mkdirSync(targetRoot, { recursive: true });
    for (const file of ["AnalyzerXLocalAIModule.kt", "AnalyzerXLocalAIPackage.kt", "AnalyzerXLlamaCppModule.kt", "AnalyzerXLlamaCppPackage.kt"]) {
      fs.copyFileSync(path.join(sourceRoot, file), path.join(targetRoot, file));
    }
    return mod;
  }]);

  return config;
};

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

describe("Local AI native wiring", () => {
  it("keeps LiteRT-LM inside the Android dependencies block or active config plugin", () => {
    const generatedGradlePath = path.join(root, "android/app/build.gradle");
    if (fs.existsSync(generatedGradlePath)) {
      const buildGradle = fs.readFileSync(generatedGradlePath, "utf8");
      const dependenciesStart = buildGradle.indexOf("dependencies {");
      const coordinate = buildGradle.indexOf("com.google.ai.edge.litertlm:litertlm-android:0.16.0");
      expect(dependenciesStart).toBeGreaterThanOrEqual(0);
      expect(coordinate).toBeGreaterThan(dependenciesStart);
      expect(buildGradle.slice(coordinate).trimEnd().endsWith("}")).toBe(true);
      return;
    }
    const plugin = fs.readFileSync(path.join(root, "plugins/with-analyzerx-local-ai.js"), "utf8");
    expect(plugin).toContain("com.google.ai.edge.litertlm:litertlm-android:0.16.0");
    expect(plugin).toContain("withAppBuildGradle");
    expect(plugin).toContain("const dependencyBlock = /dependencies\\s*\\{/;");
  });

  it("keeps Expo's Kotlin toolchain while enabling LiteRT-LM metadata compatibility only for app compilation", () => {
    const plugin = fs.readFileSync(path.join(root, "plugins/with-analyzerx-local-ai.js"), "utf8");
    expect(plugin).not.toContain("withProjectBuildGradle");
    expect(plugin).not.toContain('kotlinVersion = "2.3.0"');
    expect(plugin).toContain("tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach");
    expect(plugin).toContain("-Xskip-metadata-version-check");
  });

  it("contains native multimodal content and cancellation boundaries", () => {
    const kotlin = fs.readFileSync(path.join(root, "plugins/local-ai-android/AnalyzerXLocalAIModule.kt"), "utf8");
    expect(kotlin).toContain("Content.ImageFile");
    expect(kotlin).toContain("Content.AudioFile");
    expect(kotlin).toContain("Contents.of");
    expect(kotlin).toContain("Backend.NPU(nativeLibraryDir");
    expect(kotlin).toContain("fun cancel");
    expect(kotlin).toContain("fun unload");
    expect(kotlin).toContain("fun getDeviceTelemetry");
    expect(kotlin).toContain("currentThermalStatus");
  });

  it("normalizes Expo file URIs and validates the artifact before native model load", () => {
    const kotlin = fs.readFileSync(path.join(root, "plugins/local-ai-android/AnalyzerXLocalAIModule.kt"), "utf8");
    expect(kotlin).toContain("fun resolveModelPath");
    expect(kotlin).toContain("Uri.parse(raw)");
    expect(kotlin).toContain("uri.path?.takeIf");
    expect(kotlin).toContain("File(path)");
    expect(kotlin).toContain("file.canonicalPath");
    expect(kotlin).toContain("modelPath = resolveModelPath(modelPath)");
    expect(kotlin).toContain("The selected model file is not available on this device. Download it again.");
  });
});

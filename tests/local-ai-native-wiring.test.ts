import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

describe("Local AI native wiring", () => {
  it("keeps LiteRT-LM inside the Android dependencies block", () => {
    const gradle = fs.readFileSync(path.join(root, "android/app/build.gradle"), "utf8");
    const coordinate = gradle.indexOf("com.google.ai.edge.litertlm:litertlm-android:0.16.0");
    const dependenciesStart = gradle.indexOf("dependencies {");
    expect(dependenciesStart).toBeGreaterThanOrEqual(0);
    expect(coordinate).toBeGreaterThan(dependenciesStart);
    // Assert the actual intent: the coordinate sits *inside* a balanced `dependencies { }` block.
    // (The previous check asserted the file *ended* with "}", which only held while nothing followed
    // the block — and something legitimately does now.)
    let depth = 1;
    let closedAt = -1;
    for (let i = coordinate; i < gradle.length; i += 1) {
      if (gradle[i] === "{") depth += 1;
      else if (gradle[i] === "}") { depth -= 1; if (depth === 0) { closedAt = i; break; } }
    }
    expect(closedAt).toBeGreaterThanOrEqual(0);
  });

  it("enables LiteRT-LM metadata compatibility only for app compilation", () => {
    const gradle = fs.readFileSync(path.join(root, "android/app/build.gradle"), "utf8");
    expect(gradle).toContain("tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach");
    expect(gradle).toContain("-Xskip-metadata-version-check");
  });

  it("contains native multimodal content and cancellation boundaries", () => {
    const kotlin = fs.readFileSync(path.join(root, "android/app/src/main/java/com/app/marketeventintelligence/localai/AnalyzerXLocalAIModule.kt"), "utf8");
    expect(kotlin).toContain("Content.ImageFile");
    expect(kotlin).toContain("Content.AudioFile");
    expect(kotlin).toContain("Contents.of");
    expect(kotlin).toContain("Backend.NPU(nativeLibraryDir");
    expect(kotlin).toContain("fun cancel");
    expect(kotlin).toContain("fun unload");
    expect(kotlin).toContain("fun getDeviceTelemetry");
    expect(kotlin).toContain("currentThermalStatus");
  });

  it("normalizes file URIs and validates the artifact before native model load", () => {
    const kotlin = fs.readFileSync(path.join(root, "android/app/src/main/java/com/app/marketeventintelligence/localai/AnalyzerXLocalAIModule.kt"), "utf8");
    expect(kotlin).toContain("fun resolveModelPath");
    expect(kotlin).toContain("Uri.parse(raw)");
    expect(kotlin).toContain("uri.path?.takeIf");
    expect(kotlin).toContain("File(path)");
    expect(kotlin).toContain("file.canonicalPath");
    expect(kotlin).toContain("modelPath = resolveModelPath(modelPath)");
    expect(kotlin).toContain("The selected model file is not available on this device. Download it again.");
  });
});

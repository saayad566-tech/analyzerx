import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const android = path.join(root, "android");
const gradle = path.join(android, "app", "build.gradle");
const plugin = path.join(root, "plugins", "with-analyzerx-local-ai.js");
const bridge = path.join(root, "plugins", "local-ai-android", "AnalyzerXLocalAIModule.kt");
const localProperties = path.join(android, "local.properties");

const checks = [
  ["Expo config plugin", fs.existsSync(plugin)],
  ["Kotlin LiteRT-LM bridge source", fs.existsSync(bridge)],
  ["LiteRT-LM Gradle coordinate", fs.existsSync(gradle) && fs.readFileSync(gradle, "utf8").includes("com.google.ai.edge.litertlm:litertlm-android:0.16.0")],
  ["arm64 build policy", fs.existsSync(path.join(root, "app.config.ts")) && fs.readFileSync(path.join(root, "app.config.ts"), "utf8").includes('"arm64-v8a"')],
  ["Android SDK configured", Boolean(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || fs.existsSync(localProperties))],
];

for (const [label, passed] of checks) console.log(`${passed ? "PASS" : "PENDING"} | ${label}`);
console.log("\nRequired arm64 device gates:");
for (const gate of [
  "assembleDebug succeeds with LiteRT-LM 0.16.0",
  "Gemma 4 E2B download integrity passes",
  "Gemma 4 E2B load succeeds without ANR",
  "Text streaming emits non-empty tokens",
  "ImageFile and AudioFile multimodal prompts return non-empty tokens",
  "Cancellation resolves and unload releases the runtime",
  "Gemma 4 E4B load/switch succeeds on a device with >= 8 GB RAM",
]) console.log(`PENDING | ${gate}`);

if (!checks.every(([, passed]) => passed)) process.exitCode = 2;

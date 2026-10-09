import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const ndk = process.env.ANDROID_NDK_HOME ?? process.env.ANDROID_NDK_ROOT ?? null;
const sourceDir = process.env.ANALYZERX_LLAMA_CPP_SOURCE ?? path.join(root, "native", "llama.cpp");
const checks = [];
const has = (command) => { try { execFileSync(command, ["--version"], { stdio: "ignore" }); return true; } catch { return false; } };
checks.push({ label: "Android NDK", status: ndk && existsSync(ndk) ? "pass" : "blocked", value: ndk ?? "ANDROID_NDK_HOME/ANDROID_NDK_ROOT is not set" });
checks.push({ label: "CMake", status: has("cmake") ? "pass" : "blocked", value: has("cmake") ? "available" : "cmake is not installed" });
checks.push({ label: "Pinned llama.cpp source", status: existsSync(sourceDir) ? "pass" : "blocked", value: sourceDir });
const blocked = checks.filter((check) => check.status === "blocked");
if (blocked.length) {
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), checks, releaseDecision: "blocked-no-library-built", next: "Provide an Android SDK/NDK, CMake, and a reviewed pinned llama.cpp source tree, then rerun this script." }, null, 2));
  process.exit(2);
}
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), checks, releaseDecision: "ready-to-configure-cmake-build", next: "Run the reviewed CMake arm64 build and verify JNI symbols on an Android device." }, null, 2));

#!/usr/bin/env node
/**
 * build-apk.mjs — build the Android release APK with the platform's Gradle wrapper.
 *
 * `./gradlew` does not run in a Windows `cmd` shell and `gradlew.bat` does not run on Unix, so the
 * wrapper is chosen by platform. This is what `pnpm build:apk` calls.
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(root, "android");
const wrapper = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const outDir = path.join(androidDir, "app", "build", "outputs", "apk", "release");

const log = (m) => console.log(`[build:apk] ${m}`);

if (!existsSync(path.join(androidDir, wrapper))) {
  console.error(`[build:apk] ERROR: ${wrapper} not found in android/ — run from the repo root.`);
  process.exit(1);
}

log(`running ${wrapper} assembleRelease --no-daemon`);
execSync(`${wrapper} assembleRelease --no-daemon`, { cwd: androidDir, stdio: "inherit" });

const apks = existsSync(outDir) ? readdirSync(outDir).filter((f) => f.endsWith(".apk")) : [];
if (apks.length === 0) {
  console.error(`[build:apk] ERROR: no .apk in ${path.relative(root, outDir)}`);
  process.exit(1);
}

log(`done — ${apks.length} APK(s):`);
for (const f of apks) {
  const bytes = statSync(path.join(outDir, f)).size;
  log(`  android/app/build/outputs/apk/release/${f}  (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
}

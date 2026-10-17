#!/usr/bin/env node
/**
 * build-desktop.mjs — stage the React Native Web build into the Electron shell and package the
 * Windows installers (NSIS + portable).
 *
 * Cross-platform on purpose: it uses Node's own fs, so `pnpm build:win` behaves the same on Windows,
 * macOS and Linux — no `mkdir -p` / `cp -r` that only exist in a POSIX shell.
 *
 * Run it through the package script, which produces the web bundle first:
 *     pnpm build:win
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(root, "dist", "web");
const desktopDir = path.join(root, "desktop");
const appDir = path.join(desktopDir, "app");
const releaseDir = path.join(desktopDir, "release");

const log = (m) => console.log(`[build:win] ${m}`);
const fail = (m) => {
  console.error(`[build:win] ERROR: ${m}`);
  process.exit(1);
};

// 1. The web bundle must exist (produced by `pnpm web:bundle`, which `pnpm build:win` runs first).
if (!existsSync(path.join(webDir, "index.bundle.js"))) {
  fail("dist/web/index.bundle.js is missing — run `pnpm web:bundle` first.");
}
if (!existsSync(path.join(root, "public", "index.html"))) {
  fail("public/index.html is missing — the shell has no page to load.");
}

// 2. Stage the web build into the shell (fresh each time, so a stale bundle can never ship).
rmSync(appDir, { recursive: true, force: true });
mkdirSync(appDir, { recursive: true });
cpSync(webDir, appDir, { recursive: true });
cpSync(path.join(root, "public", "index.html"), path.join(appDir, "index.html"));
log("staged the web build into desktop/app");

// 3. Install the desktop toolchain once (electron + electron-builder are isolated in desktop/).
if (!existsSync(path.join(desktopDir, "node_modules"))) {
  log("installing the desktop toolchain (electron + electron-builder)…");
  execSync("npm install --no-audit --no-fund", { cwd: desktopDir, stdio: "inherit" });
}

// 4. Package. electron-builder reads desktop/electron-builder.yml.
log("packaging the Windows installers…");
execSync("npx electron-builder --win --publish never", { cwd: desktopDir, stdio: "inherit" });

// 5. Report what was produced, with sizes, so the caller never has to guess.
const exes = existsSync(releaseDir)
  ? readdirSync(releaseDir).filter((f) => f.toLowerCase().endsWith(".exe"))
  : [];
if (exes.length === 0) fail(`no .exe produced in ${path.relative(root, releaseDir)}`);

log(`done — ${exes.length} installer(s):`);
for (const f of exes) {
  const bytes = statSync(path.join(releaseDir, f)).size;
  log(`  desktop/release/${f}  (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
}

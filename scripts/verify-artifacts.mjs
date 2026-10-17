#!/usr/bin/env node
/**
 * verify-artifacts.mjs — run `scripts/verify_artifacts.py` with whichever Python the machine has.
 *
 * `verify_artifacts.py` stays the single source of truth for the check (non-zero size + correct magic
 * bytes); this wrapper only removes the "python3 vs python" guesswork so `pnpm verify:artifacts`
 * works on Windows, macOS and Linux.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "verify_artifacts.py");

if (!existsSync(script)) {
  console.error(`[verify:artifacts] ERROR: ${script} not found.`);
  process.exit(1);
}

const candidates = process.platform === "win32" ? ["python", "py", "python3"] : ["python3", "python"];
let notFound = true;

for (const bin of candidates) {
  try {
    execFileSync(bin, [script, "--dir", root], { stdio: "inherit" });
    process.exit(0);
  } catch (err) {
    if (err && err.code === "ENOENT") continue; // this interpreter isn't installed — try the next
    notFound = false;
    process.exit(typeof err.status === "number" ? err.status : 1);
  }
}

if (notFound) {
  console.error(
    `[verify:artifacts] no Python interpreter found (tried: ${candidates.join(", ")}). ` +
      "Install Python 3, or run `python3 scripts/verify_artifacts.py --dir .` directly.",
  );
  process.exit(1);
}

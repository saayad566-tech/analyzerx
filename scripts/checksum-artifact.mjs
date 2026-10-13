import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/*
 * Writes `<artifact>.sha256` for a build artifact.
 *
 * Guard: checksum metadata is only ever generated for an artifact that actually
 * exists and is non-empty, so a checksum file can never refer to a nonexistent
 * artifact. `release-readiness.mjs` additionally scans the tree for orphaned
 * `*.apk.sha256` files that have no matching artifact.
 */

const artifactPath = process.argv[2];
if (!artifactPath) {
  console.error("Usage: node scripts/checksum-artifact.mjs <apk-path>");
  process.exit(1);
}
if (!fs.existsSync(artifactPath)) {
  console.error(`Refusing to write checksum: artifact does not exist: ${artifactPath}`);
  process.exit(1);
}
const stat = fs.statSync(artifactPath);
if (!stat.isFile() || stat.size === 0) {
  console.error(`Refusing to write checksum: artifact is not a non-empty file: ${artifactPath}`);
  process.exit(1);
}

const bytes = fs.readFileSync(artifactPath);
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
const output = `${sha256}  ${path.basename(artifactPath)}\n`;
const checksumPath = `${artifactPath}.sha256`;
fs.writeFileSync(checksumPath, output);

// Post-write guard: the checksum file must exist and agree with the artifact.
const written = fs.readFileSync(checksumPath, "utf8").trim().split(/\s+/)[0];
if (written !== sha256) {
  console.error(`Checksum write verification failed: wrote ${written}, expected ${sha256}`);
  process.exit(1);
}

console.log(JSON.stringify({ artifact: artifactPath, size: stat.size, sha256, checksumPath }, null, 2));

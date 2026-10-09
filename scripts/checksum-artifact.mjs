import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const artifactPath = process.argv[2];
if (!artifactPath || !fs.existsSync(artifactPath)) {
  console.error("Usage: node scripts/checksum-artifact.mjs <apk-path>");
  process.exit(1);
}
const bytes = fs.readFileSync(artifactPath);
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
const output = `${sha256}  ${path.basename(artifactPath)}\n`;
const checksumPath = `${artifactPath}.sha256`;
fs.writeFileSync(checksumPath, output);
console.log(
  JSON.stringify({ artifact: artifactPath, sha256, checksumPath }, null, 2),
);

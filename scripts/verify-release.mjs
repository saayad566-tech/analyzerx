import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const version = "3.2.0";
const versionCode = 3200;
const manifest = JSON.parse(fs.readFileSync(path.join(root, "release-manifest.json"), "utf8"));
const missing = [];
const files = Object.values(manifest.requiredFeatures).flat();
for (const relative of files) {
  if (!fs.existsSync(path.join(root, relative))) missing.push(`missing file: ${relative}`);
}
const source = files.filter((file) => fs.existsSync(path.join(root, file))).map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
for (const marker of manifest.requiredSourceMarkers) {
  if (!source.includes(marker)) missing.push(`missing source marker: ${marker}`);
}
if (missing.length) {
  console.error(`AnalyzerX ${version} release parity check failed`);
  for (const issue of missing) console.error(`- ${issue}`);
  process.exit(1);
}
let revision = "unavailable";
try { revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch {}
const artifact = {
  product: manifest.product,
  version,
  androidVersionCode: versionCode,
  sourceRevision: revision,
  manifestVersion: manifest.manifestVersion,
  generatedAt: new Date().toISOString(),
  status: "parity-verified",
  featureGroups: Object.keys(manifest.requiredFeatures),
};
const out = path.join(root, "artifacts", `analyzerx-${version}-release-verification.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify(artifact, null, 2));

#!/usr/bin/env node
/**
 * build-resource-pack.mjs — turn market datasets into chunked resource packs.
 *
 * Input  (--src):  <src>/<MARKET>/*.json     e.g. resource-packs-src/IN/events.json
 * Output (--out):  <out>/packs/<MARKET>/<dataset>.<NNN>.bin   (chunked, <= chunk-bytes each)
 *                  <out>/manifests/<MARKET>.json              (per-market manifest)
 *                  <out>/manifests/index.json                 (the "main file" the app fetches)
 *                  <out>/SHA256SUMS                           (flat checksum list)
 *
 * Deterministic: same inputs produce byte-identical outputs. Uses only Node built-ins.
 *
 * Usage:
 *   node scripts/build-resource-pack.mjs --src resource-packs-src --out .assets-dist \
 *        [--chunk-bytes 4194304] [--version 2026.10.15] [--generated-at 2026-10-15T00:00:00Z]
 */
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_CHUNK_BYTES,
  MARKET_ORDER,
  canonicalManifestBody,
  chunkBuffer,
  normalizeVersion,
  sealManifest,
  sha256Hex,
} from "./resource-pack-format.mjs";

function parseArgs(argv) {
  const args = { src: "resource-packs-src", out: ".assets-dist", chunkBytes: DEFAULT_CHUNK_BYTES, version: "", generatedAt: "" };
  for (let i = 2; i < argv.length; i += 1) {
    const [key, value] = [argv[i], argv[i + 1]];
    if (key === "--src") args.src = value;
    else if (key === "--out") args.out = value;
    else if (key === "--chunk-bytes") args.chunkBytes = Number(value);
    else if (key === "--version") args.version = value;
    else if (key === "--generated-at") args.generatedAt = value;
    else if (key === "--help") {
      console.log("Usage: node scripts/build-resource-pack.mjs --src <dir> --out <dir> [--chunk-bytes N] [--version X] [--generated-at ISO]");
      process.exit(0);
    }
    i += 1;
  }
  if (!Number.isFinite(args.chunkBytes) || args.chunkBytes <= 0) throw new Error("--chunk-bytes must be a positive number");
  return args;
}

async function listMarkets(srcDir) {
  const entries = await readdir(srcDir, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const known = MARKET_ORDER.filter((id) => dirs.includes(id));
  const extra = dirs.filter((id) => !MARKET_ORDER.includes(id)).sort();
  return [...known, ...extra];
}

function datasetNameFromFile(file) {
  return path.basename(file, path.extname(file)).replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function buildMarket(marketId, srcDir, outDir, options) {
  const marketSrc = path.join(srcDir, marketId);
  const files = (await readdir(marketSrc)).filter((file) => file.endsWith(".json")).sort();
  if (files.length === 0) return null;

  const packDirRel = `packs/${marketId}`;
  const packDirAbs = path.join(outDir, packDirRel);
  await mkdir(packDirAbs, { recursive: true });

  const datasets = [];
  const sums = [];
  for (const file of files) {
    const name = datasetNameFromFile(file);
    const buffer = await readFile(path.join(marketSrc, file));
    const pieces = chunkBuffer(buffer, options.chunkBytes);
    const chunks = [];
    for (let index = 0; index < pieces.length; index += 1) {
      const piece = pieces[index];
      const chunkName = `${name}.${String(index).padStart(3, "0")}.bin`;
      const chunkRel = `${packDirRel}/${chunkName}`;
      await writeFile(path.join(outDir, chunkRel), piece);
      const digest = sha256Hex(piece);
      chunks.push({ index, file: chunkRel, bytes: piece.length, sha256: digest });
      sums.push(`${digest}  ${chunkRel}`);
    }
    datasets.push({ name, bytes: buffer.length, sha256: sha256Hex(buffer), encoding: "json", chunks });
  }

  const totalBytes = datasets.reduce((sum, dataset) => sum + dataset.bytes, 0);
  const manifest = sealManifest({
    schemaVersion: 1,
    marketId,
    packVersion: options.version,
    generatedAt: options.generatedAt,
    chunkBytes: options.chunkBytes,
    datasets,
    totalBytes,
    sha256: "0".repeat(64),
  });

  await mkdir(path.join(outDir, "manifests"), { recursive: true });
  await writeFile(path.join(outDir, "manifests", `${marketId}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  sums.push(`${sha256Hex(Buffer.from(canonicalManifestBody(manifest), "utf8"))}  manifests/${marketId}.json`);

  return {
    entry: { marketId, packVersion: manifest.packVersion, manifestPath: `manifests/${marketId}.json`, totalBytes, datasetNames: datasets.map((dataset) => dataset.name) },
    sums,
    chunks: datasets.reduce((sum, dataset) => sum + dataset.chunks.length, 0),
    totalBytes,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const srcDir = path.resolve(args.src);
  const outDir = path.resolve(args.out);
  if (!existsSync(srcDir)) throw new Error(`Source directory not found: ${srcDir}`);

  const generatedAt = args.generatedAt || new Date().toISOString();
  const version = normalizeVersion(args.version || generatedAt.slice(0, 10));
  const options = { chunkBytes: args.chunkBytes, version, generatedAt };

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const markets = await listMarkets(srcDir);
  const packs = [];
  const allSums = [];
  let totalChunks = 0;
  let totalBytes = 0;

  for (const marketId of markets) {
    const result = await buildMarket(marketId, srcDir, outDir, options);
    if (!result) continue;
    packs.push(result.entry);
    allSums.push(...result.sums);
    totalChunks += result.chunks;
    totalBytes += result.totalBytes;
    console.log(`  ${marketId.padEnd(3)} ${String(result.chunks).padStart(4)} chunks  ${result.totalBytes.toLocaleString()} bytes  datasets: ${result.entry.datasetNames.join(", ")}`);
  }

  const index = { schemaVersion: 1, generatedAt, packs };
  await writeFile(path.join(outDir, "manifests", "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  await writeFile(path.join(outDir, "SHA256SUMS"), `${allSums.join("\n")}\n`);

  console.log(`\nBuilt ${packs.length} market pack(s) -> ${path.relative(process.cwd(), outDir)}`);
  console.log(`  version      ${version}`);
  console.log(`  chunk size   ${options.chunkBytes.toLocaleString()} bytes`);
  console.log(`  chunks       ${totalChunks}`);
  console.log(`  data bytes   ${totalBytes.toLocaleString()}`);
  console.log(`  markets      ${packs.map((pack) => pack.marketId).join(", ")}`);
}

main().catch((error) => {
  console.error(`build-resource-pack failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

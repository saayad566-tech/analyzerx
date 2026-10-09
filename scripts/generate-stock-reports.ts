import { mkdir, writeFile } from "node:fs/promises";
import { analyzeFundamentals } from "../server/fundamental-analysis";
import { fundamentalAnalysisToMarkdown, reportFileName, reportsManifest } from "../server/research-report";

const symbols = ["TATAMOTORS", "TATAPOWER", "ADANIENT", "ADANIPORTS", "RELIANCE", "JIOFIN"];
const outputDir = process.argv[2] ?? "/home/ubuntu/market-event-intelligence/artifacts/stock-reports";

async function main() {
  await mkdir(outputDir, { recursive: true });
  const reports = await Promise.all(symbols.map(async (symbol) => {
    try {
      return await analyzeFundamentals(symbol);
    } catch (error) {
      throw new Error(`${symbol}: ${String(error)}`);
    }
  }));
  for (const report of reports) {
    await writeFile(`${outputDir}/${reportFileName(report)}`, fundamentalAnalysisToMarkdown(report), "utf8");
  }
  await writeFile(`${outputDir}/manifest.json`, JSON.stringify(reportsManifest(reports), null, 2), "utf8");
  console.log(JSON.stringify(reportsManifest(reports), null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

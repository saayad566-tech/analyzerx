import { mkdir, writeFile } from "node:fs/promises";
import { analyzeFundamentals } from "../server/fundamental-analysis";
import { reportFileName } from "../server/research-report";
import { institutionalReportToPdf } from "../server/institutional-report-pdf";

const symbols = process.argv.slice(2).length ? process.argv.slice(2) : ["TATAMOTORS", "TATAPOWER", "ADANIENT", "ADANIPORTS", "RELIANCE", "JIOFIN"];
const outputDir = process.env.OUTPUT_DIR ?? "/home/ubuntu/market-event-intelligence/artifacts/stock-pdfs";

async function main() {
  await mkdir(outputDir, { recursive: true });
  const manifest: Array<{ symbol: string; companyName: string; score: number; fileName: string; bytes: number }> = [];

  for (const symbol of symbols) {
    const report = await analyzeFundamentals(symbol, "IN");
    const pdf = await institutionalReportToPdf(report);
    const fileName = reportFileName(report, "pdf");
    await writeFile(`${outputDir}/${fileName}`, pdf);
    manifest.push({ symbol: report.resolvedSymbol, companyName: report.companyName, score: report.score, fileName, bytes: pdf.byteLength });
    console.log(`Generated ${fileName} (${pdf.byteLength} bytes)`);
  }

  await writeFile(`${outputDir}/manifest.json`, JSON.stringify({ generatedAt: new Date().toISOString(), reports: manifest }, null, 2), "utf8");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

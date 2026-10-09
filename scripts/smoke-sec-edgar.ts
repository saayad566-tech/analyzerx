import { collectSecCompany } from "../server/sec-edgar";

async function main() {
  process.env.SEC_EDGAR_USER_AGENT = process.env.SEC_EDGAR_USER_AGENT || "AnalyzerX/1.0 research@example.com";
  const symbol = process.argv[2] || "AAPL";
  const result = await collectSecCompany(symbol);
  console.log(JSON.stringify({ status: result.status, symbol: result.symbol, cik: result.cik ?? null, companyName: result.companyName ?? null, filings: result.filings?.length ?? 0, facts: result.facts?.length ?? 0, error: result.error ?? null, retrievedAt: result.retrievedAt }, null, 2));
}

void main();

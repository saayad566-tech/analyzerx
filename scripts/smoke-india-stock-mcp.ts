import { getIndiaStockMcpSnapshot } from "../server/india-stock-mcp";

async function main() {
  const snapshot = await getIndiaStockMcpSnapshot("RELIANCE");
  console.log(JSON.stringify({
    provider: snapshot.provider,
    sourceBoundary: snapshot.sourceBoundary,
    symbol: snapshot.symbol,
    quoteAvailable: Boolean(snapshot.quote),
    fundamentalsAvailable: Boolean(snapshot.fundamentals),
    errors: snapshot.errors,
  }, null, 2));
}

void main();

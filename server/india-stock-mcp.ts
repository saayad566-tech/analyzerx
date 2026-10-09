import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, type StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js";

export type IndiaStockMcpStatus = {
  configured: boolean;
  provider: "India Stock MCP";
  sourceBoundary: "read-only";
  freshness: "provider-reported" | "unknown";
  note: string;
};

function serverParams(): StdioServerParameters {
  const command = process.env.INDIA_STOCK_MCP_COMMAND ?? `${process.cwd()}/node_modules/.bin/india-stock-mcp`;
  return {
    command,
    args: process.env.INDIA_STOCK_MCP_ARGS ? process.env.INDIA_STOCK_MCP_ARGS.split(" ").filter(Boolean) : [],
    stderr: "pipe",
    env: { ...process.env, INDIA_STOCK_MCP_READ_ONLY: "true" },
  };
}

function textFromResult(result: unknown) {
  if (!result || typeof result !== "object") return result;
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return result;
  const text = content.find((item) => item && typeof item === "object" && (item as { type?: string }).type === "text") as { text?: string } | undefined;
  if (!text?.text) return result;
  try { return JSON.parse(text.text) as unknown; } catch { return { text: text.text }; }
}

export async function callIndiaStockMcpTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const client = new Client({ name: "market-event-intelligence", version: "1.0.0" }, { capabilities: {} });
  const transport = new StdioClientTransport(serverParams());
  try {
    await client.connect(transport);
    const result = await client.callTool({ name, arguments: args });
    return textFromResult(result) as T;
  } finally {
    await client.close().catch(() => undefined);
  }
}

export function getIndiaStockMcpStatus(): IndiaStockMcpStatus {
  return {
    configured: true,
    provider: "India Stock MCP",
    sourceBoundary: "read-only",
    freshness: "unknown",
    note: "Uses the reviewed MCP package and its documented Yahoo/NSE/mutual-fund public sources. Quotes may be delayed, rate-limited, incomplete, or unavailable.",
  };
}

export async function getIndiaStockMcpSnapshot(symbol: string) {
  const [quote, fundamentals] = await Promise.allSettled([
    callIndiaStockMcpTool("get_quote", { symbol }),
    callIndiaStockMcpTool("get_fundamentals", { symbol }),
  ]);
  return {
    symbol: symbol.toUpperCase(),
    provider: "India Stock MCP" as const,
    sourceBoundary: "read-only" as const,
    asOf: new Date().toISOString(),
    quote: quote.status === "fulfilled" ? quote.value : null,
    fundamentals: fundamentals.status === "fulfilled" ? fundamentals.value : null,
    errors: {
      quote: quote.status === "rejected" ? String(quote.reason) : null,
      fundamentals: fundamentals.status === "rejected" ? String(fundamentals.reason) : null,
    },
  };
}

export async function getIndiaStockMcpHistory(symbol: string, from: string, to: string, interval: "1d" | "1wk" | "1mo" = "1d") {
  const data = await callIndiaStockMcpTool("get_historical", { symbol, from, to, interval });
  return { symbol: symbol.toUpperCase(), provider: "India Stock MCP" as const, sourceBoundary: "read-only" as const, interval, data };
}

export async function searchIndiaStockMcp(query: string) {
  const data = await callIndiaStockMcpTool("search_symbol", { query });
  return { query, provider: "India Stock MCP" as const, sourceBoundary: "read-only" as const, data };
}

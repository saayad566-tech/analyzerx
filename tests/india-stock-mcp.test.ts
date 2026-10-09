import { describe, expect, it } from "vitest";
import { getIndiaStockMcpStatus } from "../server/india-stock-mcp";

describe("India Stock MCP provider contract", () => {
  it("is explicitly read-only and reports delayed/unknown freshness", () => {
    const status = getIndiaStockMcpStatus();
    expect(status.configured).toBe(true);
    expect(status.sourceBoundary).toBe("read-only");
    expect(status.freshness).toBe("unknown");
    expect(status.note).toContain("delayed");
  });
});

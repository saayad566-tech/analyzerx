import { describe, expect, it } from "vitest";

import { getNseCollectorRegistry } from "../server/nse-collectors";

describe("NSE collector registry", () => {
  it("keeps FII/DII ready while unresolved report downloads remain blocked", () => {
    const collectors = getNseCollectorRegistry();
    expect(collectors.find((collector) => collector.key === "fii-dii")?.status).toBe("ready");
    expect(collectors.find((collector) => collector.key === "bhavcopy")?.status).toBe("blocked-unresolved-download");
  });

  it("marks corporate pages as page snapshots rather than structured feeds", () => {
    const collectors = getNseCollectorRegistry();
    expect(collectors.find((collector) => collector.key === "announcements")?.status).toBe("page-snapshot");
    expect(collectors.find((collector) => collector.key === "results")?.status).toBe("page-snapshot");
  });
});

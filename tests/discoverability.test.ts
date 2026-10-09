import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("feature discoverability", () => {
  it("surfaces Research Workspace from Live", () => {
    expect(read("app/(tabs)/index.tsx")).toContain("/research-workspace");
  });

  it("surfaces deep research, history, and macro context from Account", () => {
    const account = read("app/account.tsx");
    expect(account).toContain("/research-desk");
    expect(account).toContain("/history");
    expect(account).toContain("/macro-context");
  });

  it("contains compiled destinations for every surfaced feature", () => {
    expect(read("app/research-desk.tsx")).toContain("Research Desk");
    expect(read("app/macro-context.tsx")).toContain("ECB and OECD context");
    expect(read("app/history.tsx")).toContain("History");
  });
});

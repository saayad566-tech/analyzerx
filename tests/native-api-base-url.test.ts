import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("native release API base URL", () => {
  it("contains a stable deployed origin fallback", () => {
    const source = readFileSync(resolve(process.cwd(), "constants/oauth.ts"), "utf8");
    expect(source).toContain('const DEFAULT_NATIVE_API_BASE_URL = "https://marketevent-i4bj664j.manus.space";');
    expect(source).toContain("return DEFAULT_NATIVE_API_BASE_URL;");
    expect(source).not.toContain('// Fallback to empty (will use relative URL)\n  return "";');
  });
});

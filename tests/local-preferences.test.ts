import { describe, expect, it } from "vitest";

import { mergeRecentSearches, parseAlertState } from "../lib/local-preferences";

describe("local preferences", () => {
  it("accepts only a two-boolean alert state", () => {
    expect(parseAlertState('[true,false]')).toEqual([true, false]);
    expect(parseAlertState('[true]')).toBeNull();
    expect(parseAlertState('{"first":true}')).toBeNull();
    expect(parseAlertState("not-json")).toBeNull();
  });

  it("normalizes, deduplicates, and caps recent searches", () => {
    expect(mergeRecentSearches(" infy ", ["RELIANCE", "INFY", "TCS"])).toEqual(["INFY", "RELIANCE", "TCS"]);
    expect(mergeRecentSearches("", ["A", "B", "C", "D", "E", "F"])).toEqual(["A", "B", "C", "D", "E"]);
  });
});

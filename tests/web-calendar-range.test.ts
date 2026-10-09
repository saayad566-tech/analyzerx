import { describe, expect, it } from "vitest";
import { quickCalendarRange } from "../lib/calendar-presets";

describe("visual calendar quick ranges", () => {
  const today = new Date("2026-08-19T18:30:00.000Z");

  it("selects seven inclusive calendar days ending today", () => {
    expect(quickCalendarRange(7, today)).toEqual({ startDate: "2026-08-13", endDate: "2026-08-19" });
  });

  it("selects thirty inclusive calendar days ending today", () => {
    expect(quickCalendarRange(30, today)).toEqual({ startDate: "2026-07-21", endDate: "2026-08-19" });
  });

  it("selects ninety inclusive calendar days ending today", () => {
    expect(quickCalendarRange(90, today)).toEqual({ startDate: "2026-05-22", endDate: "2026-08-19" });
  });

  it("handles month and year boundaries", () => {
    expect(quickCalendarRange(7, new Date("2026-01-03T12:00:00.000Z"))).toEqual({ startDate: "2025-12-28", endDate: "2026-01-03" });
    expect(quickCalendarRange(90, new Date("2026-01-03T12:00:00.000Z"))).toEqual({ startDate: "2025-10-06", endDate: "2026-01-03" });
  });
});

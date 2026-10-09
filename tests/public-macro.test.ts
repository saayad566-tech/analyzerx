import { describe, expect, it } from "vitest";
import { parseEcbSdmxCsv, parseOecdSdmxCsv, summarizePublicMacro } from "../server/public-macro";

describe("public macro parsers", () => {
  it("parses ECB SDMX CSV with units, frequency, and dimensions", () => {
    const rows = parseEcbSdmxCsv([
      "KEY,FREQ,CURRENCY,CURRENCY_DENOM,UNIT,TIME_PERIOD,OBS_VALUE",
      "EXR.D.USD.EUR.SP00.A,D,USD,EUR,USD,2026-08-18,1.17",
      "EXR.D.USD.EUR.SP00.A,D,USD,EUR,USD,2026-08-19,..",
    ].join("\n"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ source: "ECB", seriesId: "EXR.D.USD.EUR.SP00.A", period: "2026-08-18", value: 1.17, unit: "USD", frequency: "D" });
    expect(rows[1]?.value).toBeNull();
  });

  it("parses OECD SDMX CSV and preserves observation dimensions", () => {
    const rows = parseOecdSdmxCsv([
      "DATAFLOW,LOCATION,INDICATOR,UNIT_MEASURE,FREQ,TIME_PERIOD,OBS_VALUE",
      "DF,USA,CPI,PT_CHANGE,M,2026-07,3.1",
    ].join("\n"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "OECD", seriesId: "DF", period: "2026-07", value: 3.1, unit: "PT_CHANGE", frequency: "M" });
    expect(rows[0]?.dimensions.LOCATION).toBe("USA");
  });

  it("summarizes valid and unavailable observations without inventing values", () => {
    const rows = parseEcbSdmxCsv("TIME_PERIOD,OBS_VALUE,UNIT\n2026-01,..,IDX\n2026-02,101.4,IDX");
    expect(summarizePublicMacro(rows)).toMatchObject({ count: 2, validCount: 1, latestPeriod: "2026-02", latestValue: 101.4, units: ["IDX"] });
  });
});

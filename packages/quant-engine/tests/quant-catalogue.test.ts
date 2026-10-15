import { describe, expect, it } from "vitest";

import { MODEL_CATALOGUE, MODEL_CATEGORIES, catalogueStats, findModel, implementedModels, modelsByCategory } from "../src/model-catalogue";
import { RUNNABLE_MODELS, runModel, type ModelUniverse } from "../src/library-run";
import { parseFundamentals } from "../src/fundamentals-io";
import { SUPPLY_CHAIN_THEMES, classifyCandidate, findTheme, screenSupplyChain, screenSupplyChainScoped, type Candidate } from "../src/supply-chain";
import type { Fundamentals } from "../src/fundamentals";

const current: Fundamentals = {
  symbol: "ACME", revenue: 1_000, receivables: 200, costOfRevenue: 600, currentAssets: 500,
  propertyPlantEquipment: 300, totalAssets: 1_000, depreciation: 50, sellingGeneralAdmin: 100,
  longTermDebt: 100, currentLiabilities: 200, netIncome: 100, operatingCashFlow: 120,
  grossProfit: 400, sharesOutstanding: 100,
};
const prior: Fundamentals = {
  symbol: "ACME", revenue: 900, receivables: 150, costOfRevenue: 560, currentAssets: 450,
  propertyPlantEquipment: 280, totalAssets: 950, depreciation: 45, sellingGeneralAdmin: 90,
  longTermDebt: 120, currentLiabilities: 190, netIncome: 80, operatingCashFlow: 90,
  grossProfit: 340, sharesOutstanding: 100,
};

describe("the model catalogue is internally consistent", () => {
  it("gives every model a unique id, a source and a real formula", () => {
    expect(new Set(MODEL_CATALOGUE.map((model) => model.id)).size).toBe(MODEL_CATALOGUE.length);
    for (const model of MODEL_CATALOGUE) {
      expect(model.name.length).toBeGreaterThan(2);
      expect(model.source.length).toBeGreaterThan(2);
      expect(model.formula.length).toBeGreaterThan(8);
      expect(MODEL_CATEGORIES[model.category]).toBeDefined();
    }
  });

  it("populates all five categories", () => {
    const groups = modelsByCategory();
    expect(groups).toHaveLength(5);
    expect(groups.map((group) => group.category)).toEqual(["I", "II", "III", "IV", "V"]);
    for (const group of groups) expect(group.models.length).toBeGreaterThan(0);
  });

  it("totals add up and both statuses are represented", () => {
    const stats = catalogueStats();
    expect(stats.total).toBe(MODEL_CATALOGUE.length);
    expect(stats.implemented).toBe(implementedModels().length);
    expect(stats.notImplemented).toBe(stats.total - stats.implemented);
    expect(stats.byCategory.reduce((sum, group) => sum + group.total, 0)).toBe(stats.total);
    expect(stats.implemented).toBeGreaterThan(0);
    expect(stats.notImplemented).toBeGreaterThan(0);
  });

  it("explains why every unimplemented model is not implemented", () => {
    for (const model of MODEL_CATALOGUE.filter((entry) => !entry.implemented)) {
      expect(model.note, `${model.id} is unimplemented with no reason`).toBeDefined();
      expect((model.note ?? "").length).toBeGreaterThan(10);
    }
  });

  it("points every implemented model at real engine code", () => {
    for (const model of implementedModels()) {
      // The source must name the module that carries the implementation.
      expect(model.source).toMatch(/src\//);
    }
  });

  it("finds models by id", () => {
    expect(findModel("piotroski-f")?.name).toContain("Piotroski");
    expect(findModel("nope")).toBeNull();
  });
});

describe("running the score models", () => {
  const universe: ModelUniverse = { marketId: "IN", companies: [current], priors: { ACME: prior } };

  it("declares exactly which models are runnable as universe screens", () => {
    expect([...RUNNABLE_MODELS]).toEqual(["piotroski-f", "altman-z", "beneish-m"]);
  });

  it("scores Piotroski F with a prior period", () => {
    const run = runModel("piotroski-f", { marketId: "IN", universe });
    expect(run.kind).toBe("scores");
    if (run.kind !== "scores") return;
    expect(run.evaluated).toBe(1);
    expect(run.rows[0].value).toBeGreaterThanOrEqual(0);
    expect(run.rows[0].value).toBeLessThanOrEqual(9);
    expect(run.rows[0].headline).toContain("F-Score");
    expect(run.rows[0].components).toHaveLength(9);
  });

  it("refuses Piotroski when no prior period was supplied", () => {
    const run = runModel("piotroski-f", { marketId: "IN", universe: { marketId: "IN", companies: [current] } });
    expect(run.kind).toBe("unavailable");
    if (run.kind === "unavailable") expect(run.reason).toContain("prior period");
  });

  it("scores Altman Z from a single period", () => {
    const run = runModel("altman-z", { marketId: "IN", universe: { marketId: "IN", companies: [{ ...current, retainedEarnings: 300, ebit: 200, marketCap: 2_000, totalLiabilities: 500 }] } });
    expect(run.kind).toBe("scores");
    if (run.kind !== "scores") return;
    expect(run.rows[0].value).not.toBeNull();
    expect(run.rows[0].headline).toMatch(/safe|grey|distress/);
  });

  it("refuses a universe from another market", () => {
    const run = runModel("altman-z", { marketId: "IN", universe: { marketId: "US", companies: [current] } });
    expect(run.kind).toBe("unavailable");
    if (run.kind === "unavailable") expect(run.reason).toContain("Cross-market screening is refused");
  });

  it("refuses a catalogue model that is not implemented, with the stated reason", () => {
    const run = runModel("johansen", { marketId: "IN", universe });
    expect(run.kind).toBe("unavailable");
    if (run.kind === "unavailable") expect(run.reason).toContain("not implemented");
  });

  it("refuses an unknown model id", () => {
    const run = runModel("does-not-exist", { marketId: "IN", universe });
    expect(run.kind).toBe("unavailable");
    if (run.kind === "unavailable") expect(run.reason).toContain("No model named");
  });

  it("refuses an implemented model that is not a universe screen", () => {
    const run = runModel("garch11", { marketId: "IN", universe });
    expect(run.kind).toBe("unavailable");
    if (run.kind === "unavailable") expect(run.reason).toContain("not as a universe screen");
  });
});

describe("fundamentals ingestion carries the prior period", () => {
  it("parses a nested prior object", () => {
    const result = parseFundamentals(JSON.stringify([{ symbol: "acme", revenue: 1000, prior: { revenue: 900, netIncome: 80 } }]));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.companies[0].revenue).toBe(1_000);
    expect(result.priors.ACME.revenue).toBe(900);
    expect(result.notes.join(" ")).toContain("prior period");
  });

  it("reports no priors when none are supplied", () => {
    const result = parseFundamentals(JSON.stringify([{ symbol: "X", revenue: 10 }]));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(Object.keys(result.priors)).toHaveLength(0);
  });
});

describe("the directive's named themes are present and classify correctly", () => {
  it("covers AI compute, EV transition and the energy grid overhaul", () => {
    const ids = SUPPLY_CHAIN_THEMES.map((theme) => theme.id);
    expect(ids).toContain("ai-compute");
    expect(ids).toContain("ev-transition");
    expect(ids).toContain("energy-grid-overhaul");
  });

  it("classifies EV candidates into the right layers", () => {
    const theme = findTheme("ev-transition")!;
    const miner: Candidate = { symbol: "LIT", name: "Lithium Miner", description: "lithium mining and refining" };
    const oem: Candidate = { symbol: "EVX", name: "EV Motors", description: "electric vehicle manufacturer" };
    const cells: Candidate = { symbol: "CELL", name: "Cell Co", description: "battery cell manufacturing" };
    expect(classifyCandidate(theme, miner).layers).toContain("tertiary");
    expect(classifyCandidate(theme, oem).layers).toContain("primary");
    expect(classifyCandidate(theme, cells).layers).toContain("secondary");
  });

  it("classifies grid candidates into the right layers", () => {
    const theme = findTheme("energy-grid-overhaul")!;
    const switchgear: Candidate = { symbol: "SWG", name: "Switchgear Co", description: "switchgear and transformers" };
    const copper: Candidate = { symbol: "CU", name: "Copper Mines", description: "copper smelting and mining" };
    expect(classifyCandidate(theme, switchgear).layers).toContain("secondary");
    expect(classifyCandidate(theme, copper).layers).toContain("tertiary");
  });

  it("still reports unmatched candidates rather than force-fitting them", () => {
    const screen = screenSupplyChain("ev-transition", [{ symbol: "SHOP", name: "Retail Co", description: "grocery" }])!;
    expect(screen.unmatched.map((item) => item.symbol)).toEqual(["SHOP"]);
  });
});

describe("supply-chain screening is market-scoped", () => {
  const companies: Candidate[] = [{ symbol: "LIT", name: "Lithium Miner", description: "lithium mining and refining" }];

  it("screens a universe tagged for the active market", () => {
    const result = screenSupplyChainScoped("ev-transition", { marketId: "IN", companies }, "IN");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.screen.layers.tertiary.map((item) => item.candidate.symbol)).toContain("LIT");
  });

  it("refuses a universe tagged for another market", () => {
    // The regression this guards: the section used to screen whatever was loaded, so switching the
    // active market left the previous region's companies on screen.
    const result = screenSupplyChainScoped("ev-transition", { marketId: "US", companies }, "IN");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("Cross-market supply-chain screening is refused");
  });

  it("refuses when no universe is loaded", () => {
    const result = screenSupplyChainScoped("ev-transition", null, "IN");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("Load a fundamentals universe");
  });

  it("refuses an empty universe", () => {
    const result = screenSupplyChainScoped("ev-transition", { marketId: "IN", companies: [] }, "IN");
    expect(result.ok).toBe(false);
  });

  it("refuses an unknown theme", () => {
    const result = screenSupplyChainScoped("does-not-exist", { marketId: "IN", companies }, "IN");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("No supply-chain theme named");
  });
});

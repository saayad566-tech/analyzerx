/**
 * Picks & shovels — layered supply-chain screening.
 *
 * A theme boom is not just the headline names. This module classifies candidates into the three
 * layers the brief describes:
 *   primary   — the front-line innovators / developers
 *   secondary — the choke-points: equipment, packaging, cooling, power electronics
 *   tertiary  — the infrastructure beneath: generation, grid, raw materials, construction
 *
 * Classification is deterministic keyword matching over the text the caller supplies. It never
 * invents a supplier relationship it cannot see in the input, and a candidate that matches nothing
 * is returned as unmatched rather than being force-fitted into a layer.
 */

export type SupplyChainLayer = "primary" | "secondary" | "tertiary";

export type SupplyChainRole = {
  id: string;
  layer: SupplyChainLayer;
  label: string;
  description: string;
  /** Lower-cased phrases matched against the candidate's name, sector and description. */
  keywords: string[];
};

export type Theme = {
  id: string;
  name: string;
  description: string;
  roles: SupplyChainRole[];
};

export type Candidate = {
  symbol: string;
  /** Optional so a `Fundamentals` record can be classified directly. */
  name?: string;
  sector?: string;
  description?: string;
};

export const SUPPLY_CHAIN_THEMES: Theme[] = [
  {
    id: "ai-compute",
    name: "AI compute buildout",
    description:
      "Demand for accelerated compute pulls on a deep chain: the chip designers, then the equipment, memory, cooling and networking that make the chips, then the power and materials underneath the data centre.",
    roles: [
      { id: "accelerators", layer: "primary", label: "Accelerators & chip design", description: "Designs the compute engines the buildout is named for.", keywords: ["gpu", "accelerator", "chip design", "fabless", "ai chip", "semiconductor design", "processor"] },
      { id: "hyperscaler", layer: "primary", label: "Cloud & platform operators", description: "Funds and operates the compute at scale.", keywords: ["hyperscaler", "cloud infrastructure", "data center operator", "platform", "web services"] },
      { id: "semi-equipment", layer: "secondary", label: "Semiconductor equipment", description: "Lithography, deposition, etch and metrology tools — the true choke-point.", keywords: ["lithography", "semiconductor equipment", "wafer fab equipment", "deposition", "etch", "metrology", "foundry equipment"] },
      { id: "advanced-packaging", layer: "secondary", label: "Advanced packaging & test", description: "CoWoS-class packaging and test capacity gates accelerator supply.", keywords: ["advanced packaging", "cowos", "chip packaging", "semiconductor test", "assembly and test", "substrate"] },
      { id: "memory", layer: "secondary", label: "High-bandwidth memory", description: "HBM supply limits accelerator output.", keywords: ["hbm", "high bandwidth memory", "dram", "memory chips", "nand"] },
      { id: "cooling", layer: "secondary", label: "Thermal & liquid cooling", description: "Rack power density makes cooling a hard constraint.", keywords: ["liquid cooling", "thermal management", "cooling", "immersion cooling", "heat exchanger", "hvac"] },
      { id: "networking", layer: "secondary", label: "Networking & optics", description: "Interconnect bandwidth between accelerators.", keywords: ["networking", "optical", "transceiver", "ethernet", "switch", "interconnect", "infiniBand"] },
      { id: "power-electronics", layer: "secondary", label: "Power electronics", description: "Converts and conditions power inside the rack.", keywords: ["power electronics", "power supply", "ups", "voltage regulator", "inverter", "transformer"] },
      { id: "power-generation", layer: "tertiary", label: "Power generation", description: "New generation capacity is the binding constraint on data-centre growth.", keywords: ["power generation", "utility", "electricity", "nuclear", "gas turbine", "renewable generation"] },
      { id: "grid", layer: "tertiary", label: "Grid & electrical infrastructure", description: "Transmission and grid equipment to move the power.", keywords: ["power grid", "grid", "transmission", "electrical equipment", "switchgear", "grid infrastructure"] },
      { id: "materials", layer: "tertiary", label: "Raw materials", description: "Copper, rare earths and specialty inputs.", keywords: ["copper", "rare earth", "lithium", "silicon wafer", "specialty chemical", "mining", "raw material"] },
      { id: "construction", layer: "tertiary", label: "Data-centre construction", description: "Builds and hosts the physical plant.", keywords: ["data center construction", "data centre", "engineering and construction", "reit", "real estate", "colocation"] },
    ],
  },
  {
    id: "energy-transition",
    name: "Energy transition",
    description:
      "Electrification runs through generation, storage, transmission and the mined inputs beneath all three.",
    roles: [
      { id: "solar-wind", layer: "primary", label: "Solar & wind", description: "Generates the electricity.", keywords: ["solar", "photovoltaic", "wind", "renewable energy", "wind turbine"] },
      { id: "storage", layer: "primary", label: "Storage & batteries", description: "Shifts supply to match demand.", keywords: ["battery", "energy storage", "cell manufacturing", "bess"] },
      { id: "ev", layer: "secondary", label: "Electrified transport", description: "A major new source of electricity demand.", keywords: ["electric vehicle", "ev", "charging", "automotive electrification"] },
      { id: "grid", layer: "tertiary", label: "Grid & transmission", description: "Moves power from where it is made to where it is used.", keywords: ["power grid", "transmission", "grid infrastructure", "substation", "switchgear"] },
      { id: "materials", layer: "tertiary", label: "Critical minerals", description: "Lithium, copper, nickel and rare earths.", keywords: ["lithium", "copper", "nickel", "cobalt", "rare earth", "mining", "graphite"] },
    ],
  },
  {
    id: "ev-transition",
    name: "EV transition",
    description:
      "Electrification pulls on cells, the equipment that makes them, the charging and power electronics around them, and the mined inputs beneath all of it.",
    roles: [
      { id: "ev-oem", layer: "primary", label: "Vehicle OEMs", description: "The front-line manufacturers of electric vehicles.", keywords: ["electric vehicle", "ev oem", "automaker", "electric car", "vehicle manufacturer"] },
      { id: "cells", layer: "secondary", label: "Battery cells", description: "Cell and pack manufacturing is the supply constraint.", keywords: ["battery", "cell manufacturing", "battery pack", "gigafactory", "lithium ion"] },
      { id: "charging", layer: "secondary", label: "Charging & power electronics", description: "Charging networks and the power electronics in the vehicle.", keywords: ["charging", "power electronics", "inverter", "onboard charger", "dc fast"] },
      { id: "magnets", layer: "secondary", label: "Motors & magnets", description: "Traction motors and the rare-earth magnets they need.", keywords: ["traction motor", "rare earth magnet", "permanent magnet", "neodymium", "electric motor"] },
      { id: "ev-materials", layer: "tertiary", label: "Critical minerals", description: "Lithium, nickel, cobalt, graphite and copper.", keywords: ["lithium", "nickel", "cobalt", "graphite", "copper", "mining", "refining"] },
      { id: "ev-grid", layer: "tertiary", label: "Grid capacity", description: "Charging load needs distribution capacity.", keywords: ["power grid", "grid capacity", "transmission", "substation", "utility"] },
    ],
  },
  {
    id: "energy-grid-overhaul",
    name: "Energy grid overhaul",
    description:
      "Grid investment runs from the utilities and developers that commission it, through the switchgear and transformers that carry it, down to the metals it is built from.",
    roles: [
      { id: "developers", layer: "primary", label: "Utilities & developers", description: "Commission and operate the capacity.", keywords: ["utility", "power generation", "independent power", "nuclear", "gas turbine", "renewable developer"] },
      { id: "switchgear", layer: "secondary", label: "Switchgear & transformers", description: "The equipment that moves and protects the power.", keywords: ["switchgear", "transformer", "circuit breaker", "grid equipment", "electrical equipment", "substation equipment"] },
      { id: "cable", layer: "secondary", label: "Cable & transmission hardware", description: "Conductors, HVDC links and interconnection hardware.", keywords: ["cable", "conductor", "hvdc", "transmission line", "interconnection"] },
      { id: "grid-metals", layer: "tertiary", label: "Copper & aluminium", description: "The metals the grid is physically made of.", keywords: ["copper", "aluminium", "aluminum", "smelting", "mining", "raw material"] },
      { id: "grid-engineering", layer: "tertiary", label: "Engineering & construction", description: "Builds the physical infrastructure.", keywords: ["engineering and construction", "epc", "infrastructure construction", "grid construction"] },
    ],
  },
  {
    id: "semiconductor-supply",
    name: "Semiconductor supply chain",
    description: "From wafers and chemicals up to the finished device.",
    roles: [
      { id: "design", layer: "primary", label: "Chip design", description: "Fabless designers and IP.", keywords: ["fabless", "chip design", "semiconductor design", "ip core", "processor"] },
      { id: "foundry", layer: "secondary", label: "Foundry & fabrication", description: "Turns designs into silicon.", keywords: ["foundry", "wafer fab", "fabrication", "semiconductor manufacturing"] },
      { id: "equipment", layer: "secondary", label: "Fab equipment", description: "The tools every fab must buy.", keywords: ["lithography", "semiconductor equipment", "deposition", "etch", "metrology", "wafer fab equipment"] },
      { id: "chemicals", layer: "tertiary", label: "Materials & chemicals", description: "Wafers, photoresist and specialty gases.", keywords: ["silicon wafer", "photoresist", "specialty gas", "semiconductor chemical", "raw material"] },
    ],
  },
];

export type Classified = {
  candidate: Candidate;
  /** Every layer the candidate touches, in primary → tertiary order. */
  layers: SupplyChainLayer[];
  matchedRoles: string[];
  /** 0–1. Reflects how many distinct roles matched; never a probability. */
  confidence: number;
};

const LAYER_ORDER: SupplyChainLayer[] = ["primary", "secondary", "tertiary"];

function searchableText(candidate: Candidate): string {
  return [candidate.name, candidate.sector ?? "", candidate.description ?? ""].join(" ").toLowerCase();
}

/** Classify one candidate against one theme. Pure and deterministic. */
export function classifyCandidate(theme: Theme, candidate: Candidate): Classified {
  const text = searchableText(candidate);
  const matched: SupplyChainRole[] = [];
  for (const role of theme.roles) {
    if (role.keywords.some((keyword) => text.includes(keyword.toLowerCase()))) matched.push(role);
  }
  const layers = LAYER_ORDER.filter((layer) => matched.some((role) => role.layer === layer));
  // Confidence reflects breadth of fit: one role is a weak fit, three or more is a strong one.
  const confidence = matched.length === 0 ? 0 : Math.min(1, 0.4 + (matched.length - 1) * 0.3);
  return { candidate, layers, matchedRoles: matched.map((role) => role.label), confidence };
}

export type SupplyChainScreen = {
  theme: Theme;
  layers: Record<SupplyChainLayer, Classified[]>;
  /** Candidates that matched nothing in this theme — reported, not hidden. */
  unmatched: Candidate[];
};

/** Screen a candidate list against a theme, grouped by layer. */
export function screenSupplyChain(themeId: string, candidates: Candidate[]): SupplyChainScreen | null {
  const theme = SUPPLY_CHAIN_THEMES.find((entry) => entry.id === themeId);
  if (!theme) return null;
  const layers: Record<SupplyChainLayer, Classified[]> = { primary: [], secondary: [], tertiary: [] };
  const unmatched: Candidate[] = [];
  for (const candidate of candidates) {
    const classified = classifyCandidate(theme, candidate);
    if (classified.matchedRoles.length === 0) {
      unmatched.push(candidate);
      continue;
    }
    for (const layer of classified.layers) layers[layer].push(classified);
  }
  for (const layer of LAYER_ORDER) layers[layer].sort((a, b) => b.confidence - a.confidence || a.candidate.symbol.localeCompare(b.candidate.symbol));
  return { theme, layers, unmatched };
}

/** Roles of a theme, grouped by layer — used by the education panel. */
export function themeRolesByLayer(theme: Theme): Record<SupplyChainLayer, SupplyChainRole[]> {
  return {
    primary: theme.roles.filter((role) => role.layer === "primary"),
    secondary: theme.roles.filter((role) => role.layer === "secondary"),
    tertiary: theme.roles.filter((role) => role.layer === "tertiary"),
  };
}

export function findTheme(themeId: string): Theme | null {
  return SUPPLY_CHAIN_THEMES.find((entry) => entry.id === themeId) ?? null;
}

export type MultibaggerStrategy = {
  id: string;
  name: string;
  shortDescription: string;
  criteria: string[];
};

export const multibaggerStrategies: MultibaggerStrategy[] = [
  { id: "buffett-munger", name: "Buffett / Munger Quality", shortDescription: "Durable moat, high returns on capital, conservative balance sheet, and management quality.", criteria: ["Moat evidence", "ROCE / ROE quality", "Low leverage", "Cash-backed earnings", "Governance evidence"] },
  { id: "peter-lynch", name: "Peter Lynch GARP", shortDescription: "Understandable growth businesses whose valuation does not outrun their growth.", criteria: ["Revenue / EPS growth", "PEG discipline", "Business simplicity", "Runway evidence", "Debt discipline"] },
  { id: "canslim", name: "CANSLIM", shortDescription: "Current and annual earnings, new catalysts, leadership, sponsorship, and market direction.", criteria: ["Current earnings", "Annual growth", "New catalyst", "Relative leadership", "Institutional sponsorship"] },
  { id: "greenblatt", name: "Greenblatt Quality / Value", shortDescription: "High return on capital combined with an attractive earnings yield.", criteria: ["Return on capital", "Earnings yield", "Peer valuation", "Balance-sheet quality", "Evidence coverage"] },
  { id: "fisher", name: "Fisher Scuttlebutt", shortDescription: "Long runway, innovation, sales strength, management depth, and reinvestment.", criteria: ["TAM / runway", "Innovation", "Sales strength", "Management depth", "Reinvestment"] },
  { id: "small-cap-compounder", name: "Small-Cap Compounder", shortDescription: "Smaller base, repeatable cash generation, reinvestment runway, and governance.", criteria: ["Market-cap runway", "FCF quality", "Low leverage", "Expansion evidence", "Promoter / insider evidence"] },
];

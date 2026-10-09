import { classifyIndianNewsRelevance } from "../server/indian-news-relevance";
console.log(JSON.stringify(classifyIndianNewsRelevance({ headline: "Brent crude rises as OPEC signals tighter supply; India markets watch imports", symbols: ["RELIANCE", "TATAMOTORS"] }), null, 2));
console.log(JSON.stringify(classifyIndianNewsRelevance({ headline: "The recovery will rely on demand and consumer confidence", symbols: ["RELIANCE"] }), null, 2));
console.log(JSON.stringify(classifyIndianNewsRelevance({ headline: "European bank reports quarterly profit ahead of estimates", symbols: ["RELIANCE", "TCS"] }), null, 2));

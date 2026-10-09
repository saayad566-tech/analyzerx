import { writeFile } from "node:fs/promises";

const questions = [
  [1,"App guidance","Where do I find Market Flows in AnalyzerX?"],[2,"App guidance","Open the Screener for me."],[3,"App guidance","Show me the latest news for Reliance."],[4,"App guidance","How do I generate a stock research PDF?"],[5,"App guidance","What does the FII versus DII card mean?"],[6,"App guidance","How do I change the Market Flows date range?"],[7,"App guidance","Where can I see company storylines?"],[8,"App guidance","How do I clear my assistant history?"],[9,"App guidance","Can AnalyzerX analyze a screenshot?"],[10,"App guidance","Can I ask a question by voice?"],
  [11,"Personal/general","What is a good morning routine?"],[12,"Personal/general","Explain compound interest simply."],[13,"Personal/general","I feel overwhelmed by market information. What should I do?"],[14,"Personal/general","How can I organize a weekly research habit?"],[15,"Personal/general","What does diversification mean?"],[16,"Personal/general","Explain risk versus uncertainty."],[17,"Personal/general","How should I read a chart legend?"],[18,"Personal/general","What is a data source?"],[19,"Personal/general","Can you guarantee a stock will go up?"],[20,"Personal/general","Should I invest all my savings in one company?"],
  [21,"Stock research","Analyze TCS fundamentals."],[22,"Stock research","What are the main risks for Reliance Industries?"],[23,"Stock research","Compare Tata Motors growth and cash flow quality."],[24,"Stock research","Is Adani Enterprises fairly valued?"],[25,"Stock research","What does ROCE tell me about a company?"],[26,"Stock research","Explain free cash flow for Infosys."],[27,"Stock research","What is the difference between PE and PEG?"],[28,"Stock research","Which evidence supports the TCS score?"],[29,"Stock research","What data is missing from the Adani Ports report?"],[30,"Stock research","Open the Reliance research report."],
  [31,"News","What is the latest verified news for TCS?"],[32,"News","Show positive news for Reliance."],[33,"News","What catalysts are being reported for Tata Motors?"],[34,"News","Is this headline enough to call a stock a buy?"],[35,"News","Why might news be old in the archive?"],[36,"News","How does AnalyzerX score news impact?"],[37,"News","What should I check before trusting a news article?"],[38,"News","Tell me the latest global market headlines."],[39,"News","What does neutral sentiment mean?"],[40,"News","Can one article prove a company is strong?"],
  [41,"Multi-asset","What is the current research signal for Bitcoin?"],[42,"Multi-asset","Explain gold buy and sell signals without giving me advice."],[43,"Multi-asset","What moves forex markets?"],[44,"Multi-asset","Compare crypto and gold volatility conceptually."],[45,"Multi-asset","What does a confidence score mean?"],
  [46,"Troubleshooting","The flow numbers do not change when I select one week. What should I check?"],[47,"Troubleshooting","My stock search shows only Apple. How do I fix it?"],[48,"Troubleshooting","The PDF download button does nothing. What can I try?"],[49,"Troubleshooting","I uploaded a screenshot but got no answer. Why?"],[50,"Troubleshooting","The assistant says data is unavailable. Is the app broken?"],
];

const endpoint = process.env.ANALYZERX_CHAT_URL ?? "http://127.0.0.1:3000/api/trpc/chat.ask";
const limit = Number(process.env.ANALYZERX_CHAT_CONCURRENCY ?? 4);
async function ask([id, domain, question]) {
  const started = Date.now();
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ json: { message: question, history: [], attachments: [] } }), signal: AbortSignal.timeout(45_000) });
    const payload = await response.json();
    const result = payload?.result?.data?.json;
    const answer = typeof result?.answer === "string" ? result.answer.trim() : "";
    const sources = Array.isArray(result?.sources) ? result.sources : [];
    const action = result?.action ?? null;
    const invalidAction = action !== null && !["navigate", "filter_news", "open_report"].includes(action.type);
    const passed = response.ok && Boolean(answer) && typeof result?.confidence === "string" && !invalidAction && Array.isArray(result?.limitations) && Array.isArray(result?.suggestedQuestions);
    return { id, domain, question, httpStatus: response.status, elapsedMs: Date.now() - started, passed, engine: result?.engine ?? null, answerLength: answer.length, symbol: result?.symbol ?? null, confidence: result?.confidence ?? null, sourceCount: sources.length, dataAsOf: result?.dataAsOf ?? null, limitationCount: Array.isArray(result?.limitations) ? result.limitations.length : null, actionType: action?.type ?? null, invalidAction, error: passed ? null : payload?.error?.json?.message ?? "Invalid or empty chatbot response", answerPreview: answer.slice(0, 420) };
  } catch (error) {
    return { id, domain, question, httpStatus: null, elapsedMs: Date.now() - started, passed: false, engine: null, answerLength: 0, symbol: null, confidence: null, sourceCount: 0, dataAsOf: null, limitationCount: null, actionType: null, invalidAction: false, error: error instanceof Error ? error.message : String(error), answerPreview: "" };
  }
}

const results = [];
for (let index = 0; index < questions.length; index += limit) {
  results.push(...await Promise.all(questions.slice(index, index + limit).map(ask)));
}
const summary = { generatedAt: new Date().toISOString(), endpoint, questionCount: results.length, passed: results.filter((item) => item.passed).length, failed: results.filter((item) => !item.passed).length, averageLatencyMs: Math.round(results.reduce((sum, item) => sum + item.elapsedMs, 0) / Math.max(results.length, 1)), engines: Object.fromEntries([...new Set(results.map((item) => item.engine).filter(Boolean))].map((engine) => [engine, results.filter((item) => item.engine === engine).length])), results };
await writeFile(process.env.ANALYZERX_CHAT_QA_OUTPUT ?? "docs/chatbot-50-question-results.json", JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, results: undefined }, null, 2));

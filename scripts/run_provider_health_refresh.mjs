const checks = [
  ["MarketAux", process.env.MARKETAUX_API_TOKEN ? `https://api.marketaux.com/v1/news/all?api_token=${encodeURIComponent(process.env.MARKETAUX_API_TOKEN)}&symbols=AAPL&limit=1` : null],
  ["NewsAPI", process.env.NEWS_API_KEY ? `https://newsapi.org/v2/top-headlines?country=us&pageSize=1&apiKey=${encodeURIComponent(process.env.NEWS_API_KEY)}` : null],
  ["NewsData", process.env.NEWSDATA_API_KEY ? `https://newsdata.io/api/1/latest?apikey=${encodeURIComponent(process.env.NEWSDATA_API_KEY)}&q=markets&size=1` : null],
  ["GNews", process.env.GNEWS_API_KEY ? `https://gnews.io/api/v4/search?q=markets&max=1&apikey=${encodeURIComponent(process.env.GNEWS_API_KEY)}` : null],
  ["GDELT", "https://api.gdeltproject.org/api/v2/doc/doc?query=global%20markets&mode=ArtList&format=json&maxrecords=1&sort=HybridRel"],
  ["SEC EDGAR", "https://data.sec.gov/submissions/CIK0000320193.json"],
  ["Telegram", process.env.TELEGRAM_BOT_TOKEN ? `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe` : null],
  ["TinyFish", process.env.TINYFISH_API_URL ? process.env.TINYFISH_API_URL : null],
];
const timeoutMs = 12000;
async function check([name, url]) {
  if (!url) return { name, status: "unavailable", detail: "not configured" };
  const started = Date.now();
  try {
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "AnalyzerX-provider-health/1.0" }, signal: AbortSignal.timeout(timeoutMs) });
    const state = response.status >= 200 && response.status < 300 ? "live" : [401, 403, 408, 409, 425, 429].includes(response.status) ? "delayed" : "unavailable";
    return { name, status: state, httpStatus: response.status, elapsedMs: Date.now() - started };
  } catch (error) {
    return { name, status: "unavailable", detail: error instanceof Error ? error.name : "network error", elapsedMs: Date.now() - started };
  }
}
const results = await Promise.all(checks.map(check));
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));

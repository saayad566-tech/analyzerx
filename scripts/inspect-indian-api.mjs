const url = process.env.INDIAN_API_HEALTH_URL ?? "https://stock.indianapi.in/stock?name=RELIANCE";
const response = await fetch(url, {
  headers: { Accept: "application/json", "X-Api-Key": process.env.INDIAN_API_KEY ?? "" },
});
const text = await response.text();
let body;
try { body = JSON.parse(text); } catch { body = { rawType: typeof text, length: text.length }; }
const summarize = (value, depth = 0) => {
  if (depth > 2 || value === null || typeof value !== "object") return typeof value;
  if (Array.isArray(value)) return { type: "array", length: value.length, item: value.length ? summarize(value[0], depth + 1) : null };
  return Object.fromEntries(Object.entries(value).slice(0, 80).map(([key, item]) => [key, summarize(item, depth + 1)]));
};
console.log(JSON.stringify({ status: response.status, shape: summarize(body) }, null, 2));

import AsyncStorage from "@react-native-async-storage/async-storage";

export type IrrelevantNewsReason = "not_about_company" | "wrong_market" | "duplicate" | "low_quality" | "other";

const keyFor = (marketId: string) => `analyzerx.news-feedback.v1.${marketId}`;

export async function loadLocalIrrelevantNewsIds(marketId: string) {
  try {
    const raw = await AsyncStorage.getItem(keyFor(marketId));
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").slice(0, 2_000) : [];
  } catch {
    return [];
  }
}

export async function markLocalNewsIrrelevant(marketId: string, articleId: string) {
  const current = await loadLocalIrrelevantNewsIds(marketId);
  const next = [...new Set([articleId, ...current])].slice(0, 2_000);
  await AsyncStorage.setItem(keyFor(marketId), JSON.stringify(next));
  return next;
}

export async function undoLocalNewsIrrelevant(marketId: string, articleId: string) {
  const current = await loadLocalIrrelevantNewsIds(marketId);
  const next = current.filter((value) => value !== articleId);
  await AsyncStorage.setItem(keyFor(marketId), JSON.stringify(next));
  return next;
}

export type ArchiveSentiment = "All sentiment" | "Positive" | "Neutral" | "Negative";
export type ArchiveScope = "All archive" | "Special Events";
export type ArchiveOrder = "Newest first" | "Oldest first" | "Impact low → high" | "Impact high → low";

export type ArchiveArticle = {
  headline: string;
  actionable_impact: string;
  category?: string;
  sentiment: Exclude<ArchiveSentiment, "All sentiment">;
  impact_score: number;
  high_impact: boolean;
  published_at: string;
};

export function isSpecialArchiveEvent(article: ArchiveArticle) {
  return article.high_impact || /earnings|contract|order|approval|upgrade|partnership|launch|buyback|insider|expansion|guidance|investment|regulatory|merger|acquisition/i.test(`${article.headline} ${article.actionable_impact} ${article.category ?? ""}`);
}

export function filterAndSortArchiveArticles<T extends ArchiveArticle>(articles: T[], scope: ArchiveScope, sentiment: ArchiveSentiment, order: ArchiveOrder) {
  const filtered = articles.filter((article) => {
    const matchesScope = scope === "All archive" || isSpecialArchiveEvent(article);
    const matchesSentiment = sentiment === "All sentiment" || article.sentiment === sentiment;
    return matchesScope && matchesSentiment;
  });

  return [...filtered].sort((left, right) => {
    if (order === "Oldest first") return left.published_at.localeCompare(right.published_at);
    if (order === "Impact low → high") return left.impact_score - right.impact_score || right.published_at.localeCompare(left.published_at);
    if (order === "Impact high → low") return right.impact_score - left.impact_score || right.published_at.localeCompare(left.published_at);
    return right.published_at.localeCompare(left.published_at);
  });
}

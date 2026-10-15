import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { router } from "@/lib/navigation/router";
import { ScreenContainer } from "@/components/screen-container";
import { useMarketContext } from "@/lib/market-context";
import { trpc } from "@/lib/trpc";
import {
  buildMarketCoverage,
  buildReportFromAnnouncement,
  cacheSummary,
  COMPANY_UNIVERSE_SIZE,
  COMPANY_UNIVERSE_SNAPSHOT,
  describeStatus,
  marketAccessClassLabel,
  refreshFilings,
  searchIndianCompanies,
  sourceIdsForMarket,
  sourcesForMarket,
  statusLabel,
  type CachedFiling,
  type Claim,
  type CompanySearchHit,
  type FilingReport,
  type MarketSource,
  type RefreshResult,
} from "@/lib/filing-intelligence";

const amber = "#F4B860";
const teal = "#4FD1C5";
const coral = "#FB7185";
const muted = "#91A2B8";
const border = "#26364D";
const panel = "#111C2D";
const elevated = "#17253A";
const ink = "#E7EEF7";
const blue = "#7CB9F2";

type StoredArticle = {
  id: string;
  symbol: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  published_at: string;
};

function toneForStatus(status: string): string {
  if (status === "connected" || status === "tested" || status === "production_ready") return teal;
  if (status === "blocked" || status === "degraded" || status === "failed") return coral;
  if (status === "available") return blue;
  return amber;
}

function toneForReportStatus(status: string): string {
  if (status === "complete") return teal;
  if (status === "blocked" || status === "failed") return coral;
  return amber;
}

function toneForOutcome(outcome: string): string {
  if (outcome === "passed") return teal;
  if (outcome === "failed") return coral;
  return muted;
}

function toneForClaimType(type: Claim["claimType"]): string {
  switch (type) {
    case "FACT":
      return teal;
    case "CALCULATION":
      return blue;
    case "COMPANY_GUIDANCE":
      return amber;
    case "FORECAST":
      return "#C7A6F5";
    case "INTERPRETATION":
      return muted;
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Bullet({ text, tone = ink }: { text: string; tone?: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={[styles.bulletDot, { color: tone }]}>•</Text>
      <Text style={[styles.bulletText, { color: tone }]}>{text}</Text>
    </View>
  );
}

/**
 * Keep only the cached filings that belong to this market.
 * This is the isolation guarantee on the client side: a filing cached from one
 * market's sources can never appear under another market.
 */
function cachedForMarket(cache: CachedFiling[], marketId: string): CachedFiling[] {
  const allowed = new Set(sourceIdsForMarket(marketId));
  return cache.filter((entry) => allowed.has(entry.sourceId));
}

function reportFromCached(filing: CachedFiling, marketName: string, sourceName: string): FilingReport {
  return buildReportFromAnnouncement(
    {
      id: filing.key,
      headline: filing.title,
      summary: filing.companyName ? `Announcement filed by ${filing.companyName}.` : "",
      source: sourceName,
      url: filing.url,
      publishedAt: filing.publishedAt ?? filing.firstSeenUtc,
      symbol: filing.companyName ?? "",
      market: marketName,
      fromOfficialSource: true,
    },
    new Date(),
  );
}

export default function FilingsScreen() {
  const { market, marketId } = useMarketContext();

  const archiveQuery = trpc.news.archive.useQuery(
    { days: 30, limit: 60, page: 0, marketId, archiveOrder: "Newest first" },
    { staleTime: 60_000, retry: false },
  );

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CompanySearchHit | null>(null);
  const [cache, setCache] = useState<CachedFiling[]>([]);
  const [refresh, setRefresh] = useState<RefreshResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The coverage matrix is scoped to the selected market only.
  const coverage = useMemo(() => buildMarketCoverage(marketId), [marketId]);
  const marketSources = useMemo(() => sourcesForMarket(marketId), [marketId]);
  const marketFilings = useMemo(() => cachedForMarket(cache, marketId), [cache, marketId]);

  // Switching market clears the in-memory view, so nothing from the previous
  // market lingers on screen.
  useEffect(() => {
    setRefresh(null);
    setSelected(null);
    setQuery("");
    setError(null);
  }, [marketId]);

  // Company search is an Indian-market capability only.
  const isIndia = marketId === "IN";
  const hits = useMemo(() => (isIndia && query.trim() ? searchIndianCompanies(query, 8) : []), [isIndia, query]);

  const runRefresh = useCallback(
    async (mode: "user_initiated" | "automatic") => {
      setBusy(true);
      setError(null);
      try {
        const result = await refreshFilings({
          cache,
          mode,
          marketId,
          query: { companyName: isIndia ? selected?.name : undefined, symbol: isIndia ? selected?.symbol : undefined, limit: 40 },
        });
        setCache(result.cache);
        setRefresh(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [cache, marketId, isIndia, selected],
  );

  const report: FilingReport | null = useMemo(() => {
    if (marketFilings.length) {
      const filing = marketFilings[0];
      const source = marketSources.find((entry) => entry.sourceId === filing.sourceId);
      return reportFromCached(filing, market.country, source?.name ?? filing.sourceId);
    }
    if (marketId !== "IN") return null; // the archive is the Indian market's feed
    const articles = (archiveQuery.data?.articles ?? []) as StoredArticle[];
    const article = articles.find((entry) => entry.headline && entry.headline.trim());
    if (!article) return null;
    return buildReportFromAnnouncement(
      {
        id: article.id,
        headline: article.headline,
        summary: article.summary,
        source: article.source,
        url: article.url,
        publishedAt: article.published_at,
        symbol: article.symbol,
        market: market.country,
        fromOfficialSource: true,
      },
      new Date(),
    );
  }, [marketFilings, marketSources, marketId, market.country, archiveQuery.data]);

  const identity = report?.filingIdentity;
  const timestamps = identity?.timestamps;
  const summary = cacheSummary(marketFilings);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={styles.backRow} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <Text style={styles.eyebrow}>FILING INTELLIGENCE</Text>
        <Text style={styles.title}>{market.country} filings and sources</Text>

        {/* The market this screen is scoped to. Nothing from any other market appears below. */}
        <View style={styles.marketBar}>
          <View style={styles.marketHead}>
            <View>
              <Text style={styles.marketName}>{market.country}</Text>
              <Text style={styles.marketMeta}>
                {market.currency} · {market.exchanges.join(", ")}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push("/market-country")}
              style={({ pressed }) => [styles.changeButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Change market"
            >
              <Text style={styles.changeButtonText}>Change market</Text>
            </Pressable>
          </View>
          <Text style={styles.marketScope}>
            This screen reads sources for {market.country} only. Sources from other markets are not queried and their
            filings are not shown.
          </Text>
        </View>

        {/* Coverage matrix — per market, per source, per category. */}
        <Section title="Coverage for this market">
          <Text style={styles.note}>{coverage.summary.statement}</Text>
          <View style={styles.statRow}>
            <Text style={styles.statItem}>{coverage.summary.sources} sources</Text>
            <Text style={styles.statItem}>
              {coverage.summary.categoriesCovered}/{coverage.summary.categoriesTotal} categories
            </Text>
          </View>
          {coverage.summary.byStatus.map((entry) => (
            <Text key={entry.status} style={styles.statusCount}>
              {entry.label}: {entry.count}
            </Text>
          ))}

          <Text style={[styles.subheading, { marginTop: 12 }]}>Data categories</Text>
          {coverage.categories.map((category) => (
            <View key={category.category} style={styles.categoryRow}>
              <View style={styles.categoryHead}>
                <Text style={styles.categoryName}>{category.label}</Text>
                <View style={[styles.badge, { borderColor: category.covered ? teal : muted }]}>
                  <Text style={[styles.badgeText, { color: category.covered ? teal : muted }]}>
                    {category.covered ? "Covered" : "Not covered"}
                  </Text>
                </View>
              </View>
              {category.sources.length ? (
                <Text style={styles.categoryMeta}>
                  {category.sources.map((entry) => `${entry.name} (${statusLabel(entry.status)})`).join(", ")}
                </Text>
              ) : null}
              {!category.covered && category.nextStep ? <Text style={styles.categoryNext}>Next step: {category.nextStep}</Text> : null}
            </View>
          ))}
        </Section>

        {/* Sources in this market only. */}
        <Section title="Sources in this market">
          {marketSources.map((source: MarketSource) => (
            <View key={source.sourceId} style={styles.sourceRow}>
              <View style={styles.sourceHead}>
                <Text style={styles.sourceName}>{source.name}</Text>
                <View style={[styles.badge, { borderColor: toneForStatus(source.status) }]}>
                  <Text style={[styles.badgeText, { color: toneForStatus(source.status) }]}>{statusLabel(source.status)}</Text>
                </View>
              </View>
              <Text style={styles.sourceMeta}>
                {marketAccessClassLabel(source.accessClass)} · {source.authentication.replace(/_/g, " ")} · {source.cost.replace(/_/g, " ")}
              </Text>
              <Text style={styles.sourceMeta}>Access: {source.accessMethod}</Text>
              <Text style={styles.sourceMeta}>
                Last check: {source.lastSuccessfulCheckUtc ?? "none recorded"} · Latest filing:{" "}
                {source.latestFilingConfirmed ? "confirmed" : "not confirmed"}
              </Text>
              <Text style={styles.sourceMessage}>{source.licensing}</Text>
              {source.blocker ? <Text style={styles.sourceBlocker}>Dependency: {source.blocker}</Text> : null}
              <Text style={styles.sourceTerms}>Manual fallback: {source.manualFallback}</Text>
            </View>
          ))}
        </Section>

        {/* Company search is Indian-market only, and says so elsewhere. */}
        <Section title="Find a company">
          {isIndia ? (
            <>
              <TextInput
                value={query}
                onChangeText={(value) => {
                  setQuery(value);
                  setSelected(null);
                }}
                placeholder="Company name, symbol or industry"
                placeholderTextColor={muted}
                style={styles.input}
                autoCapitalize="characters"
                autoCorrect={false}
                accessibilityLabel="Search Indian listed companies"
              />
              <Text style={styles.note}>
                Searching {COMPANY_UNIVERSE_SIZE} NSE Nifty-500 constituents, pinned from the official list on{" "}
                {COMPANY_UNIVERSE_SNAPSHOT.date}. Search runs offline.
              </Text>
              {query.trim() && hits.length === 0 ? <Text style={styles.note}>No listed company matched that query.</Text> : null}
              {hits.map((hit) => (
                <Pressable
                  key={hit.symbol}
                  onPress={() => {
                    setSelected(hit);
                    setQuery(hit.name);
                  }}
                  style={({ pressed }) => [styles.hitRow, pressed && styles.pressed, selected?.symbol === hit.symbol && styles.hitRowActive]}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${hit.name}`}
                >
                  <View style={styles.hitHead}>
                    <Text style={styles.hitSymbol}>{hit.symbol}</Text>
                    <Text style={styles.hitIndustry}>{hit.industry}</Text>
                  </View>
                  <Text style={styles.hitName}>{hit.name}</Text>
                  <Text style={styles.hitMeta}>ISIN {hit.isin}</Text>
                </Pressable>
              ))}
            </>
          ) : (
            <Text style={styles.note}>
              Company search is available for the Indian market, where the Nifty-500 constituent list is held on the
              device. For {market.country}, use the sources listed above — search will be added when an issuer list for
              this market is confirmed.
            </Text>
          )}
        </Section>

        {/* Refresh, scoped to this market. */}
        <Section title="Refresh filings">
          <Text style={styles.note}>
            A refresh reads sources for {market.country} only. Background polling is blocked where the terms of a source
            prohibit systematic collection — the button below is the permitted path.
          </Text>
          <View style={styles.buttonRow}>
            <Pressable
              onPress={() => runRefresh("user_initiated")}
              disabled={busy}
              style={({ pressed }) => [styles.primaryButton, (busy || pressed) && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Refresh ${market.country} filings`}
            >
              <Text style={styles.primaryButtonText}>{busy ? "Refreshing…" : `Refresh ${market.country} filings`}</Text>
            </Pressable>
            <Pressable
              onPress={() => runRefresh("automatic")}
              disabled={busy}
              style={({ pressed }) => [styles.secondaryButton, (busy || pressed) && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Simulate a background run"
            >
              <Text style={styles.secondaryButtonText}>Background run</Text>
            </Pressable>
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {refresh ? <Text style={styles.refreshSummary}>{refresh.message}</Text> : null}
          {marketFilings.length ? (
            <Text style={styles.note}>
              This market holds {summary.total} filing{summary.total === 1 ? "" : "s"} from {summary.sources} source
              {summary.sources === 1 ? "" : "s"}. Newest: {summary.newest ?? "unknown"}.
            </Text>
          ) : null}
        </Section>

        {refresh ? (
          <Section title="Refresh outcome">
            {refresh.outcomes.map((outcome) => (
              <View key={outcome.sourceId} style={styles.sourceRow}>
                <View style={styles.sourceHead}>
                  <Text style={styles.sourceName}>{outcome.label}</Text>
                  <View style={[styles.badge, { borderColor: toneForStatus(outcome.status) }]}>
                    <Text style={[styles.badgeText, { color: toneForStatus(outcome.status) }]}>{describeStatus(outcome.status)}</Text>
                  </View>
                </View>
                <Text style={styles.sourceMessage}>{outcome.message}</Text>
                {outcome.added > 0 || outcome.existing > 0 ? (
                  <Text style={styles.sourceMeta}>
                    {outcome.added} new, {outcome.existing} already cached
                  </Text>
                ) : null}
              </View>
            ))}
          </Section>
        ) : null}

        {!report || !identity || !timestamps ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No {market.country} filing available to analyse yet</Text>
            <Text style={styles.emptyText}>
              {marketId === "IN"
                ? "Refresh filings above to read the NSE announcements archive, or collect some news first. Nothing is fabricated to fill the gap."
                : `No automated source for ${market.country} is connected yet. The sources above list each one's state and its manual fallback. Nothing is fabricated to fill the gap.`}
            </Text>
          </View>
        ) : (
          <>
            <Section title="1 · Filing identity">
              <View style={[styles.badge, { borderColor: toneForReportStatus(report.reportStatus), alignSelf: "flex-start", marginBottom: 8 }]}>
                <Text style={[styles.badgeText, { color: toneForReportStatus(report.reportStatus) }]}>
                  {report.reportStatus.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.identityName}>{identity.companyName}</Text>
              <Text style={styles.identityMeta}>{identity.market}</Text>
              <Text style={styles.identityMeta}>Category: {identity.filingCategory}</Text>
              <Text style={styles.identityMeta}>Source: {identity.officialUrl}</Text>
              <View style={styles.timeGrid}>
                <Text style={styles.timeItem}>Published: {timestamps.publicationUtc ?? "not stated by the source"}</Text>
                <Text style={styles.timeItem}>First seen: {timestamps.firstSeenUtc ?? "unknown"}</Text>
                <Text style={styles.timeItem}>Retrieved: {timestamps.retrievalUtc ?? "no bytes retrieved"}</Text>
                <Text style={styles.timeItem}>Analysed: {timestamps.analysisUtc ?? "unknown"}</Text>
              </View>
            </Section>

            <Section title="Verification">
              <Text style={[styles.verificationSummary, { color: report.verification.fullyVerified ? teal : amber }]}>
                {report.verification.summaryLabel}
              </Text>
              {report.verification.checks.map((check) => (
                <View key={check.key} style={styles.checkRow}>
                  <View style={[styles.checkDot, { backgroundColor: toneForOutcome(check.outcome) }]} />
                  <View style={styles.checkBody}>
                    <Text style={styles.checkLabel}>{check.label}</Text>
                    <Text style={[styles.checkDetail, { color: toneForOutcome(check.outcome) }]}>{check.detail}</Text>
                  </View>
                </View>
              ))}
            </Section>

            <Section title="2 · One-minute summary">
              {report.summaryBullets.map((bullet, index) => (
                <Bullet key={index} text={bullet} />
              ))}
            </Section>

            <Section title="Claims and evidence">
              {report.claims.length === 0 ? (
                <Text style={styles.note}>
                  No claim passed evidence validation, so none is published. This is the publication gate working: an
                  unsupported claim is withheld rather than shown.
                </Text>
              ) : (
                report.claims.map((claim) => (
                  <View key={claim.claimId} style={styles.claimRow}>
                    <View style={styles.claimHead}>
                      <View style={[styles.badge, { borderColor: toneForClaimType(claim.claimType) }]}>
                        <Text style={[styles.badgeText, { color: toneForClaimType(claim.claimType) }]}>{claim.claimType}</Text>
                      </View>
                      <Text style={styles.claimEvidence}>{claim.evidenceIds.join(", ")}</Text>
                    </View>
                    <Text style={styles.claimText}>{claim.text}</Text>
                    <Text style={styles.claimMeta}>{claim.confidenceRationale}</Text>
                  </View>
                ))
              )}
            </Section>

            <Section title="Sources and methodology">
              {report.sources.map((source, index) => (
                <Text key={index} style={styles.bodyText}>
                  {source.label} — {source.url}
                </Text>
              ))}
              <Text style={styles.note}>Analysis time: {timestamps.analysisUtc ?? "unknown"}.</Text>
            </Section>

            <Section title="Disclaimer and limitations">
              <Text style={styles.bodyText}>
                Informational only, not investment advice. This does not execute trades and does not provide
                individualized portfolio advice.
              </Text>
              {report.limitations.map((limitation, index) => (
                <Bullet key={index} text={limitation} tone={muted} />
              ))}
            </Section>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 60 },
  backRow: { marginBottom: 10 },
  backText: { color: muted, fontSize: 13, fontWeight: "600" },
  eyebrow: { color: teal, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  title: { color: ink, fontSize: 21, fontWeight: "800", marginTop: 4 },

  marketBar: { marginTop: 14, backgroundColor: elevated, borderRadius: 14, borderColor: border, borderWidth: 1, padding: 14 },
  marketHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  marketName: { color: ink, fontSize: 16, fontWeight: "800" },
  marketMeta: { color: muted, fontSize: 11, marginTop: 3 },
  changeButton: { backgroundColor: panel, borderColor: border, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8 },
  changeButtonText: { color: teal, fontSize: 11, fontWeight: "800" },
  marketScope: { color: muted, fontSize: 10, lineHeight: 15, marginTop: 10 },

  section: { marginTop: 18, backgroundColor: panel, borderColor: border, borderWidth: 1, borderRadius: 14, padding: 14 },
  sectionTitle: { color: ink, fontSize: 13, fontWeight: "800", marginBottom: 10 },
  subheading: { color: ink, fontSize: 12, fontWeight: "700", marginBottom: 6 },
  note: { color: muted, fontSize: 11, lineHeight: 17, marginBottom: 6 },
  bodyText: { color: ink, fontSize: 12, lineHeight: 18 },

  statRow: { flexDirection: "row", marginBottom: 4 },
  statItem: { color: teal, fontSize: 11, fontWeight: "800", marginRight: 14 },
  statusCount: { color: "#B8C6D6", fontSize: 10, lineHeight: 15 },

  categoryRow: { borderTopColor: border, borderTopWidth: 1, paddingTop: 8, marginTop: 8 },
  categoryHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  categoryName: { color: ink, fontSize: 11, fontWeight: "700", flexShrink: 1 },
  categoryMeta: { color: muted, fontSize: 10, marginTop: 3 },
  categoryNext: { color: amber, fontSize: 10, lineHeight: 15, marginTop: 3 },

  sourceRow: { borderTopColor: border, borderTopWidth: 1, paddingTop: 10, marginTop: 10 },
  sourceHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sourceName: { color: ink, fontSize: 12, fontWeight: "700", flexShrink: 1 },
  sourceMeta: { color: muted, fontSize: 10, marginTop: 3 },
  sourceMessage: { color: "#B8C6D6", fontSize: 10, lineHeight: 15, marginTop: 4 },
  sourceBlocker: { color: amber, fontSize: 10, lineHeight: 15, marginTop: 4 },
  sourceTerms: { color: muted, fontSize: 9, lineHeight: 14, marginTop: 4, fontStyle: "italic" },

  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },

  input: { backgroundColor: elevated, borderColor: border, borderWidth: 1, borderRadius: 10, color: ink, fontSize: 13, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  hitRow: { borderTopColor: border, borderTopWidth: 1, paddingTop: 9, paddingBottom: 9 },
  hitRowActive: { backgroundColor: elevated, borderRadius: 8, paddingHorizontal: 8 },
  hitHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hitSymbol: { color: teal, fontSize: 12, fontWeight: "800" },
  hitIndustry: { color: muted, fontSize: 9 },
  hitName: { color: ink, fontSize: 12, marginTop: 2 },
  hitMeta: { color: muted, fontSize: 9, marginTop: 2 },

  buttonRow: { flexDirection: "row", marginTop: 4 },
  primaryButton: { backgroundColor: teal, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, marginRight: 8, flex: 1, alignItems: "center" },
  primaryButtonText: { color: "#06202A", fontSize: 12, fontWeight: "800" },
  secondaryButton: { backgroundColor: elevated, borderColor: border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, alignItems: "center" },
  secondaryButtonText: { color: ink, fontSize: 12, fontWeight: "700" },
  pressed: { opacity: 0.7 },
  refreshSummary: { color: teal, fontSize: 11, fontWeight: "700", marginTop: 10 },
  errorText: { color: coral, fontSize: 11, marginTop: 8 },

  emptyCard: { marginTop: 18, backgroundColor: elevated, borderRadius: 14, padding: 16 },
  emptyTitle: { color: ink, fontSize: 14, fontWeight: "800" },
  emptyText: { color: muted, fontSize: 12, lineHeight: 18, marginTop: 8 },

  identityName: { color: ink, fontSize: 16, fontWeight: "800" },
  identityMeta: { color: muted, fontSize: 11, marginTop: 3 },
  timeGrid: { marginTop: 10, borderTopColor: border, borderTopWidth: 1, paddingTop: 8 },
  timeItem: { color: "#B8C6D6", fontSize: 10, lineHeight: 16 },

  verificationSummary: { fontSize: 12, fontWeight: "800", marginBottom: 10 },
  checkRow: { flexDirection: "row", marginBottom: 9 },
  checkDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4, marginRight: 9 },
  checkBody: { flex: 1 },
  checkLabel: { color: ink, fontSize: 12, fontWeight: "700" },
  checkDetail: { fontSize: 10, lineHeight: 15, marginTop: 2 },

  bulletRow: { flexDirection: "row", marginBottom: 6 },
  bulletDot: { fontSize: 12, marginRight: 7, lineHeight: 18 },
  bulletText: { flex: 1, fontSize: 12, lineHeight: 18 },

  claimRow: { borderTopColor: border, borderTopWidth: 1, paddingTop: 10, marginTop: 10 },
  claimHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  claimEvidence: { color: muted, fontSize: 9, fontWeight: "600" },
  claimText: { color: ink, fontSize: 12, lineHeight: 18 },
  claimMeta: { color: "#B8C6D6", fontSize: 10, lineHeight: 15, marginTop: 5 },
});

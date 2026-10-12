import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useCallback, useMemo, useState } from "react";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import {
  buildReportFromAnnouncement,
  cacheSummary,
  COMPANY_UNIVERSE_SIZE,
  COMPANY_UNIVERSE_SNAPSHOT,
  describeStatus,
  refreshFilings,
  searchIndianCompanies,
  type CachedFiling,
  type Claim,
  type CompanySearchHit,
  type FilingReport,
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

type StoredArticle = {
  id: string;
  symbol: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  published_at: string;
};

function isOfficialSource(source: string): boolean {
  return /\b(nse|bse|sebi|sec edgar|edgar|exchange filing)\b/i.test(source || "");
}

function toneForStance(stance: string): string {
  if (stance === "positive") return teal;
  if (stance === "negative") return coral;
  return muted;
}

function toneForStatus(status: string): string {
  if (status === "connected" || status === "tested" || status === "production_ready") return teal;
  if (status === "blocked" || status === "degraded" || status === "failed") return coral;
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
      return "#7CB9F2";
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

/** Turn a cached filing into the announcement shape the report builder takes. */
function reportFromCached(filing: CachedFiling): FilingReport {
  return buildReportFromAnnouncement(
    {
      id: filing.key,
      headline: filing.title,
      summary: filing.companyName ? `Announcement filed by ${filing.companyName}.` : "",
      source: "NSE India (official archive)",
      url: filing.url,
      publishedAt: filing.publishedAt ?? filing.firstSeenUtc,
      symbol: filing.companyName ?? "",
      market: "India",
      fromOfficialSource: true,
    },
    new Date(),
  );
}

export default function FilingsScreen() {
  const archiveQuery = trpc.news.archive.useQuery(
    { days: 30, limit: 60, page: 0, archiveOrder: "Newest first" },
    { staleTime: 60_000, retry: false },
  );

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CompanySearchHit | null>(null);
  const [cache, setCache] = useState<CachedFiling[]>([]);
  const [refresh, setRefresh] = useState<RefreshResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hits = useMemo(() => (query.trim() ? searchIndianCompanies(query, 8) : []), [query]);

  const runRefresh = useCallback(
    async (mode: "user_initiated" | "automatic") => {
      setBusy(true);
      setError(null);
      try {
        const result = await refreshFilings({
          cache,
          mode,
          query: { companyName: selected?.name, limit: 40 },
        });
        setCache(result.cache);
        setRefresh(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [cache, selected],
  );

  // Prefer a cached official filing; fall back to the on-device archive so the
  // screen is useful before the first refresh.
  const report: FilingReport | null = useMemo(() => {
    if (cache.length) return reportFromCached(cache[0]);
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
        market: "India",
        fromOfficialSource: isOfficialSource(article.source),
      },
      new Date(),
    );
  }, [cache, archiveQuery.data]);

  const identity = report?.filingIdentity;
  const timestamps = identity?.timestamps;
  const summary = cacheSummary(cache);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={styles.backRow} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <Text style={styles.eyebrow}>FILING INTELLIGENCE</Text>
        <Text style={styles.title}>Evidence-linked filing report</Text>
        <Text style={styles.intro}>
          Search an Indian listed company, refresh its filings from the connected sources — NSE, BSE, SEBI and
          data.gov.in — and read a report in which every claim carries its evidence. A source is never polled
          automatically where its terms forbid it, and a check that could not be run is reported as not checked rather
          than as a pass.
        </Text>

        {/* Company search */}
        <Section title="Find a company">
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
          {query.trim() && hits.length === 0 ? (
            <Text style={styles.note}>No listed company matched that query.</Text>
          ) : null}
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
        </Section>

        {/* Refresh */}
        <Section title="Refresh filings">
          <Text style={styles.note}>
            A refresh reads the published feeds on request. Background polling of NSE, BSE and SEBI is blocked,
            because their terms prohibit systematic automated collection — the button below is the permitted path.
            data.gov.in is open-licence data and may be read automatically.
          </Text>
          <View style={styles.buttonRow}>
            <Pressable
              onPress={() => runRefresh("user_initiated")}
              disabled={busy}
              style={({ pressed }) => [styles.primaryButton, (busy || pressed) && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Refresh filings"
            >
              <Text style={styles.primaryButtonText}>{busy ? "Refreshing…" : "Refresh filings"}</Text>
            </Pressable>
            <Pressable
              onPress={() => runRefresh("automatic")}
              disabled={busy}
              style={({ pressed }) => [styles.secondaryButton, (busy || pressed) && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Simulate an automatic background run"
            >
              <Text style={styles.secondaryButtonText}>Background run</Text>
            </Pressable>
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {refresh ? <Text style={styles.refreshSummary}>{refresh.message}</Text> : null}
          {cache.length ? (
            <Text style={styles.note}>
              Cache holds {summary.total} filing{summary.total === 1 ? "" : "s"} from {summary.sources} source
              {summary.sources === 1 ? "" : "s"}. Newest: {summary.newest ?? "unknown"}. A repeat refresh does not
              download the same filing twice.
            </Text>
          ) : null}
        </Section>

        {/* Per-source status */}
        {refresh ? (
          <Section title="Source status">
            {refresh.outcomes.map((outcome) => (
              <View key={outcome.sourceId} style={styles.sourceRow}>
                <View style={styles.sourceHead}>
                  <Text style={styles.sourceName}>{outcome.label}</Text>
                  <View style={[styles.badge, { borderColor: toneForStatus(outcome.status) }]}>
                    <Text style={[styles.badgeText, { color: toneForStatus(outcome.status) }]}>
                      {describeStatus(outcome.status)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.sourceMeta}>
                  {outcome.market} · {outcome.accessBasis.replace(/_/g, " ")}
                  {outcome.verifiedEndToEnd ? " · verified end-to-end" : " · not yet verified end-to-end"}
                </Text>
                <Text style={styles.sourceMessage}>{outcome.message}</Text>
                {outcome.added > 0 || outcome.existing > 0 ? (
                  <Text style={styles.sourceMeta}>
                    {outcome.added} new, {outcome.existing} already cached
                  </Text>
                ) : null}
                <Text style={styles.sourceTerms}>{outcome.termsNote}</Text>
              </View>
            ))}
          </Section>
        ) : null}

        {!report || !identity || !timestamps ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No filing available to analyse</Text>
            <Text style={styles.emptyText}>
              {archiveQuery.isLoading
                ? "Reading the on-device archive…"
                : "Refresh filings above to read the NSE announcements archive, or collect some news first. Nothing is fabricated to fill the gap."}
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
              <Text style={styles.identityMeta}>
                {identity.market}
                {identity.exchange ? ` · ${identity.exchange}` : ""}
                {identity.regulator ? ` · ${identity.regulator}` : ""}
              </Text>
              <Text style={styles.identityMeta}>Category: {identity.filingCategory}</Text>
              <Text style={styles.identityMeta}>Source: {identity.officialUrl}</Text>
              <View style={styles.timeGrid}>
                <Text style={styles.timeItem}>Published: {timestamps.publicationUtc ?? "not stated by the source"}</Text>
                <Text style={styles.timeItem}>First seen: {timestamps.firstSeenUtc ?? "unknown"}</Text>
                <Text style={styles.timeItem}>Retrieved: {timestamps.retrievalUtc ?? "no bytes retrieved"}</Text>
                <Text style={styles.timeItem}>Analysed: {timestamps.analysisUtc ?? "unknown"}</Text>
                <Text style={styles.timeItem}>Source checked: {timestamps.sourceCheckedUtc ?? "not checked"}</Text>
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
              {!report.verification.fullyVerified ? (
                <Text style={styles.warn}>{report.verification.latestFilingStatement}</Text>
              ) : null}
            </Section>

            <Section title="2 · One-minute summary">
              {report.summaryBullets.map((bullet, index) => (
                <Bullet key={index} text={bullet} />
              ))}
            </Section>

            <Section title="3 · What the company disclosed">
              {report.facts.length === 0 ? (
                <Text style={styles.note}>No structured facts were extracted from the text held on this device.</Text>
              ) : (
                report.facts.map((fact) => (
                  <View key={fact.factId} style={styles.factRow}>
                    <Text style={styles.factMetric}>{fact.metric}</Text>
                    <Text style={styles.factValue}>
                      {fact.reportedValue ?? "unavailable"}
                      {fact.unit ? ` ${fact.unit}` : ""}
                    </Text>
                    <Text style={styles.factMeta}>
                      {fact.valueKind} · {fact.accountingBasis} · {fact.locator ?? "no locator"}
                    </Text>
                  </View>
                ))
              )}
            </Section>

            <Section title="4 · Financial comparison">
              {report.calculations.length === 0 ? (
                <Text style={styles.note}>No calculations were produced — no comparable numeric pair was available.</Text>
              ) : (
                report.calculations.map((calc, index) => (
                  <View key={index} style={styles.calcRow}>
                    <Text style={styles.calcHead}>
                      {calc.method}: {calc.result ?? "not applicable"} {calc.unit}
                    </Text>
                    <Text style={styles.calcMeta}>{calc.formula}</Text>
                    {calc.note ? <Text style={styles.calcNote}>{calc.note}</Text> : null}
                  </View>
                ))
              )}
            </Section>

            <Section title="5 · Positive factors">
              {report.positiveFactors.length === 0 ? (
                <Text style={styles.note}>None identified from the available evidence.</Text>
              ) : (
                report.positiveFactors.map((item, index) => <Bullet key={index} text={item} tone={teal} />)
              )}
            </Section>

            <Section title="6 · Negative factors and risks">
              {report.negativeFactors.length === 0 ? (
                <Text style={styles.note}>None identified from the available evidence.</Text>
              ) : (
                report.negativeFactors.map((item, index) => <Bullet key={index} text={item} tone={coral} />)
              )}
              {report.uncertainties.map((item, index) => (
                <Bullet key={`u${index}`} text={item} tone={amber} />
              ))}
            </Section>

            <Section title="7 · Potential stock implications">
              <View style={[styles.badge, { borderColor: toneForStance(report.stockImplications.stance), alignSelf: "flex-start", marginBottom: 8 }]}>
                <Text style={[styles.badgeText, { color: toneForStance(report.stockImplications.stance) }]}>
                  {report.stockImplications.stance.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.bodyText}>{report.stockImplications.rationale}</Text>
            </Section>

            <Section title="8 · Research view">
              <Text style={styles.note}>
                {report.researchView
                  ? report.researchView.conclusion
                  : "Insufficient evidence for a research view. No conclusion is invented to fill this section."}
              </Text>
            </Section>

            <Section title="9 · What to monitor next">
              <Text style={styles.note}>
                {report.monitoringItems.length
                  ? ""
                  : "Nothing specific identified. Unconfirmed possibilities are labelled as such rather than presented as events."}
              </Text>
              {report.monitoringItems.map((item, index) => (
                <Bullet key={index} text={`${item.confirmed ? "[confirmed] " : "[unconfirmed] "}${item.text}`} />
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
                    {claim.limitations.map((limitation, index) => (
                      <Text key={index} style={styles.claimLimit}>
                        Limitation: {limitation}
                      </Text>
                    ))}
                  </View>
                ))
              )}
            </Section>

            <Section title="10 · Sources and methodology">
              {report.sources.map((source, index) => (
                <Text key={index} style={styles.bodyText}>
                  {source.label} — {source.url}
                </Text>
              ))}
              <Text style={styles.note}>
                Calculations are deterministic and carry their formula and inputs. Analysis time:{" "}
                {timestamps.analysisUtc ?? "unknown"}.
              </Text>
            </Section>

            <Section title="11 · Disclaimer and limitations">
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
  intro: { color: muted, fontSize: 12, lineHeight: 18, marginTop: 8 },

  section: { marginTop: 18, backgroundColor: panel, borderColor: border, borderWidth: 1, borderRadius: 14, padding: 14 },
  sectionTitle: { color: ink, fontSize: 13, fontWeight: "800", marginBottom: 10 },
  note: { color: muted, fontSize: 11, lineHeight: 17, marginBottom: 6 },
  bodyText: { color: ink, fontSize: 12, lineHeight: 18 },

  input: {
    backgroundColor: elevated,
    borderColor: border,
    borderWidth: 1,
    borderRadius: 10,
    color: ink,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },

  hitRow: { borderTopColor: border, borderTopWidth: 1, paddingTop: 9, paddingBottom: 9 },
  hitRowActive: { backgroundColor: elevated, borderRadius: 8, paddingHorizontal: 8 },
  hitHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hitSymbol: { color: teal, fontSize: 12, fontWeight: "800" },
  hitIndustry: { color: muted, fontSize: 9 },
  hitName: { color: ink, fontSize: 12, marginTop: 2 },
  hitMeta: { color: muted, fontSize: 9, marginTop: 2 },

  buttonRow: { flexDirection: "row", marginTop: 4 },
  primaryButton: { backgroundColor: teal, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11, marginRight: 8, flex: 1, alignItems: "center" },
  primaryButtonText: { color: "#06202A", fontSize: 12, fontWeight: "800" },
  secondaryButton: { backgroundColor: elevated, borderColor: border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, alignItems: "center" },
  secondaryButtonText: { color: ink, fontSize: 12, fontWeight: "700" },
  pressed: { opacity: 0.7 },
  refreshSummary: { color: teal, fontSize: 11, fontWeight: "700", marginTop: 10 },
  errorText: { color: coral, fontSize: 11, marginTop: 8 },

  sourceRow: { borderTopColor: border, borderTopWidth: 1, paddingTop: 10, marginTop: 10 },
  sourceHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sourceName: { color: ink, fontSize: 12, fontWeight: "700", flexShrink: 1 },
  sourceMeta: { color: muted, fontSize: 10, marginTop: 4 },
  sourceMessage: { color: "#B8C6D6", fontSize: 10, lineHeight: 15, marginTop: 4 },
  sourceTerms: { color: muted, fontSize: 9, lineHeight: 14, marginTop: 4, fontStyle: "italic" },

  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },

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
  warn: { color: amber, fontSize: 11, fontWeight: "700", marginTop: 6 },

  bulletRow: { flexDirection: "row", marginBottom: 6 },
  bulletDot: { fontSize: 12, marginRight: 7, lineHeight: 18 },
  bulletText: { flex: 1, fontSize: 12, lineHeight: 18 },

  factRow: { borderTopColor: border, borderTopWidth: 1, paddingTop: 8, marginTop: 8 },
  factMetric: { color: ink, fontSize: 12, fontWeight: "700" },
  factValue: { color: teal, fontSize: 13, fontWeight: "800", marginTop: 2 },
  factMeta: { color: muted, fontSize: 10, marginTop: 3 },

  calcRow: { borderTopColor: border, borderTopWidth: 1, paddingTop: 8, marginTop: 8 },
  calcHead: { color: ink, fontSize: 12, fontWeight: "700" },
  calcMeta: { color: "#7CB9F2", fontSize: 10, marginTop: 3 },
  calcNote: { color: amber, fontSize: 10, lineHeight: 15, marginTop: 3 },

  claimRow: { borderTopColor: border, borderTopWidth: 1, paddingTop: 10, marginTop: 10 },
  claimHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  claimEvidence: { color: muted, fontSize: 9, fontWeight: "600" },
  claimText: { color: ink, fontSize: 12, lineHeight: 18 },
  claimMeta: { color: "#B8C6D6", fontSize: 10, lineHeight: 15, marginTop: 5 },
  claimLimit: { color: amber, fontSize: 10, lineHeight: 15, marginTop: 4 },
});

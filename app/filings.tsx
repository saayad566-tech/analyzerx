import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMemo } from "react";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import {
  buildRegistry,
  buildReportFromAnnouncement,
  coverageLabel,
  isLiveSource,
  type Claim,
  type FilingReport,
} from "@/lib/filing-intelligence";

const amber = "#F4B860";
const teal = "#4FD1C5";
const coral = "#FB7185";
const muted = "#91A2B8";
const border = "#26364D";
const panel = "#111C2D";
const elevated = "#17253A";
const ink = "#E7EEF7";

/** Archive contract from lib/news-archive.ts. */
type StoredArticle = {
  id: string;
  symbol: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  impact_score: number;
  published_at: string;
};

/** Official exchange/regulator sources, as opposed to secondary reporting. */
function isOfficialSource(source: string): boolean {
  return /\b(nse|bse|sebi|sec edgar|edgar|exchange filing)\b/i.test(source || "");
}

function toneForStance(stance: string): string {
  if (stance === "positive") return teal;
  if (stance === "negative") return coral;
  return muted;
}

function toneForStatus(status: string): string {
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

export default function FilingsScreen() {
  const archiveQuery = trpc.news.archive.useQuery(
    { days: 30, limit: 60, page: 0, archiveOrder: "Newest first" },
    { staleTime: 60_000, retry: false },
  );

  // The coverage matrix is built from the registry, with no health records yet,
  // so every connected source honestly reports as stale until a check runs.
  const registry = useMemo(() => buildRegistry([]), []);

  const report: FilingReport | null = useMemo(() => {
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
  }, [archiveQuery.data]);

  const identity = report?.filingIdentity;
  const timestamps = identity?.timestamps;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.back()} style={styles.backRow} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <Text style={styles.eyebrow}>FILING INTELLIGENCE</Text>
        <Text style={styles.title}>Evidence-linked filing report</Text>
        <Text style={styles.intro}>
          Every claim below carries its evidence, its classification and its limitations. Nothing is shown unless the
          evidence for it is held on this device, and a check that could not be performed is reported as not checked
          rather than as a pass.
        </Text>

        {/* Coverage matrix — PRD 5 */}
        <Section title="Source coverage">
          <Text style={styles.note}>
            A source is only shown as live once its integration exists and a check has actually succeeded. A connected
            source with no recorded successful check is reported as stale, not healthy.
          </Text>
          {registry.map((source) => (
            <View key={source.sourceId} style={styles.registryRow}>
              <View style={styles.registryHead}>
                <Text style={styles.registryName}>{source.sourceId}</Text>
                <View style={[styles.badge, { borderColor: isLiveSource(source.status) ? teal : muted }]}>
                  <Text style={[styles.badgeText, { color: isLiveSource(source.status) ? teal : muted }]}>
                    {coverageLabel(source.status)}
                  </Text>
                </View>
              </View>
              <Text style={styles.registryMeta}>
                {source.market} · {source.supportedFilingTypes.length ? source.supportedFilingTypes.join(", ") : "no filing types integrated"}
              </Text>
              <Text style={styles.registryNotes}>{source.coverageNotes}</Text>
              <Text style={styles.registryMeta}>
                Last successful check: {source.lastSuccessfulCheckUtc ?? "none recorded"}
                {source.lastError ? ` · Last error: ${source.lastError}` : ""}
              </Text>
            </View>
          ))}
        </Section>

        {!report || !identity || !timestamps ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No item available to analyse</Text>
            <Text style={styles.emptyText}>
              {archiveQuery.isLoading
                ? "Reading the on-device archive…"
                : "The on-device archive holds no announcement yet. Nothing is fabricated to fill the gap — collect some news first and this report will build from it."}
            </Text>
          </View>
        ) : (
          <>
            {/* 1. Filing identity */}
            <Section title="1 · Filing identity">
              <View style={[styles.badge, { borderColor: toneForStatus(report.reportStatus), alignSelf: "flex-start", marginBottom: 8 }]}>
                <Text style={[styles.badgeText, { color: toneForStatus(report.reportStatus) }]}>
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

            {/* Verification panel — PRD 7 */}
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

            {/* 2. One-minute summary */}
            <Section title="2 · One-minute summary">
              {report.summaryBullets.map((bullet, index) => (
                <Bullet key={index} text={bullet} />
              ))}
            </Section>

            {/* 3. What was disclosed */}
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

            {/* 4. Financial comparison */}
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

            {/* 5 / 6. Factors and risks */}
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

            {/* 7. Stock implications */}
            <Section title="7 · Potential stock implications">
              <View style={[styles.badge, { borderColor: toneForStance(report.stockImplications.stance), alignSelf: "flex-start", marginBottom: 8 }]}>
                <Text style={[styles.badgeText, { color: toneForStance(report.stockImplications.stance) }]}>
                  {report.stockImplications.stance.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.bodyText}>{report.stockImplications.rationale}</Text>
            </Section>

            {/* 8. Research view */}
            <Section title="8 · Research view">
              <Text style={styles.note}>
                {report.researchView
                  ? report.researchView.conclusion
                  : "Insufficient evidence for a research view. No conclusion is invented to fill this section."}
              </Text>
            </Section>

            {/* 9. Monitoring */}
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

            {/* Claims with evidence */}
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

            {/* 10. Sources */}
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

            {/* 11. Disclaimer */}
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

  section: {
    marginTop: 18,
    backgroundColor: panel,
    borderColor: border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  sectionTitle: { color: ink, fontSize: 13, fontWeight: "800", marginBottom: 10 },

  note: { color: muted, fontSize: 11, lineHeight: 17, marginBottom: 6 },
  bodyText: { color: ink, fontSize: 12, lineHeight: 18 },

  registryRow: { borderTopColor: border, borderTopWidth: 1, paddingTop: 10, marginTop: 10 },
  registryHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  registryName: { color: ink, fontSize: 12, fontWeight: "700", flexShrink: 1 },
  registryMeta: { color: muted, fontSize: 10, marginTop: 4 },
  registryNotes: { color: "#B8C6D6", fontSize: 10, lineHeight: 15, marginTop: 4 },

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

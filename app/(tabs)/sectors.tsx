import { useMemo, useState } from "react";
import { MarketDataFallback } from "@/components/market-unavailable-card";
import { useMarketContext } from "@/lib/market-context";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { eventProjectionsToMarketEvents } from "@/lib/event-projection-view";

/**
 * Sectors.
 *
 * The defect this fixes: this screen rendered a hardcoded set of Indian sectors
 * (Renewable energy, Capital goods, Defence, Railways) with Indian evidence strings, a
 * hardcoded market-wide score of "82 / 100", a "+7 pts since last week" claim, a
 * hardcoded sparkline and an "Updated 2m ago" label — for every market. It also read the
 * raw NSE FII/DII feed with no market scope at all.
 *
 * Everything on this screen is now derived from the selected market's own persisted
 * event projections. When a market has no verified sector activity, the screen says so
 * rather than showing another market's numbers.
 */

const amber = "#F4B860";
const teal = "#4FD1C5";
const violet = "#A78BFA";
const coral = "#FB7185";
const palette = [amber, teal, violet, coral];

/** Human label for an event type as it appears in a sector row. */
function labelForEventType(eventType: string): string {
  return eventType
    .replace(/-/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

type SectorRow = {
  name: string;
  score: number;
  eventCount: number;
  symbols: string[];
  colour: string;
  latestHeadline: string;
};

export default function SectorsScreen() {
  const { market } = useMarketContext();
  const [rankingMode, setRankingMode] = useState<"buying" | "fii" | "dii">("buying");

  // Real, market-scoped events. The sector ranking is derived from these.
  const eventsQuery = trpc.events.latest.useQuery(
    { marketId: market.id, limit: 500, lookbackDays: 365 },
    { retry: false, staleTime: 60_000, refetchInterval: 120_000, refetchIntervalInBackground: false },
  );

  // The NSE FII/DII feed is India-only, so it is requested for India and not for anyone
  // else. A non-Indian market never receives a substituted flow figure.
  const isIndia = market.id === "IN";
  const institutionalQuery = trpc.market.institutionalFlows.useQuery(
    { range: "TODAY" },
    { retry: false, staleTime: 60_000, refetchInterval: 120_000, refetchIntervalInBackground: false, enabled: isIndia },
  );

  const marketEvents = useMemo(
    () => eventProjectionsToMarketEvents((eventsQuery.data ?? []) as never),
    [eventsQuery.data],
  );

  // Group real events into sectors, ranked by observed event activity.
  const sectors: SectorRow[] = useMemo(() => {
    const grouped = new Map<string, { score: number; count: number; symbols: Set<string>; latest: string }>();
    for (const event of marketEvents) {
      const key = labelForEventType(event.sector || "market news");
      const entry = grouped.get(key) ?? { score: 0, count: 0, symbols: new Set<string>(), latest: event.title };
      entry.score += event.score;
      entry.count += 1;
      if (event.symbolA) entry.symbols.add(event.symbolA);
      grouped.set(key, entry);
    }
    return [...grouped.entries()]
      .map(([name, entry], index) => ({
        name,
        score: Math.round(entry.score / Math.max(1, entry.count)),
        eventCount: entry.count,
        symbols: [...entry.symbols].slice(0, 4),
        colour: palette[index % palette.length],
        latestHeadline: entry.latest,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [marketEvents]);

  const strongestSector = sectors[0];
  const marketScore = sectors.length
    ? Math.round(sectors.reduce((sum, sector) => sum + sector.score, 0) / sectors.length)
    : null;

  return (
    <ScreenContainer className="px-5">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.eyebrow}>PATTERN MAP</Text>
            <Text style={styles.title}>Sectors</Text>
          </View>
          <Pressable
            style={styles.iconButton}
            onPress={() => setRankingMode((current) => (current === "buying" ? "fii" : current === "fii" ? "dii" : "buying"))}
            accessibilityLabel="Cycle sector ranking"
          >
            <Ionicons name="options-outline" size={19} color="#F4F7FB" />
          </Pressable>
        </View>

        <Text style={styles.subtitle}>
          Sector activity for {market.country}, derived from events verified from this market&apos;s own sources.
        </Text>

        <MarketDataFallback
          subject="Sector institutional flows"
          isLoading={isIndia && institutionalQuery.isLoading}
          isError={isIndia && institutionalQuery.isError}
          isEmpty={isIndia && !institutionalQuery.isLoading && !institutionalQuery.isError && !institutionalQuery.data}
          onRetry={() => void institutionalQuery.refetch()}
          reason={`The NSE FII/DII feed is India-only. For ${market.country} AnalyzerX shows sector research signals and no substitute flow figures.`}
        />

        <View style={styles.hero}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroLabel}>MARKET-WIDE SIGNAL</Text>
            {marketScore === null ? (
              <>
                <Text style={styles.heroValue}>—</Text>
                <Text style={styles.heroNote}>No verified sector activity yet</Text>
              </>
            ) : (
              <>
                <Text style={styles.heroValue}>
                  {marketScore}
                  <Text style={styles.heroUnit}> / 100</Text>
                </Text>
                <Text style={styles.heroNote}>
                  Mean of {sectors.length} sector{sectors.length === 1 ? "" : "s"} with verified activity
                </Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.radarCard}>
          <View style={styles.radarHeader}>
            <View>
              <Text style={styles.radarEyebrow}>OPPORTUNITY RADAR</Text>
              <Text style={styles.radarTitle}>Sector strength</Text>
            </View>
            <View style={styles.signalBadge}>
              <View style={[styles.signalDot, { backgroundColor: teal }]} />
              <Text style={styles.signalText}>Research signal</Text>
            </View>
          </View>
          <Text style={styles.radarNote}>
            Scores are the mean impact of this market&apos;s verified events in each sector. They are research signals, not guaranteed returns.
          </Text>
          <View style={styles.dataStatus}>
            <Ionicons
              name={eventsQuery.isLoading ? "time-outline" : sectors.length ? "checkmark-circle" : "warning-outline"}
              size={14}
              color={eventsQuery.isLoading ? amber : sectors.length ? teal : coral}
            />
            <Text style={styles.dataStatusText}>
              {eventsQuery.isLoading
                ? "Loading verified events for this market."
                : sectors.length
                  ? `${marketEvents.length} verified event${marketEvents.length === 1 ? "" : "s"} across ${sectors.length} sector${sectors.length === 1 ? "" : "s"}.`
                  : `No verified events for ${market.country} yet. Nothing is shown here rather than another market's sectors.`}
            </Text>
          </View>
        </View>

        {sectors.length > 0 ? (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Active sectors</Text>
              <Text style={styles.sectionHint}>{market.country}</Text>
            </View>
            {sectors.map((sector, index) => (
              <Pressable
                key={sector.name}
                onPress={() => router.push({ pathname: "/sector/[name]", params: { name: sector.name } })}
                style={({ pressed }) => [styles.sectorCard, pressed && { opacity: 0.75 }]}
              >
                <View style={[styles.sectorIcon, { backgroundColor: sector.colour + "18" }]}>
                  <Ionicons name={index === 0 ? "leaf-outline" : "pulse-outline"} size={21} color={sector.colour} />
                </View>
                <View style={styles.sectorCopy}>
                  <Text style={styles.sectorName}>{sector.name}</Text>
                  <Text style={styles.sectorNote} numberOfLines={1}>
                    {sector.symbols.join(" · ") || "No symbols resolved"}
                  </Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${sector.score}%`, backgroundColor: sector.colour }]} />
                  </View>
                  <Text style={styles.sectorActivity}>
                    {sector.eventCount} event{sector.eventCount === 1 ? "" : "s"} · {sector.latestHeadline.slice(0, 60)}
                  </Text>
                </View>
                <View style={styles.sectorScore}>
                  <Text style={[styles.scoreNumber, { color: sector.colour }]}>{sector.score}</Text>
                  <Ionicons name="chevron-forward" size={17} color="#6E7D92" />
                </View>
              </Pressable>
            ))}
            {strongestSector ? (
              <View style={styles.flowCallout}>
                <Ionicons name="flash-outline" size={15} color={amber} />
                <Text style={styles.flowCalloutText}>
                  Strongest observed sector: {strongestSector.name} · score {strongestSector.score}
                </Text>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({ content: { paddingBottom: 42 }, headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 12 }, eyebrow: { color: amber, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 }, title: { color: "#F4F7FB", fontSize: 32, fontWeight: "800", letterSpacing: -1, marginTop: 5 }, subtitle: { color: "#91A2B8", fontSize: 14, lineHeight: 20, marginTop: 12 }, iconButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center", backgroundColor: "#111C2D", borderWidth: 1, borderColor: "#26364D", borderRadius: 14 }, hero: { marginTop: 22, borderRadius: 19, backgroundColor: "#1A2A31", borderWidth: 1, borderColor: "#2D5657", padding: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, heroLabel: { color: "#91A2B8", fontSize: 10, letterSpacing: 1.1, fontWeight: "800" }, heroValue: { color: "#F4F7FB", fontSize: 38, fontWeight: "800", marginTop: 4 }, heroUnit: { color: "#91A2B8", fontSize: 14, fontWeight: "600" }, heroNote: { color: "#4FD1C5", fontSize: 11, fontWeight: "700", marginTop: 3 }, sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 25, marginBottom: 12 }, sectionTitle: { color: "#F4F7FB", fontSize: 18, fontWeight: "800" }, sectionHint: { color: "#6E7D92", fontSize: 11 }, sectorCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: "#111C2D", borderRadius: 17, borderWidth: 1, borderColor: "#26364D", marginBottom: 10 }, sectorIcon: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center" }, sectorCopy: { flex: 1 }, sectorName: { color: "#F4F7FB", fontSize: 14, fontWeight: "800" }, sectorNote: { color: "#91A2B8", fontSize: 10, marginTop: 3 }, progressTrack: { height: 4, backgroundColor: "#26364D", borderRadius: 3, marginTop: 10 }, progressFill: { height: 4, borderRadius: 3 }, sectorActivity: { color: "#6E7D92", fontSize: 10, marginTop: 6 }, radarCard: { backgroundColor: "#111C2D", borderWidth: 1, borderColor: "#26364D", borderRadius: 18, padding: 15, marginTop: 20 }, radarHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, radarEyebrow: { color: amber, fontSize: 9, letterSpacing: 1.1, fontWeight: "800" }, radarTitle: { color: "#F4F7FB", fontSize: 18, fontWeight: "800", marginTop: 4 }, signalBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: teal + "55", backgroundColor: teal + "15", borderRadius: 7, paddingHorizontal: 7, paddingVertical: 5 }, signalDot: { width: 6, height: 6, borderRadius: 3 }, signalText: { color: teal, fontSize: 9, fontWeight: "800" }, radarNote: { color: "#91A2B8", fontSize: 10, lineHeight: 15, marginTop: 9 }, dataStatus: { flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: "#17253A", borderRadius: 9, padding: 9, marginTop: 9 }, dataStatusText: { flex: 1, color: "#B8C6D6", fontSize: 9, lineHeight: 14 }, flowCallout: { flexDirection: "row", alignItems: "center", gap: 6, borderTopWidth: 1, borderTopColor: "#26364D", paddingTop: 11, marginTop: 12 }, flowCalloutText: { color: amber, fontSize: 9, fontWeight: "700", flex: 1 }, sectorScore: { alignItems: "flex-end", gap: 8 }, scoreNumber: { fontSize: 18, fontWeight: "800" } });

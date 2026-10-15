import { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Alert,
  FlatList,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { WebCalendarRangePicker } from "@/components/web-calendar-range-picker";
import { ScreenContainer } from "@/components/screen-container";
import { type MarketEvent } from "@/lib/market-data";
import { datasetForMarket } from "@/lib/market-dataset";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { scanDeepResearchDetailed } from "@/lib/deep-research";
import { getDeviceTrackerAvailability } from "@/lib/device-tracker-policy";
import {
  filterAndSortArchiveArticles,
  type ArchiveSentiment,
} from "@/lib/news-archive";
import {
  loadResearchUsageSummary,
  recordResearchEvent,
  type ResearchUsageSummary,
} from "@/lib/research-analytics";
import { useMarketContext } from "@/lib/market-context";
import type { MarketId } from "@/lib/market-regions";
import { useAuth } from "@/hooks/use-auth";
import {
  loadLocalIrrelevantNewsIds,
  markLocalNewsIrrelevant,
  undoLocalNewsIrrelevant,
  type IrrelevantNewsReason,
} from "@/lib/news-feedback";
import { downloadArchiveExport } from "@/lib/archive-export";
import { saveArchiveExportHistory } from "@/lib/local-preferences";
import { readLocalCache, writeLocalCache } from "@/lib/local-first-cache";
import {
  analyzerXReleaseInfo,
  isVerifiedRelease,
  releaseIdentityLabel,
} from "@/lib/release-info";

const amber = "#F4B860";
const teal = "#4FD1C5";
const violet = "#A78BFA";
const coral = "#FB7185";
const FIRST_SESSION_CHECKLIST_KEY =
  "analyzerx.first-session-checklist.dismissed.v1";
const NEWS_ARCHIVE_CACHE_PREFIX = "analyzerx.news.archive.v1";
function newsArchiveCacheKey(marketId: string, symbol: string, days: number) {
  return `${NEWS_ARCHIVE_CACHE_PREFIX}:${marketId}:${symbol || "all"}:${days}`;
}

function formatQuote(value: number | null, symbol?: string) {
  if (typeof value !== "number") return "Unavailable";
  const isIndian =
    /\.(NS|BO)$/i.test(symbol ?? "") || /^(NIFTY|SENSEX)/i.test(symbol ?? "");
  return `${isIndian ? "₹" : ""}${value.toFixed(2)}`;
}

function formatPercent(value: number | null) {
  return typeof value === "number"
    ? `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`
    : "Unavailable";
}

function formatDateOnly(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function dateOnlyToLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
    ? new Date(year, month - 1, day)
    : new Date();
}

type ArchiveExportRequest = {
  format: "csv" | "pdf";
  days: 30 | 90 | 180 | 270 | 365;
  startDate?: string;
  endDate?: string;
  symbol?: string;
  marketId: MarketId;
  archiveScope: "All archive" | "Special Events";
  archiveSentiment: ArchiveSentiment;
  archiveOrder:
    | "Newest first"
    | "Oldest first"
    | "Impact low → high"
    | "Impact high → low";
};

type TrackedNewsArticle = {
  id: string;
  marketId?: string;
  symbol: string;
  headline: string;
  summary: string;
  sentiment: "Positive" | "Neutral" | "Negative";
  actionable_impact: string;
  url: string;
  source: string;
  published_at: string;
  impact_score: number;
  high_impact: boolean;
  category?: string;
};

function sentimentPoints(sentiment: TrackedNewsArticle["sentiment"]) {
  return sentiment === "Positive" ? 70 : sentiment === "Negative" ? 45 : 25;
}

function hasCatalystEvidence(impact: string) {
  return /earnings|contract|order|approval|upgrade|partnership|growth|buyback|expansion|guidance|investment/i.test(
    impact,
  );
}

export function isSafeSourceUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

function ScoreRing({ score }: { score: number }) {
  return (
    <View style={styles.scoreRing}>
      <Text style={styles.scoreValue}>{score}</Text>
      <Text style={styles.scoreLabel}>SCORE</Text>
    </View>
  );
}

function NewspaperArticleCard({
  article,
  onPress,
  onFlag,
  flagged,
}: {
  article: TrackedNewsArticle;
  onPress: () => void;
  onFlag: () => void;
  flagged: boolean;
}) {
  const sentimentColor =
    article.sentiment === "Positive"
      ? teal
      : article.sentiment === "Negative"
        ? coral
        : "#91A2B8";
  const impactColor =
    article.impact_score >= 80
      ? teal
      : article.impact_score >= 50
        ? amber
        : "#91A2B8";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.newspaperCard,
        pressed && styles.newsItemPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Read headline ${article.headline}`}
    >
      <View style={styles.newspaperTopline}>
        <Text style={styles.newspaperKicker}>
          {article.category ?? "MARKETS"} · {article.symbol}
        </Text>
        <View
          style={[
            styles.newspaperSentiment,
            { borderColor: sentimentColor + "88" },
          ]}
        >
          <View
            style={[styles.newsBullet, { backgroundColor: sentimentColor }]}
          />
          <Text
            style={[styles.newspaperSentimentText, { color: sentimentColor }]}
          >
            {article.sentiment}
          </Text>
        </View>
      </View>
      <Text style={styles.newspaperHeadline}>{article.headline}</Text>
      <Text style={styles.newspaperSummary} numberOfLines={4}>
        {article.summary || "Summary unavailable from the source provider."}
      </Text>
      <View style={styles.newspaperDivider} />
      <View style={styles.newspaperFooter}>
        <View style={styles.newspaperSource}>
          <Text style={styles.newspaperSourceText} numberOfLines={1}>
            source · {article.source}
          </Text>
          <Text style={styles.newspaperTime}>
            {new Date(article.published_at).toLocaleString()}
          </Text>
        </View>
        <View style={styles.newspaperImpact}>
          <Text style={[styles.newspaperImpactValue, { color: impactColor }]}>
            {article.impact_score}
          </Text>
          <Text style={styles.newspaperImpactLabel}>IMPACT</Text>
        </View>
        <Ionicons name="arrow-forward-circle-outline" size={24} color={amber} />
      </View>
      <Pressable
        onPress={(event) => {
          event.stopPropagation();
          onFlag();
        }}
        style={({ pressed }) => [
          styles.irrelevantButton,
          pressed && styles.newsItemPressed,
          flagged && styles.irrelevantButtonFlagged,
        ]}
        accessibilityRole="button"
        accessibilityLabel={
          flagged
            ? "News already flagged as irrelevant"
            : "Flag this news as irrelevant"
        }
        disabled={flagged}
      >
        <Ionicons
          name={flagged ? "checkmark-circle-outline" : "flag-outline"}
          size={14}
          color={flagged ? teal : "#91A2B8"}
        />
        <Text style={[styles.irrelevantButtonText, flagged && { color: teal }]}>
          {flagged ? "Flagged for review" : "Flag as irrelevant"}
        </Text>
      </Pressable>
    </Pressable>
  );
}

function EventCard({
  event,
  onPress,
}: {
  event: MarketEvent;
  onPress: () => void;
}) {
  const accent = event.status === "Confirmed" ? teal : violet;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.eventCard, pressed && styles.pressed]}
    >
      <View style={styles.eventTopline}>
        <View style={styles.timeWrap}>
          <View
            style={[
              styles.timeDot,
              { backgroundColor: event.score > 90 ? amber : accent },
            ]}
          />
          <Text style={styles.eventTime}>{event.time}</Text>
        </View>
        <View
          style={[
            styles.statusPill,
            { borderColor: accent + "55", backgroundColor: accent + "16" },
          ]}
        >
          <View style={[styles.statusDot, { backgroundColor: accent }]} />
          <Text style={[styles.statusText, { color: accent }]}>
            {event.status}
          </Text>
        </View>
      </View>
      <Text style={styles.eventKind}>{event.kind.toUpperCase()}</Text>
      <Text style={styles.eventTitle}>{event.title}</Text>
      <View style={styles.relationRow}>
        <View style={styles.entityChip}>
          <Text style={styles.entityText}>{event.symbolA}</Text>
        </View>
        <Text style={styles.relationText}>{event.relationship}</Text>
        {event.symbolB ? (
          <View style={[styles.entityChip, styles.entityChipAlt]}>
            <Text style={styles.entityText}>{event.symbolB}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.eventMetaRow}>
        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>VALUE / SIGNAL</Text>
          <Text style={styles.metaValue}>{event.value ?? event.sector}</Text>
        </View>
        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>CONFIDENCE</Text>
          <Text style={[styles.metaValue, { color: accent }]}>
            {event.confidence}
          </Text>
        </View>
        <ScoreRing score={event.score} />
      </View>
    </Pressable>
  );
}

const FILTER_KIND_MAP: Record<string, MarketEvent["kind"] | undefined> = {
  "Large orders": "Large order",
  Partnerships: "Partnership",
  Investments: "Strategic investment",
  Government: "Government order",
  Guidance: "Results / guidance",
  Regulatory: "Regulatory action",
  Capacity: "Capacity expansion",
};

export default function LiveEventsScreen() {
  const colors = useColors();
  const { market } = useMarketContext();
  const dataset = useMemo(() => datasetForMarket(market.id), [market.id]);
  const { isAuthenticated } = useAuth();
  const [query, setQuery] = useState("");
  const [remoteLiveQuery, setRemoteLiveQuery] = useState("");
  const [newsSymbol, setNewsSymbol] = useState("RELIANCE");
  const [newsLookupSymbol, setNewsLookupSymbol] = useState("RELIANCE");
  const [activeFilter, setActiveFilter] = useState("All events");
  const [archiveScope, setArchiveScope] = useState<
    "All archive" | "Special Events"
  >("All archive");
  const [archiveOrder, setArchiveOrder] = useState<
    "Newest first" | "Oldest first" | "Impact low → high" | "Impact high → low"
  >("Newest first");
  const [archiveSentiment, setArchiveSentiment] =
    useState<ArchiveSentiment>("All sentiment");
  const [archiveDays, setArchiveDays] = useState<30 | 90 | 180 | 270 | 365>(30);
  const [archivePage, setArchivePage] = useState(0);
  const [archiveSourcesExpanded, setArchiveSourcesExpanded] = useState(false);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [appliedCustomRange, setAppliedCustomRange] = useState<{
    startDate: string;
    endDate: string;
  } | null>(null);
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [customRangeError, setCustomRangeError] = useState<string | null>(null);
  const [archiveExportRequest, setArchiveExportRequest] =
    useState<ArchiveExportRequest | null>(null);
  const [archiveExportMessage, setArchiveExportMessage] = useState<
    string | null
  >(null);
  const [localArchiveArticles, setLocalArchiveArticles] = useState<TrackedNewsArticle[]>([]);
  const [archiveExportProgress, setArchiveExportProgress] = useState(0);
  const [pickerTarget, setPickerTarget] = useState<"start" | "end" | null>(
    null,
  );
  const [selectedEvent, setSelectedEvent] = useState<MarketEvent | null>(null);
  const [selectedNewsArticle, setSelectedNewsArticle] =
    useState<TrackedNewsArticle | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [featuredSymbol, setFeaturedSymbol] = useState("RELIANCE.NS");
  const [usageSummary, setUsageSummary] = useState<ResearchUsageSummary | null>(
    null,
  );
  const [checklistDismissed, setChecklistDismissed] = useState(false);
  const [irrelevantNewsIds, setIrrelevantNewsIds] = useState<string[]>([]);
  const [flaggingNewsId, setFlaggingNewsId] = useState<string | null>(null);
  useEffect(() => {
    void recordResearchEvent({ type: "session", route: "live-events" });
    void loadResearchUsageSummary().then(setUsageSummary);
    void AsyncStorage.getItem(FIRST_SESSION_CHECKLIST_KEY)
      .then((value) => setChecklistDismissed(value === "seen"))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    const nextSymbol = newsSymbol.trim().toUpperCase();
    if (!nextSymbol || nextSymbol === newsLookupSymbol) return;
    const timeout = setTimeout(() => setNewsLookupSymbol(nextSymbol), 450);
    return () => clearTimeout(timeout);
  }, [newsLookupSymbol, newsSymbol]);
  useEffect(() => {
    const timeout = setTimeout(() => setRemoteLiveQuery(query.trim()), 220);
    return () => clearTimeout(timeout);
  }, [query]);
  useEffect(() => {
    void loadLocalIrrelevantNewsIds(market.id).then(setIrrelevantNewsIds);
    setArchivePage(0);
    setAppliedCustomRange(null);
    setShowCustomRange(false);
  }, [market.id]);
  const liveSearch = trpc.market.search.useQuery(
    { query: remoteLiveQuery },
    { enabled: remoteLiveQuery.length >= 1, retry: false, staleTime: 30_000 },
  );
  const liveSuggestions = useMemo(
    () => (liveSearch.data?.results ?? []).slice(0, 6),
    [liveSearch.data?.results],
  );
  const finnhubSnapshot = trpc.market.snapshot.useQuery(
    { symbol: featuredSymbol },
    { staleTime: 60_000, retry: 1 },
  );
  const newsTrackerStatus = trpc.news.status.useQuery(undefined, {
    refetchInterval: 1_000,
    retry: false,
  });
  const newsRefresh = trpc.news.refresh.useMutation();
  const flagIrrelevant = trpc.news.flagIrrelevant.useMutation();
  const undoIrrelevant = trpc.news.undoIrrelevant.useMutation();
  const trackedNews = trpc.news.stock.useQuery(
    { symbol: newsLookupSymbol, marketId: market.id },
    {
      staleTime: 0,
      refetchInterval: 30_000,
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
      retry: false,
      enabled: Boolean(newsLookupSymbol.trim()),
    },
  );
  const newsArchive = trpc.news.archive.useQuery(
    {
      days: archiveDays,
      page: archivePage,
      limit: 100,
      marketId: market.id,
      symbol: newsLookupSymbol.trim() || undefined,
      archiveScope,
      archiveSentiment,
      archiveOrder,
      ...(appliedCustomRange ?? {}),
    },
    { staleTime: 0, refetchInterval: 30_000, retry: false },
  );
  const localArchiveKey = newsArchiveCacheKey(market.id, newsLookupSymbol.trim().toUpperCase(), archiveDays);
  useEffect(() => {
    let active = true;
    void readLocalCache<TrackedNewsArticle[]>(localArchiveKey, []).then((cached) => {
      if (!active) return;
      setLocalArchiveArticles(Array.isArray(cached.data) ? cached.data.slice(0, 500) : []);
    });
    return () => { active = false; };
  }, [localArchiveKey]);
  useEffect(() => {
    const articles = newsArchive.data?.articles ?? [];
    if (!articles.length) return;
    setLocalArchiveArticles(articles.slice(0, 500));
    void writeLocalCache(localArchiveKey, articles.slice(0, 500), { source: "server", staleAfterSeconds: 7 * 24 * 60 * 60 });
  }, [localArchiveKey, newsArchive.data?.articles]);
  const archiveExport = trpc.news.archiveExport.useQuery(
    archiveExportRequest ?? {
      format: "csv",
      days: archiveDays,
      marketId: market.id,
      symbol: newsLookupSymbol.trim() || undefined,
      archiveScope,
      archiveSentiment,
      archiveOrder,
    },
    { enabled: Boolean(archiveExportRequest), retry: false },
  );
  const providers = trpc.providers.list.useQuery(undefined, {
    staleTime: 300_000,
    retry: false,
  });
  const sourceCatalog = trpc.sources.list.useQuery(undefined, {
    staleTime: 300_000,
    retry: false,
  });
  const nseUniverse = trpc.market.universe.useQuery(undefined, {
    staleTime: 3_600_000,
    retry: false,
  });
  const latestSourceRecords = trpc.sources.latest.useQuery(
    { limit: 5 },
    { staleTime: 60_000, retry: false },
  );
  const nseCollectors = trpc.sources.nseCollectors.useQuery(undefined, {
    staleTime: 300_000,
    retry: false,
  });
  const collectorHealth = trpc.sources.health.useQuery(undefined, {
    refetchInterval: 30_000,
    retry: false,
  });
  const deviceTrackerAvailability = getDeviceTrackerAvailability(
    Platform.OS === "android"
      ? "android"
      : Platform.OS === "ios"
        ? "ios"
        : "web",
    false,
  );

  const selectedArticleSentimentPoints = selectedNewsArticle
    ? sentimentPoints(selectedNewsArticle.sentiment)
    : 0;
  const selectedArticleCatalystPoints = selectedNewsArticle
    ? Math.max(
        0,
        Math.min(
          25,
          selectedNewsArticle.impact_score - selectedArticleSentimentPoints,
        ),
      )
    : 0;
  const selectedArticleHasSourceLink = Boolean(
    selectedNewsArticle?.url && isSafeSourceUrl(selectedNewsArticle.url),
  );

  const archiveArticles = useMemo(
    () =>
      filterAndSortArchiveArticles(
        newsArchive.data?.articles?.length ? newsArchive.data.articles : localArchiveArticles,
        archiveScope,
        archiveSentiment,
        archiveOrder,
      ),
    [archiveOrder, archiveScope, archiveSentiment, localArchiveArticles, newsArchive.data?.articles],
  );
  useEffect(() => {
    if (!archiveExportRequest) {
      setArchiveExportProgress(0);
      return;
    }
    if (archiveExport.isFetching) {
      setArchiveExportProgress((current) => current < 25 ? 25 : current);
      return;
    }
    if (!archiveExport.data) {
      setArchiveExportProgress(10);
      return;
    }
    setArchiveExportProgress(75);
    void downloadArchiveExport(archiveExport.data)
      .then((result) => {
        setArchiveExportProgress(100);
        setArchiveExportMessage(
          result.shared
            ? `Exported ${archiveExport.data?.rowCount ?? 0} verified item(s).`
            : `Saved export to ${result.uri}.`,
        );
        return saveArchiveExportHistory({
          id: `${archiveExport.data.fileName}:${Date.now()}`,
          fileName: archiveExport.data.fileName,
          format: archiveExportRequest.format,
          marketId: archiveExport.data.marketId,
          symbol: archiveExportRequest.symbol,
          startDate: archiveExportRequest.startDate,
          endDate: archiveExportRequest.endDate,
          rowCount: archiveExport.data.rowCount,
          createdAt: new Date().toISOString(),
          status: "completed",
        });
      })
      .catch(async (error) => {
        const detail =
          error instanceof Error ? error.message : "Export unavailable.";
        setArchiveExportMessage(detail);
        await saveArchiveExportHistory({
          id: `${archiveExportRequest.format}:${Date.now()}`,
          fileName: `${archiveExportRequest.format.toUpperCase()} export`,
          format: archiveExportRequest.format,
          marketId: archiveExportRequest.marketId,
          symbol: archiveExportRequest.symbol,
          startDate: archiveExportRequest.startDate,
          endDate: archiveExportRequest.endDate,
          rowCount: 0,
          createdAt: new Date().toISOString(),
          status: "failed",
          detail,
        });
      })
      .finally(() => setArchiveExportRequest(null));
  }, [archiveExport.data, archiveExport.isFetching, archiveExportRequest]);

  const requestArchiveExport = (format: "csv" | "pdf") => {
    setArchiveExportMessage(null);
    setArchiveExportRequest({
      format,
      days: archiveDays,
      marketId: market.id,
      symbol: newsLookupSymbol.trim() || undefined,
      ...(appliedCustomRange ?? {}),
      archiveScope,
      archiveSentiment,
      archiveOrder,
    });
  };

  const applyCustomArchiveRange = () => {
    const start = dateOnlyToLocalDate(customStartDate);
    const end = dateOnlyToLocalDate(customEndDate);
    const startValid =
      /^\d{4}-\d{2}-\d{2}$/.test(customStartDate) &&
      formatDateOnly(start) === customStartDate;
    const endValid =
      /^\d{4}-\d{2}-\d{2}$/.test(customEndDate) &&
      formatDateOnly(end) === customEndDate;
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (!startValid || !endValid)
      return setCustomRangeError("Use valid dates in YYYY-MM-DD format.");
    if (start > end)
      return setCustomRangeError(
        "End date must be on or after the start date.",
      );
    if (end > today)
      return setCustomRangeError("The archive cannot include future dates.");
    if (end.getTime() - start.getTime() > 3650 * 24 * 60 * 60 * 1000)
      return setCustomRangeError(
        "Custom archive ranges are limited to ten years for performance and provider-coverage safety.",
      );
    setCustomRangeError(null);
    setAppliedCustomRange({
      startDate: customStartDate,
      endDate: customEndDate,
    });
    setArchivePage(0);
  };
  const visibleTrackedArticles = useMemo(
    () =>
      (trackedNews.data?.articles ?? []).filter(
        (article) => !irrelevantNewsIds.includes(article.id),
      ),
    [irrelevantNewsIds, trackedNews.data?.articles],
  );
  const checklistSteps = [
    { label: "Set your market scope", done: true, route: "/market-country" },
    {
      label: "Search a company or ticker",
      done: Boolean(usageSummary?.searches),
      route: "/(tabs)/screener",
    },
    {
      label: "Run a full analysis",
      done: Boolean(usageSummary?.analyses),
      route: "/research-desk",
    },
    {
      label: "Read a source-linked news item",
      done: Boolean(usageSummary?.newsReads),
      route: "/(tabs)",
    },
  ];
  const checklistComplete = checklistSteps.filter((step) => step.done).length;

  const handleFlagIrrelevant = async (article: TrackedNewsArticle) => {
    if (flaggingNewsId) return;
    setFlaggingNewsId(article.id);
    const previous = irrelevantNewsIds;
    try {
      const next = await markLocalNewsIrrelevant(market.id, article.id);
      setIrrelevantNewsIds(next);
      void recordResearchEvent({
        type: "news_feedback",
        route: "live-events",
        symbol: article.symbol,
        detail: "flagged-irrelevant",
      });
      if (isAuthenticated) {
        await flagIrrelevant.mutateAsync({
          marketId: market.id,
          symbol: article.symbol,
          articleId: article.id,
          articleHash: article.id,
          headline: article.headline,
          url: article.url,
          reason: "not_about_company" as IrrelevantNewsReason,
        });
      }
      if (selectedNewsArticle?.id === article.id) setSelectedNewsArticle(null);
      Alert.alert(
        "Hidden from this feed",
        "AnalyzerX will use this signal to improve future relevance checks for this market and security.",
        [
          {
            text: "Undo",
            onPress: () => {
              void (async () => {
                const restored = await undoLocalNewsIrrelevant(
                  market.id,
                  article.id,
                );
                setIrrelevantNewsIds(restored);
                if (isAuthenticated)
                  await undoIrrelevant.mutateAsync({
                    marketId: market.id,
                    articleId: article.id,
                  });
              })().catch(() =>
                Alert.alert(
                  "Undo unavailable",
                  "The article remains hidden locally.",
                ),
              );
            },
          },
          { text: "Done" },
        ],
      );
    } catch {
      setIrrelevantNewsIds(previous);
      await undoLocalNewsIrrelevant(market.id, article.id).catch(
        () => undefined,
      );
      Alert.alert(
        "Could not save feedback",
        isAuthenticated
          ? "Your feedback was not saved. Please retry when the account connection is available."
          : "The local feedback could not be saved. Please retry.",
      );
    } finally {
      setFlaggingNewsId(null);
    }
  };

  const visibleEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return dataset.events.filter((event) => {
      const matchesQuery =
        !q ||
        [
          event.title,
          event.companyA,
          event.companyB,
          event.symbolA,
          event.symbolB,
          event.sector,
          ...event.tags,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      const mappedKind = FILTER_KIND_MAP[activeFilter];
      const matchesFilter =
        activeFilter === "All events" ||
        (activeFilter === "High confidence"
          ? event.confidence === "High"
          : mappedKind
            ? event.kind === mappedKind
            : true);
      return matchesQuery && matchesFilter;
    });
  }, [activeFilter, query, dataset.events]);

  return (
    <ScreenContainer containerClassName="bg-background" className="px-5">
      <FlatList
        data={visibleEvents}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.eyebrow}>{market.id === "IN" ? "NSE / BSE INTELLIGENCE" : `${market.exchanges.join(" / ")} INTELLIGENCE`}</Text>
                <Text style={styles.title}>Live Events</Text>
                <View
                  style={styles.releaseIdentityRow}
                  accessibilityLabel={`Build ${releaseIdentityLabel()}`}
                >
                  <Text style={styles.releaseIdentityText}>
                    {releaseIdentityLabel()}
                  </Text>
                  <View
                    style={[
                      styles.releaseIdentityDot,
                      { backgroundColor: isVerifiedRelease() ? teal : amber },
                    ]}
                  />
                  <Text style={styles.releaseIdentityText}>
                    {isVerifiedRelease()
                      ? `source ${analyzerXReleaseInfo.sourceRevision.slice(0, 8)}`
                      : "unverified artifact"}
                  </Text>
                </View>
              </View>
              <View style={styles.headerActions}>
                <Pressable
                  style={styles.bellButton}
                  onPress={() => setShowNotifications(true)}
                  accessibilityLabel="Open notifications"
                >
                  <Ionicons
                    name="notifications-outline"
                    size={21}
                    color={colors.foreground}
                  />
                </Pressable>
                <Pressable
                  style={styles.bellButton}
                  onPress={() => router.push("/account")}
                  accessibilityLabel="Open account management"
                >
                  <Ionicons
                    name="person-outline"
                    size={21}
                    color={colors.foreground}
                  />
                </Pressable>
              </View>
            </View>
            <Pressable
              onPress={() => router.push("/market-country")}
              style={({ pressed }) => [
                styles.marketSwitcher,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Change market, currently ${market.country}`}
            >
              <View style={styles.marketSwitcherIcon}>
                <Ionicons name="globe-outline" size={15} color={amber} />
              </View>
              <View style={styles.marketSwitcherCopy}>
                <Text style={styles.marketSwitcherLabel}>MARKET SCOPE</Text>
                <Text style={styles.marketSwitcherTitle}>
                  {market.country} · {market.exchanges.join(" / ")} ·{" "}
                  {market.currency}
                </Text>
              </View>
              <View style={styles.marketSwitcherMeta}>
                <Text style={styles.marketSwitcherCoverage}>
                  {market.coverage.toUpperCase()}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#91A2B8" />
              </View>
            </Pressable>
            <View style={styles.finnhubCard}>
              <View style={styles.finnhubHeader}>
                <View>
                  <Text style={styles.finnhubEyebrow}>RESEARCH WORKSPACE</Text>
                  <Text style={styles.finnhubTitle}>
                    Go deeper than the live feed
                  </Text>
                </View>
                <Ionicons name="layers-outline" size={21} color={amber} />
              </View>
              <Text style={styles.finnhubState}>
                Deep Research Desk, saved history, reports, and public macro
                context are available from one place.
              </Text>
              <Pressable
                onPress={() => router.push("/research-workspace")}
                style={({ pressed }) => [
                  styles.adminLink,
                  pressed && styles.newsItemPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Open Research Workspace"
              >
                <Text style={styles.adminLinkText}>
                  Open Research Workspace
                </Text>
                <Ionicons name="arrow-forward" size={16} color={teal} />
              </Pressable>
            </View>
            {!checklistDismissed &&
            checklistComplete < checklistSteps.length ? (
              <View style={styles.finnhubCard}>
                <View style={styles.finnhubHeader}>
                  <View>
                    <Text style={styles.finnhubEyebrow}>FIRST SESSION</Text>
                    <Text style={styles.finnhubTitle}>
                      Your AnalyzerX quick start · {checklistComplete}/
                      {checklistSteps.length}
                    </Text>
                  </View>
                  <Ionicons name="compass-outline" size={21} color={amber} />
                </View>
                {checklistSteps.map((step) => (
                  <Pressable
                    key={step.label}
                    onPress={() => {
                      void recordResearchEvent({
                        type: "onboarding_step",
                        route: step.route,
                        detail: step.label,
                      });
                      router.push(step.route as never);
                    }}
                    style={({ pressed }) => [
                      styles.adminLink,
                      pressed && styles.newsItemPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={step.label}
                  >
                    <Text
                      style={[
                        styles.adminLinkText,
                        step.done && { color: teal },
                      ]}
                    >
                      {step.done ? "✓ " : "○ "}
                      {step.label}
                    </Text>
                    <Ionicons
                      name="arrow-forward"
                      size={16}
                      color={step.done ? teal : amber}
                    />
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => {
                    setChecklistDismissed(true);
                    void AsyncStorage.setItem(
                      FIRST_SESSION_CHECKLIST_KEY,
                      "seen",
                    );
                    void recordResearchEvent({
                      type: "onboarding_dismiss",
                      route: "live-events",
                      detail: "first-session-checklist",
                    });
                  }}
                  style={styles.secondaryButton}
                  accessibilityRole="button"
                  accessibilityLabel="Hide first session checklist"
                >
                  <Text style={styles.secondaryButtonText}>Hide checklist</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.searchBox}>
              <Ionicons name="search" size={19} color="#91A2B8" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search company, symbol, project..."
                placeholderTextColor="#6E7D92"
                style={styles.searchInput}
                returnKeyType="search"
                onSubmitEditing={() => {
                  if (liveSuggestions[0]) {
                    void recordResearchEvent({
                      type: "search",
                      symbol: liveSuggestions[0].symbol,
                      route: "live-events",
                    });
                    setFeaturedSymbol(`${liveSuggestions[0].symbol}.NS`);
                    setQuery(liveSuggestions[0].symbol);
                  }
                }}
              />
              <Pressable onPress={() => setQuery("")}>
                <Ionicons
                  name={query ? "close-circle" : "options-outline"}
                  size={19}
                  color={query ? amber : "#91A2B8"}
                />
              </Pressable>
            </View>
            {query.trim() ? (
              <View style={styles.liveSearchSuggestions}>
                {liveSearch.isFetching ? (
                  <Text style={styles.liveSearchHint}>
                    Searching NSE/BSE, Finnhub, and open Indian API…
                  </Text>
                ) : liveSuggestions.length ? (
                  liveSuggestions.map((item) => (
                    <Pressable
                      key={`${item.symbol}-${item.name}`}
                      onPress={() => {
                        void recordResearchEvent({
                          type: "search",
                          symbol: item.symbol,
                          route: "live-events",
                        });
                        setFeaturedSymbol(`${item.symbol}.NS`);
                        setQuery(item.symbol);
                      }}
                      style={styles.liveSearchSuggestion}
                    >
                      <View>
                        <Text style={styles.liveSearchName}>{item.name}</Text>
                        <Text style={styles.liveSearchMeta}>
                          {item.symbol} · {item.exchange} · {item.source}
                        </Text>
                      </View>
                      <Ionicons
                        name="arrow-forward"
                        size={14}
                        color="#6E7D92"
                      />
                    </Pressable>
                  ))
                ) : (
                  <Text style={styles.liveSearchHint}>
                    No live symbol match. Try a valid NSE/BSE ticker.
                  </Text>
                )}
              </View>
            ) : null}
            <View style={styles.finnhubCard}>
              <View style={styles.finnhubHeader}>
                <View>
                  <Text style={styles.finnhubEyebrow}>
                    LIVE MARKET SNAPSHOT
                  </Text>
                  <Text style={styles.finnhubTitle}>
                    {featuredSymbol} · verified fields only
                  </Text>
                </View>
                <View
                  style={[
                    styles.sourcePill,
                    finnhubSnapshot.isError && styles.sourcePillError,
                  ]}
                >
                  <View
                    style={[
                      styles.sourceDot,
                      {
                        backgroundColor: finnhubSnapshot.isError ? coral : teal,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.sourceText,
                      { color: finnhubSnapshot.isError ? coral : teal },
                    ]}
                  >
                    {finnhubSnapshot.isError
                      ? "Unavailable"
                      : (finnhubSnapshot.data?.source ?? "Checking")}
                  </Text>
                </View>
              </View>
              {finnhubSnapshot.isLoading ? (
                <Text style={styles.finnhubState}>
                  Loading live quote and company news…
                </Text>
              ) : finnhubSnapshot.data?.quote ? (
                <View style={styles.quoteRow}>
                  <View>
                    <Text style={styles.quoteLabel}>LAST QUOTE</Text>
                    <Text style={styles.quoteValue}>
                      {formatQuote(
                        finnhubSnapshot.data.quote.current,
                        featuredSymbol,
                      )}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.quoteLabel}>CHANGE</Text>
                    <Text
                      style={[
                        styles.quoteValue,
                        {
                          color:
                            (finnhubSnapshot.data.quote.change ?? 0) >= 0
                              ? teal
                              : coral,
                        },
                      ]}
                    >
                      {formatQuote(
                        finnhubSnapshot.data.quote.change,
                        featuredSymbol,
                      )}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.quoteLabel}>DAY %</Text>
                    <Text
                      style={[
                        styles.quoteValue,
                        {
                          color:
                            (finnhubSnapshot.data.quote.changePercent ?? 0) >= 0
                              ? teal
                              : coral,
                        },
                      ]}
                    >
                      {formatPercent(finnhubSnapshot.data.quote.changePercent)}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.snapshotUnavailable}>
                  <Text style={styles.finnhubState}>
                    {finnhubSnapshot.data?.errors?.quote ??
                      "Quote unavailable from configured providers"}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Retry live market snapshot"
                    onPress={() => void finnhubSnapshot.refetch()}
                    style={({ pressed }) => [styles.snapshotRetry, pressed && { opacity: 0.72 }]}
                  >
                    <Text style={styles.snapshotRetryText}>Retry live data</Text>
                  </Pressable>
                  <Text style={styles.snapshotDiagnostic}>
                    If retry still fails, open Data Sources to see whether the provider is delayed, rate-limited, or missing credentials. Cached news remains available when the provider is offline.
                  </Text>
                </View>
              )}
              {finnhubSnapshot.data?.fundamentals ? (
                <View style={styles.quoteRow}>
                  <View>
                    <Text style={styles.quoteLabel}>P/E</Text>
                    <Text style={styles.quoteValue}>
                      {finnhubSnapshot.data.fundamentals.pe ?? "—"}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.quoteLabel}>EPS</Text>
                    <Text style={styles.quoteValue}>
                      {finnhubSnapshot.data.fundamentals.earningsPerShare ??
                        "—"}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.quoteLabel}>SECTOR</Text>
                    <Text style={styles.quoteValue}>
                      {finnhubSnapshot.data.fundamentals.sector ?? "—"}
                    </Text>
                  </View>
                </View>
              ) : null}
              {finnhubSnapshot.data?.news?.length ? (
                <View style={styles.newsList}>
                  {finnhubSnapshot.data.news.slice(0, 2).map((item) => (
                    <View
                      key={`${item.id ?? item.url}`}
                      style={styles.newsItem}
                    >
                      <View style={styles.newsBullet} />
                      <View style={styles.newsCopy}>
                        <Text style={styles.newsHeadline} numberOfLines={2}>
                          {item.headline}
                        </Text>
                        <Text style={styles.newsMeta}>
                          {item.source ?? "Source unavailable"} ·{" "}
                          {item.publishedAt
                            ? new Date(item.publishedAt).toLocaleString()
                            : "Time unavailable"}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.finnhubState}>
                  {finnhubSnapshot.data?.errors?.news ??
                    "No Finnhub company news returned for this symbol"}
                </Text>
              )}
              <Text style={styles.finnhubFootnote}>
                Source: {finnhubSnapshot.data?.source ?? "No verified provider response"} · As of{" "}
                {finnhubSnapshot.data?.asOf
                  ? new Date(finnhubSnapshot.data.asOf).toLocaleString()
                  : "not available"}
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {dataset.eventFilters.map((filter) => (
                <Pressable
                  key={filter}
                  onPress={() => setActiveFilter(filter)}
                  style={[
                    styles.filterChip,
                    activeFilter === filter && styles.filterChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      activeFilter === filter && styles.filterTextActive,
                    ]}
                  >
                    {filter}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.researchPulse}>
              <View style={styles.researchPulseHeader}>
                <View>
                  <Text style={styles.finnhubEyebrow}>RESEARCH PULSE</Text>
                  <Text style={styles.finnhubTitle}>
                    Return to the work that matters
                  </Text>
                </View>
                <Ionicons name="pulse-outline" size={18} color={amber} />
              </View>
              <Text style={styles.researchPulseBody}>
                Fast paths for discovery, repeat research, and high-signal
                market context. Usage counts stay on this device.
              </Text>
              <View style={styles.pulseMetrics}>
                <View>
                  <Text style={styles.pulseMetricValue}>
                    {usageSummary?.searches ?? 0}
                  </Text>
                  <Text style={styles.pulseMetricLabel}>SEARCHES</Text>
                </View>
                <View>
                  <Text style={styles.pulseMetricValue}>
                    {usageSummary?.analyses ?? 0}
                  </Text>
                  <Text style={styles.pulseMetricLabel}>ANALYSES</Text>
                </View>
                <View>
                  <Text style={styles.pulseMetricValue}>
                    {usageSummary?.newsReads ?? 0}
                  </Text>
                  <Text style={styles.pulseMetricLabel}>NEWS READS</Text>
                </View>
                <View>
                  <Text style={styles.pulseMetricValue}>
                    {usageSummary?.exports ?? 0}
                  </Text>
                  <Text style={styles.pulseMetricLabel}>EXPORTS</Text>
                </View>
              </View>
              {usageSummary?.topSymbols.length ? (
                <Text style={styles.researchPulseBody}>
                  Most revisited · {usageSummary.topSymbols.join(" · ")}
                </Text>
              ) : null}
              <View style={styles.pulseActions}>
                <Pressable
                  onPress={() => {
                    void recordResearchEvent({
                      type: "analysis_open",
                      route: "research-workspace",
                    });
                    router.push("/research-workspace");
                  }}
                  style={({ pressed }) => [
                    styles.pulseAction,
                    pressed && styles.newsItemPressed,
                  ]}
                >
                  <Ionicons name="briefcase-outline" size={15} color={teal} />
                  <Text style={styles.pulseActionText}>Workspace</Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push("/sectors")}
                  style={({ pressed }) => [
                    styles.pulseAction,
                    pressed && styles.newsItemPressed,
                  ]}
                >
                  <Ionicons name="grid-outline" size={15} color={violet} />
                  <Text style={styles.pulseActionText}>Sectors</Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push("/storylines")}
                  style={({ pressed }) => [
                    styles.pulseAction,
                    pressed && styles.newsItemPressed,
                  ]}
                >
                  <Ionicons
                    name="git-network-outline"
                    size={15}
                    color={amber}
                  />
                  <Text style={styles.pulseActionText}>Stories</Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push("/alerts")}
                  style={({ pressed }) => [
                    styles.pulseAction,
                    pressed && styles.newsItemPressed,
                  ]}
                >
                  <Ionicons
                    name="notifications-outline"
                    size={15}
                    color={coral}
                  />
                  <Text style={styles.pulseActionText}>Alerts</Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push("/market-chat")}
                  style={({ pressed }) => [
                    styles.pulseAction,
                    pressed && styles.newsItemPressed,
                  ]}
                >
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={15}
                    color={amber}
                  />
                  <Text style={styles.pulseActionText}>Market Chat</Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push("/history")}
                  style={({ pressed }) => [
                    styles.pulseAction,
                    pressed && styles.newsItemPressed,
                  ]}
                  accessibilityLabel="Open history"
                >
                  <Ionicons name="time-outline" size={15} color={teal} />
                  <Text style={styles.pulseActionText}>History</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.liveSummary}>
              <View
                style={[
                  styles.livePulse,
                  {
                    backgroundColor: newsTrackerStatus.data?.lastError
                      ? coral
                      : teal,
                  },
                ]}
              />
              <Text style={styles.liveText}>
                {newsTrackerStatus.data?.lastError
                  ? "TRACKER DEGRADED"
                  : "LIVE TRACKER"}
              </Text>
              <Text style={styles.liveSubtext}>
                {newsTrackerStatus.data?.lastSuccessAt
                  ? `Last collection ${new Date(newsTrackerStatus.data.lastSuccessAt).toLocaleTimeString()}`
                  : newsTrackerStatus.isLoading
                    ? "Reading collector status"
                    : "Collection starts automatically on this device"}
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#6E7D92" />
            </View>
            <View style={styles.finnhubCard}>
              <View style={styles.finnhubHeader}>
                <View>
                  <Text style={styles.finnhubEyebrow}>ON-DEVICE NEWS TRACKER</Text>
                  <Text style={styles.finnhubTitle}>
                    {newsTrackerStatus.data
                      ? newsTrackerStatus.data.articlesStored > 0
                        ? `Impact-ranked news · ${newsTrackerStatus.data.articlesStored} stored`
                        : newsTrackerStatus.data.lastError
                          ? "Collector ran but stored nothing yet"
                          : "Collector ready · first pass pending"
                      : newsTrackerStatus.isLoading
                        ? "Reading collector status"
                        : "Collector status unavailable"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.sourcePill,
                    newsTrackerStatus.data?.lastError && styles.sourcePillError,
                  ]}
                >
                  <View
                    style={[
                      styles.sourceDot,
                      {
                        backgroundColor: newsTrackerStatus.data?.lastError
                          ? coral
                          : newsTrackerStatus.data?.running
                            ? teal
                            : amber,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.sourceText,
                      {
                        color: newsTrackerStatus.data?.lastError
                          ? coral
                          : newsTrackerStatus.data?.running
                            ? teal
                            : amber,
                      },
                    ]}
                  >
                    {newsTrackerStatus.data?.lastError
                      ? "Degraded"
                      : newsTrackerStatus.data?.running
                        ? "Online"
                        : "Checking"}
                  </Text>
                </View>
              </View>
              <View style={styles.newsInputRow}>
                <TextInput
                  value={newsSymbol}
                  onChangeText={setNewsSymbol}
                  onSubmitEditing={() =>
                    setNewsLookupSymbol(newsSymbol.trim().toUpperCase())
                  }
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder="Enter stock or crypto symbol, e.g. TCS, AAPL, BTC"
                  placeholderTextColor="#6E7D92"
                  style={styles.newsFocusInput}
                  returnKeyType="search"
                />
                <Pressable
                  onPress={() => {
                    void newsRefresh
                      .mutateAsync({
                        symbol: newsLookupSymbol,
                        marketId: market.id,
                      })
                      .then(() =>
                        Promise.all([
                          trackedNews.refetch(),
                          newsTrackerStatus.refetch(),
                          newsArchive.refetch(),
                        ]),
                      )
                      .catch(() => undefined);
                  }}
                  disabled={trackedNews.isFetching || newsRefresh.isPending}
                  style={({ pressed }) => [
                    styles.refreshNewsButton,
                    pressed && styles.newsItemPressed,
                    (trackedNews.isFetching || newsRefresh.isPending) &&
                      styles.disabledButton,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Refresh and collect news for ${newsLookupSymbol}`}
                >
                  <Ionicons
                    name="refresh"
                    size={16}
                    color={
                      trackedNews.isFetching || newsRefresh.isPending
                        ? "#91A2B8"
                        : amber
                    }
                  />
                </Pressable>
              </View>
              <Text style={styles.finnhubState}>
                Automatic collection is active on this device: the app polls the
                configured providers, deduplicates verified articles, stores new
                items in the local archive, and raises high-impact alerts when
                eligible. Nothing is sent to a server.
              </Text>
              <Pressable
                onPress={() => router.push("/filings")}
                style={({ pressed }) => [styles.filingIntelCard, pressed && styles.newsItemPressed]}
                accessibilityRole="button"
                accessibilityLabel="Open Filing Intelligence report"
              >
                <View style={styles.deepResearchHeader}>
                  <Text style={styles.deepResearchEyebrow}>FILING INTELLIGENCE</Text>
                  <Text style={styles.filingIntelArrow}>→</Text>
                </View>
                <Text style={styles.filingIntelBody}>
                  An evidence-linked report built from the disclosures this device holds: every claim classified, every
                  check shown as passed, failed or not checked, and every source labelled with its real coverage status.
                </Text>
              </Pressable>
              {(() => {
                // Deep-research watch (Rule 6). Every catalyst carries its three
                // time markers, and events outside the selected window are
                // dropped unless the text marks them as a live update.
                const result = scanDeepResearchDetailed(
                  ((newsArchive.data?.articles ?? []) as Record<string, unknown>[]).map((article) => ({
                    id: String(article.id ?? ""),
                    symbol: String(article.symbol ?? ""),
                    headline: String(article.headline ?? ""),
                    summary: String(article.summary ?? ""),
                    source: String(article.source ?? ""),
                    url: String(article.url ?? ""),
                    published_at: String(article.published_at ?? ""),
                    impact_score: typeof article.impact_score === "number" ? article.impact_score : 0,
                  })),
                  { limit: 8, windowDays: archiveDays },
                );
                const signals = result.signals;
                if (!signals.length) return null;
                return (
                  <View style={styles.deepResearchCard}>
                    <View style={styles.deepResearchHeader}>
                      <Text style={styles.deepResearchEyebrow}>DEEP RESEARCH WATCH</Text>
                      <Text style={styles.deepResearchCount}>{signals.length}</Text>
                    </View>
                    <Text style={styles.deepResearchNote}>
                      Expansion, order, discovery, capital, regulatory and ownership signals in the
                      stories collected over the last {result.windowDays} days. Each row shows the
                      matched phrase and its three time markers, so you can verify it at source.
                    </Text>
                    {result.excludedOutOfWindow > 0 ? (
                      <Text style={styles.deepResearchExcluded}>
                        {result.excludedOutOfWindow} older event
                        {result.excludedOutOfWindow === 1 ? "" : "s"} left out — outside the{" "}
                        {result.windowDays}-day window and not flagged as an update to an earlier
                        agreement.
                      </Text>
                    ) : null}
                    {signals.map((signal) => (
                      <Pressable
                        key={signal.id}
                        onPress={() =>
                          router.push({ pathname: "/news/[id]", params: { id: signal.id.split(":")[0] } })
                        }
                        style={({ pressed }) => [styles.deepResearchRow, pressed && styles.newsItemPressed]}
                        accessibilityRole="button"
                        accessibilityLabel={`Open deep research signal: ${signal.headline}`}
                      >
                        <View style={styles.deepResearchTop}>
                          <Text style={styles.deepResearchLabel}>{signal.label}</Text>
                          <Text style={styles.deepResearchSymbol}>{signal.symbol}</Text>
                        </View>
                        <Text style={styles.deepResearchHeadline} numberOfLines={2}>
                          {signal.headline}
                        </Text>
                        <Text style={styles.deepResearchMatch}>
                          Matched “{signal.matchedPhrase}” · {signal.source}
                        </Text>
                        <View style={styles.deepResearchTimes}>
                          <Text style={styles.deepResearchTime}>
                            Announced ·{" "}
                            {signal.temporal.eventDateLabel ?? signal.temporal.eventDate ?? "not stated"}
                            {signal.temporal.eventDateBasis === "document_date" ? " (from filing date)" : ""}
                          </Text>
                          <Text style={styles.deepResearchTime}>
                            Document · {signal.temporal.documentDate}
                          </Text>
                          <Text style={styles.deepResearchTime}>
                            Impact · {signal.temporal.executionTimeline ?? "not stated"}
                          </Text>
                          {signal.isHistoricalUpdate ? (
                            <Text style={styles.deepResearchUpdate}>
                              Current update to an earlier agreement
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    ))}
                  </View>
                );
              })()}
              <Pressable
                onPress={() => router.push("/held-review")}
                style={({ pressed }) => [
                  styles.adminLink,
                  pressed && styles.newsItemPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Open held for review"
              >
                <Text style={styles.adminLinkText}>
                  Held for Review · inspect blocked stories
                </Text>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={16}
                  color={teal}
                />
              </Pressable>
              {newsRefresh.isError ? (
                <Text style={styles.finnhubState}>
                  Refresh could not complete; cached verified results remain
                  visible and will retry on the next safe polling window.
                </Text>
              ) : null}
              {trackedNews.isFetching || newsRefresh.isPending ? (
                <Text style={styles.finnhubState}>
                  Refreshing verified news for {newsLookupSymbol}…
                </Text>
              ) : visibleTrackedArticles.length ? (
                <ScrollView
                  horizontal
                  pagingEnabled
                  decelerationRate="fast"
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.newspaperRail}
                  accessibilityLabel="Swipe selected stock headlines"
                >
                  {visibleTrackedArticles.map((item) => (
                    <NewspaperArticleCard
                      key={item.id}
                      article={item}
                      onPress={() => {
                        void recordResearchEvent({
                          type: "news_open",
                          symbol: item.symbol,
                          route: "live-events",
                        });
                        setSelectedNewsArticle(item);
                      }}
                      onFlag={() => void handleFlagIrrelevant(item)}
                      flagged={false}
                    />
                  ))}
                </ScrollView>
              ) : (
                <Text style={styles.finnhubState}>
                  {trackedNews.data?.articles?.length
                    ? "All returned headlines are hidden by your relevance feedback for this market."
                    : (trackedNews.data?.error ??
                      (newsTrackerStatus.data?.lastError
                        ? `Latest tracker poll was partial: ${newsTrackerStatus.data.lastError}`
                        : `No verified news returned for ${newsLookupSymbol}. Provider data may be unavailable.`))}
                </Text>
              )}
              {newsTrackerStatus.data?.lastError ? (
                <Text style={styles.finnhubFootnote}>
                  Tracker note: {newsTrackerStatus.data.lastError}; available
                  symbol results remain visible.
                </Text>
              ) : null}
              <Text style={styles.finnhubFootnote}>
                Search freshness:{" "}
                {trackedNews.data?.fetchedAt
                  ? new Date(trackedNews.data.fetchedAt).toLocaleString()
                  : "not available"}{" "}
                ·{" "}
                {trackedNews.data?.stale
                  ? "cached results; no new provider item"
                  : `${trackedNews.data?.freshArticleCount ?? 0} fresh items`}{" "}
                · {trackedNews.data?.providerFailures ?? 0} provider failures
              </Text>
              <Text style={styles.finnhubFootnote}>
                Server freshness:{" "}
                {newsTrackerStatus.data?.lastSuccessAt
                  ? new Date(
                      newsTrackerStatus.data.lastSuccessAt,
                    ).toLocaleString()
                  : "not available"}{" "}
                · {newsTrackerStatus.data?.articlesStored ?? 0} stored ·{" "}
                {providers.data?.filter(
                  (provider) => provider.status === "configured",
                ).length ?? 0}{" "}
                providers configured
              </Text>
              <Text style={styles.finnhubFootnote}>
                A–Z coverage:{" "}
                {newsTrackerStatus.data?.universeCount
                  ? `${newsTrackerStatus.data.universeCount.toLocaleString()} NSE symbols · ${newsTrackerStatus.data.coveredSymbols ?? 0} in this batch`
                  : "waiting for verified NSE universe"}{" "}
                · mode {newsTrackerStatus.data?.coverageMode ?? "unknown"}
              </Text>
              <Text style={styles.finnhubFootnote}>
                Device assist:{" "}
                {deviceTrackerAvailability === "server-only"
                  ? "server-only on this platform"
                  : "custom native build required"}
              </Text>
            </View>
            <View style={styles.finnhubCard}>
              <View style={styles.finnhubHeader}>
                <View>
                  <Text style={styles.finnhubEyebrow}>
                    OFFICIAL SOURCE COVERAGE
                  </Text>
                  <Text style={styles.finnhubTitle}>
                    {sourceCatalog.isLoading
                      ? "Loading source catalog"
                      : `${sourceCatalog.data?.filter((source) => source.configured).length ?? 0} sources configured`}
                  </Text>
                </View>
                <View
                  style={[
                    styles.sourcePill,
                    sourceCatalog.isError && styles.sourcePillError,
                  ]}
                >
                  <View
                    style={[
                      styles.sourceDot,
                      { backgroundColor: sourceCatalog.isError ? coral : teal },
                    ]}
                  />
                  <Text
                    style={[
                      styles.sourceText,
                      { color: sourceCatalog.isError ? coral : teal },
                    ]}
                  >
                    {sourceCatalog.isError ? "Unavailable" : "Catalog"}
                  </Text>
                </View>
              </View>
              <Text style={styles.finnhubState}>
                {latestSourceRecords.isLoading
                  ? "Waiting for stored provenance records…"
                  : latestSourceRecords.data?.length
                    ? `${latestSourceRecords.data.length} latest source records stored with retrieval timestamps.`
                    : "No source records stored yet. Ingestion is controlled per source and preserves original URLs."}
              </Text>
              <Text style={styles.finnhubFootnote}>
                Verified NSE universe:{" "}
                {nseUniverse.isLoading
                  ? "loading"
                  : nseUniverse.data
                    ? `${nseUniverse.data.securities.length.toLocaleString()} securities`
                    : "unavailable"}
                {nseUniverse.data?.errors.length
                  ? ` · ${nseUniverse.data.errors.length} source restriction${nseUniverse.data.errors.length === 1 ? "" : "s"}`
                  : ""}
                . NSE/BSE/SEBI pages are cataloged separately from
                machine-readable reports. Prices and OHLC require a licensed
                market-data provider.
              </Text>
            </View>
            <View style={styles.finnhubCard}>
              <View style={styles.finnhubHeader}>
                <View>
                  <Text style={styles.finnhubEyebrow}>
                    NSE COLLECTOR OPERATIONS
                  </Text>
                  <Text style={styles.finnhubTitle}>
                    {nseCollectors.isLoading
                      ? "Loading collectors"
                      : `${nseCollectors.data?.filter((item) => item.status === "ready" || item.status === "page-snapshot").length ?? 0} enabled paths`}
                  </Text>
                </View>
                <View
                  style={[
                    styles.sourcePill,
                    collectorHealth.isError && styles.sourcePillError,
                  ]}
                >
                  <View
                    style={[
                      styles.sourceDot,
                      {
                        backgroundColor: collectorHealth.isError ? coral : teal,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.sourceText,
                      { color: collectorHealth.isError ? coral : teal },
                    ]}
                  >
                    {collectorHealth.isError ? "Unavailable" : "Status"}
                  </Text>
                </View>
              </View>
              <Text style={styles.finnhubState}>
                {nseCollectors.data?.filter(
                  (item) => item.status === "blocked-unresolved-download",
                ).length ?? 0}{" "}
                dataset routes are blocked until current official download
                mechanisms are validated.{" "}
                {collectorHealth.data?.filter((item) => item.lastError)
                  .length ?? 0}{" "}
                recent collector errors.
              </Text>
              <Text style={styles.finnhubFootnote}>
                No CAPTCHA, WAF, authentication, robots, or licensing controls
                are bypassed.
              </Text>
              <Pressable
                onPress={() => router.push("/admin")}
                style={({ pressed }) => [
                  styles.adminLink,
                  pressed && styles.newsItemPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Open collector administration"
              >
                <Text style={styles.adminLinkText}>
                  Open collector administration
                </Text>
                <Ionicons name="arrow-forward" size={16} color={teal} />
              </Pressable>
            </View>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Verified news archive</Text>
              <Text style={styles.sectionHint}>
                {archiveArticles.length} available
              </Text>
            </View>
            <Text style={styles.archiveIntro}>
              Historical and current verified items are retained when providers
              return them. Quick presets cover up to one year, while Custom
              dates can extend up to ten years. Older ranges remain
              market-scoped and show only source-grounded persisted coverage;
              unavailable periods are not fabricated.
            </Text>
            {newsArchive.data?.missingCoverage ? (
              <Text style={styles.archiveCoverageWarning}>
                {newsArchive.data.missingCoverage}
              </Text>
            ) : null}
            {newsArchive.data?.sourceCoverage?.length ? (
              <View style={styles.archiveSourceCoverage}>
                <Text style={styles.archiveSourceCoverageTitle}>
                  SOURCE FRESHNESS · {newsArchive.data.sourceCoverage.length} SOURCES
                </Text>
                {(archiveSourcesExpanded
                  ? newsArchive.data.sourceCoverage
                  : newsArchive.data.sourceCoverage.slice(0, 2)
                ).map((source) => (
                  <View key={source.source} style={styles.archiveSourceRow}>
                    <Text style={styles.archiveSourceName} numberOfLines={1}>
                      {source.source}
                    </Text>
                    <Text style={styles.archiveSourceMeta}>
                      {source.count} item(s) · {source.freshness} · latest{" "}
                      {new Date(source.latest).toLocaleDateString()}
                    </Text>
                  </View>
                ))}
                {newsArchive.data.sourceCoverage.length > 2 ? (
                  <Pressable
                    onPress={() =>
                      setArchiveSourcesExpanded((expanded) => !expanded)
                    }
                    style={({ pressed }) => [
                      styles.archiveSourceToggle,
                      pressed && styles.newsItemPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: archiveSourcesExpanded }}
                    accessibilityLabel={
                      archiveSourcesExpanded
                        ? "Collapse archive source list"
                        : `Expand all ${newsArchive.data.sourceCoverage.length} archive sources`
                    }
                  >
                    <Text style={styles.archiveSourceToggleText}>
                      {archiveSourcesExpanded
                        ? "Show fewer sources"
                        : `Show all ${newsArchive.data.sourceCoverage.length} sources`}
                    </Text>
                    <Ionicons
                      name={
                        archiveSourcesExpanded
                          ? "chevron-up-outline"
                          : "chevron-down-outline"
                      }
                      size={15}
                      color={teal}
                    />
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            <View style={styles.archiveExportRow}>
              <Text style={styles.archiveExportLabel}>
                EXPORT SELECTED RANGE
              </Text>
              <Pressable
                onPress={() => requestArchiveExport("csv")}
                disabled={Boolean(archiveExportRequest)}
                style={styles.archiveExportButton}
              >
                <Ionicons name="document-text-outline" size={14} color={teal} />
                <Text style={styles.archiveExportText}>
                  {archiveExportRequest?.format === "csv"
                    ? "Preparing…"
                    : "CSV"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => requestArchiveExport("pdf")}
                disabled={Boolean(archiveExportRequest)}
                style={styles.archiveExportButton}
              >
                <Ionicons name="document-outline" size={14} color={amber} />
                <Text style={[styles.archiveExportText, { color: amber }]}>
                  {archiveExportRequest?.format === "pdf"
                    ? "Preparing…"
                    : "PDF"}
                </Text>
              </Pressable>
            </View>
            {archiveExportRequest ? (
              <View style={styles.archiveExportProgressWrap}>
                <View style={styles.archiveExportProgressTrack}>
                  <View
                    style={[
                      styles.archiveExportProgressFill,
                      { width: `${Math.max(8, archiveExportProgress)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.archiveExportProgressText}>
                  {archiveExportProgress < 75
                    ? `Collecting archive pages… ${archiveExportProgress}%`
                    : archiveExportProgress < 100
                      ? "Preparing download…"
                      : "Download ready"}
                </Text>
              </View>
            ) : null}
            {archiveExportMessage ? (
              <Text style={styles.archiveExportMessage}>
                {archiveExportMessage}
              </Text>
            ) : null}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {(
                [
                  { label: "30 days", days: 30 },
                  { label: "90 days", days: 90 },
                  { label: "6 months", days: 180 },
                  { label: "9 months", days: 270 },
                  { label: "1 year", days: 365 },
                ] as const
              ).map((range) => (
                <Pressable
                  key={range.days}
                  onPress={() => {
                    setArchiveDays(range.days);
                    setAppliedCustomRange(null);
                    setShowCustomRange(false);
                    setCustomRangeError(null);
                    setArchivePage(0);
                  }}
                  style={[
                    styles.filterChip,
                    !appliedCustomRange &&
                      archiveDays === range.days &&
                      styles.filterChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      !appliedCustomRange &&
                        archiveDays === range.days &&
                        styles.filterTextActive,
                    ]}
                  >
                    {range.label}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => setShowCustomRange((visible) => !visible)}
                style={[
                  styles.filterChip,
                  appliedCustomRange || showCustomRange
                    ? styles.filterChipActive
                    : null,
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    appliedCustomRange || showCustomRange
                      ? styles.filterTextActive
                      : null,
                  ]}
                >
                  Custom dates
                </Text>
              </Pressable>
            </ScrollView>
            {showCustomRange ? (
              Platform.OS === "web" ? (
                <WebCalendarRangePicker
                  startDate={customStartDate}
                  endDate={customEndDate}
                  onStartDateChange={setCustomStartDate}
                  onEndDateChange={setCustomEndDate}
                  onApply={applyCustomArchiveRange}
                  onClear={() => {
                    setCustomStartDate("");
                    setCustomEndDate("");
                    setAppliedCustomRange(null);
                    setCustomRangeError(null);
                    setArchivePage(0);
                  }}
                />
              ) : (
                <View style={styles.customRangeCard}>
                  <Text style={styles.customRangeTitle}>
                    Choose an exact archive range
                  </Text>
                  <Text style={styles.customRangeHint}>
                    Quick presets cover up to one year. Custom ranges can reach
                    ten years when source coverage exists for {market.country};
                    dates use UTC-safe day boundaries.
                  </Text>
                  <View style={styles.customDateRow}>
                    <View style={styles.customDateField}>
                      <Text style={styles.customDateLabel}>START DATE</Text>
                      <Pressable
                        onPress={() => setPickerTarget("start")}
                        style={styles.customDateInputButton}
                      >
                        <Text style={styles.customDateInputText}>
                          {customStartDate || "Select start"}
                        </Text>
                        <Ionicons
                          name="calendar-outline"
                          size={15}
                          color={amber}
                        />
                      </Pressable>
                    </View>
                    <View style={styles.customDateField}>
                      <Text style={styles.customDateLabel}>END DATE</Text>
                      <Pressable
                        onPress={() => setPickerTarget("end")}
                        style={styles.customDateInputButton}
                      >
                        <Text style={styles.customDateInputText}>
                          {customEndDate || "Select end"}
                        </Text>
                        <Ionicons
                          name="calendar-outline"
                          size={15}
                          color={amber}
                        />
                      </Pressable>
                    </View>
                  </View>
                  {pickerTarget ? (
                    <DateTimePicker
                      value={dateOnlyToLocalDate(
                        pickerTarget === "start"
                          ? customStartDate
                          : customEndDate,
                      )}
                      mode="date"
                      maximumDate={new Date()}
                      onChange={(_, date) => {
                        if (date) {
                          const value = formatDateOnly(date);
                          if (pickerTarget === "start")
                            setCustomStartDate(value);
                          else setCustomEndDate(value);
                        }
                        setPickerTarget(null);
                      }}
                    />
                  ) : null}
                  {customRangeError ? (
                    <Text style={styles.customRangeError}>
                      {customRangeError}
                    </Text>
                  ) : null}
                  <View style={styles.customRangeActions}>
                    <Pressable
                      onPress={() => {
                        setShowCustomRange(false);
                        setCustomRangeError(null);
                      }}
                      style={styles.secondaryButton}
                    >
                      <Text style={styles.secondaryButtonText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={applyCustomArchiveRange}
                      style={styles.customApplyButton}
                    >
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={15}
                        color="#08111F"
                      />
                      <Text style={styles.customApplyText}>Apply range</Text>
                    </Pressable>
                  </View>
                </View>
              )
            ) : null}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {(["All archive", "Special Events"] as const).map((scope) => (
                <Pressable
                  key={scope}
                  onPress={() => {
                    setArchiveScope(scope);
                    setArchivePage(0);
                  }}
                  style={[
                    styles.filterChip,
                    archiveScope === scope && styles.filterChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      archiveScope === scope && styles.filterTextActive,
                    ]}
                  >
                    {scope}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {(
                [
                  "Newest first",
                  "Oldest first",
                  "Impact low → high",
                  "Impact high → low",
                ] as const
              ).map((order) => (
                <Pressable
                  key={order}
                  onPress={() => {
                    setArchiveOrder(order);
                    setArchivePage(0);
                  }}
                  style={[
                    styles.filterChip,
                    archiveOrder === order && styles.filterChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      archiveOrder === order && styles.filterTextActive,
                    ]}
                  >
                    {order}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {(
                ["All sentiment", "Positive", "Neutral", "Negative"] as const
              ).map((sentiment) => (
                <Pressable
                  key={sentiment}
                  onPress={() => {
                    setArchiveSentiment(sentiment);
                    setArchivePage(0);
                  }}
                  style={[
                    styles.filterChip,
                    archiveSentiment === sentiment && styles.filterChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      archiveSentiment === sentiment && styles.filterTextActive,
                    ]}
                  >
                    {sentiment}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {newsArchive.isLoading ? (
              <Text style={styles.finnhubState}>
                Loading{" "}
                {archiveDays === 365
                  ? "one year"
                  : archiveDays === 180
                    ? "six months"
                    : `${archiveDays} days`}{" "}
                of stored verified news…
              </Text>
            ) : archiveArticles.length ? (
              <>
                <ScrollView
                  horizontal
                  pagingEnabled
                  decelerationRate="fast"
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.newspaperRail}
                  accessibilityLabel="Swipe verified news archive headlines"
                >
                  {archiveArticles.map((item) => (
                    <NewspaperArticleCard
                      key={item.id}
                      article={item}
                      onPress={() => {
                        void recordResearchEvent({
                          type: "news_open",
                          symbol: item.symbol,
                          route: "live-events",
                        });
                        setSelectedNewsArticle(item);
                      }}
                      onFlag={() => void handleFlagIrrelevant(item)}
                      flagged={false}
                    />
                  ))}
                </ScrollView>
                <View style={styles.archivePager}>
                  <Text style={styles.finnhubFootnote}>
                    {newsArchive.data?.coverage === "persisted"
                      ? `Persisted ${archiveDays === 365 ? "one-year" : `${archiveDays}-day`} market archive`
                      : "Historical coverage unavailable"}{" "}
                    · page {archivePage + 1}
                  </Text>
                  <Pressable
                    onPress={() => setArchivePage((page) => page + 1)}
                    disabled={
                      newsArchive.isFetching ||
                      (newsArchive.data?.articles.length ?? 0) < 100
                    }
                    style={({ pressed }) => [
                      styles.archiveMoreButton,
                      pressed && styles.newsItemPressed,
                      (newsArchive.isFetching ||
                        (newsArchive.data?.articles.length ?? 0) < 100) &&
                        styles.disabledButton,
                    ]}
                  >
                    <Text style={styles.archiveMoreText}>
                      {newsArchive.isFetching
                        ? "Loading…"
                        : (newsArchive.data?.articles.length ?? 0) < 100
                          ? "End of archive"
                          : "Load older"}
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={teal} />
                  </Pressable>
                </View>
              </>
            ) : (
              <Text style={styles.finnhubState}>
                {newsArchive.data?.coverage === "unavailable"
                  ? `No persisted verified news is available for the selected ${archiveDays === 365 ? "one-year" : `${archiveDays}-day`} window in ${market.country}. Provider retention or source coverage may be incomplete.`
                  : "No archived verified news is available for this scope yet."}
              </Text>
            )}
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Developing now</Text>
              <Text style={styles.sectionHint}>
                {visibleEvents.length} events
              </Text>
            </View>
          </>
        }
        renderItem={({ item }) => (
          <EventCard event={item} onPress={() => setSelectedEvent(item)} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="scan-outline" size={30} color={amber} />
            <Text style={styles.emptyTitle}>No matching events</Text>
            <Text style={styles.emptyText}>
              Try a different company, symbol, or filter.
            </Text>
          </View>
        }
      />
      {showNotifications ? (
        <Pressable
          style={styles.detailBackdrop}
          onPress={() => setShowNotifications(false)}
        >
          <Pressable
            style={styles.detailSheet}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetEyebrow}>INTELLIGENCE ALERTS</Text>
            <Text style={styles.sheetTitle}>3 items need review</Text>
            <Text style={styles.sheetBody}>
              New institutional flow, order-book, and relationship signals are
              ready to review. Alerts remain local research signals until live
              ingestion is connected.
            </Text>
            <Pressable
              style={styles.primaryButton}
              onPress={() => setShowNotifications(false)}
            >
              <Text style={styles.primaryButtonText}>Close alerts</Text>
              <Ionicons name="checkmark" size={18} color="#09111F" />
            </Pressable>
          </Pressable>
        </Pressable>
      ) : null}
      {selectedEvent ? (
        <Pressable
          style={styles.detailBackdrop}
          onPress={() => setSelectedEvent(null)}
        >
          <Pressable
            style={styles.detailSheet}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetEyebrow}>
                  {selectedEvent.dateLabel} · {selectedEvent.source}
                </Text>
                <Text style={styles.sheetTitle}>{selectedEvent.kind}</Text>
              </View>
              <ScoreRing score={selectedEvent.score} />
            </View>
            <Text style={styles.sheetBody}>{selectedEvent.relevance}</Text>
            <View style={styles.factRow}>
              <View>
                <Text style={styles.metaLabel}>RELATIONSHIP</Text>
                <Text style={styles.factValue}>
                  {selectedEvent.companyA} {selectedEvent.relationship}{" "}
                  {selectedEvent.companyB ?? "the project"}
                </Text>
              </View>
            </View>
            <View style={styles.confirmationRow}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      selectedEvent.status === "Confirmed" ? teal : violet,
                  },
                ]}
              />
              <Text style={styles.confirmationText}>
                {selectedEvent.status} · {selectedEvent.confidence} confidence
              </Text>
              <Ionicons name="open-outline" size={17} color="#91A2B8" />
            </View>
            <Pressable
              style={styles.primaryButton}
              onPress={() =>
                router.push({
                  pathname: "/company/[symbol]",
                  params: { symbol: selectedEvent.symbolA },
                })
              }
            >
              <Text style={styles.primaryButtonText}>
                View company timeline
              </Text>
              <Ionicons name="arrow-forward" size={18} color="#09111F" />
            </Pressable>
          </Pressable>
        </Pressable>
      ) : null}
      {selectedNewsArticle ? (
        <Pressable
          style={styles.detailBackdrop}
          onPress={() => setSelectedNewsArticle(null)}
        >
          <Pressable
            style={styles.detailSheet}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={styles.articleSheetHeaderCopy}>
                <Text style={styles.sheetEyebrow}>
                  {selectedNewsArticle.symbol} · {selectedNewsArticle.source}
                </Text>
                <Text style={styles.sheetTitle}>
                  {selectedNewsArticle.headline}
                </Text>
              </View>
              <ScoreRing score={selectedNewsArticle.impact_score} />
            </View>
            <Text style={styles.articleSummary}>
              {selectedNewsArticle.summary ||
                "Summary unavailable from the source provider."}
            </Text>
            <Text style={styles.articleMeta}>
              {new Date(selectedNewsArticle.published_at).toLocaleString()} ·{" "}
              {selectedNewsArticle.sentiment} sentiment
            </Text>
            <Text style={styles.articleSectionLabel}>WHY THIS SCORE</Text>
            <View style={styles.scoreBreakdown}>
              <View style={styles.scoreBreakdownRow}>
                <Text style={styles.scoreBreakdownLabel}>Sentiment signal</Text>
                <Text style={styles.scoreBreakdownValue}>
                  +{selectedArticleSentimentPoints} / 70
                </Text>
              </View>
              <Text style={styles.scoreBreakdownHint}>
                {selectedNewsArticle.sentiment} language detected in the
                extracted article content.
              </Text>
              <View style={styles.scoreBreakdownRow}>
                <Text style={styles.scoreBreakdownLabel}>
                  Catalyst evidence
                </Text>
                <Text style={styles.scoreBreakdownValue}>
                  +{selectedArticleCatalystPoints} / 25
                </Text>
              </View>
              <Text style={styles.scoreBreakdownHint}>
                {hasCatalystEvidence(selectedNewsArticle.actionable_impact)
                  ? selectedNewsArticle.actionable_impact
                  : "No recognized catalyst evidence; score is not boosted."}
              </Text>
              <View style={styles.scoreBreakdownTotal}>
                <Text style={styles.scoreBreakdownLabel}>
                  Final impact score
                </Text>
                <Text style={styles.scoreBreakdownValue}>
                  {selectedNewsArticle.impact_score} / 100
                </Text>
              </View>
            </View>
            <Text style={styles.articleSectionLabel}>SOURCE</Text>
            <Text style={styles.articleUrl} numberOfLines={2}>
              {selectedNewsArticle.url}
            </Text>
            <Pressable
              disabled={!selectedArticleHasSourceLink}
              style={[
                styles.primaryButton,
                !selectedArticleHasSourceLink && styles.disabledButton,
              ]}
              onPress={() => {
                if (selectedArticleHasSourceLink)
                  void Linking.openURL(selectedNewsArticle.url);
              }}
            >
              <Text style={styles.primaryButtonText}>
                {selectedArticleHasSourceLink
                  ? "Open original news source"
                  : "Original source unavailable"}
              </Text>
              <Ionicons name="open-outline" size={18} color="#09111F" />
            </Pressable>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => setSelectedNewsArticle(null)}
            >
              <Text style={styles.secondaryButtonText}>Close article</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  deepResearchCard: { marginTop: 14, borderTopWidth: 1, borderTopColor: "#26364D", paddingTop: 12 },
  deepResearchHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  deepResearchEyebrow: { color: "#F4B860", fontSize: 10, fontWeight: "900", letterSpacing: 1.3 },
  deepResearchCount: { color: "#F4B860", fontSize: 15, fontWeight: "900" },
  deepResearchNote: { color: "#91A2B8", fontSize: 10, lineHeight: 15, marginTop: 6, marginBottom: 4 },
  deepResearchRow: { backgroundColor: "#17253A", borderWidth: 1, borderColor: "#26364D", borderRadius: 11, padding: 10, marginTop: 8 },
  deepResearchTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  deepResearchLabel: { color: "#4FD1C5", fontSize: 10, fontWeight: "800", flex: 1 },
  deepResearchSymbol: { color: "#F4B860", fontSize: 10, fontWeight: "900" },
  deepResearchHeadline: { color: "#F4F7FB", fontSize: 12, lineHeight: 17, marginTop: 5 },
  deepResearchMatch: { color: "#6E7D92", fontSize: 9, marginTop: 5 },
  deepResearchTimes: { marginTop: 7, borderTopWidth: 1, borderTopColor: "#26364D", paddingTop: 6 },
  deepResearchTime: { color: "#B8C6D6", fontSize: 9, lineHeight: 14 },
  deepResearchUpdate: { color: "#F4B860", fontSize: 9, fontWeight: "800", marginTop: 3 },
  deepResearchExcluded: { color: "#6E7D92", fontSize: 9, lineHeight: 14, marginTop: 4, fontStyle: "italic" },
  filingIntelCard: { backgroundColor: "#111C2D", borderRadius: 12, borderWidth: 1, borderColor: "#26364D", padding: 12, marginTop: 12 },
  filingIntelArrow: { color: "#4FD1C5", fontSize: 15, fontWeight: "800" },
  filingIntelBody: { color: "#B8C6D6", fontSize: 10, lineHeight: 15, marginTop: 6 },
  listContent: { paddingBottom: 44 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    paddingBottom: 18,
  },
  releaseIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 5,
  },
  releaseIdentityText: {
    color: "#91A2B8",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.25,
  },
  releaseIdentityDot: { width: 6, height: 6, borderRadius: 3 },
  eyebrow: {
    color: amber,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "700",
  },
  title: {
    color: "#F4F7FB",
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -1,
    marginTop: 5,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  bellButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#26364D",
    backgroundColor: "#111C2D",
    alignItems: "center",
    justifyContent: "center",
  },
  bellBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    backgroundColor: coral,
    width: 17,
    height: 17,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#09111F",
  },
  bellBadgeText: { color: "#09111F", fontSize: 9, fontWeight: "800" },
  marketSwitcher: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 13,
    backgroundColor: "#101F2B",
    borderWidth: 1,
    borderColor: "#28505A",
  },
  marketSwitcherIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "#17333B",
    alignItems: "center",
    justifyContent: "center",
  },
  marketSwitcherCopy: { flex: 1 },
  marketSwitcherLabel: {
    color: amber,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },
  marketSwitcherTitle: {
    color: "#F4F7FB",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 3,
  },
  marketSwitcherMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  marketSwitcherCoverage: { color: teal, fontSize: 8, fontWeight: "900" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#111C2D",
    borderWidth: 1,
    borderColor: "#26364D",
    borderRadius: 15,
    paddingHorizontal: 13,
    height: 50,
  },
  liveSearchSuggestions: {
    marginTop: 6,
    padding: 8,
    borderRadius: 13,
    backgroundColor: "#111C2D",
    borderWidth: 1,
    borderColor: "#26364D",
  },
  liveSearchSuggestion: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    paddingHorizontal: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#22324A",
  },
  liveSearchName: { color: "#F4F7FB", fontSize: 11, fontWeight: "700" },
  liveSearchMeta: { color: "#6E7D92", fontSize: 8, marginTop: 3 },
  liveSearchHint: { color: "#91A2B8", fontSize: 10, padding: 8 },
  searchInput: { flex: 1, color: "#F4F7FB", fontSize: 14 },
  filterRow: { gap: 8, paddingVertical: 16 },
  filterChip: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#26364D",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#111C2D",
  },
  filterChipActive: { backgroundColor: amber, borderColor: amber },
  filterText: { color: "#91A2B8", fontSize: 12, fontWeight: "600" },
  filterTextActive: { color: "#09111F" },
  researchPulse: {
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#171B32",
    borderWidth: 1,
    borderColor: "#3A3563",
  },
  researchPulseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  researchPulseBody: {
    color: "#A5B7C7",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 8,
  },
  pulseMetrics: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#2B2C4E",
  },
  pulseMetricValue: { color: "#F4F7FB", fontSize: 16, fontWeight: "800" },
  pulseMetricLabel: {
    color: "#6E7D92",
    fontSize: 8,
    letterSpacing: 0.7,
    fontWeight: "800",
    marginTop: 3,
  },
  pulseActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 13,
  },
  pulseAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: "#111C2D",
    borderWidth: 1,
    borderColor: "#33465F",
  },
  pulseActionText: { color: "#D9E4F0", fontSize: 10, fontWeight: "700" },
  liveSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 13,
    backgroundColor: "#102B2C",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#235557",
  },
  livePulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: teal },
  liveText: {
    color: teal,
    fontSize: 10,
    letterSpacing: 1.1,
    fontWeight: "800",
  },
  liveSubtext: { flex: 1, color: "#A5B7C7", fontSize: 11 },
  finnhubCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#111C2D",
    borderWidth: 1,
    borderColor: "#26364D",
  },
  finnhubHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  finnhubEyebrow: {
    color: amber,
    fontSize: 9,
    letterSpacing: 1.1,
    fontWeight: "800",
  },
  finnhubTitle: {
    color: "#F4F7FB",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 4,
  },
  sourcePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: teal + "15",
    borderWidth: 1,
    borderColor: teal + "55",
  },
  sourcePillError: { backgroundColor: coral + "15", borderColor: coral + "55" },
  sourceDot: { width: 6, height: 6, borderRadius: 3 },
  sourceText: { fontSize: 9, fontWeight: "800" },
  snapshotUnavailable: { gap: 8 },
  snapshotRetry: { alignSelf: "flex-start", borderWidth: 1, borderColor: amber + "88", borderRadius: 9, paddingHorizontal: 11, paddingVertical: 7 },
  snapshotRetryText: { color: amber, fontSize: 10, fontWeight: "800" },
  snapshotDiagnostic: { color: "#6E7D92", fontSize: 10, lineHeight: 15 },
  finnhubState: {
    color: "#91A2B8",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 12,
  },
  newsInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  newsFocusInput: {
    flex: 1,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#09111F",
    borderWidth: 1,
    borderColor: "#33465F",
    color: "#F4F7FB",
    fontSize: 11,
  },
  refreshNewsButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#33465F",
    backgroundColor: "#111C2D",
    alignItems: "center",
    justifyContent: "center",
  },
  quoteRow: {
    flexDirection: "row",
    gap: 20,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#26364D",
  },
  quoteLabel: {
    color: "#6E7D92",
    fontSize: 8,
    letterSpacing: 0.8,
    fontWeight: "800",
  },
  quoteValue: {
    color: "#F4F7FB",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 4,
  },
  newsList: {
    marginTop: 13,
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#26364D",
  },
  newspaperRail: { marginTop: 13, paddingBottom: 4 },
  newspaperCard: {
    width: 318,
    minHeight: 218,
    marginRight: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#151F32",
    borderWidth: 1,
    borderColor: "#3A4A62",
  },
  newspaperTopline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  newspaperKicker: {
    color: amber,
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: "800",
    flex: 1,
  },
  newspaperSentiment: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  newspaperSentimentText: {
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  newspaperHeadline: {
    color: "#F4F7FB",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    marginTop: 15,
  },
  newspaperSummary: {
    color: "#A5B7C7",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 10,
  },
  newspaperDivider: { height: 1, backgroundColor: "#2B3A50", marginTop: 15 },
  newspaperFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  irrelevantButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: 10,
    paddingVertical: 5,
    paddingHorizontal: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#33465F",
    backgroundColor: "#0D1728",
  },
  irrelevantButtonFlagged: {
    borderColor: teal + "66",
    backgroundColor: teal + "12",
  },
  irrelevantButtonText: { color: "#91A2B8", fontSize: 9, fontWeight: "700" },
  newspaperSource: { flex: 1 },
  newspaperSourceText: {
    color: "#7F91A6",
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 0.2,
    textTransform: "lowercase",
  },
  newspaperTime: { color: "#6E7D92", fontSize: 8, marginTop: 4 },
  newspaperImpact: { alignItems: "center", minWidth: 42 },
  newspaperImpactValue: { fontSize: 18, fontWeight: "900" },
  newspaperImpactLabel: {
    color: "#6E7D92",
    fontSize: 7,
    letterSpacing: 0.7,
    fontWeight: "800",
    marginTop: 2,
  },
  newsItem: { flexDirection: "row", gap: 8, alignItems: "center" },
  newsItemPressed: { opacity: 0.7 },
  newsBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: amber,
    marginTop: 5,
  },
  newsCopy: { flex: 1 },
  newsHeadline: {
    color: "#F4F7FB",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
  },
  newsMeta: { color: "#6E7D92", fontSize: 8, marginTop: 4 },
  finnhubFootnote: { color: "#6E7D92", fontSize: 8, marginTop: 12 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 25,
    marginBottom: 12,
  },
  sectionTitle: { color: "#F4F7FB", fontSize: 18, fontWeight: "700" },
  sectionHint: { color: "#6E7D92", fontSize: 12 },
  archiveExportRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  archiveExportLabel: {
    color: "#6E7D92",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginRight: 2,
  },
  archiveExportButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "#26364D",
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: "#111C2D",
  },
  archiveExportText: { color: teal, fontSize: 9, fontWeight: "900" },
  archiveExportMessage: { color: teal, fontSize: 9, marginTop: 7 },
  archiveExportProgressWrap: { marginTop: 8, gap: 5 },
  archiveExportProgressTrack: {
    height: 5,
    borderRadius: 4,
    backgroundColor: "#26364D",
    overflow: "hidden",
  },
  archiveExportProgressFill: {
    height: 5,
    borderRadius: 4,
    backgroundColor: teal,
  },
  archiveExportProgressText: { color: "#91A2B8", fontSize: 9 },
  archiveIntro: {
    color: "#91A2B8",
    fontSize: 11,
    lineHeight: 16,
    marginTop: -4,
    marginBottom: 2,
  },
  archiveCoverageWarning: {
    color: amber,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 6,
    padding: 8,
    borderRadius: 9,
    backgroundColor: amber + "12",
    borderWidth: 1,
    borderColor: amber + "33",
  },
  archiveSourceCoverage: {
    marginTop: 8,
    padding: 9,
    borderRadius: 10,
    backgroundColor: "#0D1728",
    borderWidth: 1,
    borderColor: "#26364D",
    gap: 6,
  },
  archiveSourceCoverageTitle: {
    color: "#6E7D92",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  archiveSourceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  archiveSourceName: {
    flex: 1,
    color: "#F4F7FB",
    fontSize: 10,
    fontWeight: "700",
  },
  archiveSourceMeta: { color: "#91A2B8", fontSize: 9 },
  archiveSourceToggle: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
    paddingVertical: 3,
  },
  archiveSourceToggleText: {
    color: teal,
    fontSize: 10,
    fontWeight: "800",
  },
  archivePager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 8,
  },
  archiveMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: teal + "66",
    backgroundColor: teal + "12",
  },
  archiveMoreText: { color: teal, fontSize: 10, fontWeight: "800" },
  customRangeCard: {
    marginTop: 8,
    padding: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: amber + "55",
    backgroundColor: "#0D1728",
  },
  customRangeTitle: { color: "#F4F7FB", fontSize: 12, fontWeight: "800" },
  customRangeHint: {
    color: "#91A2B8",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 5,
  },
  customDateRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  customDateField: { flex: 1 },
  customDateLabel: {
    color: "#6E7D92",
    fontSize: 8,
    letterSpacing: 0.8,
    fontWeight: "800",
    marginBottom: 5,
  },
  customDateInput: {
    color: "#F4F7FB",
    backgroundColor: "#111C2D",
    borderWidth: 1,
    borderColor: "#33465F",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 8,
    fontSize: 10,
  },
  customDateInputButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    backgroundColor: "#111C2D",
    borderWidth: 1,
    borderColor: "#33465F",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 9,
  },
  customDateInputText: { color: "#D9E4F0", fontSize: 10 },
  customRangeError: {
    color: coral,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 9,
  },
  customRangeActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    marginTop: 11,
  },
  customApplyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: amber,
  },
  customApplyText: { color: "#08111F", fontSize: 10, fontWeight: "800" },
  eventCard: {
    backgroundColor: "#111C2D",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#26364D",
    padding: 16,
    marginBottom: 12,
  },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  eventTopline: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timeWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  timeDot: { width: 8, height: 8, borderRadius: 4 },
  eventTime: { color: "#F4F7FB", fontSize: 13, fontWeight: "700" },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: "700" },
  eventKind: {
    color: amber,
    fontSize: 10,
    letterSpacing: 1.3,
    fontWeight: "800",
    marginTop: 14,
  },
  eventTitle: {
    color: "#F4F7FB",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    marginTop: 5,
  },
  relationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 13,
  },
  entityChip: {
    backgroundColor: "#1D3C4A",
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  entityChipAlt: { backgroundColor: "#2B2549" },
  entityText: { color: "#B4F2E9", fontSize: 10, fontWeight: "800" },
  relationText: { color: "#91A2B8", fontSize: 11, flexShrink: 1 },
  eventMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    marginTop: 16,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: "#26364D",
  },
  metaBlock: { flex: 1 },
  metaLabel: {
    color: "#6E7D92",
    fontSize: 9,
    letterSpacing: 0.9,
    fontWeight: "700",
  },
  metaValue: {
    color: "#F4F7FB",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  scoreRing: {
    width: 43,
    height: 43,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: amber,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreValue: { color: amber, fontSize: 14, lineHeight: 15, fontWeight: "800" },
  scoreLabel: {
    color: "#91A2B8",
    fontSize: 6,
    letterSpacing: 0.5,
    fontWeight: "800",
  },
  empty: { alignItems: "center", paddingTop: 50, gap: 8 },
  emptyTitle: { color: "#F4F7FB", fontSize: 17, fontWeight: "700" },
  emptyText: { color: "#91A2B8", fontSize: 13 },
  detailBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#00000099",
    justifyContent: "flex-end",
  },
  detailSheet: {
    backgroundColor: "#111C2D",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: "#26364D",
    padding: 20,
    paddingBottom: 28,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 3,
    backgroundColor: "#486078",
    alignSelf: "center",
    marginBottom: 20,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sheetEyebrow: { color: "#91A2B8", fontSize: 11 },
  sheetTitle: {
    color: "#F4F7FB",
    fontSize: 23,
    fontWeight: "800",
    marginTop: 5,
  },
  sheetBody: { color: "#B8C6D6", fontSize: 14, lineHeight: 21, marginTop: 17 },
  articleSheetHeaderCopy: { flex: 1, paddingRight: 12 },
  articleSummary: {
    color: "#B8C6D6",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 15,
  },
  articleMeta: { color: "#6E7D92", fontSize: 10, marginTop: 9 },
  articleSectionLabel: {
    color: amber,
    fontSize: 9,
    letterSpacing: 1.1,
    fontWeight: "800",
    marginTop: 18,
    marginBottom: 8,
  },
  scoreBreakdown: {
    backgroundColor: "#09111F",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#26364D",
    padding: 12,
  },
  scoreBreakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  scoreBreakdownLabel: { color: "#F4F7FB", fontSize: 12, fontWeight: "700" },
  scoreBreakdownValue: { color: teal, fontSize: 12, fontWeight: "800" },
  scoreBreakdownHint: {
    color: "#91A2B8",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 5,
  },
  scoreBreakdownTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#26364D",
    marginTop: 12,
    paddingTop: 12,
  },
  articleUrl: { color: "#91A2B8", fontSize: 10, lineHeight: 15 },
  disabledButton: { backgroundColor: "#334155" },
  secondaryButton: {
    alignItems: "center",
    justifyContent: "center",
    height: 42,
    marginTop: 8,
  },
  secondaryButtonText: { color: "#B8C6D6", fontSize: 13, fontWeight: "700" },
  factRow: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#26364D",
  },
  factValue: {
    color: "#F4F7FB",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 5,
  },
  confirmationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 15,
  },
  confirmationText: { flex: 1, color: "#B8C6D6", fontSize: 12 },
  adminLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#26364D",
    marginTop: 13,
    paddingTop: 13,
  },
  adminLinkText: { color: teal, fontSize: 12, fontWeight: "800" },
  primaryButton: {
    backgroundColor: amber,
    borderRadius: 14,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  primaryButtonText: { color: "#09111F", fontSize: 14, fontWeight: "800" },
});

/**
 * The fallback card shown whenever data for the ACTIVE market is missing, still
 * loading, or failed.
 *
 * The rule it enforces: a market-dependent surface never renders another market's
 * data and never renders an empty hole. It shows what is unavailable, for which
 * market, and why — and offers a retry when one is possible.
 *
 * Pure presentation. It never fetches and never substitutes.
 */
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useMarketContext } from "@/lib/market-context";

export type MarketUnavailableKind = "loading" | "unavailable" | "error";

export type MarketUnavailableCardProps = {
  kind: MarketUnavailableKind;
  /** What is unavailable, e.g. "Institutional flows". */
  subject: string;
  /** Why, in one honest sentence. Comes from the coverage model where available. */
  reason?: string;
  /** Shown only when a retry could actually help. */
  onRetry?: () => void;
  /** Override the market label; defaults to the active market's country. */
  marketLabel?: string;
};

const amber = "#F4B860";
const muted = "#91A2B8";
const ink = "#F4F7FB";
const coral = "#FB7185";
const panel = "#111C2D";
const border = "#26364D";

export function MarketUnavailableCard({
  kind,
  subject,
  reason,
  onRetry,
  marketLabel,
}: MarketUnavailableCardProps) {
  const { market } = useMarketContext();
  const label = marketLabel ?? market.country;

  const colour = kind === "loading" ? amber : kind === "error" ? coral : muted;
  const icon = kind === "loading" ? "cloud-download-outline" : kind === "error" ? "alert-circle-outline" : "lock-closed-outline";
  const heading =
    kind === "loading"
      ? `Loading ${subject} for ${label}…`
      : kind === "error"
        ? `${subject} could not be loaded for ${label}`
        : `${subject} is not available for ${label}`;

  return (
    <View style={[styles.card, { borderColor: `${colour}66` }]}>
      <Ionicons name={icon} size={18} color={colour} />
      <View style={styles.copy}>
        <Text style={styles.title}>{heading}</Text>
        {/* The Hindi label the mandate asks for, alongside the English. */}
        <Text style={styles.hindi}>उपलब्ध नहीं</Text>
        <Text style={styles.reason}>
          {reason ??
            (kind === "loading"
              ? "This is still being fetched; the card updates when it arrives."
              : kind === "error"
                ? "The source did not respond. Nothing from another market is shown in its place."
                : "AnalyzerX shows nothing here rather than another market's figures.")}
        </Text>
      </View>
      {onRetry && kind !== "loading" ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Retry loading ${subject} for ${label}`}
        >
          <Ionicons name="refresh-outline" size={13} color={amber} />
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Convenience wrapper: render the card when a market-scoped query is loading, errored
 * or empty, and render nothing otherwise.
 */
export function MarketDataFallback({
  subject,
  reason,
  isLoading,
  isError,
  isEmpty,
  onRetry,
}: {
  subject: string;
  reason?: string;
  isLoading?: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  onRetry?: () => void;
}) {
  if (isLoading) return <MarketUnavailableCard kind="loading" subject={subject} reason={reason} />;
  if (isError) return <MarketUnavailableCard kind="error" subject={subject} reason={reason} onRetry={onRetry} />;
  if (isEmpty) return <MarketUnavailableCard kind="unavailable" subject={subject} reason={reason} onRetry={onRetry} />;
  return null;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 9,
    backgroundColor: panel,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
  },
  copy: { flex: 1 },
  title: { color: ink, fontSize: 13, fontWeight: "800" },
  hindi: { color: muted, fontSize: 10, marginTop: 2 },
  reason: { color: muted, fontSize: 10, lineHeight: 15, marginTop: 6 },
  retry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: `${amber}66`,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  retryText: { color: amber, fontSize: 10, fontWeight: "800" },
  pressed: { opacity: 0.75 },
});

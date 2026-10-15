/**
 * First-launch onboarding.
 *
 * The gap this fills: there was no first-launch flow at all. `app/_layout.tsx` went
 * straight to `/(tabs)` on the default market, and the country screen was only reachable
 * if the user found it through the Account screen or the market chip. So a new user never
 * chose a country, and no country's data was ever knowingly requested.
 *
 * This screen is shown once, before the tabs. The user picks one or more countries, and
 * each becomes a queued download rather than being assumed ready.
 */
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { ScreenContainer } from "@/components/screen-container";
import { MARKET_PROFILES, type MarketId } from "@/lib/market-regions";
import { completeOnboarding, loadMarketLifecycles, saveMarketLifecycle, type MarketLifecycleRecord } from "@/lib/market-lifecycle";
import { useMarketContext } from "@/lib/market-context";

const amber = "#F4B860";
const teal = "#4FD1C5";
const muted = "#6E7D92";

export default function OnboardingScreen() {
  const { setMarketId } = useMarketContext();
  const [selected, setSelected] = useState<MarketId[]>(["IN"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const countries = useMemo(() => MARKET_PROFILES.map((profile) => profile), []);

  const toggle = useCallback((id: MarketId) => {
    setSelected((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  }, []);

  const proceed = useCallback(async () => {
    if (!selected.length) {
      setError("Choose at least one country to continue.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Record the choice first, so an interruption mid-download still leaves onboarding
      // complete and the queued countries recoverable.
      await completeOnboarding(selected);
      const all = await loadMarketLifecycles();
      // Mark every chosen country as queued rather than ready: nothing has been fetched
      // yet, and the switcher must not claim otherwise.
      await Promise.all(
        selected.map((id) => {
          const record: MarketLifecycleRecord = all[id];
          return record.state === "not-downloaded" ? saveMarketLifecycle({ ...record, state: "queued" }) : Promise.resolve(record);
        }),
      );
      // Activate the first choice so the app opens on something the user asked for.
      await setMarketId(selected[0]);
      router.replace("/(tabs)");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Onboarding could not be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [selected, setMarketId]);

  return (
    <ScreenContainer className="px-5">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View style={styles.logo}>
            <Ionicons name="pulse" size={26} color="#09111F" />
          </View>
          <Text style={styles.eyebrow}>WELCOME TO ANALYZERX</Text>
          <Text style={styles.title}>Choose your markets</Text>
          <Text style={styles.subtitle}>
            AnalyzerX keeps each country's data separate — its own symbols, news, filings and storage. Pick the ones you want; you can add or remove them later from the market switcher.
          </Text>
        </View>

        <View style={styles.selectionBar}>
          <Text style={styles.selectionText}>{selected.length} selected</Text>
          <Pressable onPress={() => setSelected(MARKET_PROFILES.map((p) => p.id))} accessibilityRole="button" accessibilityLabel="Select all countries">
            <Text style={styles.selectAll}>Select all</Text>
          </Pressable>
        </View>

        {countries.map((profile) => {
          const active = selected.includes(profile.id);
          return (
            <Pressable
              key={profile.id}
              onPress={() => toggle(profile.id)}
              style={[styles.card, active && styles.cardActive]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`${profile.country}, ${profile.coverage} coverage`}
            >
              <View style={styles.cardTop}>
                <View style={styles.check}>
                  <Ionicons name={active ? "checkbox" : "square-outline"} size={20} color={active ? teal : muted} />
                </View>
                <View style={styles.cardCopy}>
                  <Text style={styles.country}>{profile.country}</Text>
                  <Text style={styles.meta}>
                    {profile.region} · {profile.exchanges.join(" / ")} · {profile.currency}
                  </Text>
                </View>
                <View style={[styles.coveragePill, profile.coverage === "deep" ? styles.deep : profile.coverage === "broad" ? styles.broad : styles.standard]}>
                  <Text style={styles.coverageText}>{profile.coverage.toUpperCase()}</Text>
                </View>
              </View>
              <Text style={styles.examples}>Examples: {profile.tickerExamples.join(", ")}</Text>
              <Text style={styles.note}>{profile.notes}</Text>
            </Pressable>
          );
        })}

        {error ? (
          <View style={styles.error}>
            <Ionicons name="alert-circle-outline" size={16} color="#FB7185" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable onPress={proceed} disabled={busy} style={[styles.primary, busy && styles.disabled]} accessibilityRole="button" accessibilityLabel="Download selected countries and continue">
          {busy ? <ActivityIndicator color="#09111F" /> : (
            <>
              <Ionicons name="cloud-download-outline" size={17} color="#09111F" />
              <Text style={styles.primaryText}>
                {selected.length === 1 ? `Set up ${MARKET_PROFILES.find((p) => p.id === selected[0])?.country}` : `Set up ${selected.length} countries`}
              </Text>
            </>
          )}
        </Pressable>

        <Text style={styles.footnote}>
          Countries you pick are queued, not assumed ready. Nothing is downloaded until the app fetches it, and each country's data stays in its own namespace so one market's figures can never appear under another's.
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  hero: { paddingTop: 28, alignItems: "flex-start" },
  logo: { width: 52, height: 52, borderRadius: 16, backgroundColor: amber, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  eyebrow: { color: amber, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: "#F4F7FB", fontSize: 30, fontWeight: "900", letterSpacing: -0.9, marginTop: 6 },
  subtitle: { color: "#91A2B8", fontSize: 13, lineHeight: 20, marginTop: 12 },
  selectionBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 22, marginBottom: 10 },
  selectionText: { color: "#F4F7FB", fontSize: 12, fontWeight: "800" },
  selectAll: { color: teal, fontSize: 11, fontWeight: "800" },
  card: { padding: 13, borderRadius: 15, backgroundColor: "#111C2D", borderWidth: 1, borderColor: "#26364D", marginBottom: 10 },
  cardActive: { borderColor: teal, backgroundColor: "#102B2C" },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  check: { width: 24, alignItems: "center" },
  cardCopy: { flex: 1 },
  country: { color: "#F4F7FB", fontSize: 15, fontWeight: "800" },
  meta: { color: "#91A2B8", fontSize: 10, marginTop: 3 },
  coveragePill: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  deep: { borderColor: teal + "88", backgroundColor: teal + "16" },
  broad: { borderColor: amber + "88", backgroundColor: amber + "16" },
  standard: { borderColor: muted + "88", backgroundColor: muted + "16" },
  coverageText: { color: "#F4F7FB", fontSize: 8, fontWeight: "900" },
  examples: { color: "#6E7D92", fontSize: 10, marginTop: 9 },
  note: { color: "#91A2B8", fontSize: 10, lineHeight: 15, marginTop: 6 },
  error: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 6, padding: 11, borderRadius: 11, backgroundColor: "#2C1823", borderWidth: 1, borderColor: "#6C3045" },
  errorText: { color: "#E4A9B8", fontSize: 11, flex: 1 },
  primary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, borderRadius: 14, backgroundColor: amber, marginTop: 18 },
  primaryText: { color: "#09111F", fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.6 },
  footnote: { color: "#6E7D92", fontSize: 10, lineHeight: 15, marginTop: 16 },
});

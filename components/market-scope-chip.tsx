import Ionicons from "react-native-vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useMarketContext } from "@/lib/market-context";

export function MarketScopeChip({ compact = false }: { compact?: boolean }) {
  const { market, syncStatus } = useMarketContext();
  return (
    <Pressable onPress={() => router.push("/market-country")} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: compact ? 8 : 10, paddingVertical: compact ? 6 : 8, borderRadius: 10, backgroundColor: "#101F2B", borderWidth: 1, borderColor: syncStatus === "conflict" ? "#8B6A31" : "#28505A" }, pressed && { opacity: 0.72 }]} accessibilityRole="button" accessibilityLabel={`Change market, currently ${market.country}`}>
      <Ionicons name="globe-outline" size={compact ? 13 : 15} color="#F4B860" />
      <View style={{ flex: 1 }}>
        <Text style={{ color: "#F4B860", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 }}>MARKET</Text>
        <Text style={{ color: "#F4F7FB", fontSize: compact ? 10 : 11, fontWeight: "800", marginTop: 2 }}>{market.country} · {market.currency}</Text>
      </View>
      {syncStatus === "conflict" ? <Text style={{ color: "#F4B860", fontSize: 7, fontWeight: "900" }}>REVIEW</Text> : null}
      <Ionicons name="chevron-forward" size={14} color="#91A2B8" />
    </Pressable>
  );
}

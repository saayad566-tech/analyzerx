import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.tint, tabBarInactiveTintColor: "#6E7D92", tabBarButton: HapticTab, tabBarStyle: { paddingTop: 8, paddingBottom: bottomPadding, height: 56 + bottomPadding, backgroundColor: "#09111F", borderTopColor: "#26364D", borderTopWidth: 0.5 }, tabBarLabelStyle: { fontSize: 10, fontWeight: "700" } }}>
    <Tabs.Screen name="index" options={{ title: "Live", tabBarIcon: ({ color }) => <IconSymbol size={22} name="dot.radiowaves.left.and.right" color={color} /> }} />
    <Tabs.Screen name="storylines" options={{ title: "Stories", tabBarIcon: ({ color }) => <IconSymbol size={22} name="point.3.connected.trianglepath.dotted" color={color} /> }} />
    <Tabs.Screen name="graph" options={{ title: "Graph", tabBarIcon: ({ color }) => <IconSymbol size={22} name="circle.grid.3x3.fill" color={color} /> }} />
    <Tabs.Screen name="sectors" options={{ title: "Sectors", tabBarIcon: ({ color }) => <IconSymbol size={22} name="chart.bar.xaxis" color={color} /> }} />
    <Tabs.Screen name="flows" options={{ title: "Flows", tabBarIcon: ({ color }) => <IconSymbol size={22} name="chart.bar.xaxis" color={color} /> }} />
    <Tabs.Screen name="screener" options={{ title: "Screener", tabBarIcon: ({ color }) => <IconSymbol size={22} name="sparkles" color={color} /> }} />
    <Tabs.Screen name="assistant" options={{ title: "Assistant", tabBarIcon: ({ color }) => <IconSymbol size={22} name="bubble.left.and.bubble.right.fill" color={color} /> }} />
    <Tabs.Screen name="alerts" options={{ title: "Alerts", tabBarIcon: ({ color }) => <IconSymbol size={22} name="bell.fill" color={color} /> }} />
  </Tabs>;
}

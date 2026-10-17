/**
 * The tab navigator.
 *
 * expo-router read this file as the `(tabs)` layout. It is now an explicit React Navigation tab
 * navigator, which is what the route tree in `lib/navigation/root-navigator.tsx` mounts. The tab
 * set, titles and icons are unchanged; the bar styling now comes from the design tokens so the
 * chrome matches the panels on every screen.
 */
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { ROUTES } from "@/lib/navigation/routes";
import { color, radius, space } from "@/lib/design/tokens";

const Tab = createBottomTabNavigator();

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const screenOptions = {
    headerShown: false,
    tabBarActiveTintColor: color.accent,
    tabBarInactiveTintColor: color.textFaint,
    tabBarButton: HapticTab,
    tabBarStyle: {
      paddingTop: space.sm,
      paddingBottom: bottomPadding,
      height: 56 + bottomPadding,
      backgroundColor: color.canvasRaised,
      borderTopColor: color.border,
      borderTopWidth: 0.5,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
    },
    tabBarLabelStyle: { fontSize: 10, fontWeight: "700" as const },
  };
  return (
    <Tab.Navigator screenOptions={screenOptions}>
      <Tab.Screen name="index" component={ROUTES["/(tabs)/index"]} options={{ title: "Live", tabBarIcon: ({ color: c }: { color: string }) => <IconSymbol size={22} name="dot.radiowaves.left.and.right" color={c} /> }} />
      <Tab.Screen name="storylines" component={ROUTES["/(tabs)/storylines"]} options={{ title: "Stories", tabBarIcon: ({ color: c }: { color: string }) => <IconSymbol size={22} name="point.3.connected.trianglepath.dotted" color={c} /> }} />
      <Tab.Screen name="graph" component={ROUTES["/(tabs)/graph"]} options={{ title: "Graph", tabBarIcon: ({ color: c }: { color: string }) => <IconSymbol size={22} name="circle.grid.3x3.fill" color={c} /> }} />
      <Tab.Screen name="sectors" component={ROUTES["/(tabs)/sectors"]} options={{ title: "Sectors", tabBarIcon: ({ color: c }: { color: string }) => <IconSymbol size={22} name="chart.bar.xaxis" color={c} /> }} />
      <Tab.Screen name="flows" component={ROUTES["/(tabs)/flows"]} options={{ title: "Flows", tabBarIcon: ({ color: c }: { color: string }) => <IconSymbol size={22} name="chart.bar.xaxis" color={c} /> }} />
      <Tab.Screen name="screener" component={ROUTES["/(tabs)/screener"]} options={{ title: "Screener", tabBarIcon: ({ color: c }: { color: string }) => <IconSymbol size={22} name="sparkles" color={c} /> }} />
      <Tab.Screen name="assistant" component={ROUTES["/(tabs)/assistant"]} options={{ title: "Assistant", tabBarIcon: ({ color: c }: { color: string }) => <IconSymbol size={22} name="bubble.left.and.bubble.right.fill" color={c} /> }} />
      <Tab.Screen name="alerts" component={ROUTES["/(tabs)/alerts"]} options={{ title: "Alerts", tabBarIcon: ({ color: c }: { color: string }) => <IconSymbol size={22} name="bell.fill" color={c} /> }} />
    </Tab.Navigator>
  );
}

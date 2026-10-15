/**
 * The tab navigator.
 *
 * expo-router read this file as the `(tabs)` layout. It is now an explicit React Navigation tab
 * navigator, which is what the route tree in `lib/navigation/root-navigator.tsx` mounts. The tab
 * set, titles, icons and bar styling are unchanged.
 */
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { ROUTES } from "@/lib/navigation/routes";

const Tab = createBottomTabNavigator();

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const screenOptions = {
    headerShown: false,
    tabBarActiveTintColor: colors.tint,
    tabBarInactiveTintColor: "#6E7D92",
    tabBarButton: HapticTab,
    tabBarStyle: {
      paddingTop: 8,
      paddingBottom: bottomPadding,
      height: 56 + bottomPadding,
      backgroundColor: "#09111F",
      borderTopColor: "#26364D",
      borderTopWidth: 0.5,
    },
    tabBarLabelStyle: { fontSize: 10, fontWeight: "700" as const },
  };
  return (
    <Tab.Navigator screenOptions={screenOptions}>
      <Tab.Screen name="index" component={ROUTES["/(tabs)/index"]} options={{ title: "Live", tabBarIcon: ({ color }: { color: string }) => <IconSymbol size={22} name="dot.radiowaves.left.and.right" color={color} /> }} />
      <Tab.Screen name="storylines" component={ROUTES["/(tabs)/storylines"]} options={{ title: "Stories", tabBarIcon: ({ color }: { color: string }) => <IconSymbol size={22} name="point.3.connected.trianglepath.dotted" color={color} /> }} />
      <Tab.Screen name="graph" component={ROUTES["/(tabs)/graph"]} options={{ title: "Graph", tabBarIcon: ({ color }: { color: string }) => <IconSymbol size={22} name="circle.grid.3x3.fill" color={color} /> }} />
      <Tab.Screen name="sectors" component={ROUTES["/(tabs)/sectors"]} options={{ title: "Sectors", tabBarIcon: ({ color }: { color: string }) => <IconSymbol size={22} name="chart.bar.xaxis" color={color} /> }} />
      <Tab.Screen name="flows" component={ROUTES["/(tabs)/flows"]} options={{ title: "Flows", tabBarIcon: ({ color }: { color: string }) => <IconSymbol size={22} name="chart.bar.xaxis" color={color} /> }} />
      <Tab.Screen name="screener" component={ROUTES["/(tabs)/screener"]} options={{ title: "Screener", tabBarIcon: ({ color }: { color: string }) => <IconSymbol size={22} name="sparkles" color={color} /> }} />
      <Tab.Screen name="assistant" component={ROUTES["/(tabs)/assistant"]} options={{ title: "Assistant", tabBarIcon: ({ color }: { color: string }) => <IconSymbol size={22} name="bubble.left.and.bubble.right.fill" color={color} /> }} />
      <Tab.Screen name="alerts" component={ROUTES["/(tabs)/alerts"]} options={{ title: "Alerts", tabBarIcon: ({ color }: { color: string }) => <IconSymbol size={22} name="bell.fill" color={color} /> }} />
    </Tab.Navigator>
  );
}

/**
 * The route tree.
 *
 * expo-router derived the stack from the `app/` file tree. React Navigation needs it declared, so
 * every non-tab route in the registry becomes a screen here, and the tab navigator is mounted as a
 * single `tabs` screen — the same shape expo-router produced from `app/(tabs)/_layout.tsx`.
 */
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import TabLayout from "@/app/(tabs)/_layout";
import { ROUTES } from "@/lib/navigation/routes";
import { TAB_TARGETS, navigationRef } from "@/lib/navigation/router";

const Stack = createNativeStackNavigator();

/** Titles the previous router declared inline for a few routes. */
const TITLES: Record<string, string> = {
  "news/[id]": "Story",
  filings: "Filing Intelligence",
};

const TAB_PATHS = new Set(Object.keys(TAB_TARGETS));
const STACK_ROUTES = Object.entries(ROUTES).filter(([path]) => !TAB_PATHS.has(path));

export default function RootNavigator() {
  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="tabs" component={TabLayout} />
        {STACK_ROUTES.map(([path, Component]) => (
          <Stack.Screen key={path} name={path} component={Component} options={TITLES[path] ? { title: TITLES[path] } : undefined} />
        ))}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

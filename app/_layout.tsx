import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, usePathname, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { BackHandler, Platform, ToastAndroid } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";

import { trpc, createTRPCClient } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";
import { WorkspaceSync } from "@/components/workspace-sync";
import { MarketProvider } from "@/lib/market-context";
import { resolveBackAction, resolveRootBackFeedback } from "@/lib/navigation-back";
import { AssistantModeGate } from "@/components/assistant-mode-gate";
import { RuntimeReadinessProbe } from "@/components/runtime-readiness-probe";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
});

function BackNavigationController() {
  const pathname = usePathname();
  const lastRootBackAt = useRef(0);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      const action = resolveBackAction(router.canGoBack(), pathname);
      if (action === "stack") {
        router.back();
      } else if (action === "home") {
        router.replace("/(tabs)");
      }
      if (action === "stay") {
        const now = Date.now();
        if (resolveRootBackFeedback(lastRootBackAt.current, now) === "exit") {
          BackHandler.exitApp();
        } else {
          lastRootBackAt.current = now;
          ToastAndroid.show("Press back again to exit AnalyzerX", ToastAndroid.SHORT);
        }
      }
      return true;
    });
    return () => subscription.remove();
  }, [pathname]);

  return null;
}

function PushRegistration() {
  const { isAuthenticated } = useAuth();
  const registerPushToken = trpc.account.pushTokenUpsert.useMutation();
  useEffect(() => {
    if (Platform.OS === "web" || !isAuthenticated) return;
    const register = async () => {
      try {
        const permissions = await Notifications.getPermissionsAsync();
        const finalStatus = permissions.status === "granted" ? permissions.status : (await Notifications.requestPermissionsAsync()).status;
        if (finalStatus !== "granted") return;
        if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("market-events", { name: "Market Events", importance: Notifications.AndroidImportance.MAX });
        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
        if (!projectId) return;
        const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        await registerPushToken.mutateAsync({ token, platform: Platform.OS === "ios" ? "ios" : "android" });
      } catch (error) {
        console.warn("[Notifications] Push registration unavailable:", error);
      }
    };
    void register();
  }, [registerPushToken, isAuthenticated]);
  return null;
}

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    initManusRuntime();
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Disable automatic refetching on window focus for mobile
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  // Ensure minimum 8px padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <MarketProvider>
          <AssistantModeGate />
          <RuntimeReadinessProbe />
          <PushRegistration />
          <BackNavigationController />
          <WorkspaceSync />
          {/* Default to hiding native headers so raw route segments don't appear (e.g. "(tabs)", "products/[id]"). */}
          {/* If a screen needs the native header, explicitly enable it and set a human title via Stack.Screen options. */}
          {/* in order for ios apps tab switching to work properly, use presentation: "fullScreenModal" for login page, whenever you decide to use presentation: "modal*/}
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="oauth/callback" />
          </Stack>
          <StatusBar style="auto" />
          </MarketProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}

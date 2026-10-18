import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePathname, router } from "@/lib/navigation/router";
import RootNavigator from "@/lib/navigation/root-navigator";
import { ErrorBoundary } from "@/components/error-boundary";
import { StatusBar } from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { BackHandler, Platform, ToastAndroid } from "react-native";
import Constants from "@/lib/platform/constants";
import { ensureMarketEventsChannel, getPermission, getPushToken, requestPermission } from "@/lib/platform/notifications";
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
import { fireAndForget, installUnhandledRejectionGuard } from "@/lib/fire-and-forget";

// Record any rejection that escapes a call site, so no background failure is ever silent.
installUnhandledRejectionGuard();

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

// Foreground presentation and the Android channel are handled by the notifications adapter
// (backed by @notifee/react-native). Expo's hosted push service is no longer used.
void ensureMarketEventsChannel();

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
        const existing = await getPermission();
        const finalStatus = existing === "granted" ? existing : await requestPermission();
        if (finalStatus !== "granted") return;
        await ensureMarketEventsChannel();
        // A device token needs a Firebase project and google-services.json. Until that exists the
        // adapter reports it plainly rather than registering a token that could never deliver.
        const token = await getPushToken();
        if (!token.available) return;
        await registerPushToken.mutateAsync({ token: token.token, platform: token.platform });
      } catch (error) {
        console.warn("[Notifications] Push registration unavailable:", error);
      }
    };
    fireAndForget(register(), "register");
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
          {/* A render error in any screen is caught here and turned into a
              recoverable screen instead of closing the app. */}
          <ErrorBoundary>
            <RootNavigator />
          </ErrorBoundary>
          <StatusBar barStyle="default" />
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

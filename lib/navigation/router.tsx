/**
 * A compatibility layer that presents the `expo-router` API on top of React Navigation.
 *
 * The 43 screens were written against expo-router's imperative `router`, its `useLocalSearchParams`
 * and friends. Re-expressing every screen as a navigator tree would be a large, behaviourally risky
 * rewrite; this module instead keeps the API they already use and maps it onto React Navigation, so
 * the screens are untouched. The route tree itself lives in `root-navigator.tsx`.
 */
import {
  CommonActions, StackActions, createNavigationContainerRef,
  useFocusEffect as useReactNavigationFocusEffect, useNavigation, useRoute,
} from "@react-navigation/native";
import { useCallback } from "react";
import type { ReactNode } from "react";
import { Pressable, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";

export type Href = string;

type NavParams = Record<string, unknown>;

/** expo-router accepted both a bare path and a `{ pathname, params }` object. */
export type HrefTarget = Href | { pathname: Href; params?: NavParams };

function normalize(target: HrefTarget): { path: Href; params?: NavParams } {
  return typeof target === "string" ? { path: target } : { path: target.pathname, params: target.params };
}

export const navigationRef = createNavigationContainerRef<Record<string, NavParams | undefined>>();

/** Paths that live inside the tab navigator, mapped to their tab screen name. */
export const TAB_TARGETS: Record<string, string> = {
  "/": "index",
  "/(tabs)": "index",
  "/index": "index",
  "/storylines": "storylines", "/(tabs)/storylines": "storylines",
  "/graph": "graph", "/(tabs)/graph": "graph",
  "/sectors": "sectors", "/(tabs)/sectors": "sectors",
  "/flows": "flows", "/(tabs)/flows": "flows",
  "/screener": "screener", "/(tabs)/screener": "screener",
  "/assistant": "assistant", "/(tabs)/assistant": "assistant",
  "/alerts": "alerts", "/(tabs)/alerts": "alerts",
};

function dispatch(target: HrefTarget, params: NavParams | undefined, replace: boolean) {
  if (!navigationRef.isReady()) return;
  const normalized = normalize(target);
  const path = normalized.path;
  params = params ?? normalized.params;
  const tab = TAB_TARGETS[path];
  if (tab) {
    // A tab path targets the tab navigator, matching expo-router's behaviour of switching tab
    // rather than pushing a second, non-tab copy of the screen.
    navigationRef.dispatch(CommonActions.navigate({ name: "tabs", params: { screen: tab, params } }));
    return;
  }
  // `CommonActions` has no `replace`; `StackActions` is where it lives.
  const action = replace
    ? StackActions.replace(path, params)
    : CommonActions.navigate({ name: path, params });
  navigationRef.dispatch(action);
}

export const router = {
  push(target: HrefTarget, params?: NavParams) { dispatch(target, params, false); },
  navigate(target: HrefTarget, params?: NavParams) { dispatch(target, params, false); },
  replace(target: HrefTarget, params?: NavParams) { dispatch(target, params, true); },
  back() { if (navigationRef.isReady() && navigationRef.canGoBack()) navigationRef.goBack(); },
  canGoBack() { return navigationRef.isReady() && navigationRef.canGoBack(); },
};

export function useRouter() { return router; }

/** The route's params, exactly as `useLocalSearchParams` returned them. */
export function useLocalSearchParams<T extends NavParams = NavParams>(): T {
  const route = useRoute();
  return (route.params ?? {}) as T;
}

/** The active route's name, in the same path form expo-router reported. */
export function usePathname(): string {
  const route = useRoute();
  return route.name;
}

export function useFocusEffect(effect: () => void | (() => void)) {
  // The caller's callback identity already encodes its dependencies, as it did before.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useReactNavigationFocusEffect(useCallback(effect, [effect]));
}

/** A pressable link. `onPress` receives an event whose `preventDefault` suppresses navigation. */
export function Link({
  href, onPress, children, style, ...rest
}: {
  href: Href;
  onPress?: (event: { preventDefault: () => void; defaultPrevented: boolean }) => void;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
} & Record<string, unknown>) {
  const handle = (_event: GestureResponderEvent) => {
    const synthetic = { defaultPrevented: false, preventDefault: () => { synthetic.defaultPrevented = true; } };
    onPress?.(synthetic);
    if (!synthetic.defaultPrevented) router.push(href);
  };
  return <Pressable {...rest} style={style} onPress={handle}>{children}</Pressable>;
}

export { useNavigation };

/**
 * lib/platform/notifications.ts — push + local notifications, bare React Native.
 *
 * Replaces `expo-notifications` while keeping the call-site surface close enough
 * that the consuming layout changes only its import and one token call. Follows
 * the existing `lib/platform/*` adapter pattern.
 *
 * Backed by `@react-native-firebase/messaging` (FCM) with `@notifee/react-native`
 * for channels and foreground display.
 *
 * DEGRADATION IS THE DESIGN: if Firebase is not configured (no
 * `google-services.json` / `GoogleService-Info.plist`), every call here resolves
 * to an explicit "unavailable" result instead of throwing. Push registration is
 * skipped and the app continues to work — the previous Expo path behaved the
 * same way (see KNOWN_ISSUES K13). Nothing in this module crashes a cold start.
 */
import { Platform } from "react-native";
import notifee, { AndroidImportance as NotifeeImportance, EventType } from "@notifee/react-native";
import messaging from "@react-native-firebase/messaging";

/** Mirrors expo-notifications' `AndroidImportance` numeric scale. */
export const AndroidImportance = {
  MIN: NotifeeImportance.MIN,
  LOW: NotifeeImportance.LOW,
  DEFAULT: NotifeeImportance.DEFAULT,
  HIGH: NotifeeImportance.HIGH,
  MAX: NotifeeImportance.MAX,
} as const;

export const ANDROID_CHANNEL_ID = "market-events";

export type PermissionStatus = "granted" | "denied" | "undetermined";

type ForegroundHandler = () => {
  shouldShowBanner?: boolean;
  shouldShowList?: boolean;
  shouldPlaySound?: boolean;
  shouldSetBadge?: boolean;
};

let firebaseUnavailableReason: string | null = null;
let foregroundHandler: ForegroundHandler | null = null;

/**
 * Resolves the FCM factory, or null once we know Firebase is unusable.
 *
 * The import above is static and typed. React Native Firebase reports a missing
 * native module or an unconfigured project when a method is *called*, not when
 * the module is imported — so every call site below is guarded, and the first
 * failure is remembered so we do not retry it on every render.
 */
function resolveMessaging(): typeof messaging | null {
  if (firebaseUnavailableReason) return null;
  if (typeof messaging !== "function") {
    firebaseUnavailableReason = "messaging module did not export a factory";
    return null;
  }
  return messaging;
}

/** True when FCM can be used; false when the app is running without Firebase. */
export function isPushAvailable(): boolean {
  return resolveMessaging() !== null;
}

export function pushUnavailableReason(): string | null {
  return firebaseUnavailableReason;
}

/**
 * Registers foreground presentation. Replaces
 * `Notifications.setNotificationHandler`. With notifee, foreground display is an
 * event listener rather than a handler object, so the supplied flags are applied
 * when a foreground message arrives.
 */
export function setNotificationHandler(handler: ForegroundHandler): void {
  foregroundHandler = handler;
  try {
    notifee.onForegroundEvent(({ type }) => {
      if (type === EventType.PRESS) {
        // Navigation is owned by the app; nothing to do here.
      }
    });
  } catch {
    // Notifee unavailable on this platform (e.g. web). Foreground display is
    // simply not offered; nothing else degrades.
  }
}

export function getForegroundHandler(): ForegroundHandler | null {
  return foregroundHandler;
}

export async function getPermissionsAsync(): Promise<{ status: PermissionStatus }> {
  try {
    const settings = await notifee.getNotificationSettings();
    if (settings.authorizationStatus >= 1) {
      return { status: "granted" };
    }
    return { status: settings.authorizationStatus === 0 ? "undetermined" : "denied" };
  } catch {
    return { status: "undetermined" };
  }
}

export async function requestPermissionsAsync(): Promise<{ status: PermissionStatus }> {
  try {
    const settings = await notifee.requestPermission();
    return { status: settings.authorizationStatus >= 1 ? "granted" : "denied" };
  } catch {
    return { status: "denied" };
  }
}

export async function setNotificationChannelAsync(
  id: string,
  options: { name: string; importance: number },
): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await notifee.createChannel({
      id,
      name: options.name,
      importance: options.importance as NotifeeImportance,
    });
  } catch {
    // A channel that cannot be created must not break registration.
  }
}

/**
 * Replaces `getExpoPushTokenAsync({ projectId })`.
 *
 * Returns the FCM registration token, or `null` when Firebase is not configured.
 * A `null` result is an expected, supported state — the caller skips push
 * registration and the app keeps working with local notifications only.
 */
export async function getPushTokenAsync(): Promise<{ data: string } | null> {
  const factory = resolveMessaging();
  if (!factory) return null;

  try {
    const instance = factory();
    await instance.registerDeviceForRemoteMessages();
    const token = await instance.getToken();
    return typeof token === "string" && token.length > 0 ? { data: token } : null;
  } catch (error) {
    // A configured-but-unreachable FCM also degrades rather than throwing.
    firebaseUnavailableReason =
      error instanceof Error ? error.message : "push token request failed";
    return null;
  }
}

/** Displays a local notification immediately. Used when push is unavailable. */
export async function displayLocalNotification(input: {
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<string | null> {
  try {
    if (Platform.OS === "android") {
      await notifee.createChannel({
        id: ANDROID_CHANNEL_ID,
        name: "Market Events",
        importance: NotifeeImportance.MAX,
      });
    }
    return await notifee.displayNotification({
      title: input.title,
      body: input.body,
      data: input.data,
      android: { channelId: ANDROID_CHANNEL_ID },
    });
  } catch {
    return null;
  }
}

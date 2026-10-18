/**
 * Notifications, backed by `@notifee/react-native`.
 *
 * Replaces `expo-notifications`. Notifee handles permissions, Android channels, foreground
 * presentation and local display without any Firebase project configuration, so the build stays
 * self-contained.
 *
 * PUSH TOKENS: this adapter deliberately does not mint one. Expo's `getExpoPushTokenAsync` used
 * Expo's hosted push service, which is what the project moved away from. A real device token needs a
 * Firebase project and `google-services.json`, which is a deployment decision rather than a code
 * one — so `getPushToken()` reports that no provider is configured instead of returning a value it
 * cannot obtain. The server side already speaks bare FCM, so wiring this later is a one-function
 * change once the Firebase config exists.
 */
import { Platform } from "react-native";
import notifee, { AndroidImportance, EventType, type Event } from "@notifee/react-native";

export const MARKET_EVENTS_CHANNEL = "market-events";

export type PermissionState = "granted" | "denied" | "not-determined";

/** Ask for notification permission, returning a normalised state. Never throws. */
export async function requestPermission(): Promise<PermissionState> {
  if (Platform.OS === "web") return "denied";
  try {
    const settings = await notifee.requestPermission();
    if (settings.authorizationStatus >= 1) return "granted";
    return "denied";
  } catch {
    return "denied";
  }
}

/** Current permission without prompting. */
export async function getPermission(): Promise<PermissionState> {
  if (Platform.OS === "web") return "denied";
  try {
    const settings = await notifee.getNotificationSettings();
    if (settings.authorizationStatus >= 1) return "granted";
    return settings.authorizationStatus === 0 ? "not-determined" : "denied";
  } catch {
    return "not-determined";
  }
}

/** Create the Android channel the app posts market events to. No-op off Android. */
export async function ensureMarketEventsChannel(): Promise<string | null> {
  if (Platform.OS !== "android") return null;
  try {
    return await notifee.createChannel({
      id: MARKET_EVENTS_CHANNEL,
      name: "Market Events",
      importance: AndroidImportance.HIGH,
    });
  } catch {
    return null;
  }
}

export type LocalNotification = {
  title: string;
  body: string;
  /** Arbitrary payload delivered back on press. */
  data?: Record<string, string>;
};

/** Display a local notification immediately. */
export async function displayLocal(notification: LocalNotification): Promise<void> {
  try {
    const channelId = await ensureMarketEventsChannel();
    await notifee.displayNotification({
      title: notification.title,
      body: notification.body,
      data: notification.data,
      android: channelId ? { channelId, pressAction: { id: "default" } } : undefined,
    });
  } catch {
    // A notification that cannot be shown must not take the caller down with it.
  }
}

/** Subscribe to notification presses. Returns an unsubscribe function. */
export function onNotificationPress(handler: (data: Record<string, string> | undefined) => void): () => void {
  try {
    return notifee.onForegroundEvent((event: Event) => {
      if (event.type === EventType.PRESS) handler(event.detail.notification?.data as Record<string, string> | undefined);
    });
  } catch {
    return () => undefined;
  }
}

export type PushTokenResult =
  | { available: true; token: string; platform: "ios" | "android" }
  | { available: false; reason: string };

/**
 * No push provider is configured in this build, so this reports that honestly rather than
 * returning a token that would never deliver.
 */
export async function getPushToken(): Promise<PushTokenResult> {
  return {
    available: false,
    reason:
      "No push provider is configured. A device token requires a Firebase project and google-services.json; the server already speaks bare FCM once that is supplied.",
  };
}

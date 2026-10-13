import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/**
 * Best-effort haptic feedback.
 *
 * Haptics are a polish layer: they must never throw, never block a press, and
 * never run on platforms that do not support them (web). Every call is wrapped so
 * a failure in the native module cannot break an interaction.
 */

const supported = Platform.OS === "ios" || Platform.OS === "android";

function run(trigger: () => Promise<unknown> | void) {
  if (!supported) return;
  try {
    const result = trigger();
    if (result && typeof (result as Promise<unknown>).catch === "function") {
      (result as Promise<unknown>).catch(() => {
        /* haptics are best-effort */
      });
    }
  } catch {
    /* haptics are best-effort */
  }
}

export const haptics = {
  /** Light tap — button presses, chip selection. */
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Medium press — primary actions such as send. */
  press: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Heavy press — destructive or high-impact actions. */
  heavy: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  /** Selection changed — list pickers, segmented controls. */
  selection: () => run(() => Haptics.selectionAsync()),
};

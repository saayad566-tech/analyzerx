/** Haptic feedback, backed by react-native-haptic-feedback. */
import ReactNativeHapticFeedback from "react-native-haptic-feedback";

/** The set of styles the underlying module accepts, so call sites stay type-checked. */
export type HapticStyle = NonNullable<Parameters<typeof ReactNativeHapticFeedback.trigger>[0]>;

export const ImpactFeedbackStyle = {
  Light: "impactLight",
  Medium: "impactMedium",
  Heavy: "impactHeavy",
} as const;

export async function impactAsync(style: HapticStyle = ImpactFeedbackStyle.Light): Promise<void> {
  ReactNativeHapticFeedback.trigger(style, { enableVibrateFallback: true, ignoreAndroidSystemSettings: false });
}

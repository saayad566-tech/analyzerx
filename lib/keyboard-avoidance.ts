/**
 * Keyboard avoidance (mandate §2).
 *
 * The app runs with `edgeToEdgeEnabled = true` (Expo SDK 54 / RN 0.81). On
 * Android, edge-to-edge **disables** the activity's automatic window resize, so
 * `windowSoftInputMode="adjustResize"` no longer keeps content above the soft
 * keyboard. Every `KeyboardAvoidingView` in the app still used
 * `behavior={Platform.OS === "ios" ? "padding" : undefined}` — the pre-edge-to-edge
 * assumption documented in ScreenContainer ("the activity already uses
 * adjustResize, so no extra behavior is applied"). With edge-to-edge that leaves
 * the composer and send button underneath the keyboard on Android.
 *
 * This module centralises the correct behaviour so the two places that manage
 * keyboard avoidance cannot drift apart again.
 */

import { Platform } from "react-native";

export type KeyboardAvoidingBehavior = "padding" | "height" | "position" | undefined;

/**
 * Whether the app currently builds with Android edge-to-edge enabled. Mirrors
 * `expo.edgeToEdgeEnabled` in android/gradle.properties. Edge-to-edge is the
 * default in Expo SDK 54, so this defaults to true.
 */
export const EDGE_TO_EDGE_ENABLED = true;

/**
 * The `behavior` a KeyboardAvoidingView must use on each platform.
 *
 * - iOS: always "padding" (the keyboard overlays the view).
 * - Android with edge-to-edge: "padding", because the window no longer resizes.
 * - Android without edge-to-edge: undefined, because adjustResize already
 *   resizes the window and adding behaviour would double-shift the content.
 */
export function keyboardAvoidingBehavior(platform: string = Platform.OS, edgeToEdge: boolean = EDGE_TO_EDGE_ENABLED): KeyboardAvoidingBehavior {
  if (platform === "ios") return "padding";
  if (platform === "android") return edgeToEdge ? "padding" : undefined;
  return undefined;
}

/**
 * Vertical offset for the KeyboardAvoidingView. The view sits inside the safe
 * area, so the distance from the screen top to it is the top inset; callers may
 * add their own (e.g. for a fixed in-screen header).
 */
export function keyboardVerticalOffset(topInset: number, extraOffset = 0): number {
  return Math.max(0, extraOffset) + Math.max(0, topInset);
}

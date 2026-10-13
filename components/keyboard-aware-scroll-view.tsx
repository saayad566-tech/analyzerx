import { forwardRef } from "react";
import { Platform, ScrollView, type ScrollViewProps } from "react-native";

/**
 * A `ScrollView` that behaves correctly around the soft keyboard.
 *
 * - `keyboardDismissMode` defaults to `interactive` on iOS and `on-drag` on
 *   Android, so dragging the list dismisses the keyboard.
 * - `keyboardShouldPersistTaps="handled"` keeps buttons and list rows tappable
 *   while the keyboard is open (a single tap both dismisses and activates).
 *
 * It does NOT add a `KeyboardAvoidingView` — the enclosing `ScreenContainer`
 * already lifts content above the keyboard, so wrapping here would double-shift.
 * Every other `ScrollView` prop (including `horizontal`, refs and
 * `contentContainerStyle`) passes straight through.
 */
export type KeyboardAwareScrollViewProps = ScrollViewProps;

export const KeyboardAwareScrollView = forwardRef<ScrollView, KeyboardAwareScrollViewProps>(
  function KeyboardAwareScrollView({ keyboardDismissMode, keyboardShouldPersistTaps, ...props }, ref) {
    return (
      <ScrollView
        ref={ref}
        keyboardDismissMode={keyboardDismissMode ?? (Platform.OS === "ios" ? "interactive" : "on-drag")}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? "handled"}
        {...props}
      />
    );
  },
);

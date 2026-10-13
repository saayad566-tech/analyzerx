import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { computeKeyboardPadding } from "@/lib/keyboard-avoidance";

/**
 * Bottom padding needed to keep a composer above the soft keyboard.
 *
 * Why this exists instead of relying on `KeyboardAvoidingView`: KAV's Android
 * implementation is unreliable, and with edge-to-edge enabled the window no longer
 * resizes, so the composer was left underneath the keyboard. Reading the keyboard
 * height from the `Keyboard` API and applying padding explicitly is the durable
 * fix, because those events report the real height regardless of window behaviour.
 *
 * Returns 0 on iOS (KeyboardAvoidingView's padding behaviour is used there) and 0
 * when the keyboard is closed.
 */
export function useKeyboardInset(): number {
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "android") return undefined;

    // Platform.OS is already known to be android here (guard above).
    // `keyboardDidShow` is used because it reports the final geometry;
    // `keyboardWillShow` is not reliably emitted on Android.
    const onShow = (event: { endCoordinates?: { height?: number } }) => {
      const value = event?.endCoordinates?.height;
      setHeight(typeof value === "number" && Number.isFinite(value) ? value : 0);
    };
    const onHide = () => setHeight(0);

    const showSub = Keyboard.addListener("keyboardDidShow", onShow);
    const hideSub = Keyboard.addListener("keyboardDidHide", onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return computeKeyboardPadding(height, insets.bottom, Platform.OS);
}

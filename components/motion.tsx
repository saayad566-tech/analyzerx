import { useCallback, useEffect } from "react";
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";

/**
 * Hardware-accelerated motion primitives (react-native-reanimated worklets).
 *
 * These run entirely on the UI thread, so press feedback and entrance
 * animations stay smooth at the display refresh rate even while JavaScript is
 * parsing data or hitting the local store. They are the shared building blocks
 * the 144 Hz mandate asks for, replacing one-off `Animated` (JS-driven) usage.
 */

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);
const PRESS_SPRING = { damping: 18, stiffness: 320, mass: 0.6 } as const;

export type HapticStrength = "none" | "light" | "medium";

export type AnimatedPressableProps = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  /** Scale applied while pressed (spring physics). */
  pressedScale?: number;
  /** Haptic feedback fired on press. */
  haptic?: HapticStrength;
};

/**
 * A `Pressable` with spring press feedback and optional haptics. Immediate
 * visual response (sub-frame) plus tactile confirmation on key actions.
 */
export function AnimatedPressable({
  pressedScale = 0.96,
  haptic = "light",
  style,
  onPressIn,
  onPressOut,
  onPress,
  disabled,
  ...rest
}: AnimatedPressableProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      scale.value = withSpring(pressedScale, PRESS_SPRING);
      onPressIn?.(event);
    },
    [onPressIn, pressedScale, scale],
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      scale.value = withSpring(1, PRESS_SPRING);
      onPressOut?.(event);
    },
    [onPressOut, scale],
  );

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      if (haptic !== "none" && !disabled) {
        void Haptics.impactAsync(haptic === "medium" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      }
      onPress?.(event);
    },
    [disabled, haptic, onPress],
  );

  return (
    <AnimatedPressableBase
      {...rest}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      style={[style, animatedStyle]}
    />
  );
}

export type FadeInViewProps = {
  children: React.ReactNode;
  /** Delay before the entrance starts (ms). */
  delay?: number;
  duration?: number;
  /** Starting vertical offset in px; animates to 0. */
  translateY?: number;
  style?: StyleProp<ViewStyle>;
};

/** Fades and lifts its children into place on mount — smooth, worklet-driven. */
export function FadeInView({ children, delay = 0, duration = 260, translateY = 10, style }: FadeInViewProps) {
  const opacity = useSharedValue(0);
  const offset = useSharedValue(translateY);

  // Kick the entrance off on first mount only (side effects never run in render).
  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.quad) }));
    offset.value = withDelay(delay, withTiming(0, { duration, easing: Easing.out(Easing.quad) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: offset.value }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

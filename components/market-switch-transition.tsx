/**
 * Animated transition for a market change.
 *
 * The requirement: switching markets should look real, not snap. When the active
 * market changes, the wrapped content fades out and back in with a short vertical
 * lift, so the user sees that the whole screen has moved to a different market.
 *
 * Uses React Native's built-in Animated, matching components/motion.tsx, rather than
 * Reanimated. That keeps it dependency-free and avoids a worklet/babel configuration
 * risk that cannot be verified without a device.
 *
 * It is purely presentational: it reads the active market and animates. It does not
 * fetch, cache or filter anything, so it cannot affect market isolation.
 */
import { useEffect, useRef, type PropsWithChildren } from "react";
import { Animated, Easing, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { useMarketContext } from "@/lib/market-context";

export type MarketSwitchTransitionProps = PropsWithChildren<{
  /** Duration of each half of the transition, in ms. Default 180. */
  duration?: number;
  /** Vertical offset the content moves through, in px. Default 10. */
  translateY?: number;
  style?: StyleProp<ViewStyle>;
}>;

export function MarketSwitchTransition({
  children,
  duration = 180,
  translateY = 10,
  style,
}: MarketSwitchTransitionProps) {
  const { marketId } = useMarketContext();
  const progress = useRef(new Animated.Value(1)).current;
  const previousMarket = useRef(marketId);

  useEffect(() => {
    // Nothing to animate on first mount — the screen should simply appear.
    if (previousMarket.current === marketId) return;
    previousMarket.current = marketId;

    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [duration, marketId, progress]);

  return (
    <Animated.View
      style={[
        styles.container,
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [translateY, 0] }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});

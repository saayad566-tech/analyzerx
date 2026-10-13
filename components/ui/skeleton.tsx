import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

/**
 * Shimmer skeleton placeholder.
 *
 * Used instead of a blank panel or a spinner while content loads, so a screen
 * never shows an empty box and never janks when the data arrives. The animation
 * runs on the native driver, so it stays smooth while the JS thread is busy.
 */

export type SkeletonProps = {
  width?: ViewStyle["width"];
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

export function Skeleton({ width = "100%", height = 12, radius = 8, style }: SkeletonProps) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1200,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-240, 240] });

  return (
    <View style={[styles.base, { width, height, borderRadius: radius }, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.shimmer, { transform: [{ translateX }] }]} />
    </View>
  );
}

/** A short stack of skeleton lines, for a loading list or card body. */
export function SkeletonLines({ rows = 3, lineHeight = 12, gap = 10 }: { rows?: number; lineHeight?: number; gap?: number }) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} height={lineHeight} width={index === rows - 1 ? "60%" : "100%"} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: "hidden",
    backgroundColor: "rgba(148,163,184,0.16)",
  },
  shimmer: {
    backgroundColor: "rgba(255,255,255,0.10)",
  },
});

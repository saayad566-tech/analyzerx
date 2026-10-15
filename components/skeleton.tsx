import { useEffect, useState } from "react";
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

/**
 * Shimmer / skeleton loading primitives.
 *
 * The design brief calls for shimmer skeletons instead of spinner wheels. These
 * render a static placeholder block with a highlight band sweeping across it on
 * the UI thread (react-native-reanimated worklets), so the animation keeps
 * running at the display refresh rate even while JS is busy parsing data or
 * reading the local store — no frame drops on the loading path.
 *
 * All colours default to the app's dark surface palette but are overridable, so
 * the components read correctly in both light and dark themes.
 */

const SHIMMER_DURATION_MS = 1150;
const DEFAULT_BASE = "#16243A";
const DEFAULT_HIGHLIGHT = "rgba(244, 247, 251, 0.10)";

export type SkeletonProps = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  baseColor?: string;
  highlightColor?: string;
};

export function Skeleton({
  width = "100%",
  height = 14,
  radius = 8,
  style,
  baseColor = DEFAULT_BASE,
  highlightColor = DEFAULT_HIGHLIGHT,
}: SkeletonProps) {
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const progress = useSharedValue(0);
  const bandWidth = Math.max(60, measuredWidth * 0.4);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: SHIMMER_DURATION_MS, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(progress);
  }, [progress]);

  const bandStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * (measuredWidth + bandWidth) - bandWidth }],
  }));

  const onLayout = (event: LayoutChangeEvent) => setMeasuredWidth(event.nativeEvent.layout.width);

  return (
    <View
      onLayout={onLayout}
      style={[{ width, height, borderRadius: radius, backgroundColor: baseColor, overflow: "hidden" }, style]}
    >
      <Animated.View
        pointerEvents="none"
        style={[{ position: "absolute", top: 0, bottom: 0, left: 0, width: bandWidth, backgroundColor: highlightColor }, bandStyle]}
      />
    </View>
  );
}

export type SkeletonTextProps = {
  lines?: number;
  height?: number;
  gap?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  /** Widths (%) applied to each line; the last line is shortened by default. */
  widths?: readonly `${number}%`[];
};

export function SkeletonText({ lines = 3, height = 12, gap = 8, radius = 6, style, widths }: SkeletonTextProps) {
  const resolved = widths ?? Array.from({ length: lines }, (_, index) => (index === lines - 1 ? "62%" : "100%")) as `${number}%`[];
  return (
    <View style={[{ gap }, style]} accessibilityRole="progressbar" accessibilityLabel="Loading content">
      {resolved.map((width, index) => (
        <Skeleton key={index} width={width} height={height} radius={radius} />
      ))}
    </View>
  );
}

export type SkeletonCardProps = {
  rows?: number;
  style?: StyleProp<ViewStyle>;
  showHeader?: boolean;
};

export function SkeletonCard({ rows = 3, style, showHeader = true }: SkeletonCardProps) {
  return (
    <View
      style={[{ borderWidth: 1, borderColor: "#26364D", backgroundColor: "#0D1728", borderRadius: 16, padding: 14, gap: 10 }, style]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading card"
    >
      {showHeader ? <Skeleton width="46%" height={16} radius={7} /> : null}
      <SkeletonText lines={rows} />
    </View>
  );
}

export type SkeletonListProps = {
  rows?: number;
  style?: StyleProp<ViewStyle>;
  rowStyle?: StyleProp<ViewStyle>;
  showAvatar?: boolean;
};

/** A vertical list of shimmering rows — drop-in for a list's loading state. */
export function SkeletonList({ rows = 4, style, rowStyle, showAvatar = true }: SkeletonListProps) {
  return (
    <View style={[{ gap: 14, paddingVertical: 8 }, style]} accessibilityRole="progressbar" accessibilityLabel="Loading list">
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={[{ flexDirection: "row", alignItems: "center", gap: 12 }, rowStyle]}>
          {showAvatar ? <Skeleton width={40} height={40} radius={12} /> : null}
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="72%" height={13} radius={6} />
            <Skeleton width="48%" height={11} radius={6} />
          </View>
        </View>
      ))}
    </View>
  );
}

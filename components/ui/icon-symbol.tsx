// Icon rendering for Android and web. iOS uses the sibling .ios.tsx with the same icon set.

import MaterialIcons from "react-native-vector-icons/MaterialIcons";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<string, ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "dot.radiowaves.left.and.right": "sensors",
  "point.3.connected.trianglepath.dotted": "account-tree",
  "circle.grid.3x3.fill": "hub",
  "chart.bar.xaxis": "bar-chart",
  "bell.fill": "notifications",
  "sparkles": "auto-awesome",
  "bubble.left.and.bubble.right.fill": "chat",
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  /** Accepted for call-site compatibility. The vector icon set has no weight axis. */
  weight?: string;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}

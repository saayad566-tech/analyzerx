import MaterialIcons from "react-native-vector-icons/MaterialIcons";
import { StyleProp, ViewStyle } from "react-native";

/**
 * Icon rendering on iOS.
 *
 * This previously used Apple's SF Symbols. It now uses the same vector icon set as Android, so a
 * single icon name resolves identically on both platforms and the app carries one icon dependency.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: string;
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
}) {
  return <MaterialIcons name={name} size={size} color={color} style={style} />;
}

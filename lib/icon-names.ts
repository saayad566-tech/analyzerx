/**
 * The icon-name union for the icon set the app uses.
 *
 * This replaces the Expo icon package's `glyphMap` type, which does not exist here. Deriving the
 * type from the component's own props keeps the call sites type-checked and keeps a single place to
 * change if the icon set is ever swapped again.
 */
import type { ComponentProps } from "react";
import Ionicons from "react-native-vector-icons/Ionicons";

export type IoniconName = ComponentProps<typeof Ionicons>["name"];

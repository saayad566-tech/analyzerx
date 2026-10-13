import { Keyboard, KeyboardAvoidingView, Platform, Pressable, View, type ViewProps } from "react-native";
import { keyboardAvoidingBehavior } from "@/lib/keyboard-avoidance";
import { SafeAreaView, useSafeAreaInsets, type Edge } from "react-native-safe-area-context";

import { cn } from "@/lib/utils";

export interface ScreenContainerProps extends ViewProps {
  /**
   * SafeArea edges to apply. Defaults to ["top", "left", "right"].
   * Bottom is typically handled by Tab Bar.
   */
  edges?: Edge[];
  /**
   * Tailwind className for the content area.
   */
  className?: string;
  /**
   * Additional className for the outer container (background layer).
   */
  containerClassName?: string;
  /**
   * Additional className for the SafeAreaView (content layer).
   */
  safeAreaClassName?: string;
  /**
   * Wrap content so the soft keyboard never hides the focused input. Defaults
   * to `true`; set `false` on screens that manage their own KeyboardAvoidingView
   * (the chat composers) to avoid double-shifting.
   */
  keyboardAware?: boolean;
  /**
   * Dismiss the keyboard when the user taps outside an input. Defaults to
   * `false` because it can swallow taps; screens with a single form enable it.
   */
  dismissKeyboardOnTap?: boolean;
  /**
   * Extra offset (px) added on top of the safe-area top inset for the
   * keyboard-avoiding calculation, e.g. for an in-screen fixed header.
   */
  keyboardVerticalOffset?: number;
}

/**
 * A container component that properly handles SafeArea, background colors and
 * the soft keyboard.
 *
 * The outer View extends to full screen (including status bar area) with the
 * background color, while the inner SafeAreaView ensures content is within safe
 * bounds. When `keyboardAware` is on, the content is wrapped in a
 * KeyboardAvoidingView so inputs and send buttons stay visible above the
 * keyboard. On Android the activity already uses `windowSoftInputMode="adjustResize"`,
 * so no extra behavior is applied there to avoid double-adjustment.
 *
 * Usage:
 * ```tsx
 * <ScreenContainer className="p-4">
 *   <Text className="text-2xl font-bold text-foreground">Welcome</Text>
 * </ScreenContainer>
 * ```
 */
export function ScreenContainer({
  children,
  edges = ["top", "left", "right"],
  className,
  containerClassName,
  safeAreaClassName,
  style,
  keyboardAware = true,
  dismissKeyboardOnTap = false,
  keyboardVerticalOffset,
  ...props
}: ScreenContainerProps) {
  const insets = useSafeAreaInsets();
  // The KeyboardAvoidingView sits inside the SafeAreaView, so the distance from
  // the screen top to it is the top safe-area inset; callers may add their own.
  const offset = (keyboardVerticalOffset ?? 0) + (edges.includes("top") ? insets.top : 0);
  const content = <View className={cn("flex-1", className)}>{children}</View>;

  return (
    <View className={cn("flex-1", "bg-background", containerClassName)} {...props}>
      <SafeAreaView
        edges={edges}
        className={cn("flex-1", safeAreaClassName)}
        style={style}
      >
        {keyboardAware ? (
          <KeyboardAvoidingView
            style={FILL}
            behavior={keyboardAvoidingBehavior(Platform.OS)}
            keyboardVerticalOffset={offset}
          >
            {dismissKeyboardOnTap ? (
              <Pressable style={FILL} onPress={Keyboard.dismiss} accessible={false}>
                {content}
              </Pressable>
            ) : (
              content
            )}
          </KeyboardAvoidingView>
        ) : (
          content
        )}
      </SafeAreaView>
    </View>
  );
}

const FILL = { flex: 1 } as const;

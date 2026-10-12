import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Crash containment and self-recovery.
 *
 * A render-time exception in React Native releases the whole app: the screen
 * closes and the user loses their place. This boundary catches those errors,
 * records them on the device so they can be inspected later, and offers a
 * recovery path that re-mounts the tree instead of exiting.
 *
 * It deliberately does not swallow errors silently: the failure is shown, the
 * component stack is retained, and the last crash is persisted.
 */

const CRASH_KEY = "analyzerx.crash.last";

type CrashRecord = {
  message: string;
  stack: string | null;
  componentStack: string | null;
  route: string | null;
  at: string;
};

type Props = {
  children: React.ReactNode;
  /** Called after a successful reset, so the caller can clear its own state. */
  onRecover?: () => void;
};

type State = {
  error: Error | null;
  componentStack: string | null;
  crash: CrashRecord | null;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, componentStack: null, crash: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    const crash: CrashRecord = {
      message: error?.message ?? String(error),
      stack: error?.stack ?? null,
      componentStack: info?.componentStack ?? null,
      route: null,
      at: new Date().toISOString(),
    };
    this.setState({ componentStack: crash.componentStack, crash });
    // Persist for later inspection; never let logging itself throw.
    void AsyncStorage.setItem(CRASH_KEY, JSON.stringify(crash)).catch(() => undefined);
  }

  private reset = () => {
    this.setState({ error: null, componentStack: null, crash: null });
    this.props.onRecover?.();
  };

  /** Re-mount the subtree from scratch by changing its React key. */
  private remount = () => {
    this.setState({ error: null, componentStack: null, crash: null });
    this.props.onRecover?.();
  };

  render() {
    if (!this.state.error) return this.props.children;

    const { error, componentStack, crash } = this.state;

    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>RECOVERED</Text>
          </View>
          <Text style={styles.title}>This screen hit an error</Text>
          <Text style={styles.body}>
            AnalyzerX caught the failure before it could close the app. Your saved work, the local
            archive and your downloaded models are untouched. Nothing was sent anywhere.
          </Text>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>WHAT FAILED</Text>
            <Text style={styles.cardValue}>{error?.message ?? "Unknown error"}</Text>
          </View>

          {componentStack ? (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>WHERE</Text>
              <Text style={styles.mono}>{componentStack.split("\n").slice(0, 6).join("\n").trim()}</Text>
            </View>
          ) : null}

          {crash?.at ? (
            <Text style={styles.meta}>Recorded on this device at {crash.at}</Text>
          ) : null}

          <Pressable
            onPress={this.reset}
            style={styles.primary}
            accessibilityRole="button"
            accessibilityLabel="Retry this screen"
          >
            <Text style={styles.primaryText}>Retry this screen</Text>
          </Pressable>
          <Pressable
            onPress={this.remount}
            style={styles.secondary}
            accessibilityRole="button"
            accessibilityLabel="Rebuild the screen from scratch"
          >
            <Text style={styles.secondaryText}>Rebuild the screen</Text>
          </Pressable>
          <Text style={styles.hint}>
            If it fails again, the same error will be recorded and can be reviewed in Diagnostics.
            Reporting the text above is enough to trace it.
          </Text>
        </ScrollView>
      </View>
    );
  }
}

/** Read the last recorded crash, for the Diagnostics screen. */
export async function loadLastCrash(): Promise<CrashRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(CRASH_KEY);
    return raw ? (JSON.parse(raw) as CrashRecord) : null;
  } catch {
    return null;
  }
}

export async function clearLastCrash(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CRASH_KEY);
  } catch {
    // ignore
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#09111F" },
  content: { padding: 20, paddingTop: 48, paddingBottom: 40 },
  badge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#F4B86066",
    backgroundColor: "#F4B86018",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginBottom: 14,
  },
  badgeText: { color: "#F4B860", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: "#F4F7FB", fontSize: 24, fontWeight: "800", lineHeight: 31 },
  body: { color: "#91A2B8", fontSize: 13, lineHeight: 20, marginTop: 10 },
  card: {
    backgroundColor: "#111C2D",
    borderWidth: 1,
    borderColor: "#26364D",
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
  },
  cardLabel: { color: "#F4B860", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  cardValue: { color: "#F4F7FB", fontSize: 13, lineHeight: 19, marginTop: 6 },
  mono: { color: "#B8C6D6", fontSize: 10, lineHeight: 15, marginTop: 6, fontFamily: "monospace" },
  meta: { color: "#6E7D92", fontSize: 10, marginTop: 12 },
  primary: {
    backgroundColor: "#F4B860",
    borderRadius: 13,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
  },
  primaryText: { color: "#09111F", fontSize: 14, fontWeight: "800" },
  secondary: {
    borderWidth: 1,
    borderColor: "#26364D",
    backgroundColor: "#17253A",
    borderRadius: 13,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  secondaryText: { color: "#F4F7FB", fontSize: 13, fontWeight: "700" },
  hint: { color: "#6E7D92", fontSize: 10, lineHeight: 15, marginTop: 16 },
});

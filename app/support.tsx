import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";

import { ScreenContainer } from "@/components/screen-container";

const SUPPORT_EMAIL = "support@marketeventintelligence.com";
const SUPPORT_SITE = "https://marketevent-i4bj664j.manus.space";
const SUPPORT_REFERENCE = "AnalyzerX support";

async function openExternal(url: string, onFailure: (message: string) => void) {
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      onFailure("This action is not available on the device.");
      return;
    }
    await Linking.openURL(url);
  } catch {
    onFailure("We could not open the requested support channel. Please copy the address instead.");
  }
}

export default function SupportScreen() {
  const [feedback, setFeedback] = useState<string | null>(null);

  const showFeedback = (message: string) => {
    setFeedback(message);
    setTimeout(() => setFeedback(null), 3500);
  };

  const contactEmail = () => {
    const subject = encodeURIComponent(SUPPORT_REFERENCE);
    const body = encodeURIComponent("Please describe the issue, affected screen, and any relevant stock symbol or timestamp.\n\n");
    void openExternal(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`, (message) => {
      showFeedback(message);
      Alert.alert("Email unavailable", `Copy ${SUPPORT_EMAIL} and contact support from your mail app.`);
    });
  };

  const openSupportSite = () => {
    void openExternal(SUPPORT_SITE, showFeedback);
  };

  const copyEmail = async () => {
    try {
      await Clipboard.setStringAsync(SUPPORT_EMAIL);
      showFeedback("Support email copied to your clipboard.");
    } catch {
      showFeedback("Copy failed. Please select the email address manually.");
    }
  };

  return (
    <ScreenContainer containerClassName="bg-background" edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Ionicons name="chevron-back" size={22} color="#F4F7FB" />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>NATIVE SUPPORT</Text>
            <Text style={styles.title}>Contact support</Text>
          </View>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroIcon}><Ionicons name="headset-outline" size={28} color="#4FD1C5" /></View>
          <Text style={styles.heroTitle}>Need help with AnalyzerX?</Text>
          <Text style={styles.heroText}>The web chat widget is available on the web version. On Android and iOS, use one of the support channels below.</Text>
        </View>

        <Text style={styles.sectionTitle}>Support channels</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Email support" onPress={contactEmail} style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]}>
          <View style={[styles.actionIcon, { backgroundColor: "#4FD1C518" }]}><Ionicons name="mail-outline" size={22} color="#4FD1C5" /></View>
          <View style={styles.actionCopy}><Text style={styles.actionTitle}>Email support</Text><Text style={styles.actionText}>Send a detailed issue report with the affected screen and symbol.</Text></View>
          <Ionicons name="chevron-forward" size={18} color="#91A2B8" />
        </Pressable>

        <Pressable accessibilityRole="button" accessibilityLabel="Open support website" onPress={openSupportSite} style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]}>
          <View style={[styles.actionIcon, { backgroundColor: "#A78BFA18" }]}><Ionicons name="globe-outline" size={22} color="#A78BFA" /></View>
          <View style={styles.actionCopy}><Text style={styles.actionTitle}>Open support website</Text><Text style={styles.actionText}>Open the project support page in your device browser.</Text></View>
          <Ionicons name="open-outline" size={18} color="#91A2B8" />
        </Pressable>

        <View style={styles.emailCard}>
          <View style={styles.emailCopy}><Text style={styles.emailLabel}>SUPPORT EMAIL</Text><Text style={styles.emailValue} selectable>{SUPPORT_EMAIL}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Copy support email" onPress={copyEmail} style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}><Ionicons name="copy-outline" size={18} color="#09111F" /><Text style={styles.copyText}>Copy</Text></Pressable>
        </View>

        <View style={styles.reportCard}>
          <Ionicons name="information-circle-outline" size={19} color="#F4B860" />
          <Text style={styles.reportText}>For faster investigation, include the app version, device model, screen name, stock symbol, and a screenshot when reporting a problem.</Text>
        </View>

        {feedback ? <View accessibilityRole="alert" style={styles.feedback}><Ionicons name="checkmark-circle-outline" size={18} color="#4FD1C5" /><Text style={styles.feedbackText}>{feedback}</Text></View> : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 4, marginBottom: 22 },
  headerCopy: { flex: 1 },
  backButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#111C2D", borderWidth: 1, borderColor: "#26364D", alignItems: "center", justifyContent: "center" },
  eyebrow: { color: "#F4B860", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: "#F4F7FB", fontSize: 30, fontWeight: "800", letterSpacing: -0.8, marginTop: 4 },
  heroCard: { backgroundColor: "#132B35", borderWidth: 1, borderColor: "#2D5657", borderRadius: 18, padding: 18, marginBottom: 26 },
  heroIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: "#4FD1C518", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  heroTitle: { color: "#F4F7FB", fontSize: 18, fontWeight: "800", lineHeight: 24 },
  heroText: { color: "#B8C6D6", fontSize: 12, lineHeight: 18, marginTop: 8 },
  sectionTitle: { color: "#F4F7FB", fontSize: 18, fontWeight: "800", marginBottom: 11 },
  actionCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#111C2D", borderWidth: 1, borderColor: "#26364D", borderRadius: 17, padding: 14, marginBottom: 10 },
  actionIcon: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  actionCopy: { flex: 1 },
  actionTitle: { color: "#F4F7FB", fontSize: 14, fontWeight: "800" },
  actionText: { color: "#91A2B8", fontSize: 11, lineHeight: 16, marginTop: 4 },
  emailCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, backgroundColor: "#17253A", borderWidth: 1, borderColor: "#26364D", borderRadius: 16, padding: 14, marginTop: 8 },
  emailCopy: { flex: 1 },
  emailLabel: { color: "#6E7D92", fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  emailValue: { color: "#F4F7FB", fontSize: 12, marginTop: 5 },
  copyButton: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#F4B860", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  copyText: { color: "#09111F", fontSize: 11, fontWeight: "800" },
  reportCard: { flexDirection: "row", gap: 9, backgroundColor: "#251F20", borderRadius: 14, padding: 13, marginTop: 14 },
  reportText: { flex: 1, color: "#B8C6D6", fontSize: 11, lineHeight: 17 },
  feedback: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#153B3B", borderRadius: 13, padding: 12, marginTop: 14 },
  feedbackText: { flex: 1, color: "#B8F0E6", fontSize: 11, lineHeight: 16 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
});

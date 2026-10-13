import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { KeyboardAwareScrollView } from "@/components/keyboard-aware-scroll-view";

const KEY = "analyzerx.custom-domain";
const MANAGED_DOMAIN = "https://marketevent-i4bj664j.manus.space";
const amber = "#F4B860";
const teal = "#4FD1C5";
const coral = "#FB7185";
const text = "#F4F7FB";
const muted = "#91A2B8";
const surface = "#111C2D";
const border = "#26364D";

export default function CustomDomainScreen() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [status, setStatus] = useState<"managed" | "saved" | "verified" | "failed">("managed");
  const [message, setMessage] = useState("");
  useEffect(() => { void AsyncStorage.getItem(KEY).then((value) => { if (value) { setDomain(value); setStatus("saved"); } }); }, []);
  const verify = async () => {
    const normalized = domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!normalized || !normalized.includes(".")) { setStatus("failed"); setMessage("Enter a domain such as research.example.com."); return; }
    setDomain(normalized);
    await AsyncStorage.setItem(KEY, normalized);
    try {
      const response = await fetch(`https://${normalized}`, { method: "HEAD" });
      setStatus(response.ok ? "verified" : "saved");
      setMessage(response.ok ? "HTTPS is reachable. DNS and TLS appear active." : "Domain saved locally, but HTTPS did not return a successful response yet.");
    } catch { setStatus("saved"); setMessage("Domain saved locally. Add the DNS record and HTTPS certificate, then verify again."); }
  };
  const remove = async () => { await AsyncStorage.removeItem(KEY); setDomain(""); setStatus("managed"); setMessage("AnalyzerX managed domain restored."); };
  return <ScreenContainer className="px-5" edges={["top", "left", "right", "bottom"]}><KeyboardAwareScrollView contentContainerStyle={styles.content}><View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={21} color={text} /></Pressable><View><Text style={styles.eyebrow}>APPEARANCE</Text><Text style={styles.title}>Custom Domain</Text></View></View><View style={styles.hero}><Ionicons name="globe-outline" size={25} color={amber} /><View style={{ flex: 1 }}><Text style={styles.heroTitle}>Brand your live PWA</Text><Text style={styles.heroText}>Use a DNS-controlled HTTPS domain for public access. The APK and offline local mode continue to work without a public domain.</Text></View></View><View style={styles.card}><Text style={styles.label}>DOMAIN</Text><TextInput value={domain} onChangeText={setDomain} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="research.example.com" placeholderTextColor="#607088" style={styles.input} /><Pressable onPress={() => void verify()} style={styles.primary}><Text style={styles.primaryText}>Save and verify</Text></Pressable>{message ? <Text style={[styles.message, { color: status === "failed" ? coral : status === "verified" ? teal : amber }]}>{message}</Text> : null}<View style={styles.statusRow}><View style={[styles.dot, { backgroundColor: status === "verified" ? teal : status === "failed" ? coral : amber }]} /><Text style={styles.statusText}>{status === "managed" ? "Using AnalyzerX managed domain" : status === "verified" ? "Custom domain verified" : status === "saved" ? "Saved; verification pending" : "Verification needs attention"}</Text></View></View><View style={styles.card}><Text style={styles.label}>DNS CHECKLIST</Text><Text style={styles.item}>1. Add the host record provided by your hosting/domain provider.</Text><Text style={styles.item}>2. Wait for DNS propagation and ensure HTTPS is enabled.</Text><Text style={styles.item}>3. Return here and verify. AnalyzerX will not claim activation from text input alone.</Text><Pressable onPress={() => void Linking.openURL(MANAGED_DOMAIN)} style={styles.secondary}><Text style={styles.secondaryText}>Open managed domain</Text></Pressable></View>{status !== "managed" ? <Pressable onPress={() => void remove()} style={styles.remove}><Text style={styles.removeText}>Remove custom domain</Text></Pressable> : null}<Text style={styles.note}>Local-only mode uses the workstation or LAN address and does not require this setting. A public custom domain requires DNS control and an HTTPS-capable public host.</Text></KeyboardAwareScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({ content: { paddingBottom: 48 }, header: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 8, paddingBottom: 18 }, back: { width: 42, height: 42, borderRadius: 13, backgroundColor: surface, borderWidth: 1, borderColor: border, alignItems: "center", justifyContent: "center" }, eyebrow: { color: amber, fontSize: 10, fontWeight: "800", letterSpacing: 1.3 }, title: { color: text, fontSize: 28, fontWeight: "800", marginTop: 2 }, hero: { flexDirection: "row", gap: 12, backgroundColor: "#162639", borderWidth: 1, borderColor: "#315064", borderRadius: 17, padding: 15, marginBottom: 12 }, heroTitle: { color: text, fontSize: 15, fontWeight: "800" }, heroText: { color: muted, fontSize: 11, lineHeight: 16, marginTop: 4 }, card: { backgroundColor: surface, borderWidth: 1, borderColor: border, borderRadius: 16, padding: 14, marginBottom: 12 }, label: { color: amber, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 }, input: { height: 45, borderWidth: 1, borderColor: border, borderRadius: 10, paddingHorizontal: 12, color: text, marginTop: 8, backgroundColor: "#0B1422" }, primary: { alignItems: "center", backgroundColor: amber, borderRadius: 10, paddingVertical: 12, marginTop: 10 }, primaryText: { color: "#09111F", fontSize: 12, fontWeight: "900" }, message: { fontSize: 10, lineHeight: 15, marginTop: 9 }, statusRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 12 }, dot: { width: 7, height: 7, borderRadius: 4 }, statusText: { color: text, fontSize: 11, fontWeight: "800" }, item: { color: muted, fontSize: 11, lineHeight: 17, marginTop: 9 }, secondary: { alignSelf: "flex-start", borderWidth: 1, borderColor: "#76572D", borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, marginTop: 13 }, secondaryText: { color: amber, fontSize: 11, fontWeight: "800" }, remove: { alignItems: "center", borderWidth: 1, borderColor: "#FB718566", borderRadius: 11, paddingVertical: 11 }, removeText: { color: coral, fontSize: 11, fontWeight: "800" }, note: { color: "#6E7D92", fontSize: 10, lineHeight: 15, textAlign: "center", marginTop: 18 } });

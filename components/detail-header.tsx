import { Pressable, Text, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { router } from "@/lib/navigation/router";

export function DetailHeader({ title, eyebrow = "DETAIL" }: { title: string; eyebrow?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 11, paddingTop: 14, paddingBottom: 16 }}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
        style={({ pressed }) => [{ width: 38, height: 38, borderRadius: 12, backgroundColor: "#111C2D", borderWidth: 1, borderColor: "#26364D", alignItems: "center", justifyContent: "center" }, pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] }]}
      >
        <Ionicons name="chevron-back" size={21} color="#F4F7FB" />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={{ color: "#F4B860", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 }}>{eyebrow}</Text>
        <Text style={{ color: "#F4F7FB", fontSize: 20, fontWeight: "900", marginTop: 3 }} numberOfLines={1}>{title}</Text>
      </View>
    </View>
  );
}

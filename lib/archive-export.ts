import { Platform } from "react-native";
import * as FileSystem from "@/lib/platform/file-system";
import * as Sharing from "@/lib/platform/share";

export type ArchiveExportPayload = {
  fileName: string;
  mimeType: string;
  content?: string;
  contentBase64?: string;
};

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export async function downloadArchiveExport(payload: ArchiveExportPayload): Promise<{ uri: string; shared: boolean }> {
  if (Platform.OS === "web" && typeof document !== "undefined") {
    const bytes = payload.contentBase64 ? base64ToBytes(payload.contentBase64) : new TextEncoder().encode(payload.content ?? "");
    const blob = new Blob([bytes], { type: payload.mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = payload.fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { uri: payload.fileName, shared: true };
  }

  const root = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!root) throw new Error("Device file storage is unavailable.");
  const uri = `${root}${payload.fileName}`;
  if (payload.contentBase64) {
    await FileSystem.writeAsStringAsync(uri, payload.contentBase64, { encoding: FileSystem.EncodingType.Base64 });
  } else {
    await FileSystem.writeAsStringAsync(uri, payload.content ?? "", { encoding: FileSystem.EncodingType.UTF8 });
  }
  const canShare = await Sharing.isAvailableAsync().catch(() => false);
  if (canShare) await Sharing.shareAsync(uri, { mimeType: payload.mimeType, dialogTitle: `Export ${payload.fileName}` });
  return { uri, shared: canShare };
}

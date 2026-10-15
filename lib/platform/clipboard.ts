/** Clipboard, backed by the bare React Native clipboard module. Same surface the call sites expect. */
import Clipboard from "@react-native-clipboard/clipboard";

export async function setStringAsync(text: string): Promise<void> {
  Clipboard.setString(text);
}

export async function getStringAsync(): Promise<string> {
  return Clipboard.getString();
}

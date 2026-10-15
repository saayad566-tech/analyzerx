/** On-device PDF rendering, backed by react-native-print. */
import RNPrint from "react-native-print";

export async function printToFileAsync(options: { html: string; base64?: boolean }): Promise<{ uri: string }> {
  // react-native-print always writes a real file and returns its path.
  const uri = await RNPrint.print({ html: options.html });
  return { uri };
}

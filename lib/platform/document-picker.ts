/** Document picker, backed by @react-native-documents/picker. Returns the previous result shape. */
import { pick, types } from "@react-native-documents/picker";

export type PickedDocument = { uri: string; name: string | null; mimeType: string | null };

export async function getDocumentAsync(
  options: { type?: string[]; copyToCacheDirectory?: boolean; multiple?: boolean } = {},
): Promise<{ canceled: boolean; assets: PickedDocument[] }> {
  try {
    const results = await pick({
      allowMultiSelection: options.multiple ?? false,
      // The previous API accepted an explicit MIME allow-list; anything else falls back to all files.
      type: options.type?.length ? options.type : [types.allFiles],
    });
    return {
      canceled: false,
      assets: results.map((file) => ({ uri: file.uri, name: file.name ?? null, mimeType: file.type ?? null })),
    };
  } catch {
    // The picker throws when the user dismisses it; the previous API reported that as `canceled`.
    return { canceled: true, assets: [] };
  }
}

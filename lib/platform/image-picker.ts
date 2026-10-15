/** Image library picker, backed by react-native-image-picker. Returns the previous result shape. */
import { launchImageLibrary } from "react-native-image-picker";

export type PickedImage = { uri: string; mimeType: string | null; fileName: string | null };

export async function launchImageLibraryAsync(
  options: { mediaTypes?: string[]; allowsEditing?: boolean; selectionLimit?: number; quality?: number } = {},
): Promise<{ canceled: boolean; assets: PickedImage[] }> {
  const result = await launchImageLibrary({
    mediaType: "photo",
    selectionLimit: options.selectionLimit ?? 1,
    // react-native-image-picker types quality as a specific union; the caller passes a plain number.
    quality: (options.quality ?? 0.8) as never,
    includeBase64: false,
  });
  if (result.didCancel || !result.assets?.length) return { canceled: true, assets: [] };
  return {
    canceled: false,
    assets: result.assets.map((asset) => ({
      uri: asset.uri ?? "",
      mimeType: asset.type ?? null,
      fileName: asset.fileName ?? null,
    })),
  };
}

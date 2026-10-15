/** Native share sheet, backed by react-native-share. */
import Share from "react-native-share";

/** A native share sheet is always present on Android and iOS. */
export async function isAvailableAsync(): Promise<boolean> {
  return true;
}

export async function shareAsync(
  uri: string,
  options: { mimeType?: string; dialogTitle?: string; UTI?: string } = {},
): Promise<void> {
  // `UTI` was an iOS type hint on the previous API; the MIME type carries the same information here.
  await Share.open({ url: uri, type: options.mimeType, title: options.dialogTitle, failOnCancel: false });
}

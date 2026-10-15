/** In-app browser, backed by react-native-inappbrowser-reborn. */
import InAppBrowser from "react-native-inappbrowser-reborn";

export const WebBrowserPresentationStyle = {
  AUTOMATIC: "automatic",
  FULL_SCREEN: "fullScreen",
  PAGE_SHEET: "pageSheet",
  FORM_SHEET: "formSheet",
} as const;

export async function openBrowserAsync(
  url: string,
  options: { presentationStyle?: string } = {},
): Promise<void> {
  const available = await InAppBrowser.isAvailable();
  if (!available) return;
  await InAppBrowser.open(url, {
    // `automatic` and `fullScreen` both map to the modal presentation this app wants.
    modalPresentationStyle: options.presentationStyle === WebBrowserPresentationStyle.PAGE_SHEET ? "pageSheet" : "fullScreen",
    modalEnabled: true,
    animated: true,
  });
}

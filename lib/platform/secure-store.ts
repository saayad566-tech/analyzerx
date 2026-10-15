/**
 * Encrypted key/value storage, backed by react-native-keychain.
 * Each logical key is stored under its own keychain service, preserving the per-key isolation the
 * previous store provided.
 */
import * as Keychain from "react-native-keychain";

/** Accessibility class meaning "readable only while the device is unlocked, and never migrated". */
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = "whenUnlockedThisDeviceOnly";

export async function setItemAsync(
  key: string,
  value: string,
  options?: { keychainAccessible?: string },
): Promise<void> {
  const accessible =
    options?.keychainAccessible === WHEN_UNLOCKED_THIS_DEVICE_ONLY
      ? Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY
      : Keychain.ACCESSIBLE.WHEN_UNLOCKED;
  await Keychain.setGenericPassword(key, value, { service: key, accessible });
}

export async function getItemAsync(key: string): Promise<string | null> {
  const entry = await Keychain.getGenericPassword({ service: key });
  return entry ? entry.password : null;
}

export async function deleteItemAsync(key: string): Promise<void> {
  await Keychain.resetGenericPassword({ service: key });
}

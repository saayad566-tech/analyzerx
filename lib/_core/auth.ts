import * as SecureStore from "@/lib/platform/secure-store";
import { Platform } from "react-native";
import { SESSION_TOKEN_KEY, USER_INFO_KEY } from "@/constants/oauth";

export type User = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  lastSignedIn: Date;
};

/**
 * Debug tracing is gated so release builds stay quiet.
 * Credential material is never passed here: no token, no token prefix, no email, no user object.
 * A partial credential in a log is still credential material, and an email is personal data.
 */
const isDev = process.env.NODE_ENV !== "production";
const debug = (...args: unknown[]): void => {
  if (isDev) console.log(...args);
};

export async function getSessionToken(): Promise<string | null> {
  try {
    // Web platform uses cookie-based auth, no manual token management needed
    if (Platform.OS === "web") {
      debug("[Auth] Web platform uses cookie-based auth, skipping token retrieval");
      return null;
    }

    // Use SecureStore for native
    debug("[Auth] Reading the session token from SecureStore…");
    const token = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
    // Presence only — never the value, not even a prefix.
    debug("[Auth] Session token lookup:", token ? "present" : "missing");
    return token;
  } catch (error) {
    console.error("[Auth] Failed to get session token:", error);
    return null;
  }
}

export async function setSessionToken(token: string): Promise<void> {
  try {
    // Web platform uses cookie-based auth, no manual token management needed
    if (Platform.OS === "web") {
      debug("[Auth] Web platform uses cookie-based auth, skipping token storage");
      return;
    }

    // Use SecureStore for native.
    // The token is never logged, not even a prefix: a partial credential in a
    // log is still credential material.
    debug("[Auth] Storing the session token in SecureStore…");
    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
    debug("[Auth] Session token stored.");
  } catch (error) {
    console.error("[Auth] Failed to set session token:", error);
    throw error;
  }
}

export async function removeSessionToken(): Promise<void> {
  try {
    // Web platform uses cookie-based auth, logout is handled by server clearing cookie
    if (Platform.OS === "web") {
      debug("[Auth] Web platform uses cookie-based auth, skipping token removal");
      return;
    }

    // Use SecureStore for native
    debug("[Auth] Removing the session token…");
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
    debug("[Auth] Session token removed.");
  } catch (error) {
    console.error("[Auth] Failed to remove session token:", error);
  }
}

export async function getUserInfo(): Promise<User | null> {
  try {
    debug("[Auth] Reading stored user info…");

    let info: string | null = null;
    if (Platform.OS === "web") {
      // Use localStorage for web
      info = window.localStorage.getItem(USER_INFO_KEY);
    } else {
      // Use SecureStore for native
      info = await SecureStore.getItemAsync(USER_INFO_KEY);
    }

    if (!info) {
      debug("[Auth] No stored user info.");
      return null;
    }
    const user = JSON.parse(info) as User;
    // Never log the user object: it carries an email address.
    debug("[Auth] Stored user info loaded:", user?.id != null ? "present" : "malformed");
    return user;
  } catch (error) {
    console.error("[Auth] Failed to get user info:", error);
    return null;
  }
}

export async function setUserInfo(user: User): Promise<void> {
  try {
    // Never log the user object: it carries an email address.
    debug("[Auth] Storing user info…");

    if (Platform.OS === "web") {
      // Use localStorage for web
      window.localStorage.setItem(USER_INFO_KEY, JSON.stringify(user));
      debug("[Auth] User info stored in localStorage.");
      return;
    }

    // Use SecureStore for native
    await SecureStore.setItemAsync(USER_INFO_KEY, JSON.stringify(user));
    debug("[Auth] User info stored in SecureStore.");
  } catch (error) {
    console.error("[Auth] Failed to set user info:", error);
  }
}

export async function clearUserInfo(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      // Use localStorage for web
      window.localStorage.removeItem(USER_INFO_KEY);
      return;
    }

    // Use SecureStore for native
    await SecureStore.deleteItemAsync(USER_INFO_KEY);
  } catch (error) {
    console.error("[Auth] Failed to clear user info:", error);
  }
}

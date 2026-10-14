import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/routers";
import * as Auth from "@/lib/_core/auth";
import { assertJsonApiResponse } from "@/lib/api-response-validation";
import { localLink } from "@/lib/open-data/link";

/**
 * tRPC React client for type-safe API calls.
 *
 * IMPORTANT (tRPC v11): The `transformer` must be inside `httpBatchLink`,
 * NOT at the root createClient level. This ensures client and server
 * use the same serialization format (superjson).
 */
export const trpc = createTRPCReact<AppRouter>();

// Provider-backed research can legitimately take more than one cellular round trip; keep it bounded while leaving room for one full server-side fallback cycle.
export const API_REQUEST_TIMEOUT_MS = 30_000;

export async function fetchWithTimeout(
  url: RequestInfo | URL,
  options?: RequestInit,
  timeoutMs = API_REQUEST_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const requestSignal = options?.signal;
  const forwardAbort = () => controller.abort();
  if (requestSignal?.aborted) controller.abort();
  else requestSignal?.addEventListener("abort", forwardAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      credentials: "include",
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") ?? "";
    const route = typeof url === "string" ? url.split("?")[0] : url.toString().split("?")[0];
    const responsePreview = await response.clone().text();
    try {
      assertJsonApiResponse({ status: response.status, contentType, body: responsePreview }, route);
    } catch (error) {
      await response.body?.cancel().catch(() => undefined);
      throw error;
    }
    return response;
  } finally {
    clearTimeout(timeout);
    requestSignal?.removeEventListener("abort", forwardAbort);
  }
}

/**
 * Creates the tRPC client with proper configuration.
 * Call this once in your app's root layout.
 */
/**
 * AnalyzerX 3.26.0 is on-device first: every procedure resolves locally against
 * free/open sources through `localLink`, so the app needs no backend to show
 * live data. A remote server is used only when one is explicitly configured
 * through EXPO_PUBLIC_API_BASE_URL.
 */
export function createTRPCClient() {
  const remoteBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (!remoteBaseUrl) {
    return trpc.createClient({ links: [localLink] });
  }
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${remoteBaseUrl.replace(/\/$/, "")}/api/trpc`,
        // tRPC v11: transformer MUST be inside httpBatchLink, not at root
        transformer: superjson,
        async headers() {
          const token = await Auth.getSessionToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        // Keep every API request bounded without suppressing caller cancellation.
        fetch(url, options) {
          return fetchWithTimeout(url, options);
        },
      }),
    ],
  });
}

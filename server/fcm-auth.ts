/**
 * Firebase Cloud Messaging (HTTP v1) service-account authentication.
 *
 * FCM HTTP v1 has no static API key: the server mints a short-lived OAuth2 access token by signing
 * a JWT with the service-account private key, then exchanges it at Google's token endpoint. This is
 * free to use; the only requirement is the operator's own Firebase service account.
 *
 * The JWT is built and signed with Node's built-in `crypto`, so the signing is real and testable —
 * `tests/fcm-auth.test.ts` verifies the signature with the matching public key.
 */
import { createSign } from "node:crypto";

/** Google's OAuth2 token endpoint and the scope FCM needs. */
export const FCM_TOKEN_URI = "https://oauth2.googleapis.com/token";
export const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

/** How long a minted JWT is valid for (Google caps this at one hour). */
export const JWT_LIFETIME_SECONDS = 3_600;

export type FcmServiceAccount = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

/** Base64url without padding, as JWT requires. */
export function base64UrlEncode(input: string | Uint8Array): string {
  const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

/**
 * Parse the `FCM_SERVICE_ACCOUNT_JSON` value.
 * Accepts a JSON object (or a string containing one) and normalises escaped newlines in the key.
 * Returns null when the value is absent or incomplete — callers then stay on the free Expo path.
 */
export function parseServiceAccount(raw: string | undefined | null): FcmServiceAccount | null {
  if (!raw || !raw.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  const projectId = typeof record.project_id === "string" ? record.project_id : typeof record.projectId === "string" ? record.projectId : "";
  const clientEmail = typeof record.client_email === "string" ? record.client_email : typeof record.clientEmail === "string" ? record.clientEmail : "";
  const privateKeyRaw = typeof record.private_key === "string" ? record.private_key : typeof record.privateKey === "string" ? record.privateKey : "";
  if (!projectId || !clientEmail || !privateKeyRaw) return null;
  return { projectId, clientEmail, privateKey: privateKeyRaw.replace(/\\n/g, "\n").trim() };
}

export type JwtInput = {
  clientEmail: string;
  privateKey: string;
  tokenUri?: string;
  scope?: string;
  /** Issued-at, in seconds. */
  issuedAt: number;
  lifetimeSeconds?: number;
};

/**
 * Build and sign the service-account JWT (RS256).
 * Deterministic given the same inputs, which is what makes it testable.
 */
export function buildServiceAccountJwt(input: JwtInput): string {
  const tokenUri = input.tokenUri ?? FCM_TOKEN_URI;
  const scope = input.scope ?? FCM_SCOPE;
  const lifetime = Number.isFinite(input.lifetimeSeconds) ? Math.max(1, Math.min(JWT_LIFETIME_SECONDS, Math.floor(input.lifetimeSeconds as number))) : JWT_LIFETIME_SECONDS;
  const issuedAt = Math.max(0, Math.floor(input.issuedAt));
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64UrlEncode(JSON.stringify({ iss: input.clientEmail, scope, aud: tokenUri, iat: issuedAt, exp: issuedAt + lifetime }));
  const signingInput = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(input.privateKey);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

// --- access-token cache -------------------------------------------------------------------------

type CachedToken = { accessToken: string; expiresAtMs: number };
let cached: CachedToken | null = null;

/** Reset the in-memory access token (used by tests and on configuration change). */
export function clearFcmAccessTokenCache(): void {
  cached = null;
}

/** The minimum shape of a transport used to reach Google's token endpoint (injectable for tests). */
export type TokenTransport = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type AccessTokenResult = { status: "ok"; accessToken: string; expiresAtMs: number } | { status: "unconfigured" } | { status: "failed"; reason: string };

/**
 * Return a valid FCM access token, minting and caching one when needed.
 * Never throws: an authentication failure is returned as a value so delivery can degrade cleanly.
 */
export async function getFcmAccessToken(options: { transport: TokenTransport; serviceAccount: FcmServiceAccount | null; now?: number }): Promise<AccessTokenResult> {
  if (!options.serviceAccount) return { status: "unconfigured" };
  const now = options.now ?? Date.now();
  if (cached && cached.expiresAtMs - 60_000 > now) return { status: "ok", accessToken: cached.accessToken, expiresAtMs: cached.expiresAtMs };

  const issuedAt = Math.floor(now / 1_000);
  let assertion: string;
  try {
    assertion = buildServiceAccountJwt({ clientEmail: options.serviceAccount.clientEmail, privateKey: options.serviceAccount.privateKey, issuedAt });
  } catch (error) {
    return { status: "failed", reason: `Could not sign the service-account assertion: ${error instanceof Error ? error.message : String(error)}` };
  }

  try {
    const response = await options.transport(FCM_TOKEN_URI, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
    });
    if (!response.ok) return { status: "failed", reason: `The token endpoint returned HTTP ${response.status}.` };
    const payload = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
    if (!accessToken) return { status: "failed", reason: "The token endpoint returned no access token." };
    const expiresIn = typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in) ? payload.expires_in : JWT_LIFETIME_SECONDS;
    const expiresAtMs = now + Math.max(60, expiresIn) * 1_000;
    cached = { accessToken, expiresAtMs };
    return { status: "ok", accessToken, expiresAtMs };
  } catch (error) {
    return { status: "failed", reason: `Could not reach the token endpoint: ${error instanceof Error ? error.message : String(error)}` };
  }
}

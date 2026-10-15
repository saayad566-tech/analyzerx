import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  FCM_SCOPE,
  FCM_TOKEN_URI,
  JWT_LIFETIME_SECONDS,
  base64UrlDecode,
  base64UrlEncode,
  buildServiceAccountJwt,
  clearFcmAccessTokenCache,
  getFcmAccessToken,
  parseServiceAccount,
  type TokenTransport,
} from "../server/fcm-auth";

/**
 * The FCM service-account JWT is signed with Node's crypto, so the signature can be verified with
 * the matching public key — this is real verification, not a shape check.
 */

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function parts(jwt: string) {
  const [header, claims, signature] = jwt.split(".");
  return { header: JSON.parse(base64UrlDecode(header)) as Record<string, unknown>, claims: JSON.parse(base64UrlDecode(claims)) as Record<string, unknown>, signingInput: `${header}.${claims}`, signature };
}

describe("base64url", () => {
  it("round-trips and never emits padding or URL-unsafe characters", () => {
    const encoded = base64UrlEncode("AnalyzerX ₹ FCM — push");
    expect(encoded).not.toMatch(/[+/=]/);
    expect(base64UrlDecode(encoded)).toBe("AnalyzerX ₹ FCM — push");
  });
});

describe("service-account JWT", () => {
  it("produces a verifiable RS256 signature", () => {
    const jwt = buildServiceAccountJwt({ clientEmail: "svc@proj.iam.gserviceaccount.com", privateKey, issuedAt: 1_700_000_000 });
    const { header, claims, signingInput, signature } = parts(jwt);
    expect(header).toEqual({ alg: "RS256", typ: "JWT" });
    const verified = createVerify("RSA-SHA256").update(signingInput).verify(publicKey, Buffer.from(signature.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
    expect(verified).toBe(true);
  });

  it("carries the right claims and a one-hour expiry", () => {
    const jwt = buildServiceAccountJwt({ clientEmail: "svc@proj.iam.gserviceaccount.com", privateKey, issuedAt: 1_700_000_000 });
    const { claims } = parts(jwt);
    expect(claims.iss).toBe("svc@proj.iam.gserviceaccount.com");
    expect(claims.aud).toBe(FCM_TOKEN_URI);
    expect(claims.scope).toBe(FCM_SCOPE);
    expect(claims.iat).toBe(1_700_000_000);
    expect(claims.exp).toBe(1_700_000_000 + JWT_LIFETIME_SECONDS);
  });

  it("fails verification when the claims are tampered with", () => {
    const jwt = buildServiceAccountJwt({ clientEmail: "svc@proj.iam.gserviceaccount.com", privateKey, issuedAt: 1_700_000_000 });
    const { signingInput, signature } = parts(jwt);
    const tamperedClaims = base64UrlEncode(JSON.stringify({ iss: "attacker@evil.example", aud: FCM_TOKEN_URI, scope: FCM_SCOPE, iat: 1, exp: 9_999_999_999 }));
    const header = signingInput.split(".")[0];
    const verified = createVerify("RSA-SHA256").update(`${header}.${tamperedClaims}`).verify(publicKey, Buffer.from(signature.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
    expect(verified).toBe(false);
  });

  it("clamps an oversized requested lifetime to one hour", () => {
    const jwt = buildServiceAccountJwt({ clientEmail: "svc@x.iam.gserviceaccount.com", privateKey, issuedAt: 1_000, lifetimeSeconds: 999_999 });
    const { claims } = parts(jwt);
    expect((claims.exp as number) - (claims.iat as number)).toBe(JWT_LIFETIME_SECONDS);
  });
});

describe("parseServiceAccount", () => {
  it("parses a service account and unescapes the private key newlines", () => {
    const raw = JSON.stringify({ project_id: "proj", client_email: "svc@proj.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----" });
    const parsed = parseServiceAccount(raw);
    expect(parsed?.projectId).toBe("proj");
    expect(parsed?.clientEmail).toBe("svc@proj.iam.gserviceaccount.com");
    expect(parsed?.privateKey).toContain("\n");
    expect(parsed?.privateKey).not.toContain("\\n");
  });

  it("returns null for missing, malformed or incomplete values", () => {
    expect(parseServiceAccount(undefined)).toBeNull();
    expect(parseServiceAccount("")).toBeNull();
    expect(parseServiceAccount("not json")).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ project_id: "proj" }))).toBeNull();
  });
});

describe("getFcmAccessToken", () => {
  it("reports unconfigured when there is no service account", async () => {
    clearFcmAccessTokenCache();
    const result = await getFcmAccessToken({ transport: vi.fn() as unknown as TokenTransport, serviceAccount: null });
    expect(result.status).toBe("unconfigured");
  });

  it("mints a token, caches it, and does not call the endpoint twice", async () => {
    clearFcmAccessTokenCache();
    const transport = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ access_token: "ya29.test", expires_in: 3600 }) })) as unknown as TokenTransport;
    const serviceAccount = { projectId: "proj", clientEmail: "svc@proj.iam.gserviceaccount.com", privateKey };
    const first = await getFcmAccessToken({ transport, serviceAccount });
    const second = await getFcmAccessToken({ transport, serviceAccount });
    expect(first.status).toBe("ok");
    expect(second.status).toBe("ok");
    if (first.status === "ok" && second.status === "ok") expect(second.accessToken).toBe(first.accessToken);
    expect((transport as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1);
  });

  it("returns a failure value instead of throwing when the endpoint errors", async () => {
    clearFcmAccessTokenCache();
    const transport = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })) as unknown as TokenTransport;
    const result = await getFcmAccessToken({ transport, serviceAccount: { projectId: "proj", clientEmail: "svc@proj.iam.gserviceaccount.com", privateKey } });
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.reason).toContain("401");
  });

  it("returns a failure value when the private key cannot sign", async () => {
    clearFcmAccessTokenCache();
    const transport = vi.fn() as unknown as TokenTransport;
    const result = await getFcmAccessToken({ transport, serviceAccount: { projectId: "proj", clientEmail: "svc@proj.iam.gserviceaccount.com", privateKey: "not-a-key" } });
    expect(result.status).toBe("failed");
  });
});

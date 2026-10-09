import { describe, expect, it } from "vitest";
import { appRouter } from "../server/routers";
import type { TrpcContext } from "../server/_core/context";

function createContext(user: TrpcContext["user"] = null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("admin route authorization", () => {
  it("blocks provider telemetry access without an authenticated admin", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.providers.health()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks collector execution for a normal authenticated user", async () => {
    const caller = appRouter.createCaller(createContext({
      id: 1,
      openId: "user-1",
      email: "user@example.com",
      name: "User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    }));
    await expect(caller.sources.runNseCollector({ key: "announcements" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

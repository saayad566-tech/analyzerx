import { beforeEach, describe, expect, it, vi } from "vitest";
import { MARKETPLACE_TOOLS } from "../lib/marketplace";

const store = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => { store.set(key, value); },
    removeItem: async (key: string) => { store.delete(key); },
  },
}));

// The Forge Shelf filesystem now routes through the shared platform adapter, which is backed by
// react-native-fs. That module is Flow-typed native source and cannot be parsed in the Node test
// graph, so it is mocked here exactly as async-storage already is. The adapter's real behaviour is
// exercised on device, not in this suite.
vi.mock("@/lib/platform/file-system", () => ({
  documentDirectory: "/tmp/",
  cacheDirectory: "/tmp/",
  EncodingType: { Base64: "base64" },
  writeAsStringAsync: async () => undefined,
  readAsStringAsync: async () => "",
  deleteAsync: async () => undefined,
  getInfoAsync: async () => ({ exists: false, uri: "", isDirectory: false }),
  makeDirectoryAsync: async () => undefined,
  getFreeDiskStorageAsync: async () => 1_000_000_000,
  readDirectoryAsync: async () => [],
  moveAsync: async () => undefined,
  createDownloadResumable: () => ({
    downloadAsync: async () => undefined,
    pauseAsync: async function () { return this; },
    resumeAsync: async () => undefined,
    cancelAsync: async () => undefined,
    savable: () => ({ url: "", fileUri: "", options: {} }),
  }),
}));


const profile: any = {
  platform: "cpu", os: "test", architecture: "x64", cpuModel: "test", cpuCores: 4,
  totalMemoryBytes: 8_000_000_000, freeStorageBytes: 20_000_000_000, backend: "cpu", gpuName: null,
  vramBytes: null, driverVersion: null, hostConnected: false, capturedAt: new Date().toISOString(),
};

describe("ForgeShelf one-click installer", async () => {
  const { getForgeShelfInstall, installForgeShelfToolOneClick, resolveForgeShelfDependencies, validateForgeShelfPreflight } = await import("../lib/forge-shelf");
  beforeEach(() => store.clear());

  it("installs a built-in verified AnalyzerX contract atomically", async () => {
    const tool = MARKETPLACE_TOOLS.find((item) => item.id === "grounded-research-assistant")!;
    const progress: string[] = [];
    const result = await installForgeShelfToolOneClick(tool, profile, (item) => progress.push(item.stage));
    expect(result.record.state).toBe("installed");
    expect(result.record.verifiedSha256).toBeNull();
    expect(progress).toContain("preflight");
    expect(progress).toContain("complete");
    expect((await getForgeShelfInstall(tool.id))?.installedVersion).toBe(tool.version);
  });

  it("fails closed when a remote artifact has no pinned checksum", () => {
    const tool = { ...MARKETPLACE_TOOLS.find((item) => item.id === "finbert-financial-sentiment")!, releaseChannel: "verified" as const };
    expect(validateForgeShelfPreflight(tool, profile).join(" ")).toContain("pinned SHA-256");
  });

  it("declares dependent local-news capability requirements", () => {
    const tool = MARKETPLACE_TOOLS.find((item) => item.id === "android-local-sentiment")!;
    expect(resolveForgeShelfDependencies(tool)).toEqual(["grounded-research-assistant"]);
  });

  it("does not accept an unverified remote listing", async () => {
    const tool: any = { ...MARKETPLACE_TOOLS.find((item) => item.id === "finbert-financial-sentiment")!, releaseChannel: "candidate" };
    await expect(installForgeShelfToolOneClick(tool, profile)).rejects.toThrow("verified release channel");
    expect(await getForgeShelfInstall(tool.id)).toMatchObject({ state: "failed", installerStage: "failed" });
  });
});

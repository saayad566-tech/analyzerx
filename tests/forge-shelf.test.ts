import { beforeEach, describe, expect, it, vi } from "vitest";

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


describe("ForgeShelf lifecycle", async () => {
  const { activateForgeShelfTool, getActiveForgeShelfToolId, getForgeShelfInstall, installAnalyzerXTool, loadForgeShelfInstalls, removeForgeShelfInstall } = await import("../lib/forge-shelf");

  beforeEach(() => store.clear());

  it("persists a verified AnalyzerX tool as installed", async () => {
    const record = await installAnalyzerXTool("sec-edgar-filing-research", "1.0.0");
    expect(record.state).toBe("installed");
    expect((await getForgeShelfInstall("sec-edgar-filing-research"))?.installedVersion).toBe("1.0.0");
  });

  it("activates one installed tool and demotes the previous active tool", async () => {
    await installAnalyzerXTool("sec-edgar-filing-research", "1.0.0");
    await installAnalyzerXTool("pandas-ta-indicators", "0.2.67");
    await activateForgeShelfTool("sec-edgar-filing-research", "1.0.0");
    await activateForgeShelfTool("pandas-ta-indicators", "0.2.67");
    expect(await getActiveForgeShelfToolId()).toBe("pandas-ta-indicators");
    expect((await getForgeShelfInstall("sec-edgar-filing-research"))?.state).toBe("installed");
  });

  it("removes an install and active pointer safely", async () => {
    await installAnalyzerXTool("pandas-ta-indicators", "0.2.67");
    await activateForgeShelfTool("pandas-ta-indicators", "0.2.67");
    await removeForgeShelfInstall("pandas-ta-indicators");
    expect(await getActiveForgeShelfToolId()).toBeNull();
    expect(await loadForgeShelfInstalls()).toEqual([]);
  });
});

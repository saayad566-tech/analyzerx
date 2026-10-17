/**
 * Electron main process for the AnalyzerX desktop shell.
 *
 * Security posture (deliberately the strict defaults, per Electron's own guidance):
 *   - `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` — the renderer is a plain
 *     web page with no direct Node access; the only bridge is the curated `preload.cjs`.
 *   - `webviewTag: false` and window-open is denied, so a link can never open an in-app browser
 *     window; http(s) links are handed to the OS browser instead.
 *   - The window loads the bundled `app/index.html` from disk, so the app runs offline.
 */
const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");

const CANVAS = "#070A10";

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: CANVAS,
    title: "AnalyzerX",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });

  win.once("ready-to-show", () => win.show());

  // Never open a new window inside the shell; send real links to the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url);
    return { action: "deny" };
  });

  void win.loadFile(path.join(__dirname, "app", "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

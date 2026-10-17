/**
 * Preload bridge. The renderer gets exactly one thing: a read-only flag that says it is running in the
 * desktop shell. No Node API, no filesystem, no IPC surface is exposed.
 */
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("analyzerxDesktop", {
  isDesktop: true,
  platform: process.platform,
});

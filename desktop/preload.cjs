/* eslint-disable @typescript-eslint/no-require-imports -- Electron preload runs as CommonJS. */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("revisionReaderStorage", {
  loadLatestBackup: () =>
    ipcRenderer.invoke("revision-reader:load-latest-backup"),
  saveBackup: (entries) =>
    ipcRenderer.invoke("revision-reader:save-backup", entries),
});

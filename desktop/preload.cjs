/* eslint-disable @typescript-eslint/no-require-imports -- Electron preload runs as CommonJS. */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("revisionReaderStorage", {
  loadLatestBackup: () =>
    ipcRenderer.invoke("revision-reader:load-latest-backup"),
  saveBackup: (entries) =>
    ipcRenderer.invoke("revision-reader:save-backup", entries),
});

contextBridge.exposeInMainWorld("revisionReaderDesktop", {
  checkForUpdates: () =>
    ipcRenderer.invoke("revision-reader:check-for-updates"),
  openUpdateDownload: (url) =>
    ipcRenderer.invoke("revision-reader:open-update-download", url),
});

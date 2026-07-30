/* eslint-disable @typescript-eslint/no-require-imports -- Electron's packaged main process uses CommonJS. */
const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("node:path");

const APP_TITLE = "Revision Reader — 英语错句对照阅读器";
const appDataDirectory = path.join(path.dirname(process.execPath), "data");

app.setPath("userData", appDataDirectory);
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 860,
    minHeight: 620,
    backgroundColor: "#080a0d",
    autoHideMenuBar: true,
    show: false,
    title: APP_TITLE,
    icon: path.join(__dirname, "icon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => {
    window.show();
    window.focus();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  void window.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.setName("英语错句对照阅读器");
Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("second-instance", () => {
  const [window] = BrowserWindow.getAllWindows();
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

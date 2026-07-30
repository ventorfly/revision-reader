/* eslint-disable @typescript-eslint/no-require-imports -- Electron's packaged main process uses CommonJS. */
const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  shell,
  Tray,
} = require("electron");
const path = require("node:path");
const {
  loadLatestBackup,
  migrateLegacyUserData,
  writeAutoBackup,
} = require("./storage.cjs");

const APP_TITLE = "Revision Reader — 英语错句对照阅读器";
const LEGACY_DATA_DIRECTORY = path.join(
  path.dirname(process.execPath),
  "data",
);
const APP_DATA_DIRECTORY = path.join(
  app.getPath("appData"),
  "Revision Reader",
);

migrateLegacyUserData(
  LEGACY_DATA_DIRECTORY,
  APP_DATA_DIRECTORY,
);
app.setPath("userData", APP_DATA_DIRECTORY);
const hasSingleInstanceLock = app.requestSingleInstanceLock();
let mainWindow = null;
let tray = null;
let isQuitting = false;
let backgroundNoticeShown = false;

if (!hasSingleInstanceLock) {
  app.quit();
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.setSkipTaskbar(false);
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  if (tray) return;

  tray = new Tray(path.join(__dirname, "icon.ico"));
  tray.setToolTip("Revision Reader — 英语错句对照阅读器");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "打开 Revision Reader",
        click: showMainWindow,
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => app.quit(),
      },
    ]),
  );
  tray.on("click", showMainWindow);
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow();
    return;
  }

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
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
    },
  });
  mainWindow = window;

  window.once("ready-to-show", () => {
    showMainWindow();
  });

  window.on("close", (event) => {
    if (isQuitting) return;

    event.preventDefault();
    window.hide();
    window.setSkipTaskbar(true);

    if (
      process.platform === "win32" &&
      tray &&
      !backgroundNoticeShown
    ) {
      backgroundNoticeShown = true;
      tray.displayBalloon({
        title: "Revision Reader 正在后台运行",
        content: "点击右下角托盘图标可重新打开；右键图标可以彻底退出。",
        iconType: "info",
      });
    }
  });

  window.on("query-session-end", () => {
    isQuitting = true;
  });

  window.on("closed", () => {
    mainWindow = null;
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

app.on("before-quit", () => {
  isQuitting = true;
});

app.whenReady().then(() => {
  ipcMain.handle("revision-reader:load-latest-backup", () => {
    try {
      const backup = loadLatestBackup(APP_DATA_DIRECTORY);
      return backup
        ? { ok: true, ...backup }
        : { ok: false, error: "backup-not-found" };
    } catch {
      return { ok: false, error: "backup-read-failed" };
    }
  });

  ipcMain.handle("revision-reader:save-backup", (_event, entries) => {
    try {
      return {
        ok: true,
        ...writeAutoBackup(APP_DATA_DIRECTORY, entries),
      };
    } catch {
      return { ok: false, error: "backup-write-failed" };
    }
  });

  createTray();
  createWindow();

  app.on("activate", () => {
    showMainWindow();
  });
});

app.on("second-instance", () => {
  showMainWindow();
});

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
const UPDATE_RELEASE_API =
  "https://api.github.com/repos/ventorfly/revision-reader/releases/latest";
const UPDATE_REPOSITORY_PATH = "/ventorfly/revision-reader/";
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

function isNewerVersion(latestVersion, currentVersion) {
  const normalize = (version) =>
    String(version)
      .replace(/^v/i, "")
      .split(".")
      .slice(0, 3)
      .map((part) => Number.parseInt(part, 10) || 0);
  const latest = normalize(latestVersion);
  const current = normalize(currentVersion);

  for (let index = 0; index < 3; index += 1) {
    if (latest[index] > current[index]) return true;
    if (latest[index] < current[index]) return false;
  }
  return false;
}

function isAllowedUpdateUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      url.pathname.startsWith(UPDATE_REPOSITORY_PATH)
    );
  } catch {
    return false;
  }
}

async function checkForUpdates() {
  const currentVersion = app.getVersion();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(UPDATE_RELEASE_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Revision-Reader",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);

    const release = await response.json();
    const latestVersion = String(release.tag_name || "").replace(/^v/i, "");
    if (!latestVersion) throw new Error("Latest release has no version tag");

    const installer = Array.isArray(release.assets)
      ? release.assets.find(
          (asset) =>
            typeof asset?.name === "string" &&
            /^Revision-Reader-Setup-.*\.exe$/i.test(asset.name),
        )
      : null;
    const downloadUrl =
      installer?.browser_download_url || release.html_url || "";

    return {
      ok: true,
      currentVersion,
      latestVersion,
      updateAvailable: isNewerVersion(latestVersion, currentVersion),
      downloadUrl: isAllowedUpdateUrl(downloadUrl) ? downloadUrl : "",
    };
  } catch {
    return { ok: false, currentVersion, error: "update-check-failed" };
  } finally {
    clearTimeout(timeout);
  }
}

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

  ipcMain.handle("revision-reader:check-for-updates", checkForUpdates);

  ipcMain.handle(
    "revision-reader:open-update-download",
    async (_event, url) => {
      if (!isAllowedUpdateUrl(url)) {
        return { ok: false, error: "invalid-update-url" };
      }

      await shell.openExternal(url);
      return { ok: true };
    },
  );

  createTray();
  createWindow();

  app.on("activate", () => {
    showMainWindow();
  });
});

app.on("second-instance", () => {
  showMainWindow();
});

import { spawn } from "node:child_process";
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
} from "node:fs";
import { createConnection } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const workDir = join(projectRoot, "work");
const serverLog = join(workDir, "shortcut-server.log");
const statusLog = join(workDir, "shortcut-status.log");
const localServerPath = join(projectRoot, "local-server.mjs");
const host = "127.0.0.1";
const port = 3000;
const appUrl = `http://${host}:${port}/`;
const serverEnvironment = { ...process.env };

for (const name of [
  "ALL_PROXY",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "all_proxy",
  "http_proxy",
  "https_proxy",
]) {
  delete serverEnvironment[name];
}

mkdirSync(workDir, { recursive: true });

function log(message) {
  appendFileSync(
    statusLog,
    `${new Date().toISOString()} ${message}\n`,
    "utf8",
  );
}

function portIsOpen() {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(1000);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function appIsReady() {
  try {
    const page = await fetch(appUrl, { signal: AbortSignal.timeout(5000) });
    if (!page.ok) return false;
    const html = await page.text();
    if (!html.includes("Revision Reader")) return false;

    const cssPath = html.match(/href="([^"]+\.css)"/)?.[1];
    if (!cssPath) return false;
    const css = await fetch(new URL(cssPath, appUrl), {
      signal: AbortSignal.timeout(5000),
    });
    if (!css.ok) return false;

    const cssType = css.headers.get("content-type") ?? "";
    const cssBody = await css.text();
    return (
      cssType.includes("text/css") ||
      (cssType.includes("javascript") &&
        cssBody.includes("__vite__updateStyle"))
    );
  } catch {
    return false;
  }
}

function openApp() {
  const launchUrl = `${appUrl}?opened=${Date.now()}`;
  const chromeCandidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  const chrome = chromeCandidates.find((candidate) => existsSync(candidate));
  const program =
    chrome ?? join(process.env.WINDIR ?? "C:\\Windows", "explorer.exe");
  const args = chrome
    ? [`--app=${launchUrl}`, "--new-window"]
    : [launchUrl];

  spawn(program, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  }).unref();
  log(`Opened ${launchUrl} with ${chrome ? "Chrome app window" : "browser"}`);
}

async function main() {
  log("Launcher started");

  if (await appIsReady()) {
    log("Existing app server is ready on port 3000");
    openApp();
    return;
  }

  if (await portIsOpen()) {
    log("Port 3000 is occupied by an invalid or incomplete server");
    spawn("notepad.exe", [statusLog], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    }).unref();
    return;
  }

  if (!existsSync(localServerPath)) {
    log("Required app files are missing");
    spawn("notepad.exe", [statusLog], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    }).unref();
    return;
  }

  const output = openSync(serverLog, "a");
  const server = spawn(
    process.execPath,
    [localServerPath],
    {
      cwd: projectRoot,
      detached: true,
      env: serverEnvironment,
      stdio: ["ignore", output, output],
      windowsHide: true,
    },
  );
  server.unref();
  closeSync(output);
  log(`Started local app server with pid ${server.pid}`);

  for (let attempt = 0; attempt < 120; attempt += 1) {
    await delay(500);
    if (await appIsReady()) {
      log("App server and CSS are ready");
      openApp();
      return;
    }
  }

  log("Server did not become ready");
  spawn("notepad.exe", [statusLog], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  }).unref();
}

main().catch((error) => {
  log(`Launcher failed: ${error instanceof Error ? error.stack : error}`);
});

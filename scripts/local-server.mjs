import { spawn } from "node:child_process";
import {
  createReadStream,
  existsSync,
  statSync,
} from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const clientRoot = resolve(projectRoot, "dist", "client");
const cliPath = join(projectRoot, "node_modules", "vinext", "dist", "cli.js");
const host = "127.0.0.1";
const publicPort = 3000;
const backendPort = 31777;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function staticFileFor(rawUrl) {
  const pathname = decodeURIComponent(new URL(rawUrl, "http://localhost").pathname);
  const relativePath = normalize(pathname).replace(/^[/\\]+/, "");
  const candidate = resolve(clientRoot, relativePath);

  if (
    !candidate.startsWith(`${clientRoot}\\`) &&
    !candidate.startsWith(`${clientRoot}/`)
  ) {
    return null;
  }

  if (!existsSync(candidate) || !statSync(candidate).isFile()) return null;
  return candidate;
}

function serveStatic(filePath, response, method) {
  response.statusCode = 200;
  response.setHeader(
    "Content-Type",
    mimeTypes[extname(filePath).toLowerCase()] ??
      "application/octet-stream",
  );
  response.setHeader("Cache-Control", "no-cache");

  if (method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
}

function proxyToApp(request, response) {
  const headers = { ...request.headers, host: `${host}:${backendPort}` };
  const proxyRequest = httpRequest(
    {
      host,
      port: backendPort,
      path: request.url,
      method: request.method,
      headers,
    },
    (proxyResponse) => {
      response.writeHead(
        proxyResponse.statusCode ?? 502,
        proxyResponse.headers,
      );
      proxyResponse.pipe(response);
    },
  );

  proxyRequest.on("error", () => {
    if (response.headersSent) {
      response.end();
      return;
    }
    response.writeHead(503, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "1",
    });
    response.end("Revision Reader is starting. Please refresh in a moment.");
  });

  request.pipe(proxyRequest);
}

if (!existsSync(clientRoot) || !existsSync(cliPath)) {
  throw new Error("Revision Reader build files are missing.");
}

const backend = spawn(
  process.execPath,
  [
    cliPath,
    "start",
    "--hostname",
    host,
    "--port",
    String(backendPort),
  ],
  {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  },
);

backend.on("exit", (code) => {
  console.error(`Revision Reader backend exited with code ${code ?? "unknown"}.`);
  process.exit(code ?? 1);
});

const server = createServer((request, response) => {
  if (request.method === "GET" || request.method === "HEAD") {
    const filePath = staticFileFor(request.url ?? "/");
    if (filePath) {
      serveStatic(filePath, response, request.method);
      return;
    }
  }

  proxyToApp(request, response);
});

server.listen(publicPort, host, () => {
  console.log(`Revision Reader is available at http://${host}:${publicPort}/`);
});

function shutdown() {
  server.close();
  backend.kill();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

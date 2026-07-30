import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Revision Reader shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Revision Reader — 英语错句对照阅读器<\/title>/i);
  assert.match(html, /Revision Reader/);
  assert.match(html, /Original/);
  assert.match(html, /Changed/);
  assert.match(html, /新增一组/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("keeps the learning, local-storage, and responsive feature contracts", async () => {
  const [page, css, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /window\.localStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(page, /window\.localStorage\.setItem\(STORAGE_KEY/);
  assert.match(page, /crypto\.randomUUID\(\)/);
  assert.match(page, /application\/json/);
  assert.match(page, /`diff-\$\{segment\.kind\}`/);
  assert.match(page, /sampleEntries/);
  assert.match(page, /activeTag/);
  assert.match(page, /normalizedQuery/);

  assert.match(css, /\.comparison-card[\s\S]*grid-template-columns:/);
  assert.match(css, /@media \(max-width: 880px\)/);
  assert.match(css, /\.comparison-card\s*\{[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(css, /\.diff-removed/);
  assert.match(css, /\.diff-added/);
  assert.match(css, /prefers-reduced-motion/);

  assert.match(layout, /Revision Reader/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(
    access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)),
  );
});

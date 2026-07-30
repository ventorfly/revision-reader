import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import storage from "../desktop/storage.cjs";

const {
  loadLatestBackup,
  migrateLegacyUserData,
  normalizeEntries,
  writeAutoBackup,
} = storage;

function makeEntry(id = "entry-1") {
  return {
    id,
    original: "She go home.",
    changed: "She goes home.",
    note: "第三人称单数。",
    tags: ["时态"],
    createdAt: "2026-07-30",
    updatedAt: "2026-07-30",
  };
}

async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), "revision-reader-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("normalizes older entries that do not contain updatedAt", () => {
  const entry = makeEntry();
  delete entry.updatedAt;

  const normalized = normalizeEntries([entry]);
  assert.equal(normalized?.[0].updatedAt, entry.createdAt);
});

test("migrates the legacy Electron profile without deleting the source", async (t) => {
  const root = await temporaryDirectory(t);
  const legacy = join(root, "legacy-data");
  const target = join(root, "new-user-data");
  await mkdir(join(legacy, "Local Storage"), { recursive: true });
  await writeFile(
    join(legacy, "Local Storage", "entries.leveldb"),
    "personal-sentences",
  );

  const result = migrateLegacyUserData(legacy, target);

  assert.equal(result.migrated, true);
  assert.equal(
    await readFile(
      join(target, "Local Storage", "entries.leveldb"),
      "utf8",
    ),
    "personal-sentences",
  );
  assert.equal(
    await readFile(
      join(legacy, "Local Storage", "entries.leveldb"),
      "utf8",
    ),
    "personal-sentences",
  );
});

test("writes the latest recovery copy", async (t) => {
  const userData = await temporaryDirectory(t);
  const entries = [makeEntry()];
  const savedAt = new Date("2026-07-30T08:00:00.000Z");

  const result = writeAutoBackup(userData, entries, savedAt);
  assert.equal(result.savedAt, savedAt.toISOString());

  const restored = loadLatestBackup(userData);
  assert.deepEqual(restored?.entries, entries);
});

test("falls back to the backup made before an update", async (t) => {
  const userData = await temporaryDirectory(t);
  const entries = [makeEntry()];
  writeAutoBackup(
    userData,
    entries,
    new Date("2026-07-30T08:00:00.000Z"),
  );

  const installerDirectory = join(
    userData,
    "backups",
    "installer",
  );
  await mkdir(installerDirectory, { recursive: true });
  await writeFile(
    join(installerDirectory, "before-update.json"),
    await readFile(join(userData, "backups", "latest.json"), "utf8"),
  );
  await writeFile(join(userData, "backups", "latest.json"), "{damaged");

  const restored = loadLatestBackup(userData);
  assert.deepEqual(restored?.entries, entries);
  assert.match(restored?.source ?? "", /before-update\.json$/);
});

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
    kind: "comparison",
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
  delete entry.kind;

  const normalized = normalizeEntries([entry]);
  assert.equal(normalized?.[0].updatedAt, entry.createdAt);
  assert.equal(normalized?.[0].kind, "comparison");
  assert.equal(normalized?.[0].preserveNoteLineBreaks, undefined);
});

test("preserves knowledge-point entries in desktop backups", () => {
  const entry = {
    ...makeEntry("knowledge-1"),
    kind: "knowledge",
    original: "catch up on + noun",
    changed: "",
    note: "把之前落下的东西补回来。",
  };

  assert.deepEqual(normalizeEntries([entry])?.[0], entry);
});

test("review status and time survive backup recovery and later regrading", async (t) => {
  const userData = await temporaryDirectory(t);
  const entry = {
    ...makeEntry(),
    review: { status: "known", reviewedAt: "2026-09-29T10:30:00.000Z" },
  };
  writeAutoBackup(userData, [entry]);
  assert.deepEqual(loadLatestBackup(userData)?.entries, [entry]);
  const regraded = { ...entry, review: { status: "again", reviewedAt: "2026-09-30T10:30:00.000Z" } };
  writeAutoBackup(userData, [regraded]);
  const recovered = loadLatestBackup(userData)?.entries[0];
  assert.deepEqual(recovered, regraded);
  assert.equal(recovered.updatedAt, entry.updatedAt);
});

test("invalid optional review metadata never discards a sentence", () => {
  const entry = makeEntry();
  for (const review of [null, {}, { status: "other", reviewedAt: "2026-09-29T00:00:00.000Z" }, { status: "known", reviewedAt: "not-a-date" }]) {
    assert.deepEqual(normalizeEntries([{ ...entry, review }]), [entry]);
  }
});

test("preserves line breaks inside notes", async (t) => {
  const userData = await temporaryDirectory(t);
  const multilineNote =
    "更自然的说法是 Is anyone there?\n= 那里有人吗？\n或者：Are there any people there?";
  const entries = [
    {
      ...makeEntry("multiline-note"),
      note: multilineNote,
      preserveNoteLineBreaks: true,
    },
  ];

  writeAutoBackup(userData, entries, new Date("2026-09-02T08:00:00.000Z"));

  const restored = loadLatestBackup(userData);
  assert.equal(restored?.entries[0].note, multilineNote);
  assert.equal(restored?.entries[0].preserveNoteLineBreaks, true);
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

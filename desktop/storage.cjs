/* eslint-disable @typescript-eslint/no-require-imports -- Electron storage runs as CommonJS. */
const fs = require("node:fs");
const path = require("node:path");

const BACKUP_SCHEMA_VERSION = 1;
const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function normalizeEntries(value) {
  if (!Array.isArray(value)) return null;

  const entries = [];
  for (const entry of value) {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof entry.id !== "string" ||
      typeof entry.original !== "string" ||
      typeof entry.changed !== "string" ||
      typeof entry.note !== "string" ||
      !Array.isArray(entry.tags) ||
      !entry.tags.every((tag) => typeof tag === "string") ||
      typeof entry.createdAt !== "string"
    ) {
      return null;
    }

    entries.push({
      id: entry.id,
      kind: entry.kind === "knowledge" ? "knowledge" : "comparison",
      original: entry.original,
      changed: entry.changed,
      note: entry.note,
      tags: [...entry.tags],
      createdAt: entry.createdAt,
      updatedAt:
        typeof entry.updatedAt === "string"
          ? entry.updatedAt
          : entry.createdAt,
    });
  }

  return entries;
}

function migrateLegacyUserData(legacyDirectory, targetDirectory) {
  if (
    !legacyDirectory ||
    !targetDirectory ||
    path.resolve(legacyDirectory) === path.resolve(targetDirectory) ||
    !fs.existsSync(legacyDirectory)
  ) {
    return { migrated: false, reason: "not-needed" };
  }

  const targetAlreadyInitialized = ["Local Storage", "Preferences"].some(
    (name) => fs.existsSync(path.join(targetDirectory, name)),
  );

  if (targetAlreadyInitialized) {
    return { migrated: false, reason: "target-in-use" };
  }

  ensureDirectory(targetDirectory);
  fs.cpSync(legacyDirectory, targetDirectory, {
    recursive: true,
    errorOnExist: false,
    force: false,
  });

  return { migrated: true, reason: "copied" };
}

function atomicWriteJson(filePath, payload) {
  ensureDirectory(path.dirname(filePath));
  const serialized = JSON.stringify(payload, null, 2);

  if (Buffer.byteLength(serialized, "utf8") > MAX_BACKUP_BYTES) {
    throw new Error("Backup exceeds the supported size");
  }

  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, serialized, {
    encoding: "utf8",
    flag: "wx",
  });

  try {
    fs.copyFileSync(temporaryPath, filePath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

function getBackupPaths(userDataDirectory) {
  const backupDirectory = path.join(userDataDirectory, "backups");
  const installerBackupDirectory = path.join(
    backupDirectory,
    "installer",
  );

  return {
    backupDirectory,
    installerBackupDirectory,
    latestPath: path.join(backupDirectory, "latest.json"),
  };
}

function writeAutoBackup(userDataDirectory, value, now = new Date()) {
  const entries = normalizeEntries(value);
  if (!entries) throw new Error("Invalid entries");

  const savedAt = now.toISOString();
  const payload = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    savedAt,
    entries,
  };
  const { latestPath } = getBackupPaths(userDataDirectory);

  atomicWriteJson(latestPath, payload);

  return { savedAt };
}

function readBackupFile(filePath) {
  const stats = fs.statSync(filePath);
  if (stats.size > MAX_BACKUP_BYTES) {
    throw new Error("Backup exceeds the supported size");
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const entries = normalizeEntries(parsed?.entries);
  if (
    !entries ||
    parsed?.schemaVersion !== BACKUP_SCHEMA_VERSION ||
    typeof parsed?.savedAt !== "string"
  ) {
    throw new Error("Invalid backup");
  }

  return {
    entries,
    savedAt: parsed.savedAt,
    source: filePath,
  };
}

function loadLatestBackup(userDataDirectory) {
  const { latestPath, installerBackupDirectory } =
    getBackupPaths(userDataDirectory);
  const candidates = [
    latestPath,
    path.join(installerBackupDirectory, "before-update.json"),
    path.join(installerBackupDirectory, "before-uninstall.json"),
  ];
  const validBackups = [];

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    try {
      validBackups.push(readBackupFile(filePath));
    } catch {
      // Continue to an operation backup if the latest file is damaged.
    }
  }

  return (
    validBackups.sort((left, right) =>
      right.savedAt.localeCompare(left.savedAt),
    )[0] ?? null
  );
}

module.exports = {
  BACKUP_SCHEMA_VERSION,
  loadLatestBackup,
  migrateLegacyUserData,
  normalizeEntries,
  writeAutoBackup,
};

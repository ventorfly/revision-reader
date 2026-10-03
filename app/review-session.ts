export type ReviewRecord = { status: "known" | "again"; reviewedAt: string };
type ReviewEntry = { id: string; kind: string; changed: string; review?: ReviewRecord };

export const REVIEW_ROUND_SIZE = 15;
export const REVIEW_SESSION_KEY = "revision-reader.review-session.v1";

export type ReviewPosition = {
  roundIds: string[];
  remainingIds: string[];
  retryIds: string[];
  index: number;
  revealedId: string | null;
  roundNumber: number;
};
export type SavedReview = {
  version: 1;
  position: ReviewPosition;
  undo: null | {
    position: ReviewPosition;
    entryId: string;
    previousReview: ReviewRecord | null;
    appliedReview: ReviewRecord;
  };
};

const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const ids = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((id) => typeof id === "string") &&
  new Set(value).size === value.length;
const record = (value: unknown): value is ReviewRecord =>
  object(value) && (value.status === "known" || value.status === "again") &&
  typeof value.reviewedAt === "string" && Number.isFinite(Date.parse(value.reviewedAt));
const sameReview = (a: ReviewRecord | undefined, b: ReviewRecord) =>
  a?.status === b.status && a.reviewedAt === b.reviewedAt;

function readPosition(value: unknown, liveIds: Set<string>): ReviewPosition | null {
  if (!object(value) || !ids(value.roundIds) || !ids(value.remainingIds) ||
    !ids(value.retryIds) || value.roundIds.length > REVIEW_ROUND_SIZE ||
    !Number.isSafeInteger(value.index) || typeof value.index !== "number" ||
    value.index < 0 || value.index > value.roundIds.length ||
    !Number.isSafeInteger(value.roundNumber) || typeof value.roundNumber !== "number" ||
    value.roundNumber < 1 || (value.revealedId !== null && typeof value.revealedId !== "string")) return null;
  const roundIds = value.roundIds.filter((id) => liveIds.has(id));
  // Count surviving processed cards, so deleting an earlier card never skips the current one.
  const index = value.roundIds.slice(0, value.index).filter((id) => liveIds.has(id)).length;
  return {
    roundIds,
    remainingIds: value.remainingIds.filter((id) => liveIds.has(id) && !roundIds.includes(id)),
    retryIds: value.retryIds.filter((id) => roundIds.slice(0, index).includes(id)),
    index,
    revealedId: value.revealedId === roundIds[index] ? value.revealedId : null,
    roundNumber: value.roundNumber,
  };
}

export function restoreReview(value: unknown, entries: ReviewEntry[]): SavedReview | null {
  if (!object(value) || value.version !== 1) return null;
  const live = entries.filter((entry) => entry.kind === "comparison" && entry.changed.trim());
  const liveIds = new Set(live.map((entry) => entry.id));
  const position = readPosition(value.position, liveIds);
  if (!position || (!position.roundIds.length && !position.remainingIds.length)) return null;
  let undo: SavedReview["undo"] = null;
  if (object(value.undo) && typeof value.undo.entryId === "string" &&
    record(value.undo.appliedReview) &&
    (value.undo.previousReview === null || record(value.undo.previousReview))) {
    const entryId = value.undo.entryId;
    const previous = readPosition(value.undo.position, liveIds);
    const entry = live.find((item) => item.id === entryId);
    // Never resurrect a deleted card or overwrite a newer grade imported from elsewhere.
    if (previous && entry && previous.roundIds[previous.index] === entry.id &&
      sameReview(entry.review, value.undo.appliedReview)) {
      undo = { position: previous, entryId: entry.id,
        previousReview: value.undo.previousReview, appliedReview: value.undo.appliedReview };
    }
  }
  return { version: 1, position, undo };
}

export function createReview(entryIds: string[]): SavedReview {
  const unique = [...new Set(entryIds)];
  return { version: 1, position: { roundIds: unique.slice(0, REVIEW_ROUND_SIZE),
    remainingIds: unique.slice(REVIEW_ROUND_SIZE), retryIds: [], index: 0,
    revealedId: null, roundNumber: 1 }, undo: null };
}

export function gradeReview(session: SavedReview, entry: ReviewEntry, appliedReview: ReviewRecord): SavedReview {
  const p = session.position;
  if (p.roundIds[p.index] !== entry.id || p.revealedId !== entry.id) return session;
  return { ...session, position: { ...p, index: p.index + 1, revealedId: null,
    retryIds: appliedReview.status === "again" ? [...p.retryIds, entry.id] : p.retryIds },
    undo: { position: p, entryId: entry.id, previousReview: entry.review ?? null, appliedReview } };
}

export function nextReviewRound(session: SavedReview, retry: boolean): SavedReview {
  const p = session.position;
  const items = retry ? p.retryIds : p.remainingIds;
  if (!items.length || p.index < p.roundIds.length) return session;
  return { ...session, position: { roundIds: items.slice(0, REVIEW_ROUND_SIZE),
    remainingIds: retry ? p.remainingIds : [...items.slice(REVIEW_ROUND_SIZE), ...p.retryIds],
    retryIds: [], index: 0, revealedId: null, roundNumber: p.roundNumber + 1 } };
}

export function undoReview<T extends ReviewEntry>(session: SavedReview, entries: T[]) {
  const valid = restoreReview(session, entries);
  const undo = valid?.undo;
  if (!undo) return null;
  return {
    session: { version: 1 as const, position: undo.position, undo: null },
    entries: entries.map((entry) => {
      if (entry.id !== undo.entryId) return entry;
      const restored = { ...entry };
      if (undo.previousReview) restored.review = undo.previousReview;
      else delete restored.review;
      return restored;
    }),
  };
}

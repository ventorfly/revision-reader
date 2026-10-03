import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const source = await readFile(new URL('../app/review-session.ts', import.meta.url), 'utf8');
const { createReview, restoreReview, gradeReview, nextReviewRound, undoReview } = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`
);

const entries = (n = 18) => Array.from({ length: n }, (_, i) => ({ id: String(i), kind: 'comparison', changed: `Answer ${i}`, original: `Prompt ${i}`, note: 'keep note', updatedAt: 'keep date' }));
const record = (status = 'known', time = '2026-10-03T01:00:00.000Z') => ({ status, reviewedAt: time });
function grade(session, data, status = 'known') {
  const id = session.position.roundIds[session.position.index];
  const revealed = { ...session, position: { ...session.position, revealedId: id } };
  const review = record(status);
  return { session: gradeReview(revealed, data.find(e => e.id === id), review), data: data.map(e => e.id === id ? { ...e, review } : e) };
}

test('resume preserves position, order, reveal, remainder and undo across JSON storage', () => {
  let data = entries();
  const first = grade(createReview(data.map(e => e.id)), data, 'again');
  first.session.position.revealedId = '1';
  const restored = restoreReview(JSON.parse(JSON.stringify(first.session)), first.data);
  assert.deepEqual(restored, first.session);
  assert.equal(restored.position.roundIds.length, 15);
  assert.equal(restored.position.remainingIds.length, 3);
  assert.equal(restored.position.index, 1);
  assert.deepEqual(restored.position.retryIds, ['0']);
});

test('undo first grade restores unseen status and all other fields exactly', () => {
  const data = entries();
  const graded = grade(createReview(data.map(e => e.id)), data, 'again');
  const undone = undoReview(graded.session, graded.data);
  assert.deepEqual(undone.entries, data);
  assert.equal(undone.session.position.index, 0);
  assert.equal(undone.session.position.revealedId, '0');
  assert.deepEqual(undone.session.position.retryIds, []);
  assert.equal(undoReview(undone.session, undone.entries), null);
});

test('undo restores previous grade and timestamp without reverting subsequent content edits', () => {
  const data = entries();
  data[0].review = record('again', '2026-10-01T12:00:00.000Z');
  const graded = grade(createReview(data.map(e => e.id)), data);
  graded.data[0].changed = 'Edited answer';
  const undone = undoReview(graded.session, graded.data);
  assert.deepEqual(undone.entries[0].review, data[0].review);
  assert.equal(undone.entries[0].changed, 'Edited answer');
});

test('last item can be undone from completion and after entering the next round', () => {
  let data = entries(16), session = createReview(data.map(e => e.id));
  for (let i = 0; i < 15; i++) ({ session, data } = grade(session, data, i === 14 ? 'again' : 'known'));
  assert.equal(session.position.index, 15);
  assert.equal(undoReview(session, data).session.position.index, 14);
  const next = nextReviewRound(session, false);
  assert.deepEqual(next.position.roundIds, ['15']);
  assert.deepEqual(next.position.remainingIds, ['14']);
  const undone = undoReview(next, data);
  assert.equal(undone.session.position.roundNumber, 1);
  assert.equal(undone.session.position.index, 14);
  assert.equal(undone.entries[14].review, undefined);
});

test('retry round and undo do not lose remaining unseen cards', () => {
  let data = entries(16), session = createReview(data.map(e => e.id));
  for (let i = 0; i < 15; i++) ({ session, data } = grade(session, data, i === 0 ? 'again' : 'known'));
  session = nextReviewRound(session, true);
  assert.deepEqual(session.position.roundIds, ['0']);
  assert.deepEqual(session.position.remainingIds, ['15']);
  ({ session, data } = grade(session, data));
  const undone = undoReview(session, data);
  assert.equal(undone.entries[0].review.status, 'again');
  assert.deepEqual(undone.session.position.remainingIds, ['15']);
});

test('removing an earlier card keeps current position and deleting current hides the next answer', () => {
  let data = entries(), session = createReview(data.map(e => e.id));
  for (let i = 0; i < 2; i++) ({ session, data } = grade(session, data));
  session.position.revealedId = '2';
  const restored = restoreReview(session, data.filter(e => e.id !== '0'));
  assert.equal(restored.position.roundIds[restored.position.index], '2');
  const deleted = restoreReview(restored, data.filter(e => !['0', '2'].includes(e.id)));
  assert.equal(deleted.position.roundIds[deleted.position.index], '3');
  assert.equal(deleted.position.revealedId, null);
});

test('resume excludes knowledge cards and empty answers; deleted undo target stays deleted', () => {
  const data = entries();
  const graded = grade(createReview(data.map(e => e.id)), data);
  graded.data[1].kind = 'knowledge'; graded.data[2].changed = '';
  const restored = restoreReview(graded.session, graded.data.filter(e => e.id !== '0'));
  assert.equal(restored.position.roundIds[restored.position.index], '3');
  assert.equal(restored.undo, null);
  assert.equal(restoreReview(graded.session, []), null);
});

test('corrupted progress is ignored and a newer grade cannot be overwritten by stale undo', () => {
  const data = entries();
  const graded = grade(createReview(data.map(e => e.id)), data);
  for (const invalid of [null, {}, {version: 2}, {...graded.session, position: {...graded.session.position, index: -1}}, {...graded.session, position: {...graded.session.position, roundIds: ['0', '0']}}]) assert.equal(restoreReview(invalid, data), null);
  graded.data[0].review = record('again', '2026-10-04T01:00:00.000Z');
  assert.equal(restoreReview(graded.session, graded.data).undo, null);
});

test('grading a hidden or different card does nothing, and incomplete rounds cannot advance', () => {
  const data = entries(), session = createReview(data.map(e => e.id));
  assert.equal(gradeReview(session, data[0], record()), session);
  assert.equal(gradeReview(session, data[1], record()), session);
  assert.equal(nextReviewRound(session, false), session);
});

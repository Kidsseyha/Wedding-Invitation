import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldSkipImageRecompression,
  needsFirestoreCompaction,
  raceWithTimeout,
  getEventTimestampMs,
  pickNewestDatabaseEvent,
} from './saveHelpers';

test('shouldSkipImageRecompression skips non-data URLs and small data images', () => {
  assert.equal(shouldSkipImageRecompression('https://example.com/photo.jpg'), true);
  assert.equal(shouldSkipImageRecompression('data:image/jpeg;base64,abc123'), true);
  assert.equal(
    shouldSkipImageRecompression('data:image/jpeg;base64,' + 'A'.repeat(100_000)),
    false
  );
});

test('needsFirestoreCompaction triggers only near Firestore size limit', () => {
  assert.equal(needsFirestoreCompaction(120_000), false);
  assert.equal(needsFirestoreCompaction(549_999), false);
  assert.equal(needsFirestoreCompaction(550_000), true);
});

test('raceWithTimeout resolves quickly when promise hangs past timeoutMs', async () => {
  const neverResolves = new Promise<string>(() => {});
  const start = Date.now();
  const res = await raceWithTimeout(neverResolves, 40, 'queued');
  const elapsed = Date.now() - start;

  assert.equal(res.timedOut, true);
  assert.equal(res.value, 'queued');
  assert.ok(elapsed < 250, `Expected fast resolution, got ${elapsed}ms`);
});

test('raceWithTimeout returns resolved value when fast', async () => {
  const fastPromise = Promise.resolve('synced');
  const res = await raceWithTimeout(fastPromise, 200, 'queued');

  assert.equal(res.timedOut, false);
  assert.equal(res.value, 'synced');
});

test('pickNewestDatabaseEvent picks the candidate with newest updatedAt timestamp', () => {
  const older = { updatedAt: '2026-05-01T10:00:00.000Z', image: 'old.jpg', config: { cover_monogram_bride: 'A' } };
  const newer = { updatedAt: '2026-05-01T10:05:00.000Z', image: 'new.jpg', config: { cover_monogram_bride: 'B' } };
  assert.equal(pickNewestDatabaseEvent([null, older, newer, undefined]), newer);
});

test('pickNewestDatabaseEvent prefers richer payload when timestamps match', () => {
  const compact = { updatedAt: '2026-05-01T10:05:00.000Z', image: 'small', config: { cover_monogram_bride: 'B' } };
  const full = { updatedAt: '2026-05-01T10:05:00.000Z', image: 'data:image/jpeg;base64,' + 'x'.repeat(200), config: { cover_monogram_bride: 'B' } };
  assert.equal(getEventTimestampMs(compact), getEventTimestampMs(full));
  assert.equal(pickNewestDatabaseEvent([compact, full]), full);
});


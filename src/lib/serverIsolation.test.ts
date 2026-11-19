import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findUserDbEvent,
  shouldIncludePublicRecord,
  shouldAcceptWebSocketEventUpdate,
} from './serverIsolation.js';
import { GUEST_PUBLIC_SCOPE, getScopedEventId } from './userScope.js';

const USER_A = 'u_alice_123456';
const USER_B = 'u_bob_654321';

test('findUserDbEvent resolves strictly inside target user DB and picks newest match', () => {
  const scopedWeddingId = getScopedEventId('cmgrawhnk0003le0434762j7n', USER_A);
  const olderWedding = {
    id: scopedWeddingId,
    templateId: 'cmgrawhnk0003le0434762j7n',
    ownerId: USER_A,
    eventType: 'wedding',
    groom: 'Old Groom',
    updatedAt: '2026-01-01T10:00:00.000Z',
  };
  const newerWedding = {
    id: scopedWeddingId,
    templateId: 'cmgrawhnk0003le0434762j7n',
    ownerId: USER_A,
    eventType: 'wedding',
    groom: 'New Groom',
    updatedAt: '2026-01-02T10:00:00.000Z',
  };

  const userADb: Record<string, any> = {
    [scopedWeddingId]: newerWedding,
    [`user_${USER_A}_type_wedding`]: olderWedding,
    [`user_${USER_A}_default`]: newerWedding,
  };

  const byExactId = findUserDbEvent(userADb, { eventId: scopedWeddingId, dbId: USER_A });
  assert.equal(byExactId?.groom, 'New Groom');

  const byBaseId = findUserDbEvent(userADb, { eventId: 'cmgrawhnk0003le0434762j7n', dbId: USER_A });
  assert.equal(byBaseId?.groom, 'New Groom');

  const byType = findUserDbEvent(userADb, { eventType: 'wedding', dbId: USER_A });
  assert.equal(byType?.groom, 'New Groom');

  const byDefault = findUserDbEvent(userADb, { dbId: USER_A });
  assert.equal(byDefault?.groom, 'New Groom');

  // Empty DB for User B must return null (never fall back to User A or global)
  assert.equal(findUserDbEvent({}, { eventId: 'cmgrawhnk0003le0434762j7n', dbId: USER_B }), null);
});

test('shouldIncludePublicRecord prevents authenticated user records from leaking publicly', () => {
  assert.equal(shouldIncludePublicRecord({ id: 'w1', message: 'Public wish' }), true);
  assert.equal(shouldIncludePublicRecord({ id: 'w2', ownerId: GUEST_PUBLIC_SCOPE }), true);
  assert.equal(shouldIncludePublicRecord({ id: 'w3', ownerId: USER_A }), false);
  assert.equal(
    shouldIncludePublicRecord({ id: 'w4', eventId: `${USER_A}__cmgrawhnk0003le0434762j7n` }),
    false
  );
});

test('shouldAcceptWebSocketEventUpdate isolates live updates per authenticated user and share viewer', () => {
  const userAEventId = getScopedEventId('cmgrawhnk0003le0434762j7n', USER_A);
  const userBEventId = getScopedEventId('cmgrawhnk0003le0434762j7n', USER_B);

  // User A accepts User A fresher server update
  assert.equal(
    shouldAcceptWebSocketEventUpdate({
      incomingEvent: { id: userAEventId, ownerId: USER_A, updatedAt: '2026-05-01T12:00:00.000Z' },
      incomingEventId: userAEventId,
      incomingOwnerId: USER_A,
      currentEventId: userAEventId,
      currentOwnerId: USER_A,
      activeScopeId: USER_A,
      isAuthenticated: true,
      isFromShareLink: false,
      lastSavedAtMs: Date.parse('2026-05-01T11:00:00.000Z'),
    }),
    true
  );

  // User A rejects User B server update even for the same base template
  assert.equal(
    shouldAcceptWebSocketEventUpdate({
      incomingEvent: { id: userBEventId, ownerId: USER_B, updatedAt: '2026-05-01T12:00:00.000Z' },
      incomingEventId: userBEventId,
      incomingOwnerId: USER_B,
      currentEventId: userAEventId,
      currentOwnerId: USER_A,
      activeScopeId: USER_A,
      isAuthenticated: true,
      isFromShareLink: false,
      lastSavedAtMs: Date.parse('2026-05-01T11:00:00.000Z'),
    }),
    false
  );

  // Stale update is ignored even for the same user
  assert.equal(
    shouldAcceptWebSocketEventUpdate({
      incomingEvent: { id: userAEventId, ownerId: USER_A, updatedAt: '2026-05-01T10:00:00.000Z' },
      incomingEventId: userAEventId,
      incomingOwnerId: USER_A,
      currentEventId: userAEventId,
      currentOwnerId: USER_A,
      activeScopeId: USER_A,
      isAuthenticated: true,
      isFromShareLink: false,
      lastSavedAtMs: Date.parse('2026-05-01T11:00:00.000Z'),
    }),
    false
  );

  // Share-link viewer accepts updates ONLY for the shared event ID they are viewing
  assert.equal(
    shouldAcceptWebSocketEventUpdate({
      incomingEvent: { id: userAEventId, ownerId: USER_A, updatedAt: '2026-05-01T12:00:00.000Z' },
      incomingEventId: userAEventId,
      incomingOwnerId: USER_A,
      currentEventId: userAEventId,
      currentOwnerId: USER_A,
      activeScopeId: GUEST_PUBLIC_SCOPE,
      isAuthenticated: false,
      isFromShareLink: true,
      lastSavedAtMs: 0,
    }),
    true
  );

  assert.equal(
    shouldAcceptWebSocketEventUpdate({
      incomingEvent: { id: userBEventId, ownerId: USER_B, updatedAt: '2026-05-01T12:00:00.000Z' },
      incomingEventId: userBEventId,
      incomingOwnerId: USER_B,
      currentEventId: userAEventId,
      currentOwnerId: USER_A,
      activeScopeId: GUEST_PUBLIC_SCOPE,
      isAuthenticated: false,
      isFromShareLink: true,
      lastSavedAtMs: 0,
    }),
    false
  );
});

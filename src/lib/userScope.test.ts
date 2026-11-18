import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PRESET_EVENT_ID,
  GUEST_PUBLIC_SCOPE,
  extractScopeFromEventId,
  getScopedEventId,
  getScopedGuestId,
  getUserStorageKey,
  isGlobalSharedPresetId,
  resolveUserScope,
  stripScopedEventId,
} from './userScope';
import { readShareTemplatesStorageState, buildAllShareTemplates } from '../utils/shareMeta';
import { EVENT_PRESETS } from '../data/eventTemplates';
import { getSavedGuests, getScopedDefaultGuests, saveGuestToList } from '../data/guests';
import { getEmailDatabaseId, resolveRecordDatabaseId } from './userDatabase';

function installMockLocalStorage() {
  const store = new Map<string, string>();
  const mockStorage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
  };
  (globalThis as any).localStorage = mockStorage;
  if (typeof (globalThis as any).window === 'undefined') {
    (globalThis as any).window = globalThis;
  }
  return mockStorage;
}

test('resolveUserScope produces distinct deterministic scopes for different users and unifies email across Google/Passcode login', () => {
  const userA = resolveUserScope(null, 'alice@example.com');
  const userAGoogle = resolveUserScope({ uid: 'uid-alice-999', email: 'ALICE@example.com', displayName: 'Alice' } as any);
  const userB = resolveUserScope(null, 'bob@example.com');
  const guest = resolveUserScope(null, '');

  assert.equal(userA.isAuthenticated, true);
  assert.equal(userA.scopeId, userAGoogle.scopeId);
  assert.notEqual(userA.scopeId, userB.scopeId);
  assert.equal(guest.scopeId, GUEST_PUBLIC_SCOPE);
  assert.equal(guest.isAuthenticated, false);
});

test('getScopedEventId, stripScopedEventId, and extractScopeFromEventId round-trip cleanly without double prefixing', () => {
  const userA = resolveUserScope(null, 'alice@example.com').scopeId;
  const scoped = getScopedEventId(DEFAULT_PRESET_EVENT_ID, userA);

  assert.ok(scoped.startsWith(`${userA}__`));
  assert.equal(extractScopeFromEventId(scoped), userA);
  assert.equal(stripScopedEventId(scoped), DEFAULT_PRESET_EVENT_ID);
  assert.equal(getScopedEventId(scoped, userA), scoped);
  assert.equal(getScopedEventId(DEFAULT_PRESET_EVENT_ID, GUEST_PUBLIC_SCOPE), DEFAULT_PRESET_EVENT_ID);
  assert.equal(isGlobalSharedPresetId(DEFAULT_PRESET_EVENT_ID), true);
  assert.equal(isGlobalSharedPresetId(scoped), false);
});

test('getScopedGuestId and localStorage guest lists stay completely isolated between User A and User B', () => {
  const storage = installMockLocalStorage();
  const userA = resolveUserScope(null, 'alice@example.com').scopeId;
  const userB = resolveUserScope(null, 'bob@example.com').scopeId;

  saveGuestToList(
    {
      name: 'Alice VIP Guest',
      category: 'vip',
      categoryLabelKh: 'ភ្ញៀវពិសេស',
      categoryLabelEn: 'VIP',
      ownerId: userA,
    },
    userA
  );

  // Clear Bob's list completely to verify empty [] does not leak Alice's or fall back unexpectedly
  storage.setItem(getUserStorageKey('wedding_saved_guest_list_v1', userB), JSON.stringify([]));

  const loadedAlice = getSavedGuests(userA);
  const loadedBob = getSavedGuests(userB);

  assert.ok(loadedAlice.some(g => g.name === 'Alice VIP Guest'));
  assert.ok(loadedAlice.every(g => g.ownerId === userA));
  assert.equal(loadedBob.length, 0);

  const userC = resolveUserScope(null, 'carol@example.com').scopeId;
  const loadedCarol = getSavedGuests(userC);
  assert.equal(loadedCarol.length, getScopedDefaultGuests(userC).length);
  assert.ok(loadedCarol.every(g => g.ownerId === userC));
  assert.equal(loadedCarol.some(g => g.name === 'Alice VIP Guest'), false);
});

test('readShareTemplatesStorageState and buildAllShareTemplates isolate custom templates and saved edits per user', () => {
  const storage = installMockLocalStorage();
  const userA = resolveUserScope(null, 'alice@example.com').scopeId;
  const userB = resolveUserScope(null, 'bob@example.com').scopeId;

  const aliceScopedWeddingId = getScopedEventId(DEFAULT_PRESET_EVENT_ID, userA);
  storage.setItem(
    getUserStorageKey(`wedding_template_saved_${aliceScopedWeddingId}`, userA),
    JSON.stringify({
      id: aliceScopedWeddingId,
      templateId: DEFAULT_PRESET_EVENT_ID,
      ownerId: userA,
      eventType: 'wedding',
      name: 'Alice Custom Wedding',
      groom: 'Sokha',
      bride: 'Dara',
    })
  );

  storage.setItem(
    getUserStorageKey('wedding_custom_templates', userA),
    JSON.stringify([
      {
        id: getScopedEventId('custom-alice-1', userA),
        type: 'birthday',
        titleKh: 'ខួបកំណើត Alice',
        titleEn: 'Alice Birthday',
        sampleEvent: {
          id: getScopedEventId('custom-alice-1', userA),
          ownerId: userA,
          eventType: 'birthday',
          name: 'Alice Birthday Bash',
          groom: 'Alice',
        },
      },
    ])
  );

  const aliceState = readShareTemplatesStorageState(userA);
  const bobState = readShareTemplatesStorageState(userB);

  const aliceTemplates = buildAllShareTemplates({ presets: EVENT_PRESETS, ...aliceState });
  const bobTemplates = buildAllShareTemplates({ presets: EVENT_PRESETS, ...bobState });

  assert.ok(aliceTemplates.some(t => t.event?.name === 'Alice Custom Wedding'));
  assert.ok(aliceTemplates.some(t => t.templateId === getScopedEventId('custom-alice-1', userA) || t.eventId === getScopedEventId('custom-alice-1', userA)));
  assert.equal(bobTemplates.some(t => t.event?.name === 'Alice Custom Wedding'), false);
  assert.equal(bobTemplates.some(t => t.templateId === getScopedEventId('custom-alice-1', userA) || t.eventId === getScopedEventId('custom-alice-1', userA)), false);
});

test('getEmailDatabaseId and resolveRecordDatabaseId deterministically map each Email to its own personal database ID', () => {
  const dbOwnerLower = getEmailDatabaseId('seyhayoeurn2017@gmail.com');
  const dbOwnerUpper = getEmailDatabaseId('  SeyhaYoeurn2017@GMAIL.com ');
  const dbAdmin = getEmailDatabaseId('yoeurn.seyha@diu.edu.kh');
  const dbPublic = getEmailDatabaseId('');

  assert.ok(dbOwnerLower.startsWith('u_'));
  assert.match(dbOwnerLower, /^[a-zA-Z0-9_-]{1,128}$/);
  assert.equal(dbOwnerLower, dbOwnerUpper);
  assert.equal(getEmailDatabaseId(dbOwnerLower), dbOwnerLower);
  assert.notEqual(dbOwnerLower, dbAdmin);
  assert.equal(dbPublic, GUEST_PUBLIC_SCOPE);

  const scopedEventId = getScopedEventId(DEFAULT_PRESET_EVENT_ID, dbOwnerLower);
  assert.equal(resolveRecordDatabaseId({ eventId: scopedEventId }), dbOwnerLower);
  assert.equal(resolveRecordDatabaseId({ ownerEmail: 'yoeurn.seyha@diu.edu.kh' }), dbAdmin);
  assert.equal(resolveRecordDatabaseId({ ownerId: GUEST_PUBLIC_SCOPE, eventId: DEFAULT_PRESET_EVENT_ID }), '');
});

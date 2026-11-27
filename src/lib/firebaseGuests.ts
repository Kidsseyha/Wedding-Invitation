import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, IS_FIRESTORE_WRITE_DISABLED, isFirestoreKnownUnavailable } from '../lib/firebase';
import { getGuestStorageKey, getScopedDefaultGuests, GuestPreset } from '../data/guests';
import {
  GUEST_PUBLIC_SCOPE,
  getScopedGuestId,
  guestMatchesEventScope,
  normalizeGuestEventId,
  resolveUserScope,
} from './userScope';
import { ensureUserDatabaseInFirebase } from './firebaseServices';

const GUESTS_COLLECTION = 'guests';
const EVENTS_COLLECTION = 'events';
const USER_DATABASES_COLLECTION = 'user_databases';

// On static/serverless Vercel deployments (.vercel.app), /api/guests does not exist on disk.
// Skipping redundant /api/guests calls on .vercel.app (or after a 404) avoids 404 network latency.
let isGuestsRestApiUnsupported =
  typeof window !== 'undefined' &&
  Boolean(window.location?.hostname?.endsWith('.vercel.app'));

function shouldCallGuestsRestApi(): boolean {
  return !isGuestsRestApiUnsupported;
}

function resolveOwnerId(ownerId?: string): string {
  return (ownerId && ownerId.trim()) || resolveUserScope().scopeId;
}

function resolveEventId(eventId?: string, effectiveOwner?: string): string {
  return normalizeGuestEventId(eventId, effectiveOwner);
}

export function stripGuestIdPrefix(rawId?: string): string {
  return (rawId || '')
    .trim()
    .replace(/^g_(?:u_[a-z0-9_]+|guest_public)__(?:ev_[a-z0-9]+__)?/, '')
    .replace(/^g_ev_[a-z0-9]+__/, '')
    .trim();
}

function getCandidateGuestIds(rawId: string, effectiveOwner: string, effectiveEventId: string): string[] {
  const cleanRaw = (rawId || '').trim();
  const baseId = stripGuestIdPrefix(cleanRaw);
  const candidates = new Set<string>();
  if (cleanRaw) candidates.add(cleanRaw);
  if (baseId) {
    candidates.add(baseId);
    candidates.add(getScopedGuestId(baseId, effectiveOwner, effectiveEventId));
    candidates.add(getScopedGuestId(baseId, effectiveOwner));
  }
  if (cleanRaw) {
    candidates.add(getScopedGuestId(cleanRaw, effectiveOwner, effectiveEventId));
    candidates.add(getScopedGuestId(cleanRaw, effectiveOwner));
  }
  return Array.from(candidates).filter(Boolean);
}

function getDeletedGuestsStorageKey(effectiveOwner: string, effectiveEventId: string): string {
  return `${getGuestStorageKey(effectiveOwner, effectiveEventId)}__deleted_v1`;
}

function readDeletedGuestTokens(effectiveOwner: string, effectiveEventId: string): Set<string> {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(getDeletedGuestsStorageKey(effectiveOwner, effectiveEventId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.map(v => String(v || '').trim()).filter(Boolean));
    }
  } catch {
    // ignore
  }
  return new Set();
}

function writeDeletedGuestTokens(effectiveOwner: string, effectiveEventId: string, tokens: Set<string>): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      getDeletedGuestsStorageKey(effectiveOwner, effectiveEventId),
      JSON.stringify(Array.from(tokens))
    );
  } catch {
    // ignore
  }
}

function addDeletedGuestTokens(
  effectiveOwner: string,
  effectiveEventId: string,
  id: string,
  name?: string
): Set<string> {
  const tokens = readDeletedGuestTokens(effectiveOwner, effectiveEventId);
  for (const cid of getCandidateGuestIds(id, effectiveOwner, effectiveEventId)) {
    tokens.add(cid);
  }
  const baseId = stripGuestIdPrefix(id);
  if (baseId) tokens.add(`base:${baseId}`);
  const cleanName = (name || '').trim().toLowerCase();
  if (cleanName) tokens.add(`name:${cleanName}`);
  writeDeletedGuestTokens(effectiveOwner, effectiveEventId, tokens);
  return tokens;
}

function removeDeletedGuestTokens(
  effectiveOwner: string,
  effectiveEventId: string,
  id?: string,
  name?: string
): void {
  const tokens = readDeletedGuestTokens(effectiveOwner, effectiveEventId);
  if (tokens.size === 0) return;
  if (id) {
    for (const cid of getCandidateGuestIds(id, effectiveOwner, effectiveEventId)) {
      tokens.delete(cid);
    }
    const baseId = stripGuestIdPrefix(id);
    if (baseId) tokens.delete(`base:${baseId}`);
  }
  const cleanName = (name || '').trim().toLowerCase();
  if (cleanName) tokens.delete(`name:${cleanName}`);
  writeDeletedGuestTokens(effectiveOwner, effectiveEventId, tokens);
}

function clearDeletedGuestTokens(effectiveOwner: string, effectiveEventId: string): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(getDeletedGuestsStorageKey(effectiveOwner, effectiveEventId));
  } catch {
    // ignore
  }
}

function isGuestDeletedByTombstone(
  guest: Partial<GuestPreset> | null | undefined,
  tombstones: Set<string>,
  effectiveOwner: string,
  effectiveEventId: string
): boolean {
  if (!guest || tombstones.size === 0) return false;
  const rawId = (guest.id || '').trim();
  if (rawId) {
    if (tombstones.has(rawId)) return true;
    const baseId = stripGuestIdPrefix(rawId);
    if (baseId && (tombstones.has(baseId) || tombstones.has(`base:${baseId}`))) return true;
    for (const cid of getCandidateGuestIds(rawId, effectiveOwner, effectiveEventId)) {
      if (tombstones.has(cid)) return true;
    }
  }
  const cleanName = (guest.name || '').trim().toLowerCase();
  if (cleanName && tombstones.has(`name:${cleanName}`)) return true;
  return false;
}

function normalizeAndFilterGuests(
  guests: GuestPreset[],
  effectiveOwner: string,
  effectiveEventId: string,
  eventType?: string
): GuestPreset[] {
  const tombstones = readDeletedGuestTokens(effectiveOwner, effectiveEventId);
  const seenBaseIds = new Set<string>();
  const seenNames = new Set<string>();
  const result: GuestPreset[] = [];

  for (const raw of guests) {
    if (!raw || !raw.name || !raw.name.trim()) continue;
    if (!guestMatchesEventScope(raw, effectiveOwner, effectiveEventId)) continue;
    if (isGuestDeletedByTombstone(raw, tombstones, effectiveOwner, effectiveEventId)) continue;

    const baseId = stripGuestIdPrefix(raw.id) || `guest-${result.length + 1}`;
    const nameKey = raw.name.trim().toLowerCase();
    if (seenBaseIds.has(baseId) || seenNames.has(nameKey)) continue;
    seenBaseIds.add(baseId);
    seenNames.add(nameKey);

    const scopedId = getScopedGuestId(baseId, effectiveOwner, effectiveEventId);
    result.push({
      ...raw,
      id: scopedId,
      name: raw.name.trim(),
      ownerId: raw.ownerId || effectiveOwner,
      eventId: raw.eventId || effectiveEventId,
      ...(raw.eventType || eventType ? { eventType: raw.eventType || eventType } : {}),
    });
  }

  return result;
}

/**
 * Merges remote guests with any locally saved guests in localStorage (giving priority to local additions/edits
 * while respecting deletion tombstones) so background Firestore snapshots never wipe out newly added local guests.
 */
function mergeRemoteWithLocalGuests(
  remoteGuests: GuestPreset[],
  storageKey: string,
  effectiveOwner: string,
  effectiveEventId: string,
  eventType?: string
): GuestPreset[] {
  let localGuests: GuestPreset[] = [];
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        localGuests = parsed;
      }
    }
  } catch {
    // ignore
  }
  // Combine localGuests first so freshly added/edited local records take precedence over stale remote snapshots
  const combined = [...localGuests, ...remoteGuests];
  const merged = normalizeAndFilterGuests(combined, effectiveOwner, effectiveEventId, eventType);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify(merged));
    }
  } catch {
    // ignore
  }
  return merged;
}

function getUserEventGuestsCollection(effectiveOwner: string, effectiveEventId: string) {
  return effectiveOwner && effectiveOwner !== GUEST_PUBLIC_SCOPE
    ? collection(db, USER_DATABASES_COLLECTION, effectiveOwner, EVENTS_COLLECTION, effectiveEventId, GUESTS_COLLECTION)
    : collection(db, GUESTS_COLLECTION);
}

function getUserEventGuestDoc(effectiveOwner: string, effectiveEventId: string, guestId: string) {
  return effectiveOwner && effectiveOwner !== GUEST_PUBLIC_SCOPE
    ? doc(db, USER_DATABASES_COLLECTION, effectiveOwner, EVENTS_COLLECTION, effectiveEventId, GUESTS_COLLECTION, guestId)
    : doc(db, GUESTS_COLLECTION, guestId);
}

function getScopedGuestDoc(effectiveOwner: string, guestId: string) {
  return effectiveOwner && effectiveOwner !== GUEST_PUBLIC_SCOPE
    ? doc(db, USER_DATABASES_COLLECTION, effectiveOwner, GUESTS_COLLECTION, guestId)
    : doc(db, GUESTS_COLLECTION, guestId);
}

function mapDocToGuest(
  id: string,
  data: Partial<GuestPreset>,
  effectiveOwner: string,
  effectiveEventId: string,
  fallbackEventType?: string
): GuestPreset {
  return {
    id,
    name: data.name || '',
    category: data.category || 'general',
    categoryLabelKh: data.categoryLabelKh || 'ទូទៅ',
    categoryLabelEn: data.categoryLabelEn || 'General',
    note: data.note || '',
    ownerId: data.ownerId || effectiveOwner,
    eventId: data.eventId || effectiveEventId,
    ...(data.eventType || fallbackEventType ? { eventType: data.eventType || fallbackEventType } : {}),
    ...(data.updatedAt ? { updatedAt: data.updatedAt } : {}),
  };
}

function buildGuestsApiUrl(effectiveOwner: string, effectiveEventId: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  params.set('ownerId', effectiveOwner);
  params.set('eventId', effectiveEventId);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
    }
  }
  return `/api/guests?${params.toString()}`;
}

/**
 * Helper to commit a list of guest payloads to Firestore using atomic writeBatch chunks
 */
async function commitGuestsBatchToFirestore(
  payloads: GuestPreset[],
  effectiveOwner: string,
  effectiveEventId: string
): Promise<void> {
  if (payloads.length === 0 || IS_FIRESTORE_WRITE_DISABLED || isFirestoreKnownUnavailable()) {
    return;
  }
  try {
    if (effectiveOwner !== GUEST_PUBLIC_SCOPE) {
      await ensureUserDatabaseInFirebase({ scopeId: effectiveOwner, skipRestApi: true });
    }
    const CHUNK_SIZE = 120; // Each guest writes up to 3 docs -> max 360 ops per batch (< 500 Firestore limit)
    for (let i = 0; i < payloads.length; i += CHUNK_SIZE) {
      const chunk = payloads.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const item of chunk) {
        const guestId = item.id;
        if (effectiveOwner !== GUEST_PUBLIC_SCOPE) {
          batch.set(getUserEventGuestDoc(effectiveOwner, effectiveEventId, guestId), item, { merge: true });
          batch.set(getScopedGuestDoc(effectiveOwner, guestId), item, { merge: true });
        }
        batch.set(doc(db, GUESTS_COLLECTION, guestId), item, { merge: true });
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, GUESTS_COLLECTION);
  }
}

/**
 * Fetch all guests for a specific user AND specific invitation from localStorage / REST API / Firestore
 */
export async function fetchGuestsFromFirebase(
  ownerId?: string,
  eventId?: string,
  eventType?: string
): Promise<GuestPreset[]> {
  const effectiveOwner = resolveOwnerId(ownerId);
  const effectiveEventId = resolveEventId(eventId, effectiveOwner);
  const storageKey = getGuestStorageKey(effectiveOwner, effectiveEventId);

  // Fast path: if localStorage already has initialized guest state or deletion tombstones, return it immediately
  // and sync any remote additions in the background so the UI never stalls on Vercel or slow networks.
  try {
    if (typeof localStorage !== 'undefined') {
      const localRaw = localStorage.getItem(storageKey);
      if (localRaw !== null) {
        const parsed = JSON.parse(localRaw);
        if (Array.isArray(parsed)) {
          const filteredLocal = normalizeAndFilterGuests(parsed, effectiveOwner, effectiveEventId, eventType);
          localStorage.setItem(storageKey, JSON.stringify(filteredLocal));
          return filteredLocal;
        }
      }
    }
  } catch {
    // ignore
  }

  // 1. Check scoped server API if supported (skipped on static .vercel.app)
  if (shouldCallGuestsRestApi()) {
    try {
      const res = await fetch(buildGuestsApiUrl(effectiveOwner, effectiveEventId), {
        cache: 'no-store',
      });
      if (res.status === 404 || res.status === 405) {
        isGuestsRestApiUnsupported = true;
      } else if (res.ok) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.guests)) {
          const scopedApiGuests = normalizeAndFilterGuests(
            data.guests,
            effectiveOwner,
            effectiveEventId,
            eventType
          );
          if (scopedApiGuests.length > 0) {
            try {
              localStorage.setItem(storageKey, JSON.stringify(scopedApiGuests));
            } catch {
              // ignore
            }
            return scopedApiGuests;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  const skipFs = IS_FIRESTORE_WRITE_DISABLED || isFirestoreKnownUnavailable();

  // 2. Query Firestore collections in parallel when local storage is empty
  if (!skipFs) {
    try {
      const queries =
        effectiveOwner !== GUEST_PUBLIC_SCOPE
          ? [
              getDocs(
                query(
                  getUserEventGuestsCollection(effectiveOwner, effectiveEventId),
                  where('ownerId', '==', effectiveOwner)
                )
              ),
              getDocs(
                query(
                  collection(db, USER_DATABASES_COLLECTION, effectiveOwner, GUESTS_COLLECTION),
                  where('ownerId', '==', effectiveOwner)
                )
              ),
              getDocs(query(collection(db, GUESTS_COLLECTION), where('ownerId', '==', effectiveOwner))),
            ]
          : [getDocs(query(collection(db, GUESTS_COLLECTION), where('ownerId', '==', effectiveOwner)))];

      const results = await Promise.allSettled(queries);
      const rawGuests: GuestPreset[] = [];
      for (const res of results) {
        if (res.status === 'fulfilled' && !res.value.empty) {
          res.value.forEach(docSnap => {
            const rawData = docSnap.data() as GuestPreset;
            if (
              guestMatchesEventScope(
                { ...rawData, eventId: rawData.eventId || effectiveEventId },
                effectiveOwner,
                effectiveEventId
              )
            ) {
              rawGuests.push(mapDocToGuest(docSnap.id, rawData, effectiveOwner, effectiveEventId, eventType));
            }
          });
        }
      }
      const guests = normalizeAndFilterGuests(rawGuests, effectiveOwner, effectiveEventId, eventType);
      if (guests.length > 0) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(guests));
        } catch {
          // ignore
        }
        return guests;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, GUESTS_COLLECTION);
    }
  }

  // 3. Fallback to scoped defaults filtered by tombstones
  const defaults = normalizeAndFilterGuests(
    getScopedDefaultGuests(effectiveOwner, effectiveEventId, eventType),
    effectiveOwner,
    effectiveEventId,
    eventType
  );
  try {
    localStorage.setItem(storageKey, JSON.stringify(defaults));
  } catch {
    // ignore
  }
  return defaults;
}

/**
 * Seed initial presets scoped to the specified owner AND invitation event
 */
export async function seedDefaultGuestsToFirebase(
  ownerId?: string,
  eventId?: string,
  eventType?: string
) {
  const effectiveOwner = resolveOwnerId(ownerId);
  const effectiveEventId = resolveEventId(eventId, effectiveOwner);
  const storageKey = getGuestStorageKey(effectiveOwner, effectiveEventId);

  // Clear deleted tombstones when explicitly restoring defaults
  clearDeletedGuestTokens(effectiveOwner, effectiveEventId);

  const defaults = getScopedDefaultGuests(effectiveOwner, effectiveEventId, eventType);
  const now = new Date().toISOString();

  const payloads = defaults.map(preset => ({
    ...preset,
    ownerId: effectiveOwner,
    eventId: effectiveEventId,
    ...(eventType ? { eventType } : {}),
    updatedAt: now,
  }));

  try {
    localStorage.setItem(storageKey, JSON.stringify(payloads));
  } catch {
    // ignore
  }

  // Sync batch to REST API in background
  if (shouldCallGuestsRestApi()) {
    void fetch('/api/guests/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerId: effectiveOwner,
        eventId: effectiveEventId,
        eventType,
        guests: payloads,
      }),
    })
      .then(res => {
        if (res.status === 404 || res.status === 405) isGuestsRestApiUnsupported = true;
      })
      .catch(() => {});
  }

  // Sync to Firestore in background using atomic writeBatch
  void commitGuestsBatchToFirestore(payloads, effectiveOwner, effectiveEventId);
}

/**
 * Real-time listener for a single user's AND single invitation's guests from Firebase
 */
export function subscribeToGuests(
  callback: (guests: GuestPreset[]) => void,
  ownerId?: string,
  eventId?: string,
  eventType?: string
) {
  const effectiveOwner = resolveOwnerId(ownerId);
  const effectiveEventId = resolveEventId(eventId, effectiveOwner);
  const storageKey = getGuestStorageKey(effectiveOwner, effectiveEventId);

  const fallbackGuests = () => {
    fetchGuestsFromFirebase(effectiveOwner, effectiveEventId, eventType)
      .then(guests => {
        callback(guests);
      })
      .catch(() => {
        try {
          const local = localStorage.getItem(storageKey);
          if (local !== null) {
            const parsed = JSON.parse(local);
            if (Array.isArray(parsed)) {
              callback(normalizeAndFilterGuests(parsed, effectiveOwner, effectiveEventId, eventType));
              return;
            }
          }
        } catch {
          // ignore
        }
        callback(
          normalizeAndFilterGuests(
            getScopedDefaultGuests(effectiveOwner, effectiveEventId, eventType),
            effectiveOwner,
            effectiveEventId,
            eventType
          )
        );
      });
  };

  if (IS_FIRESTORE_WRITE_DISABLED || isFirestoreKnownUnavailable()) {
    fallbackGuests();
    return () => {};
  }

  try {
    const q =
      effectiveOwner !== GUEST_PUBLIC_SCOPE
        ? query(
            getUserEventGuestsCollection(effectiveOwner, effectiveEventId),
            where('ownerId', '==', effectiveOwner)
          )
        : query(collection(db, GUESTS_COLLECTION), where('ownerId', '==', effectiveOwner));

    return onSnapshot(
      q,
      snapshot => {
        const rawGuests: GuestPreset[] = [];
        snapshot.forEach(docSnap => {
          const rawData = docSnap.data() as GuestPreset;
          if (
            effectiveOwner !== GUEST_PUBLIC_SCOPE ||
            guestMatchesEventScope(rawData, effectiveOwner, effectiveEventId)
          ) {
            rawGuests.push(mapDocToGuest(docSnap.id, rawData, effectiveOwner, effectiveEventId, eventType));
          }
        });

        if (rawGuests.length > 0) {
          // Merge remote Firestore snapshot with local guests so newly added local guests are never overwritten
          const merged = mergeRemoteWithLocalGuests(
            rawGuests,
            storageKey,
            effectiveOwner,
            effectiveEventId,
            eventType
          );
          callback(merged);
        } else {
          fallbackGuests();
        }
      },
      () => {
        fallbackGuests();
      }
    );
  } catch {
    fallbackGuests();
    return () => {};
  }
}

/**
 * Save or update guest scoped to BOTH current user AND current invitation in localStorage (instant), API, and Firestore
 */
export async function saveGuestToFirebase(
  guest: GuestPreset | Omit<GuestPreset, 'id'>,
  ownerId?: string,
  eventId?: string,
  eventType?: string
) {
  const effectiveOwner = resolveOwnerId(ownerId || guest.ownerId);
  const effectiveEventId = resolveEventId(eventId || guest.eventId, effectiveOwner);
  const effectiveEventType = (eventType || guest.eventType || '').trim();
  const storageKey = getGuestStorageKey(effectiveOwner, effectiveEventId);
  const rawId = 'id' in guest && guest.id ? guest.id : `guest-${Date.now()}`;
  const guestId = getScopedGuestId(rawId, effectiveOwner, effectiveEventId);

  // Un-tombstone this guest if it was previously deleted
  removeDeletedGuestTokens(effectiveOwner, effectiveEventId, guestId, guest.name);

  const payload: any = {
    ...guest,
    note: guest.note !== undefined && guest.note !== null ? guest.note : '',
    id: guestId,
    ownerId: effectiveOwner,
    eventId: effectiveEventId,
    ...(effectiveEventType ? { eventType: effectiveEventType } : {}),
    updatedAt: new Date().toISOString(),
  };

  Object.keys(payload).forEach(key => {
    if (payload[key] === undefined) {
      delete payload[key];
    }
  });

  // 1. Always update scoped local storage synchronously (0ms)
  try {
    const local = localStorage.getItem(storageKey);
    const parsed = local !== null ? JSON.parse(local) : null;
    const baseList: GuestPreset[] = Array.isArray(parsed)
      ? parsed
      : normalizeAndFilterGuests(
          getScopedDefaultGuests(effectiveOwner, effectiveEventId, effectiveEventType || undefined),
          effectiveOwner,
          effectiveEventId,
          effectiveEventType || undefined
        );
    const targetBaseId = stripGuestIdPrefix(guestId);
    const targetNameLower = String(payload.name || '').trim().toLowerCase();
    const idx = baseList.findIndex(
      g =>
        g.id === guestId ||
        stripGuestIdPrefix(g.id) === targetBaseId ||
        (targetNameLower && g.name.trim().toLowerCase() === targetNameLower)
    );
    if (idx >= 0) {
      baseList[idx] = { ...baseList[idx], ...payload, id: baseList[idx].id || guestId };
      payload.id = baseList[idx].id;
    } else {
      baseList.push(payload);
    }
    localStorage.setItem(storageKey, JSON.stringify(baseList));
  } catch {
    // ignore
  }

  // 2. Sync with server API asynchronously in background (never blocks UI on Vercel or slow networks)
  if (shouldCallGuestsRestApi()) {
    void fetch('/api/guests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(res => {
        if (res.status === 404 || res.status === 405) isGuestsRestApiUnsupported = true;
      })
      .catch(() => {});
  }

  // 3. Sync to Firestore asynchronously in background using atomic writeBatch
  void commitGuestsBatchToFirestore([payload as GuestPreset], effectiveOwner, effectiveEventId);

  return payload as GuestPreset;
}

/**
 * Batch save multiple guests scoped to current user AND current invitation (used by Excel/CSV/Sheets imports & Save All)
 */
export async function saveGuestsBatchToFirebase(
  guests: Array<GuestPreset | Omit<GuestPreset, 'id'>>,
  ownerId?: string,
  eventId?: string,
  eventType?: string
): Promise<GuestPreset[]> {
  if (!Array.isArray(guests) || guests.length === 0) return [];
  const effectiveOwner = resolveOwnerId(ownerId);
  const effectiveEventId = resolveEventId(eventId, effectiveOwner);
  const effectiveEventType = (eventType || '').trim();
  const storageKey = getGuestStorageKey(effectiveOwner, effectiveEventId);
  const now = new Date().toISOString();

  const payloads: GuestPreset[] = guests.map((guest, idx) => {
    const rawId = 'id' in guest && guest.id ? guest.id : `guest-${Date.now()}-${idx}`;
    const guestId = getScopedGuestId(rawId, effectiveOwner, effectiveEventId);
    removeDeletedGuestTokens(effectiveOwner, effectiveEventId, guestId, guest.name);
    return {
      ...guest,
      note: guest.note !== undefined && guest.note !== null ? guest.note : '',
      id: guestId,
      ownerId: effectiveOwner,
      eventId: effectiveEventId,
      ...(effectiveEventType || guest.eventType ? { eventType: effectiveEventType || guest.eventType } : {}),
      updatedAt: now,
    };
  });

  // 1. Update scoped localStorage synchronously (0ms)
  try {
    const local = localStorage.getItem(storageKey);
    const parsed = local !== null ? JSON.parse(local) : null;
    const list: GuestPreset[] = Array.isArray(parsed)
      ? [...parsed]
      : normalizeAndFilterGuests(
          getScopedDefaultGuests(effectiveOwner, effectiveEventId, effectiveEventType || undefined),
          effectiveOwner,
          effectiveEventId,
          effectiveEventType || undefined
        );
    for (const item of payloads) {
      const itemBaseId = stripGuestIdPrefix(item.id);
      const idx = list.findIndex(
        g =>
          g.id === item.id ||
          stripGuestIdPrefix(g.id) === itemBaseId ||
          g.name.toLowerCase() === item.name.toLowerCase()
      );
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...item, id: list[idx].id || item.id };
        item.id = list[idx].id;
      } else {
        list.push(item);
      }
    }
    localStorage.setItem(storageKey, JSON.stringify(list));
  } catch {
    // ignore
  }

  // 2. Sync batch to server API asynchronously in background
  if (shouldCallGuestsRestApi()) {
    void fetch('/api/guests/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerId: effectiveOwner,
        eventId: effectiveEventId,
        eventType: effectiveEventType,
        guests: payloads,
      }),
    })
      .then(res => {
        if (res.status === 404 || res.status === 405) isGuestsRestApiUnsupported = true;
      })
      .catch(() => {});
  }

  // 3. Sync to Firestore asynchronously in background using atomic writeBatch
  void commitGuestsBatchToFirestore(payloads, effectiveOwner, effectiveEventId);

  return payloads;
}

/**
 * Delete a guest scoped to the current user AND invitation across localStorage, REST API, and all Firestore paths
 */
export async function deleteGuestFromFirebase(
  id: string,
  ownerId?: string,
  eventId?: string,
  guestName?: string,
  eventType?: string
): Promise<GuestPreset[]> {
  const effectiveOwner = resolveOwnerId(ownerId);
  const effectiveEventId = resolveEventId(eventId, effectiveOwner);
  const storageKey = getGuestStorageKey(effectiveOwner, effectiveEventId);
  const candidateIds = getCandidateGuestIds(id, effectiveOwner, effectiveEventId);
  const candidateSet = new Set(candidateIds);
  const targetBaseId = stripGuestIdPrefix(id);
  const targetNameLower = (guestName || '').trim().toLowerCase();

  let resolvedName = guestName || '';
  let remainingGuests: GuestPreset[] = [];
  let hadUnseededDefaults = false;

  try {
    const local = localStorage.getItem(storageKey);
    hadUnseededDefaults = local === null;
    const currentList: GuestPreset[] =
      local !== null && Array.isArray(JSON.parse(local))
        ? JSON.parse(local)
        : getScopedDefaultGuests(effectiveOwner, effectiveEventId, eventType);

    for (const item of currentList) {
      const itemBaseId = stripGuestIdPrefix(item.id);
      const isMatch =
        candidateSet.has(item.id) ||
        (targetBaseId && itemBaseId === targetBaseId) ||
        (targetNameLower && (item.name || '').trim().toLowerCase() === targetNameLower);
      if (isMatch && !resolvedName && item.name) {
        resolvedName = item.name;
      }
      if (!isMatch) {
        remainingGuests.push(item);
      }
    }

    addDeletedGuestTokens(effectiveOwner, effectiveEventId, id, resolvedName);
    remainingGuests = normalizeAndFilterGuests(remainingGuests, effectiveOwner, effectiveEventId, eventType);
    localStorage.setItem(storageKey, JSON.stringify(remainingGuests));
  } catch {
    addDeletedGuestTokens(effectiveOwner, effectiveEventId, id, resolvedName);
  }

  // Delete from server API in background so UI never waits on Vercel / network latency
  if (shouldCallGuestsRestApi()) {
    void fetch(
      buildGuestsApiUrl(effectiveOwner, effectiveEventId, {
        id,
        ...(resolvedName ? { name: resolvedName } : {}),
      }),
      {
        method: 'DELETE',
        cache: 'no-store',
      }
    )
      .then(async res => {
        if (res.status === 404 || res.status === 405) {
          isGuestsRestApiUnsupported = true;
          return;
        }
        if (res.ok && hadUnseededDefaults && remainingGuests.length > 0) {
          await fetch('/api/guests/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ownerId: effectiveOwner,
              eventId: effectiveEventId,
              ...(eventType ? { eventType } : {}),
              guests: remainingGuests,
            }),
          }).catch(() => {});
        }
      })
      .catch(() => {});
  }

  if (IS_FIRESTORE_WRITE_DISABLED || isFirestoreKnownUnavailable()) {
    return remainingGuests;
  }

  // Run Firestore candidate document cleanup asynchronously in the background using atomic writeBatch
  void (async () => {
    try {
      const batch = writeBatch(db);
      for (const cid of candidateIds) {
        if (effectiveOwner !== GUEST_PUBLIC_SCOPE) {
          batch.delete(getUserEventGuestDoc(effectiveOwner, effectiveEventId, cid));
          batch.delete(getScopedGuestDoc(effectiveOwner, cid));
        }
        batch.delete(doc(db, GUESTS_COLLECTION, cid));
      }
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${GUESTS_COLLECTION}/${id}`);
    }
  })();

  return remainingGuests;
}

/**
 * Clear ONLY the specified owner's AND specified invitation's guests from localStorage, API, and Firestore
 */
export async function clearAllGuestsFromFirebase(ownerId?: string, eventId?: string): Promise<GuestPreset[]> {
  const effectiveOwner = resolveOwnerId(ownerId);
  const effectiveEventId = resolveEventId(eventId, effectiveOwner);
  const storageKey = getGuestStorageKey(effectiveOwner, effectiveEventId);

  try {
    const defaults = getScopedDefaultGuests(effectiveOwner, effectiveEventId);
    for (const d of defaults) {
      addDeletedGuestTokens(effectiveOwner, effectiveEventId, d.id, d.name);
    }
    localStorage.setItem(storageKey, JSON.stringify([]));
  } catch {
    // ignore
  }

  if (shouldCallGuestsRestApi()) {
    void fetch(buildGuestsApiUrl(effectiveOwner, effectiveEventId, { all: '1' }), {
      method: 'DELETE',
      cache: 'no-store',
    })
      .then(res => {
        if (res.status === 404 || res.status === 405) isGuestsRestApiUnsupported = true;
      })
      .catch(() => {});
  }

  if (IS_FIRESTORE_WRITE_DISABLED || isFirestoreKnownUnavailable()) {
    return [];
  }

  // Run Firestore bulk cleanup in background so UI clears immediately
  void (async () => {
    try {
      if (effectiveOwner !== GUEST_PUBLIC_SCOPE) {
        try {
          const eventSubSnap = await getDocs(
            query(getUserEventGuestsCollection(effectiveOwner, effectiveEventId), where('ownerId', '==', effectiveOwner))
          );
          await Promise.all(
            eventSubSnap.docs.map(docSnap => deleteDoc(getUserEventGuestDoc(effectiveOwner, effectiveEventId, docSnap.id)))
          );
        } catch {
          // ignore
        }
        try {
          const subSnap = await getDocs(
            query(collection(db, USER_DATABASES_COLLECTION, effectiveOwner, GUESTS_COLLECTION), where('ownerId', '==', effectiveOwner))
          );
          await Promise.all(
            subSnap.docs
              .filter(docSnap => guestMatchesEventScope(docSnap.data() as GuestPreset, effectiveOwner, effectiveEventId))
              .map(docSnap => deleteDoc(getScopedGuestDoc(effectiveOwner, docSnap.id)))
          );
        } catch {
          // ignore
        }
      }
      const q = query(collection(db, GUESTS_COLLECTION), where('ownerId', '==', effectiveOwner));
      const querySnapshot = await getDocs(q);
      const deletePromises = querySnapshot.docs
        .filter(docSnap => guestMatchesEventScope(docSnap.data() as GuestPreset, effectiveOwner, effectiveEventId))
        .map(docSnap => deleteDoc(doc(db, GUESTS_COLLECTION, docSnap.id)));
      await Promise.all(deletePromises);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, GUESTS_COLLECTION);
    }
  })();

  return [];
}

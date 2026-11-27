import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  where,
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
 * Fetch all guests for a specific user AND specific invitation from REST API / Firestore / scoped localStorage
 */
export async function fetchGuestsFromFirebase(
  ownerId?: string,
  eventId?: string,
  eventType?: string
): Promise<GuestPreset[]> {
  const effectiveOwner = resolveOwnerId(ownerId);
  const effectiveEventId = resolveEventId(eventId, effectiveOwner);
  const storageKey = getGuestStorageKey(effectiveOwner, effectiveEventId);

  // 1. Check scoped server API first (strictly filtered by ownerId + eventId + tombstones)
  try {
    const res = await fetch(buildGuestsApiUrl(effectiveOwner, effectiveEventId), {
      cache: 'no-store',
    });
    if (res.ok) {
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
        // If user already has an initialized local guest list or deletion tombstones, return immediately without slow Firestore waterfall!
        const hasLocalState = typeof localStorage !== 'undefined' && localStorage.getItem(storageKey) !== null;
        const hasTombstones = readDeletedGuestTokens(effectiveOwner, effectiveEventId).size > 0;
        if (hasLocalState || hasTombstones) {
          try {
            const localRaw = localStorage.getItem(storageKey);
            if (localRaw !== null) {
              const parsed = JSON.parse(localRaw);
              if (Array.isArray(parsed)) {
                const filteredLocal = normalizeAndFilterGuests(parsed, effectiveOwner, effectiveEventId, eventType);
                localStorage.setItem(storageKey, JSON.stringify(filteredLocal));
                return filteredLocal;
              }
            }
          } catch {
            // ignore
          }
          return [];
        }
      }
    }
  } catch {
    // ignore
  }

  const skipFs = IS_FIRESTORE_WRITE_DISABLED || isFirestoreKnownUnavailable();

  // 2. Check per-user + per-invitation subcollection `/user_databases/{effectiveOwner}/events/{effectiveEventId}/guests`
  if (!skipFs && effectiveOwner !== GUEST_PUBLIC_SCOPE) {
    try {
      const eventGuestsQuery = query(
        getUserEventGuestsCollection(effectiveOwner, effectiveEventId),
        where('ownerId', '==', effectiveOwner)
      );
      const subSnap = await getDocs(eventGuestsQuery);
      if (!subSnap.empty) {
        const rawGuests: GuestPreset[] = [];
        subSnap.forEach(docSnap => {
          const rawData = docSnap.data() as GuestPreset;
          if (guestMatchesEventScope({ ...rawData, eventId: rawData.eventId || effectiveEventId }, effectiveOwner, effectiveEventId)) {
            rawGuests.push(mapDocToGuest(docSnap.id, rawData, effectiveOwner, effectiveEventId, eventType));
          }
        });
        const guests = normalizeAndFilterGuests(rawGuests, effectiveOwner, effectiveEventId, eventType);
        if (guests.length > 0) {
          try {
            localStorage.setItem(storageKey, JSON.stringify(guests));
          } catch {
            // ignore
          }
          return guests;
        }
      }
    } catch {
      // fallback to per-user /guests subcollection
    }

    // 3. Fallback to `/user_databases/{effectiveOwner}/guests` filtered by eventId (checking raw data.eventId BEFORE mapping)
    try {
      const userGuestsQuery = query(
        collection(db, USER_DATABASES_COLLECTION, effectiveOwner, GUESTS_COLLECTION),
        where('ownerId', '==', effectiveOwner)
      );
      const userSnap = await getDocs(userGuestsQuery);
      if (!userSnap.empty) {
        const rawGuests: GuestPreset[] = [];
        userSnap.forEach(docSnap => {
          const rawData = docSnap.data() as GuestPreset;
          if (guestMatchesEventScope(rawData, effectiveOwner, effectiveEventId)) {
            rawGuests.push(mapDocToGuest(docSnap.id, rawData, effectiveOwner, effectiveEventId, eventType));
          }
        });
        const guests = normalizeAndFilterGuests(rawGuests, effectiveOwner, effectiveEventId, eventType);
        if (guests.length > 0) {
          try {
            localStorage.setItem(storageKey, JSON.stringify(guests));
          } catch {
            // ignore
          }
          return guests;
        }
      }
    } catch {
      // fallback to top-level /guests
    }
  }

  // 4. Fallback to top-level `/guests` filtered by ownerId & eventId (checking raw data.eventId BEFORE mapping)
  if (!skipFs) {
    try {
      const q = query(collection(db, GUESTS_COLLECTION), where('ownerId', '==', effectiveOwner));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const rawGuests: GuestPreset[] = [];
        querySnapshot.forEach(docSnap => {
          const rawData = docSnap.data() as GuestPreset;
          if (guestMatchesEventScope(rawData, effectiveOwner, effectiveEventId)) {
            rawGuests.push(mapDocToGuest(docSnap.id, rawData, effectiveOwner, effectiveEventId, eventType));
          }
        });
        const guests = normalizeAndFilterGuests(rawGuests, effectiveOwner, effectiveEventId, eventType);
        if (guests.length > 0) {
          try {
            localStorage.setItem(storageKey, JSON.stringify(guests));
          } catch {
            // ignore
          }
          return guests;
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, GUESTS_COLLECTION);
    }
  }

  // 5. Fallback to scoped local storage (preserving explicit empty [] when cleared) or scoped defaults filtered by tombstones
  try {
    const local = localStorage.getItem(storageKey);
    if (local !== null) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed)) {
        const filteredLocal = normalizeAndFilterGuests(parsed, effectiveOwner, effectiveEventId, eventType);
        localStorage.setItem(storageKey, JSON.stringify(filteredLocal));
        return filteredLocal;
      }
    }
    const defaults = normalizeAndFilterGuests(
      getScopedDefaultGuests(effectiveOwner, effectiveEventId, eventType),
      effectiveOwner,
      effectiveEventId,
      eventType
    );
    localStorage.setItem(storageKey, JSON.stringify(defaults));
    return defaults;
  } catch {
    // ignore
  }

  return normalizeAndFilterGuests(
    getScopedDefaultGuests(effectiveOwner, effectiveEventId, eventType),
    effectiveOwner,
    effectiveEventId,
    eventType
  );
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

  // Sync batch to REST API
  try {
    await fetch('/api/guests/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerId: effectiveOwner,
        eventId: effectiveEventId,
        eventType,
        guests: payloads,
      }),
    });
  } catch {
    // ignore
  }

  if (IS_FIRESTORE_WRITE_DISABLED || (typeof window !== 'undefined' && localStorage.getItem('firestore_quota_exceeded') === 'true')) {
    return;
  }
  try {
    if (effectiveOwner !== GUEST_PUBLIC_SCOPE) {
      await ensureUserDatabaseInFirebase({ scopeId: effectiveOwner, skipRestApi: true });
    }
    await Promise.all(
      payloads.map(async presetPayload => {
        if (effectiveOwner !== GUEST_PUBLIC_SCOPE) {
          await setDoc(getUserEventGuestDoc(effectiveOwner, effectiveEventId, presetPayload.id), presetPayload, { merge: true });
          await setDoc(getScopedGuestDoc(effectiveOwner, presetPayload.id), presetPayload, { merge: true });
        }
        const docRef = doc(db, GUESTS_COLLECTION, presetPayload.id);
        await setDoc(docRef, presetPayload, { merge: true });
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, GUESTS_COLLECTION);
  }
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

        const guests = normalizeAndFilterGuests(rawGuests, effectiveOwner, effectiveEventId, eventType);

        if (guests.length > 0) {
          try {
            localStorage.setItem(storageKey, JSON.stringify(guests));
          } catch {
            // ignore
          }
          callback(guests);
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
 * Save or update guest scoped to BOTH current user AND current invitation in Firestore, API, and localStorage
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

  // Always update scoped local storage
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
    const idx = baseList.findIndex(
      g => g.id === guestId || stripGuestIdPrefix(g.id) === targetBaseId
    );
    if (idx >= 0) {
      baseList[idx] = payload;
    } else {
      baseList.push(payload);
    }
    localStorage.setItem(storageKey, JSON.stringify(baseList));
  } catch {
    // ignore
  }

  // Always sync with server API
  try {
    await fetch('/api/guests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // ignore
  }

  if (IS_FIRESTORE_WRITE_DISABLED || (typeof window !== 'undefined' && localStorage.getItem('firestore_quota_exceeded') === 'true')) {
    return payload as GuestPreset;
  }

  try {
    if (effectiveOwner !== GUEST_PUBLIC_SCOPE) {
      await ensureUserDatabaseInFirebase({ scopeId: effectiveOwner, skipRestApi: true });
      await setDoc(getUserEventGuestDoc(effectiveOwner, effectiveEventId, guestId), payload, { merge: true });
      await setDoc(getScopedGuestDoc(effectiveOwner, guestId), payload, { merge: true });
    }
    const docRef = doc(db, GUESTS_COLLECTION, guestId);
    await setDoc(docRef, payload, { merge: true });
    return payload as GuestPreset;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${GUESTS_COLLECTION}/${guestId}`);
    return payload as GuestPreset;
  }
}

/**
 * Batch save multiple guests scoped to current user AND current invitation (used by Excel/CSV/Sheets imports)
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

  // 1. Update scoped localStorage
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
        list[idx] = { ...list[idx], ...item, id: item.id };
      } else {
        list.push(item);
      }
    }
    localStorage.setItem(storageKey, JSON.stringify(list));
  } catch {
    // ignore
  }

  // 2. Sync batch to server API
  try {
    await fetch('/api/guests/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerId: effectiveOwner,
        eventId: effectiveEventId,
        eventType: effectiveEventType,
        guests: payloads,
      }),
    });
  } catch {
    // ignore
  }

  // 3. Sync to Firestore
  if (IS_FIRESTORE_WRITE_DISABLED || (typeof window !== 'undefined' && localStorage.getItem('firestore_quota_exceeded') === 'true')) {
    return payloads;
  }

  try {
    if (effectiveOwner !== GUEST_PUBLIC_SCOPE) {
      await ensureUserDatabaseInFirebase({ scopeId: effectiveOwner, skipRestApi: true });
    }
    await Promise.all(
      payloads.map(async item => {
        if (effectiveOwner !== GUEST_PUBLIC_SCOPE) {
          await setDoc(getUserEventGuestDoc(effectiveOwner, effectiveEventId, item.id), item, { merge: true });
          await setDoc(getScopedGuestDoc(effectiveOwner, item.id), item, { merge: true });
        }
        await setDoc(doc(db, GUESTS_COLLECTION, item.id), item, { merge: true });
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, GUESTS_COLLECTION);
  }

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

  // Delete from server API immediately (single fast local HTTP request)
  try {
    const res = await fetch(
      buildGuestsApiUrl(effectiveOwner, effectiveEventId, {
        id,
        ...(resolvedName ? { name: resolvedName } : {}),
      }),
      {
        method: 'DELETE',
        cache: 'no-store',
      }
    );
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && Array.isArray(data.guests) && data.guests.length > 0) {
        remainingGuests = normalizeAndFilterGuests(
          data.guests,
          effectiveOwner,
          effectiveEventId,
          eventType
        );
        localStorage.setItem(storageKey, JSON.stringify(remainingGuests));
      } else if (hadUnseededDefaults && remainingGuests.length > 0) {
        // Persist remaining defaults in background without blocking UI
        void fetch('/api/guests/batch', {
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
    }
  } catch {
    // ignore
  }

  if (IS_FIRESTORE_WRITE_DISABLED || isFirestoreKnownUnavailable()) {
    return remainingGuests;
  }

  // Run Firestore candidate document cleanup asynchronously in the background so UI never stalls
  void Promise.all(
    candidateIds.map(async cid => {
      if (effectiveOwner !== GUEST_PUBLIC_SCOPE) {
        try {
          await deleteDoc(getUserEventGuestDoc(effectiveOwner, effectiveEventId, cid));
        } catch {
          // ignore
        }
        try {
          await deleteDoc(getScopedGuestDoc(effectiveOwner, cid));
        } catch {
          // ignore
        }
      }
      try {
        await deleteDoc(doc(db, GUESTS_COLLECTION, cid));
      } catch {
        // ignore
      }
    })
  ).catch(error => {
    handleFirestoreError(error, OperationType.DELETE, `${GUESTS_COLLECTION}/${id}`);
  });

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

  try {
    await fetch(buildGuestsApiUrl(effectiveOwner, effectiveEventId, { all: '1' }), {
      method: 'DELETE',
      cache: 'no-store',
    });
  } catch {
    // ignore
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

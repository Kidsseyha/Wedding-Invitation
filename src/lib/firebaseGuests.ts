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

  // 1. Check scoped server API first (strictly filtered by ownerId + eventId)
  try {
    const res = await fetch(buildGuestsApiUrl(effectiveOwner, effectiveEventId), {
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && Array.isArray(data.guests)) {
        const scopedApiGuests = data.guests.filter((g: GuestPreset) =>
          guestMatchesEventScope(g, effectiveOwner, effectiveEventId)
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
        const guests: GuestPreset[] = [];
        subSnap.forEach(docSnap => {
          const mapped = mapDocToGuest(docSnap.id, docSnap.data() as GuestPreset, effectiveOwner, effectiveEventId, eventType);
          if (guestMatchesEventScope(mapped, effectiveOwner, effectiveEventId)) {
            guests.push(mapped);
          }
        });
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

    // 3. Fallback to `/user_databases/{effectiveOwner}/guests` filtered by eventId
    try {
      const userGuestsQuery = query(
        collection(db, USER_DATABASES_COLLECTION, effectiveOwner, GUESTS_COLLECTION),
        where('ownerId', '==', effectiveOwner)
      );
      const userSnap = await getDocs(userGuestsQuery);
      if (!userSnap.empty) {
        const guests: GuestPreset[] = [];
        userSnap.forEach(docSnap => {
          const mapped = mapDocToGuest(docSnap.id, docSnap.data() as GuestPreset, effectiveOwner, effectiveEventId, eventType);
          if (guestMatchesEventScope(mapped, effectiveOwner, effectiveEventId)) {
            guests.push(mapped);
          }
        });
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

  // 4. Fallback to top-level `/guests` filtered by ownerId & eventId
  if (!skipFs) {
    try {
      const q = query(collection(db, GUESTS_COLLECTION), where('ownerId', '==', effectiveOwner));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const guests: GuestPreset[] = [];
        querySnapshot.forEach(docSnap => {
          const mapped = mapDocToGuest(docSnap.id, docSnap.data() as GuestPreset, effectiveOwner, effectiveEventId, eventType);
          if (guestMatchesEventScope(mapped, effectiveOwner, effectiveEventId)) {
            guests.push(mapped);
          }
        });
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

  // 5. Fallback to scoped local storage (preserving explicit empty [] when cleared) or scoped defaults
  try {
    const local = localStorage.getItem(storageKey);
    if (local !== null) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
    const defaults = getScopedDefaultGuests(effectiveOwner, effectiveEventId, eventType);
    localStorage.setItem(storageKey, JSON.stringify(defaults));
    return defaults;
  } catch {
    // ignore
  }

  return getScopedDefaultGuests(effectiveOwner, effectiveEventId, eventType);
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
    fetch(buildGuestsApiUrl(effectiveOwner, effectiveEventId), { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (data && data.success && Array.isArray(data.guests)) {
          const scopedApiGuests = data.guests.filter((g: GuestPreset) =>
            guestMatchesEventScope(g, effectiveOwner, effectiveEventId)
          );
          if (scopedApiGuests.length > 0) {
            try {
              localStorage.setItem(storageKey, JSON.stringify(scopedApiGuests));
            } catch {
              // ignore
            }
            callback(scopedApiGuests);
            return;
          }
        }
        try {
          const local = localStorage.getItem(storageKey);
          if (local !== null) {
            const parsed = JSON.parse(local);
            if (Array.isArray(parsed)) {
              callback(parsed);
              return;
            }
          }
        } catch {
          // ignore
        }
        callback(getScopedDefaultGuests(effectiveOwner, effectiveEventId, eventType));
      })
      .catch(() => {
        try {
          const local = localStorage.getItem(storageKey);
          if (local !== null) {
            const parsed = JSON.parse(local);
            if (Array.isArray(parsed)) {
              callback(parsed);
              return;
            }
          }
        } catch {
          // ignore
        }
        callback(getScopedDefaultGuests(effectiveOwner, effectiveEventId, eventType));
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
        const guests: GuestPreset[] = [];
        snapshot.forEach(docSnap => {
          const mapped = mapDocToGuest(docSnap.id, docSnap.data() as GuestPreset, effectiveOwner, effectiveEventId, eventType);
          if (guestMatchesEventScope(mapped, effectiveOwner, effectiveEventId)) {
            guests.push(mapped);
          }
        });

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
    const list: GuestPreset[] = Array.isArray(parsed)
      ? parsed
      : getScopedDefaultGuests(effectiveOwner, effectiveEventId, effectiveEventType || undefined);
    const idx = list.findIndex(g => g.id === guestId);
    if (idx >= 0) {
      list[idx] = payload;
    } else {
      list.push(payload);
    }
    localStorage.setItem(storageKey, JSON.stringify(list));
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
      : getScopedDefaultGuests(effectiveOwner, effectiveEventId, effectiveEventType || undefined);
    for (const item of payloads) {
      const idx = list.findIndex(g => g.id === item.id || g.name.toLowerCase() === item.name.toLowerCase());
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...item, id: list[idx].id };
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
 * Delete a guest scoped to the current user AND invitation
 */
export async function deleteGuestFromFirebase(id: string, ownerId?: string, eventId?: string) {
  const effectiveOwner = resolveOwnerId(ownerId);
  const effectiveEventId = resolveEventId(eventId, effectiveOwner);
  const storageKey = getGuestStorageKey(effectiveOwner, effectiveEventId);

  try {
    const local = localStorage.getItem(storageKey);
    if (local !== null) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed)) {
        const list = parsed.filter((g: any) => g.id !== id);
        localStorage.setItem(storageKey, JSON.stringify(list));
      }
    } else {
      const defaults = getScopedDefaultGuests(effectiveOwner, effectiveEventId);
      if (defaults.some(d => d.id === id)) {
        localStorage.setItem(storageKey, JSON.stringify(defaults.filter(d => d.id !== id)));
      } else {
        localStorage.setItem(storageKey, JSON.stringify([]));
      }
    }
  } catch {
    // ignore
  }

  try {
    await fetch(buildGuestsApiUrl(effectiveOwner, effectiveEventId, { id }), {
      method: 'DELETE',
      cache: 'no-store',
    });
  } catch {
    // ignore
  }

  if (IS_FIRESTORE_WRITE_DISABLED || (typeof window !== 'undefined' && localStorage.getItem('firestore_quota_exceeded') === 'true')) {
    return;
  }

  try {
    if (effectiveOwner !== GUEST_PUBLIC_SCOPE) {
      try {
        await deleteDoc(getUserEventGuestDoc(effectiveOwner, effectiveEventId, id));
      } catch {
        // ignore
      }
      try {
        await deleteDoc(getScopedGuestDoc(effectiveOwner, id));
      } catch {
        // ignore
      }
    }
    const docRef = doc(db, GUESTS_COLLECTION, id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${GUESTS_COLLECTION}/${id}`);
  }
}

/**
 * Clear ONLY the specified owner's AND specified invitation's guests from localStorage, API, and Firestore
 */
export async function clearAllGuestsFromFirebase(ownerId?: string, eventId?: string) {
  const effectiveOwner = resolveOwnerId(ownerId);
  const effectiveEventId = resolveEventId(eventId, effectiveOwner);
  const storageKey = getGuestStorageKey(effectiveOwner, effectiveEventId);

  try {
    localStorage.setItem(storageKey, JSON.stringify([]));
  } catch {
    // ignore
  }

  try {
    await fetch(buildGuestsApiUrl(effectiveOwner, effectiveEventId, { all: '1' }), {
      method: 'DELETE',
    });
  } catch {
    // ignore
  }

  if (IS_FIRESTORE_WRITE_DISABLED || (typeof window !== 'undefined' && localStorage.getItem('firestore_quota_exceeded') === 'true')) {
    return;
  }

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
}

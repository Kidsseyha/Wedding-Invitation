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
import { db, handleFirestoreError, OperationType, IS_FIRESTORE_WRITE_DISABLED } from '../lib/firebase';
import { getScopedDefaultGuests, GuestPreset } from '../data/guests';
import { getScopedGuestId, getUserStorageKey, resolveUserScope } from './userScope';

const GUESTS_COLLECTION = 'guests';
const LOCAL_STORAGE_KEY = 'wedding_saved_guest_list_v1';

function resolveOwnerId(ownerId?: string): string {
  return (ownerId && ownerId.trim()) || resolveUserScope().scopeId;
}

function getOwnerStorageKey(ownerId?: string): string {
  return getUserStorageKey(LOCAL_STORAGE_KEY, resolveOwnerId(ownerId));
}

function mapDocToGuest(id: string, data: Partial<GuestPreset>, effectiveOwner: string): GuestPreset {
  return {
    id,
    name: data.name || '',
    category: data.category || 'general',
    categoryLabelKh: data.categoryLabelKh || 'ទូទៅ',
    categoryLabelEn: data.categoryLabelEn || 'General',
    note: data.note || '',
    ownerId: data.ownerId || effectiveOwner,
  };
}

/**
 * Fetch all guests for a specific owner from REST API / Firestore / scoped localStorage
 */
export async function fetchGuestsFromFirebase(ownerId?: string): Promise<GuestPreset[]> {
  const effectiveOwner = resolveOwnerId(ownerId);
  const storageKey = getOwnerStorageKey(effectiveOwner);

  // Check scoped server API first
  try {
    const res = await fetch(`/api/guests?ownerId=${encodeURIComponent(effectiveOwner)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && Array.isArray(data.guests) && data.guests.length > 0) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(data.guests));
        } catch {
          // ignore
        }
        return data.guests;
      }
    }
  } catch {
    // ignore
  }

  try {
    const q = query(collection(db, GUESTS_COLLECTION), where('ownerId', '==', effectiveOwner));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const guests: GuestPreset[] = [];
      querySnapshot.forEach(docSnap => {
        guests.push(mapDocToGuest(docSnap.id, docSnap.data() as GuestPreset, effectiveOwner));
      });
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

  // Fallback to scoped local storage (preserving explicit empty [] when cleared) or scoped defaults
  try {
    const local = localStorage.getItem(storageKey);
    if (local !== null) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
    const defaults = getScopedDefaultGuests(effectiveOwner);
    localStorage.setItem(storageKey, JSON.stringify(defaults));
    return defaults;
  } catch {
    // ignore
  }

  return getScopedDefaultGuests(effectiveOwner);
}

/**
 * Seed initial presets scoped to the specified owner
 */
export async function seedDefaultGuestsToFirebase(ownerId?: string) {
  const effectiveOwner = resolveOwnerId(ownerId);
  const storageKey = getOwnerStorageKey(effectiveOwner);
  const defaults = getScopedDefaultGuests(effectiveOwner);

  try {
    localStorage.setItem(storageKey, JSON.stringify(defaults));
  } catch {
    // ignore
  }

  // Sync to REST API
  try {
    for (const preset of defaults) {
      await fetch('/api/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...preset,
          ownerId: effectiveOwner,
          updatedAt: new Date().toISOString(),
        }),
      });
    }
  } catch {
    // ignore
  }

  if (IS_FIRESTORE_WRITE_DISABLED || (typeof window !== 'undefined' && localStorage.getItem('firestore_quota_exceeded') === 'true')) {
    return;
  }
  try {
    for (const preset of defaults) {
      const docRef = doc(db, GUESTS_COLLECTION, preset.id);
      await setDoc(
        docRef,
        {
          ...preset,
          ownerId: effectiveOwner,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, GUESTS_COLLECTION);
  }
}

/**
 * Real-time listener for a single owner's guests from Firebase
 */
export function subscribeToGuests(callback: (guests: GuestPreset[]) => void, ownerId?: string) {
  const effectiveOwner = resolveOwnerId(ownerId);
  const storageKey = getOwnerStorageKey(effectiveOwner);

  const fallbackGuests = () => {
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
    fetch(`/api/guests?ownerId=${encodeURIComponent(effectiveOwner)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.success && Array.isArray(data.guests) && data.guests.length > 0) {
          callback(data.guests);
        } else {
          callback(getScopedDefaultGuests(effectiveOwner));
        }
      })
      .catch(() => callback(getScopedDefaultGuests(effectiveOwner)));
  };

  try {
    const q = query(collection(db, GUESTS_COLLECTION), where('ownerId', '==', effectiveOwner));
    return onSnapshot(
      q,
      snapshot => {
        if (!snapshot.empty) {
          const guests: GuestPreset[] = [];
          snapshot.forEach(docSnap => {
            guests.push(mapDocToGuest(docSnap.id, docSnap.data() as GuestPreset, effectiveOwner));
          });

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
 * Save or update guest scoped to the current owner in Firestore, API, and localStorage
 */
export async function saveGuestToFirebase(guest: GuestPreset | Omit<GuestPreset, 'id'>, ownerId?: string) {
  const effectiveOwner = resolveOwnerId(ownerId || guest.ownerId);
  const storageKey = getOwnerStorageKey(effectiveOwner);
  const rawId = 'id' in guest && guest.id ? guest.id : `guest-${Date.now()}`;
  const guestId = getScopedGuestId(rawId, effectiveOwner);

  const payload: any = {
    ...guest,
    note: guest.note !== undefined && guest.note !== null ? guest.note : '',
    id: guestId,
    ownerId: effectiveOwner,
    updatedAt: new Date().toISOString(),
  };

  Object.keys(payload).forEach(key => {
    if (payload[key] === undefined) {
      payload[key] = '';
    }
  });

  // Always update scoped local storage
  try {
    const local = localStorage.getItem(storageKey);
    const parsed = local !== null ? JSON.parse(local) : null;
    const list: GuestPreset[] = Array.isArray(parsed) ? parsed : getScopedDefaultGuests(effectiveOwner);
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

  const docRef = doc(db, GUESTS_COLLECTION, guestId);

  try {
    await setDoc(docRef, payload, { merge: true });
    return payload as GuestPreset;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${GUESTS_COLLECTION}/${guestId}`);
    return payload as GuestPreset;
  }
}

/**
 * Delete a guest scoped to the current owner
 */
export async function deleteGuestFromFirebase(id: string, ownerId?: string) {
  const effectiveOwner = resolveOwnerId(ownerId);
  const storageKey = getOwnerStorageKey(effectiveOwner);

  try {
    const local = localStorage.getItem(storageKey);
    if (local !== null) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed)) {
        const list = parsed.filter((g: any) => g.id !== id);
        localStorage.setItem(storageKey, JSON.stringify(list));
      }
    }
  } catch {
    // ignore
  }

  try {
    await fetch(`/api/guests?id=${encodeURIComponent(id)}&ownerId=${encodeURIComponent(effectiveOwner)}`, {
      method: 'DELETE',
    });
  } catch {
    // ignore
  }

  if (IS_FIRESTORE_WRITE_DISABLED || (typeof window !== 'undefined' && localStorage.getItem('firestore_quota_exceeded') === 'true')) {
    return;
  }

  try {
    const docRef = doc(db, GUESTS_COLLECTION, id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${GUESTS_COLLECTION}/${id}`);
  }
}

/**
 * Clear ONLY the specified owner's guests from localStorage, API, and Firestore
 */
export async function clearAllGuestsFromFirebase(ownerId?: string) {
  const effectiveOwner = resolveOwnerId(ownerId);
  const storageKey = getOwnerStorageKey(effectiveOwner);

  try {
    localStorage.setItem(storageKey, JSON.stringify([]));
  } catch {
    // ignore
  }

  try {
    await fetch(`/api/guests?all=1&ownerId=${encodeURIComponent(effectiveOwner)}`, {
      method: 'DELETE',
    });
  } catch {
    // ignore
  }

  if (IS_FIRESTORE_WRITE_DISABLED || (typeof window !== 'undefined' && localStorage.getItem('firestore_quota_exceeded') === 'true')) {
    return;
  }

  try {
    const q = query(collection(db, GUESTS_COLLECTION), where('ownerId', '==', effectiveOwner));
    const querySnapshot = await getDocs(q);
    const deletePromises = querySnapshot.docs.map(docSnap =>
      deleteDoc(doc(db, GUESTS_COLLECTION, docSnap.id))
    );
    await Promise.all(deletePromises);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, GUESTS_COLLECTION);
  }
}

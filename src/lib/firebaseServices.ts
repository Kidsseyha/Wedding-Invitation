import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db, auth, IS_FIRESTORE_WRITE_DISABLED, handleFirestoreError, OperationType } from './firebase';
import type { WeddingEvent } from '../types';
import { DEFAULT_PRESET_EVENT_ID, extractScopeFromEventId, isGlobalSharedPresetId } from './userScope';
import { compressBase64String } from '../utils/imageCompressor';
import {
  shouldSkipImageRecompression,
  needsFirestoreCompaction,
  raceWithTimeout,
} from '../utils/saveHelpers';

export interface RSVPRecord {
  id?: string;
  eventId?: string;
  ownerId?: string;
  name: string;
  attending: 'yes' | 'no';
  guestCount: number;
  phone: string;
  note: string;
  timestamp: string;
}

/**
 * Helper to compress/downsample large base64 images so they fit securely in Firestore 1MB limits
 */
async function downsampleBase64Image(base64Str: string, maxWidth = 650, maxHeight = 650, quality = 0.6): Promise<string> {
  if (shouldSkipImageRecompression(base64Str)) return base64Str;
  try {
    return await compressBase64String(base64Str, { maxWidth, maxHeight, quality });
  } catch {
    return base64Str;
  }
}

/**
 * Prepares a safe, compact payload specifically bounded for Firestore's 1MB document limit
 */
async function prepareFirestorePayload(event: WeddingEvent): Promise<WeddingEvent> {
  const rawStr = JSON.stringify(event);
  const safeEvent: WeddingEvent = JSON.parse(rawStr);

  // Strip oversized inline video data URLs (> 200KB) from single Firestore doc
  if (Array.isArray(safeEvent.config?.galleryPhotos)) {
    safeEvent.config.galleryPhotos = safeEvent.config.galleryPhotos.filter(
      (p) => Boolean(p) && !(typeof p === 'string' && p.startsWith('data:video/') && p.length > 200_000)
    );
  }

  // Fast path: skip expensive canvas downsampling if payload already fits comfortably under Firestore limits
  if (!needsFirestoreCompaction(rawStr.length)) {
    return safeEvent;
  }

  // Pass 1: Parallel downsampling of oversized fields
  const tasks: Promise<void>[] = [];
  if (safeEvent.image && !shouldSkipImageRecompression(safeEvent.image)) {
    tasks.push(
      downsampleBase64Image(safeEvent.image, 600, 600, 0.58).then((res) => {
        safeEvent.image = res;
      })
    );
  }

  if (safeEvent.config) {
    const cfg = safeEvent.config;
    const compressCfgField = (
      key:
        | 'main_background'
        | 'cover_background'
        | 'details_background'
        | 'envelope_header_image'
        | 'event_location'
        | 'qr_code'
        | 'qr_code_riel',
      maxDim: number
    ) => {
      const val = cfg[key];
      if (val && val !== 'none' && !shouldSkipImageRecompression(val)) {
        tasks.push(
          downsampleBase64Image(val, maxDim, maxDim, 0.55).then((res) => {
            cfg[key] = res;
          })
        );
      }
    };

    compressCfgField('main_background', 600);
    compressCfgField('cover_background', 600);
    compressCfgField('details_background', 600);
    compressCfgField('envelope_header_image', 450);
    compressCfgField('event_location', 600);
    compressCfgField('qr_code', 400);
    compressCfgField('qr_code_riel', 400);

    if (Array.isArray(cfg.galleryPhotos) && cfg.galleryPhotos.length > 0) {
      tasks.push(
        Promise.all(
          cfg.galleryPhotos.map((p) =>
            typeof p === 'string' && !shouldSkipImageRecompression(p)
              ? downsampleBase64Image(p, 550, 550, 0.55)
              : Promise.resolve(p)
          )
        ).then((photos) => {
          cfg.galleryPhotos = photos;
        })
      );
    }
  }

  await Promise.all(tasks);

  // Pass 2 only if payload still exceeds 650KB
  const jsonStr = JSON.stringify(safeEvent);
  if (jsonStr.length > 650_000 && safeEvent.config) {
    const cfg = safeEvent.config;
    await Promise.all([
      cfg.main_background ? downsampleBase64Image(cfg.main_background, 400, 400, 0.45).then((r) => { cfg.main_background = r; }) : Promise.resolve(),
      cfg.cover_background ? downsampleBase64Image(cfg.cover_background, 400, 400, 0.45).then((r) => { cfg.cover_background = r; }) : Promise.resolve(),
      cfg.details_background ? downsampleBase64Image(cfg.details_background, 400, 400, 0.45).then((r) => { cfg.details_background = r; }) : Promise.resolve(),
      cfg.event_location ? downsampleBase64Image(cfg.event_location, 400, 400, 0.45).then((r) => { cfg.event_location = r; }) : Promise.resolve(),
      safeEvent.image ? downsampleBase64Image(safeEvent.image, 400, 400, 0.45).then((r) => { safeEvent.image = r; }) : Promise.resolve(),
      Array.isArray(cfg.galleryPhotos)
        ? Promise.all(
            cfg.galleryPhotos.slice(0, 10).map((p) =>
              typeof p === 'string' && p.startsWith('data:image/')
                ? downsampleBase64Image(p, 380, 380, 0.45)
                : p
            )
          ).then((photos) => { cfg.galleryPhotos = photos; })
        : Promise.resolve(),
    ]);
  }

  return safeEvent;
}

/**
 * Submit wedding wish/blessing scoped to a specific eventId & ownerId
 */
export async function submitWishToFirebase(wish: {
  name: string;
  message: string;
  relation: string;
  timestamp: string;
  eventId?: string;
  ownerId?: string;
}) {
  const wishId = 'wish-' + Date.now();
  const effectiveEventId = wish.eventId || DEFAULT_PRESET_EVENT_ID;
  const effectiveOwnerId = wish.ownerId || extractScopeFromEventId(effectiveEventId) || '';
  const payload = {
    id: wishId,
    eventId: effectiveEventId,
    ownerId: effectiveOwnerId,
    name: wish.name || '',
    relationship: wish.relation || '',
    message: wish.message || '',
    likes: 0,
    createdAt: wish.timestamp || new Date().toISOString()
  };

  // 1. Sync with server API
  try {
    await fetch('/api/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn('REST API save wish error:', e);
  }

  // 2. Direct Firestore write
  if (!IS_FIRESTORE_WRITE_DISABLED) {
    try {
      const docRef = doc(db, 'wishes', wishId);
      await setDoc(docRef, payload, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `wishes/${wishId}`);
    }
  }

  return payload;
}

/**
 * Add wish alias (same as submitWishToFirebase)
 */
export async function addWishToFirebase(wish: any) {
  return submitWishToFirebase({
    name: wish.name || '',
    message: wish.message || '',
    relation: wish.relation || wish.relationship || '',
    timestamp: wish.createdAt || wish.timestamp || new Date().toISOString(),
    eventId: wish.eventId,
    ownerId: wish.ownerId,
  });
}

/**
 * Increment heart likes on a wish
 */
export async function likeWishInFirebase(wishId: string, eventId?: string) {
  let updatedWish: any = null;
  const querySuffix = eventId ? `?eventId=${encodeURIComponent(eventId)}` : '';

  // 1. Local/Server API update
  try {
    const res = await fetch(`/api/wishes${querySuffix}`);
    const data = await res.json();
    const wishes = data.wishes || [];
    const wish = wishes.find((w: any) => w.id === wishId);
    if (wish) {
      wish.likes = (wish.likes || 0) + 1;
      updatedWish = wish;
      await fetch('/api/wishes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wish),
      });
    }
  } catch (e) {
    console.warn('REST API like wish error:', e);
  }

  // 2. Sync directly to Firestore
  if (!IS_FIRESTORE_WRITE_DISABLED) {
    try {
      const docRef = doc(db, 'wishes', wishId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const currentData = snap.data();
        const newLikes = updatedWish && typeof updatedWish.likes === 'number'
          ? updatedWish.likes
          : (currentData.likes || 0) + 1;
        await setDoc(docRef, { likes: newLikes }, { merge: true });
      } else if (updatedWish && updatedWish.name && updatedWish.message) {
        const effectiveEventId = updatedWish.eventId || eventId || DEFAULT_PRESET_EVENT_ID;
        await setDoc(docRef, {
          id: updatedWish.id || wishId,
          eventId: effectiveEventId,
          ownerId: updatedWish.ownerId || extractScopeFromEventId(effectiveEventId) || '',
          name: String(updatedWish.name).slice(0, 200),
          relationship: String(updatedWish.relationship || updatedWish.relation || ''),
          message: String(updatedWish.message).slice(0, 2000),
          likes: typeof updatedWish.likes === 'number' ? updatedWish.likes : 1,
          createdAt: updatedWish.createdAt || updatedWish.timestamp || new Date().toISOString(),
        }, { merge: true });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `wishes/${wishId}`);
    }
  }
}

/**
 * Delete a wish from both server and Firestore
 */
export async function deleteWishInFirebase(wishId: string, eventId?: string): Promise<void> {
  const querySuffix = eventId ? `?eventId=${encodeURIComponent(eventId)}` : '';
  // 1. Delete from REST API
  try {
    await fetch(`/api/wishes/${encodeURIComponent(wishId)}${querySuffix}`, {
      method: 'DELETE',
    });
  } catch (e) {
    console.warn('REST API delete wish error:', e);
  }

  // 2. Delete from Firestore
  if (!IS_FIRESTORE_WRITE_DISABLED) {
    try {
      const docRef = doc(db, 'wishes', wishId);
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `wishes/${wishId}`);
    }
  }
}

/**
 * Submit RSVP response and notify the specific event owner
 */
export async function saveRSVPToFirebase(rsvp: RSVPRecord) {
  const rsvpId = rsvp.id || 'rsvp-' + Date.now();
  const effectiveEventId = rsvp.eventId || DEFAULT_PRESET_EVENT_ID;
  const effectiveOwnerId = rsvp.ownerId || extractScopeFromEventId(effectiveEventId) || '';
  const payload = {
    ...rsvp,
    id: rsvpId,
    eventId: effectiveEventId,
    ownerId: effectiveOwnerId,
    note: rsvp.note || '',
    timestamp: rsvp.timestamp || new Date().toISOString()
  };

  // 1. Sync with server API
  try {
    await fetch('/api/rsvps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn('REST API save RSVP error:', e);
  }

  // 2. Sync with Firestore
  if (!IS_FIRESTORE_WRITE_DISABLED) {
    try {
      const docRef = doc(db, 'rsvps', rsvpId);
      await setDoc(docRef, payload, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `rsvps/${rsvpId}`);
    }
  }

  // 3. Trigger Owner Notification (In-App Dashboard Alert & Email Notification Log)
  try {
    const notificationId = 'notif-' + Date.now();
    const notifPayload = {
      id: notificationId,
      eventId: effectiveEventId,
      ownerId: effectiveOwnerId,
      type: 'RSVP_SUBMISSION',
      title: `New RSVP: ${payload.name}`,
      message: `${payload.name} submitted RSVP: ${payload.attending === 'yes' ? 'Attending' : 'Not Attending'} (${payload.guestCount} guests). Phone: ${payload.phone || 'N/A'}`,
      guestName: payload.name,
      attending: payload.attending,
      timestamp: new Date().toISOString(),
      read: false,
    };
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(notifPayload),
    });
    if (!IS_FIRESTORE_WRITE_DISABLED) {
      const notifRef = doc(db, 'notifications', notificationId);
      await setDoc(notifRef, notifPayload, { merge: true });
    }
  } catch (e) {
    console.warn('Owner RSVP notification trigger error:', e);
  }

  return payload;
}

/**
 * Sync user profile to Firestore `/users/{userId}` database collection
 */
export async function syncUserProfile(
  user: { uid: string; email?: string | null; displayName?: string | null; photoURL?: string | null },
  activeEventId?: string
) {
  if (!user || !user.uid) return null;
  const userProfile = {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
    activeEventId: activeEventId || `event_${user.uid}`,
    role: user.email?.toLowerCase() === 'seyhayoeurn2017@gmail.com' ? 'owner' : (user.email === 'yoeurn.seyha@diu.edu.kh' ? 'admin' : 'editor'),
    lastLoginAt: new Date().toISOString(),
  };

  if (!IS_FIRESTORE_WRITE_DISABLED) {
    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, userProfile, { merge: true });
    } catch (error) {
      console.warn('Error saving user profile to Firestore:', error);
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  }

  return userProfile;
}

/**
 * Fetch dedicated user wedding event from Firestore or fallback to REST API
 */
export async function fetchUserEvent(userId: string): Promise<WeddingEvent | null> {
  const userEventId = `event_${userId}`;
  return fetchEventFromFirebase(userEventId);
}

/**
 * Fetch wedding event from Firestore or fallback to REST API
 */
export async function fetchEventFromFirebase(eventId: string, ownerId?: string): Promise<WeddingEvent | null> {
  const targetId = eventId || DEFAULT_PRESET_EVENT_ID;

  // Try fetching from Firestore first
  if (!IS_FIRESTORE_WRITE_DISABLED) {
    try {
      const docRef = doc(db, 'events', targetId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as WeddingEvent;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `events/${targetId}`);
    }
  }

  // Fallback to server REST API
  try {
    const ownerParam = ownerId ? `&ownerId=${encodeURIComponent(ownerId)}` : '';
    const res = await fetch(`/api/event?id=${encodeURIComponent(targetId)}${ownerParam}`);
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.event) return json.event;
    }
  } catch (error) {
    console.warn('REST API fetch event error:', error);
  }
  return null;
}

/**
 * Fetch all saved/custom events belonging strictly to a specific ownerId
 */
export async function fetchUserTemplatesFromFirebase(ownerId: string): Promise<WeddingEvent[]> {
  if (!ownerId || ownerId === 'guest_public') return [];
  const results = new Map<string, WeddingEvent>();

  // 1. REST API templates owned by this user
  try {
    const res = await fetch(`/api/templates?ownerId=${encodeURIComponent(ownerId)}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.success && Array.isArray(data.templates)) {
        for (const t of data.templates) {
          const evt = t?.event || t;
          if (evt && evt.id && !isGlobalSharedPresetId(evt.id) && evt.ownerId === ownerId) {
            results.set(evt.id, evt);
          }
        }
      }
    }
  } catch {
    // ignore
  }

  // 2. Firestore events query where('ownerId', '==', ownerId)
  if (!IS_FIRESTORE_WRITE_DISABLED) {
    try {
      const q = query(collection(db, 'events'), where('ownerId', '==', ownerId));
      const snap = await getDocs(q);
      snap.forEach((docSnap) => {
        const evt = docSnap.data() as WeddingEvent;
        if (evt && docSnap.id && !isGlobalSharedPresetId(docSnap.id)) {
          results.set(docSnap.id, { ...evt, id: evt.id || docSnap.id });
        }
      });
    } catch {
      // ignore
    }
  }

  return Array.from(results.values());
}

/**
 * Save wedding event config to both Server and Firestore with defensive size enforcement
 */
export async function saveEventToFirebase(
  event: WeddingEvent,
  options?: { skipRestApi?: boolean; writeTimeoutMs?: number }
) {
  const eventId = event.id || 'cmgrawhnk0003le0434762j7n';

  // 1. Sync full rich data with server API (supports up to 50MB payload) unless caller already synced it
  const serverPayload: WeddingEvent = {
    ...event,
    id: eventId,
    name: event.name || 'អាពាហ៍ពិពាហ៍',
    slug: event.slug || 'wedding',
    groom: event.groom || '',
    bride: event.bride || '',
    updatedAt: event.updatedAt || new Date().toISOString(),
  };

  if (!options?.skipRestApi) {
    try {
      await fetch('/api/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serverPayload),
      });
    } catch (e) {
      console.warn('REST API save event error:', e);
    }
  }

  // 2. Sync with Firestore safely with bounded wait so offline/reconnecting SDK never stalls Save UI
  if (!IS_FIRESTORE_WRITE_DISABLED) {
    const writePromise = (async () => {
      try {
        const firestorePayload = await prepareFirestorePayload(serverPayload);
        const docRef = doc(db, 'events', eventId);
        await setDoc(docRef, firestorePayload, { merge: true });
      } catch (error) {
        console.warn('Firestore write event error (handled defensively):', error);
        handleFirestoreError(error, OperationType.WRITE, `events/${eventId}`);
      }
    })();

    const timeoutMs = options?.writeTimeoutMs ?? 1200;
    await raceWithTimeout(writePromise, timeoutMs, undefined);
  }

  return serverPayload;
}

/**
 * Delete wedding event / template from both server REST API and Firestore
 */
export async function deleteEventFromFirebase(eventId: string): Promise<void> {
  if (!eventId) return;

  // 1. Delete from REST API
  try {
    await fetch(`/api/event?id=${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
    });
  } catch (e) {
    console.warn('REST API delete event error:', e);
  }

  // 2. Delete from Firestore
  if (!IS_FIRESTORE_WRITE_DISABLED) {
    try {
      const docRef = doc(db, 'events', eventId);
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `events/${eventId}`);
    }
  }
}

/**
 * Real-time listener for events (prefers Firestore, falls back to polling API)
 */
export function subscribeToEvent(eventId: string, callback: (event: WeddingEvent) => void) {
  const targetId = eventId || 'cmgrawhnk0003le0434762j7n';

  // If writes/reads are enabled, subscribe to Firestore real-time updates
  if (!IS_FIRESTORE_WRITE_DISABLED) {
    try {
      const docRef = doc(db, 'events', targetId);
      return onSnapshot(docRef, (snap) => {
        if (snap.exists()) {
          callback(snap.data() as WeddingEvent);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `events/${targetId}`);
      });
    } catch (e) {
      console.warn('Firestore subscription failed, falling back to REST polling:', e);
    }
  }

  // Fallback server REST polling (highly resilient)
  const intervalId = setInterval(async () => {
    try {
      const res = await fetch(`/api/event?id=${targetId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.event) callback(json.event);
      }
    } catch (e) {
      // ignore
    }
  }, 10000);

  return () => clearInterval(intervalId);
}

/**
 * Real-time listener for wishes/blessings scoped to a specific eventId
 */
export function subscribeToWishes(
  eventIdOrCallback: string | ((wishes: any[]) => void),
  maybeCallback?: (wishes: any[]) => void
) {
  const targetEventId =
    typeof eventIdOrCallback === 'string' && eventIdOrCallback
      ? eventIdOrCallback
      : DEFAULT_PRESET_EVENT_ID;
  const callback =
    typeof eventIdOrCallback === 'function'
      ? eventIdOrCallback
      : maybeCallback!;

  if (!IS_FIRESTORE_WRITE_DISABLED) {
    try {
      const wishesCol = collection(db, 'wishes');
      const sourceQuery =
        targetEventId === DEFAULT_PRESET_EVENT_ID
          ? wishesCol
          : query(wishesCol, where('eventId', '==', targetEventId));

      return onSnapshot(sourceQuery, (snap) => {
        const wishes: any[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          if (targetEventId === DEFAULT_PRESET_EVENT_ID) {
            if (!data.eventId || data.eventId === targetEventId) {
              wishes.push(data);
            }
          } else if (data.eventId === targetEventId) {
            wishes.push(data);
          }
        });
        wishes.sort((a, b) => new Date(b.createdAt || b.timestamp || 0).getTime() - new Date(a.createdAt || a.timestamp || 0).getTime());
        callback(wishes);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'wishes');
      });
    } catch (e) {
      console.warn('Firestore subscription for wishes failed, falling back to REST polling:', e);
    }
  }

  // Fallback polling scoped by eventId
  const pollWishes = async () => {
    try {
      const res = await fetch(`/api/wishes?eventId=${encodeURIComponent(targetEventId)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.wishes) callback(json.wishes);
      }
    } catch {
      // ignore
    }
  };
  pollWishes();
  const intervalId = setInterval(pollWishes, 10000);

  return () => clearInterval(intervalId);
}

/**
 * Register or update system user in Firestore and REST API for Security Verification
 */
export async function registerSystemUserInFirebase(userRecord: { name: string; email: string; passcode: string }) {
  const userId = 'user-' + (userRecord.email || userRecord.name).toLowerCase().replace(/[^a-z0-9]/g, '_');
  const payload = {
    ...userRecord,
    id: userId,
    createdAt: new Date().toISOString()
  };

  // 1. Save to REST API
  try {
    await fetch('/api/system-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.warn('REST API save system user error:', e);
  }

  // 2. Save to Firestore
  if (!IS_FIRESTORE_WRITE_DISABLED) {
    try {
      const docRef = doc(db, 'system_users', userId);
      await setDoc(docRef, payload, { merge: true });
    } catch (error) {
      console.warn('Firestore system user write error:', error);
    }
  }
  return payload;
}

/**
 * Fetch system users from Firestore and REST API for Security Verification
 */
export async function fetchSystemUsersFromFirebase(): Promise<any[]> {
  // Ultra-fast parallel fetch: local API vs Firestore collections (system_users & users) with 1200ms timeout race
  const apiFetchPromise = fetch('/api/system-users')
    .then(async (res) => (res.ok ? (await res.json())?.users || [] : []))
    .catch(() => []);

  const firestoreSystemUsersPromise = !IS_FIRESTORE_WRITE_DISABLED
    ? getDocs(collection(db, 'system_users'))
        .then((querySnapshot) => {
          const users: any[] = [];
          querySnapshot.forEach((docSnap) => users.push(docSnap.data()));
          return users;
        })
        .catch(() => [])
    : Promise.resolve([]);

  const currentAuthEmail = auth.currentUser?.email?.toLowerCase() || '';
  const isVerifiedAdminAuth =
    Boolean(auth.currentUser?.emailVerified) &&
    (currentAuthEmail === 'seyhayoeurn2017@gmail.com' || currentAuthEmail === 'yoeurn.seyha@diu.edu.kh');

  const firestoreUsersCollectionPromise =
    !IS_FIRESTORE_WRITE_DISABLED && isVerifiedAdminAuth
      ? getDocs(collection(db, 'users'))
          .then((querySnapshot) => {
            const users: any[] = [];
            querySnapshot.forEach((docSnap) => {
              const data = docSnap.data();
              users.push({
                name: data.displayName || data.email?.split('@')[0] || 'Google User',
                email: data.email || '',
                passcode: 'Google Auth (Verified)',
                role: data.role || (data.email?.toLowerCase() === 'seyhayoeurn2017@gmail.com' ? 'owner' : (data.email === 'yoeurn.seyha@diu.edu.kh' ? 'admin' : 'editor')),
                createdAt: data.lastLoginAt || new Date().toISOString(),
              });
            });
            return users;
          })
          .catch(() => [])
      : Promise.resolve([]);

  const timeoutPromise = new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 1200));

  const [apiUsers, firestoreSystemUsers, firestoreAuthUsers] = await Promise.all([
    apiFetchPromise,
    Promise.race([firestoreSystemUsersPromise, timeoutPromise]),
    Promise.race([firestoreUsersCollectionPromise, timeoutPromise]),
  ]);

  const combined = [...apiUsers];
  for (const u of [...firestoreSystemUsers, ...firestoreAuthUsers]) {
    if (u && (u.email || u.name)) {
      const emailLower = (u.email || '').toLowerCase().trim();
      const nameLower = (u.name || '').toLowerCase().trim();
      const existingIdx = combined.findIndex((m: any) => {
        const mEmail = (m.email || '').toLowerCase().trim();
        const mName = (m.name || '').toLowerCase().trim();
        if (emailLower && mEmail === emailLower) return true;
        if (nameLower && mName === nameLower) return true;
        return false;
      });
      if (existingIdx >= 0) {
        combined[existingIdx] = { ...combined[existingIdx], ...u };
      } else {
        combined.push(u);
      }
    }
  }

  return combined;
}

/**
 * Delete system user from Firestore and REST API
 */
export async function deleteSystemUserFromFirebase(userRecord: { id?: string; email?: string; name?: string }): Promise<boolean> {
  const userId = userRecord.id || ('user-' + (userRecord.email || userRecord.name || '').toLowerCase().replace(/[^a-z0-9]/g, '_'));

  // 1. Delete from REST API
  try {
    await fetch('/api/system-users/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: userId, email: userRecord.email, name: userRecord.name })
    });
  } catch (e) {
    console.warn('REST API delete system user error:', e);
  }

  // 2. Delete from Firestore
  if (!IS_FIRESTORE_WRITE_DISABLED) {
    try {
      const docRef = doc(db, 'system_users', userId);
      await deleteDoc(docRef);
    } catch (error) {
      console.warn('Firestore system user delete error:', error);
    }
  }

  return true;
}


import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  db,
  auth,
  firebaseConfig,
  IS_FIRESTORE_WRITE_DISABLED,
  handleFirestoreError,
  testFirestoreConnection,
  isFirestoreKnownUnavailable,
  markFirestoreUnavailable,
  markFirestoreAvailable,
  OperationType,
} from './firebase';
import type { WeddingEvent } from '../types';
import { DEFAULT_PRESET_EVENT_ID, GUEST_PUBLIC_SCOPE, extractScopeFromEventId, isGlobalSharedPresetId } from './userScope';
import { getEmailDatabaseId, resolveRecordDatabaseId, type UserDatabaseRecord } from './userDatabase';
import { compressBase64String } from '../utils/imageCompressor';
import {
  shouldSkipImageRecompression,
  needsFirestoreCompaction,
  raceWithTimeout,
  pickNewestDatabaseEvent,
  getEventTimestampMs,
  getUtf8ByteLength,
  enforceFirestoreEventBounds,
} from '../utils/saveHelpers';

const USER_DATABASES_COLLECTION = 'user_databases';
const provisionedDbIds = new Set<string>();

/**
 * Ensures a dedicated personal database exists for a user account (keyed by email -> u_<slug>_<hash>)
 * in both Firestore `/user_databases/{dbId}` and the Express server directory `data/user_databases/{dbId}/`.
 */
export async function ensureUserDatabaseInFirebase(account: {
  email?: string | null;
  name?: string | null;
  displayName?: string | null;
  role?: string;
  uid?: string;
  scopeId?: string;
  forceSync?: boolean;
  skipRestApi?: boolean;
}): Promise<UserDatabaseRecord | null> {
  const cleanEmail = (account.email || '').trim().toLowerCase().slice(0, 256);
  const dbId = getEmailDatabaseId(account.scopeId || cleanEmail || account.uid || account.name);
  if (!dbId || dbId === GUEST_PUBLIC_SCOPE) return null;

  const now = new Date().toISOString().slice(0, 64);
  const resolvedRole = (
    account.role ||
    (cleanEmail === 'seyhayoeurn2017@gmail.com'
      ? 'owner'
      : cleanEmail === 'yoeurn.seyha@diu.edu.kh'
      ? 'admin'
      : 'user')
  ).slice(0, 50);
  const resolvedName = (account.displayName || account.name || cleanEmail.split('@')[0] || 'User').trim().slice(0, 256);
  const cleanUid = account.uid ? String(account.uid).trim().slice(0, 128) : undefined;

  const record: UserDatabaseRecord = {
    id: dbId,
    email: cleanEmail,
    displayName: resolvedName,
    role: resolvedRole,
    ownerId: dbId,
    ...(cleanUid ? { uid: cleanUid } : {}),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  let serverDbRecord: UserDatabaseRecord | null = null;
  if (!account.skipRestApi) {
    try {
      const res = await fetch('/api/user-databases/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          name: resolvedName,
          displayName: resolvedName,
          role: resolvedRole,
          uid: cleanUid,
          scopeId: dbId,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.success && json.database) {
          serverDbRecord = json.database as UserDatabaseRecord;
        }
      }
    } catch {
      // ignore offline/network errors
    }
  }

  if (!IS_FIRESTORE_WRITE_DISABLED && (!provisionedDbIds.has(dbId) || account.forceSync)) {
    try {
      const dbRef = doc(db, USER_DATABASES_COLLECTION, dbId);
      const firestorePayload: Record<string, any> = {
        id: dbId,
        ownerId: dbId,
        status: 'active',
        updatedAt: now,
      };
      if (cleanEmail) firestorePayload.email = cleanEmail;
      if (resolvedName) firestorePayload.displayName = resolvedName;
      if (resolvedRole) firestorePayload.role = resolvedRole;
      if (cleanUid) firestorePayload.uid = cleanUid;
      if (!provisionedDbIds.has(dbId)) {
        firestorePayload.createdAt = (serverDbRecord?.createdAt || now).slice(0, 64);
      }
      await setDoc(dbRef, firestorePayload, { merge: true });
      provisionedDbIds.add(dbId);
    } catch (error) {
      console.warn(`Firestore user_databases write notice (${dbId}):`, error);
    }
  } else {
    provisionedDbIds.add(dbId);
  }

  return serverDbRecord || record;
}

/**
 * Batch provisions personal databases for all registered email accounts
 */
export async function provisionAllEmailDatabases(
  users: Array<{ email?: string; name?: string; displayName?: string; role?: string; uid?: string; scopeId?: string }>
): Promise<UserDatabaseRecord[]> {
  if (!Array.isArray(users) || users.length === 0) return [];
  let serverDatabases: UserDatabaseRecord[] = [];
  try {
    const res = await fetch('/api/user-databases/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ users }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json?.success && Array.isArray(json.databases)) {
        serverDatabases = json.databases;
      }
    }
  } catch {
    // ignore
  }

  if (!IS_FIRESTORE_WRITE_DISABLED) {
    await Promise.allSettled(
      users
        .filter((u) => u && (u.email || u.scopeId))
        .map((u) =>
          ensureUserDatabaseInFirebase({
            email: u.email,
            name: u.name,
            displayName: u.displayName,
            role: u.role,
            uid: u.uid,
            scopeId: u.scopeId,
            skipRestApi: true,
          })
        )
    );
  }

  return serverDatabases;
}

/**
 * Fetches all per-email personal database records with live collection counts
 */
export async function fetchUserDatabasesFromFirebase(): Promise<UserDatabaseRecord[]> {
  const apiPromise = fetch('/api/user-databases')
    .then(async (res) => (res.ok ? ((await res.json())?.databases || []) : []))
    .catch(() => []);

  const firestorePromise = !IS_FIRESTORE_WRITE_DISABLED
    ? getDocs(collection(db, USER_DATABASES_COLLECTION))
        .then((snap) => {
          const list: UserDatabaseRecord[] = [];
          snap.forEach((docSnap) => {
            const data = docSnap.data() as UserDatabaseRecord;
            if (data && docSnap.id) {
              list.push({ ...data, id: data.id || docSnap.id });
            }
          });
          return list;
        })
        .catch(() => [])
    : Promise.resolve([]);

  const [apiList, fsResult] = await Promise.all([
    apiPromise,
    raceWithTimeout(firestorePromise, 1500, [] as UserDatabaseRecord[]),
  ]);
  const fsList = Array.isArray(fsResult?.value) ? fsResult.value : [];

  const byId = new Map<string, UserDatabaseRecord>();
  for (const item of fsList) {
    if (item?.id) byId.set(item.id, item);
  }
  for (const item of apiList) {
    if (item?.id) {
      const prev = byId.get(item.id);
      byId.set(item.id, prev ? { ...prev, ...item } : item);
    }
  }
  return Array.from(byId.values());
}

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
 * and validated against Firestore Security Rules (`isValidWeddingEvent` & UTF-8 size).
 */
async function prepareFirestorePayload(
  event: WeddingEvent,
  forcedOwnerId?: string
): Promise<WeddingEvent> {
  const safeEvent = enforceFirestoreEventBounds(
    JSON.parse(JSON.stringify(event)) as WeddingEvent,
    forcedOwnerId
  );

  // Strip oversized inline video data URLs (> 180KB) from single Firestore doc
  if (Array.isArray(safeEvent.config?.galleryPhotos)) {
    safeEvent.config.galleryPhotos = safeEvent.config.galleryPhotos.filter(
      (p) => Boolean(p) && !(typeof p === 'string' && p.startsWith('data:video/') && p.length > 180_000)
    );
  }

  // Fast path: check actual UTF-8 byte length (Khmer text is 3 bytes/char)
  if (!needsFirestoreCompaction(getUtf8ByteLength(JSON.stringify(safeEvent)), 500_000)) {
    return safeEvent;
  }

  // Pass 1: Parallel downsampling of oversized image fields
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
              ? downsampleBase64Image(p, 520, 520, 0.55)
              : Promise.resolve(p)
          )
        ).then((photos) => {
          cfg.galleryPhotos = photos;
        })
      );
    }
  }

  await Promise.all(tasks);

  // Pass 2 only if UTF-8 bytes still exceed 700KB
  if (getUtf8ByteLength(JSON.stringify(safeEvent)) > 700_000 && safeEvent.config) {
    const cfg = safeEvent.config;
    await Promise.all([
      cfg.main_background && !shouldSkipImageRecompression(cfg.main_background, 40_000)
        ? downsampleBase64Image(cfg.main_background, 400, 400, 0.45).then((r) => { cfg.main_background = r; })
        : Promise.resolve(),
      cfg.cover_background && !shouldSkipImageRecompression(cfg.cover_background, 40_000)
        ? downsampleBase64Image(cfg.cover_background, 400, 400, 0.45).then((r) => { cfg.cover_background = r; })
        : Promise.resolve(),
      cfg.details_background && !shouldSkipImageRecompression(cfg.details_background, 40_000)
        ? downsampleBase64Image(cfg.details_background, 400, 400, 0.45).then((r) => { cfg.details_background = r; })
        : Promise.resolve(),
      cfg.event_location && !shouldSkipImageRecompression(cfg.event_location, 40_000)
        ? downsampleBase64Image(cfg.event_location, 400, 400, 0.45).then((r) => { cfg.event_location = r; })
        : Promise.resolve(),
      safeEvent.image && !shouldSkipImageRecompression(safeEvent.image, 40_000)
        ? downsampleBase64Image(safeEvent.image, 400, 400, 0.45).then((r) => { safeEvent.image = r; })
        : Promise.resolve(),
      Array.isArray(cfg.galleryPhotos)
        ? Promise.all(
            cfg.galleryPhotos.slice(0, 8).map((p) =>
              typeof p === 'string' && !shouldSkipImageRecompression(p, 40_000)
                ? downsampleBase64Image(p, 360, 360, 0.42)
                : p
            )
          ).then((photos) => { cfg.galleryPhotos = photos; })
        : Promise.resolve(),
    ]);
  }

  // Pass 3 safeguard: guarantee UTF-8 size fits safely under Firestore's 1,048,576 byte ceiling
  if (getUtf8ByteLength(JSON.stringify(safeEvent)) > 820_000 && safeEvent.config) {
    const cfg = safeEvent.config;
    if (Array.isArray(cfg.galleryPhotos)) {
      const compactGallery: string[] = [];
      for (const p of cfg.galleryPhotos) {
        if (typeof p !== 'string') continue;
        if (!p.startsWith('data:image/') || compactGallery.length < 3) {
          compactGallery.push(p);
        }
      }
      cfg.galleryPhotos = compactGallery;
    }
    if (getUtf8ByteLength(JSON.stringify(safeEvent)) > 820_000 && Array.isArray(cfg.galleryPhotos)) {
      cfg.galleryPhotos = cfg.galleryPhotos.filter((p) => typeof p === 'string' && !p.startsWith('data:'));
    }
    // Progressive fallback for oversized inline background/QR base64 fields if still over 820KB
    const trimOrder: Array<'details_background' | 'main_background' | 'cover_background' | 'event_location' | 'envelope_header_image' | 'qr_code_riel' | 'qr_code'> = [
      'details_background',
      'main_background',
      'cover_background',
      'event_location',
      'envelope_header_image',
      'qr_code_riel',
      'qr_code',
    ];
    for (const key of trimOrder) {
      if (getUtf8ByteLength(JSON.stringify(safeEvent)) <= 820_000) break;
      const val = cfg[key];
      if (typeof val === 'string' && val.startsWith('data:image/')) {
        const tiny = await downsampleBase64Image(val, 260, 260, 0.35);
        cfg[key] = tiny;
        if (getUtf8ByteLength(JSON.stringify(safeEvent)) > 820_000 && cfg[key].length > 50_000) {
          delete cfg[key];
        }
      }
    }
    if (getUtf8ByteLength(JSON.stringify(safeEvent)) > 820_000 && typeof safeEvent.image === 'string' && safeEvent.image.startsWith('data:image/')) {
      safeEvent.image = await downsampleBase64Image(safeEvent.image, 260, 260, 0.35);
    }
  }

  return enforceFirestoreEventBounds(safeEvent, forcedOwnerId);
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

  // 2. Direct Firestore write (top-level + personal email database subcollection)
  if (!IS_FIRESTORE_WRITE_DISABLED) {
    try {
      const docRef = doc(db, 'wishes', wishId);
      await setDoc(docRef, payload, { merge: true });

      const targetDbId = resolveRecordDatabaseId({ ownerId: effectiveOwnerId, eventId: effectiveEventId });
      if (targetDbId && targetDbId !== GUEST_PUBLIC_SCOPE) {
        await ensureUserDatabaseInFirebase({ scopeId: targetDbId, skipRestApi: true });
        const scopedWishRef = doc(db, USER_DATABASES_COLLECTION, targetDbId, 'wishes', wishId);
        await setDoc(scopedWishRef, { ...payload, ownerId: targetDbId }, { merge: true });
      }
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
export async function likeWishInFirebase(wishId: string, eventId?: string, ownerId?: string) {
  let updatedWish: any = null;
  const effectiveOwner = ownerId || extractScopeFromEventId(eventId) || '';
  const queryParams = new URLSearchParams();
  if (eventId) queryParams.set('eventId', eventId);
  if (effectiveOwner && effectiveOwner !== GUEST_PUBLIC_SCOPE) queryParams.set('ownerId', effectiveOwner);
  const querySuffix = queryParams.toString() ? `?${queryParams.toString()}` : '';

  // 1. Local/Server API update
  try {
    const res = await fetch(`/api/wishes${querySuffix}`);
    const data = await res.json();
    const wishes = data.wishes || [];
    const wish = wishes.find((w: any) => w.id === wishId);
    if (wish) {
      wish.likes = (wish.likes || 0) + 1;
      if (!wish.ownerId && effectiveOwner) {
        wish.ownerId = effectiveOwner;
      }
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

  // 2. Sync directly to Firestore (top-level + personal email database subcollection)
  if (!IS_FIRESTORE_WRITE_DISABLED) {
    try {
      const docRef = doc(db, 'wishes', wishId);
      const snap = await getDoc(docRef);
      const resolvedOwner =
        updatedWish?.ownerId ||
        effectiveOwner ||
        (snap.exists() ? snap.data()?.ownerId : '') ||
        extractScopeFromEventId(updatedWish?.eventId || eventId || '') ||
        '';
      let finalLikes = typeof updatedWish?.likes === 'number' ? updatedWish.likes : 1;

      if (snap.exists()) {
        const currentData = snap.data();
        finalLikes =
          updatedWish && typeof updatedWish.likes === 'number'
            ? updatedWish.likes
            : (currentData.likes || 0) + 1;
        await setDoc(docRef, { likes: finalLikes }, { merge: true });
      } else if (updatedWish && updatedWish.name && updatedWish.message) {
        const effectiveEventId = updatedWish.eventId || eventId || DEFAULT_PRESET_EVENT_ID;
        await setDoc(
          docRef,
          {
            id: updatedWish.id || wishId,
            eventId: effectiveEventId,
            ownerId: resolvedOwner,
            name: String(updatedWish.name).slice(0, 200),
            relationship: String(updatedWish.relationship || updatedWish.relation || ''),
            message: String(updatedWish.message).slice(0, 2000),
            likes: finalLikes,
            createdAt: updatedWish.createdAt || updatedWish.timestamp || new Date().toISOString(),
          },
          { merge: true }
        );
      }

      const targetDbId = resolveRecordDatabaseId({
        ownerId: resolvedOwner,
        eventId: updatedWish?.eventId || eventId,
      });
      if (targetDbId && targetDbId !== GUEST_PUBLIC_SCOPE) {
        try {
          const scopedWishRef = doc(db, USER_DATABASES_COLLECTION, targetDbId, 'wishes', wishId);
          const scopedSnap = await getDoc(scopedWishRef);
          if (scopedSnap.exists()) {
            await setDoc(scopedWishRef, { likes: finalLikes }, { merge: true });
          } else if (updatedWish && updatedWish.name && updatedWish.message) {
            await ensureUserDatabaseInFirebase({ scopeId: targetDbId, skipRestApi: true });
            await setDoc(
              scopedWishRef,
              {
                id: updatedWish.id || wishId,
                eventId: updatedWish.eventId || eventId || DEFAULT_PRESET_EVENT_ID,
                ownerId: targetDbId,
                name: String(updatedWish.name).slice(0, 200),
                relationship: String(updatedWish.relationship || updatedWish.relation || ''),
                message: String(updatedWish.message).slice(0, 2000),
                likes: finalLikes,
                createdAt: updatedWish.createdAt || updatedWish.timestamp || new Date().toISOString(),
              },
              { merge: true }
            );
          }
        } catch {
          // ignore subcollection like mirror failures
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `wishes/${wishId}`);
    }
  }
}

/**
 * Delete a wish from both server and Firestore (top-level + personal email database)
 */
export async function deleteWishInFirebase(wishId: string, eventId?: string, ownerId?: string): Promise<void> {
  const effectiveOwner = ownerId || extractScopeFromEventId(eventId) || '';
  const queryParams = new URLSearchParams();
  if (eventId) queryParams.set('eventId', eventId);
  if (effectiveOwner && effectiveOwner !== GUEST_PUBLIC_SCOPE) queryParams.set('ownerId', effectiveOwner);
  const querySuffix = queryParams.toString() ? `?${queryParams.toString()}` : '';

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
      const targetDbId = resolveRecordDatabaseId({ ownerId: effectiveOwner, eventId });
      if (targetDbId && targetDbId !== GUEST_PUBLIC_SCOPE) {
        try {
          await deleteDoc(doc(db, USER_DATABASES_COLLECTION, targetDbId, 'wishes', wishId));
        } catch {
          // ignore
        }
      }
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

  // 2. Sync with Firestore (top-level + personal email database subcollection)
  const targetDbId = resolveRecordDatabaseId({ ownerId: effectiveOwnerId, eventId: effectiveEventId });
  if (!IS_FIRESTORE_WRITE_DISABLED) {
    try {
      const docRef = doc(db, 'rsvps', rsvpId);
      await setDoc(docRef, payload, { merge: true });

      if (targetDbId && targetDbId !== GUEST_PUBLIC_SCOPE) {
        await ensureUserDatabaseInFirebase({ scopeId: targetDbId, skipRestApi: true });
        await setDoc(
          doc(db, USER_DATABASES_COLLECTION, targetDbId, 'rsvps', rsvpId),
          { ...payload, ownerId: targetDbId },
          { merge: true }
        );
      }
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
      if (targetDbId && targetDbId !== GUEST_PUBLIC_SCOPE) {
        await ensureUserDatabaseInFirebase({ scopeId: targetDbId, skipRestApi: true });
        await setDoc(
          doc(db, USER_DATABASES_COLLECTION, targetDbId, 'notifications', notificationId),
          { ...notifPayload, ownerId: targetDbId },
          { merge: true }
        );
      }
    }
  } catch (e) {
    console.warn('Owner RSVP notification trigger error:', e);
  }

  return payload;
}

/**
 * Sync user profile to Firestore `/users/{userId}` and provision their personal `/user_databases/{dbId}`
 */
export async function syncUserProfile(
  user: { uid: string; email?: string | null; displayName?: string | null; photoURL?: string | null },
  activeEventId?: string
) {
  if (!user || !user.uid) return null;
  const userRole = user.email?.toLowerCase() === 'seyhayoeurn2017@gmail.com' ? 'owner' : (user.email === 'yoeurn.seyha@diu.edu.kh' ? 'admin' : 'editor');
  const userProfile = {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
    activeEventId: activeEventId || `event_${user.uid}`,
    role: userRole,
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

  // Ensure dedicated personal database exists for this user's email
  await ensureUserDatabaseInFirebase({
    email: user.email,
    displayName: user.displayName,
    role: userRole,
    uid: user.uid,
  });

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
 * Fetch wedding event from Firestore (personal user_databases + top-level events) & Server REST API,
 * returning the newest persisted database record (ignoring untouched presets) with bounded latency.
 */
export async function fetchEventFromFirebase(
  eventId: string,
  ownerId?: string,
  options?: {
    includeServerApi?: boolean;
    templateType?: string;
    ownerEmail?: string;
    forceServer?: boolean;
    timeoutMs?: number;
    onFastResult?: (event: WeddingEvent) => void;
    onSourceResolved?: (info: { firestoreOk: boolean; serverOk: boolean }) => void;
  }
): Promise<WeddingEvent | null> {
  const targetId = eventId || DEFAULT_PRESET_EVENT_ID;
  const targetDbId = resolveRecordDatabaseId({
    ownerId,
    ownerEmail: options?.ownerEmail,
    eventId: targetId,
  });
  const branchTimeoutMs = options?.timeoutMs ?? (options?.forceServer ? 3500 : 2500);

  const isBelongingToTargetOwner = (cand: WeddingEvent | null | undefined): cand is WeddingEvent => {
    if (!cand || typeof cand !== 'object') return false;
    if (!targetDbId || targetDbId === GUEST_PUBLIC_SCOPE) {
      return !cand.ownerId || cand.ownerId === GUEST_PUBLIC_SCOPE || cand.ownerId === extractScopeFromEventId(targetId);
    }
    return !cand.ownerId || cand.ownerId === targetDbId || cand.ownerId === ownerId;
  };

  let fastBest: WeddingEvent | null = null;
  let firestoreResponded = false;
  let serverResponded = false;

  const considerFastResult = (cand: WeddingEvent | null) => {
    if (!isBelongingToTargetOwner(cand) || !options?.onFastResult) return cand;
    const picked = pickNewestDatabaseEvent<WeddingEvent>([fastBest, cand]);
    if (picked && picked !== fastBest) {
      fastBest = picked;
      options.onFastResult(picked);
    }
    return cand;
  };

  const readDocFast = async (ref: ReturnType<typeof doc>): Promise<WeddingEvent | null> => {
    if (isFirestoreKnownUnavailable()) return null;
    const effectiveFsTimeout = Math.min(branchTimeoutMs, 650);
    if (options?.forceServer) {
      let failed = false;
      const serverRes = await raceWithTimeout(
        getDocFromServer(ref)
          .then((snap) => {
            firestoreResponded = true;
            markFirestoreAvailable();
            return snap.exists() ? (snap.data() as WeddingEvent) : null;
          })
          .catch(() => {
            failed = true;
            return null;
          }),
        effectiveFsTimeout,
        null as WeddingEvent | null
      );
      if (!serverRes.timedOut && !failed) {
        return serverRes.value;
      }
      if (serverRes.timedOut || failed) {
        markFirestoreUnavailable(45_000);
      }
      return null;
    }

    const res = await raceWithTimeout(
      getDoc(ref)
        .then((snap) => {
          firestoreResponded = true;
          markFirestoreAvailable();
          return snap.exists() ? (snap.data() as WeddingEvent) : null;
        })
        .catch(() => null),
      effectiveFsTimeout,
      null as WeddingEvent | null
    );
    if (res.timedOut) {
      markFirestoreUnavailable(45_000);
    }
    return res.value;
  };

  const skipFirestoreReads = IS_FIRESTORE_WRITE_DISABLED || isFirestoreKnownUnavailable();

  const scopedFsPromise: Promise<WeddingEvent | null> =
    !skipFirestoreReads && targetDbId && targetDbId !== GUEST_PUBLIC_SCOPE
      ? readDocFast(doc(db, USER_DATABASES_COLLECTION, targetDbId, 'events', targetId)).then(considerFastResult)
      : Promise.resolve(null);

  const shouldSkipGlobalTopDoc = Boolean(targetDbId && targetDbId !== GUEST_PUBLIC_SCOPE && isGlobalSharedPresetId(targetId));
  const topFsPromise: Promise<WeddingEvent | null> =
    !skipFirestoreReads && !shouldSkipGlobalTopDoc
      ? readDocFast(doc(db, 'events', targetId))
          .catch((error) => {
            handleFirestoreError(error, OperationType.GET, `events/${targetId}`);
            return null;
          })
          .then((docData) => (isBelongingToTargetOwner(docData) ? docData : null))
          .then(considerFastResult)
      : Promise.resolve(null);

  const includeServerApi = options?.includeServerApi !== false;
  const serverApiPromise: Promise<WeddingEvent | null> = includeServerApi
    ? (async () => {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timerId = controller ? setTimeout(() => controller.abort(), branchTimeoutMs) : null;
        try {
          const ownerParam = ownerId && ownerId !== GUEST_PUBLIC_SCOPE ? `&ownerId=${encodeURIComponent(ownerId)}` : '';
          const ownerEmailParam = options?.ownerEmail ? `&ownerEmail=${encodeURIComponent(options.ownerEmail)}` : '';
          const typeParam = options?.templateType ? `&type=${encodeURIComponent(options.templateType)}` : '';
          const cacheBust = options?.forceServer ? `&_t=${Date.now()}` : '';
          const fetchOpts: RequestInit = {
            ...(options?.forceServer ? { cache: 'no-store' as RequestCache } : {}),
            ...(controller ? { signal: controller.signal } : {}),
          };

          const res = await fetch(
            `/api/event?id=${encodeURIComponent(targetId)}${typeParam}${ownerParam}${ownerEmailParam}${cacheBust}`,
            fetchOpts
          );
          if (res.ok) {
            serverResponded = true;
            const json = await res.json();
            if (json?.success && json.event && json.source !== 'preset' && isBelongingToTargetOwner(json.event)) {
              return json.event as WeddingEvent;
            }
            // Only query ?type= separately if the ID lookup found nothing at all (not_found)
            if (options?.templateType && json?.source === 'not_found') {
              const typeRes = await fetch(
                `/api/event?type=${encodeURIComponent(options.templateType)}${ownerParam}${ownerEmailParam}${cacheBust}`,
                fetchOpts
              );
              if (typeRes.ok) {
                const typeJson = await typeRes.json();
                if (typeJson?.success && typeJson.event && typeJson.source !== 'preset' && isBelongingToTargetOwner(typeJson.event)) {
                  return typeJson.event as WeddingEvent;
                }
              }
            }
          }
        } catch (error) {
          if ((error as any)?.name !== 'AbortError') {
            console.warn('REST API fetch event error:', error);
          }
        } finally {
          if (timerId !== null) clearTimeout(timerId);
        }
        return null;
      })().then(considerFastResult)
    : Promise.resolve(null);

  const [scopedDoc, topDoc, apiDoc] = await Promise.all([
    scopedFsPromise,
    topFsPromise,
    serverApiPromise,
  ]);

  options?.onSourceResolved?.({
    firestoreOk: firestoreResponded,
    serverOk: serverResponded,
  });

  return pickNewestDatabaseEvent<WeddingEvent>([
    scopedDoc,
    isBelongingToTargetOwner(topDoc) ? topDoc : null,
    isBelongingToTargetOwner(apiDoc) ? apiDoc : null,
  ]);
}

export interface DatabaseCheckResult {
  event: WeddingEvent | null;
  firestoreConnected: boolean;
  serverConnected: boolean;
  reconnected: boolean;
  latencyMs: number;
  databaseId: string;
  projectId: string;
}

/**
 * Verifies connectivity to both Firebase Firestore and the Express Server DB,
 * then fetches the latest event record from both sources with forceServer enabled.
 */
export async function checkDatabasesAndFetchEvent(
  eventId: string,
  ownerId?: string,
  options?: {
    templateType?: string;
    ownerEmail?: string;
    timeoutMs?: number;
    onFastResult?: (event: WeddingEvent) => void;
  }
): Promise<DatabaseCheckResult> {
  const timeoutMs = options?.timeoutMs ?? 4000;
  let sourceStatus = { firestoreOk: false, serverOk: false };

  const checkServerHealth = async (): Promise<boolean> => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), Math.min(timeoutMs, 3500)) : null;
    try {
      const res = await fetch(`/api/health?_t=${Date.now()}`, {
        cache: 'no-store',
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!res.ok) return false;
      const json = await res.json().catch(() => null);
      return Boolean(json && json.status === 'ok');
    } catch {
      return false;
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  };

  const [fsStatus, healthOk, dbEvent] = await Promise.all([
    testFirestoreConnection(Math.min(timeoutMs, 650)),
    checkServerHealth(),
    fetchEventFromFirebase(eventId, ownerId, {
      includeServerApi: true,
      templateType: options?.templateType,
      ownerEmail: options?.ownerEmail,
      forceServer: true,
      timeoutMs: Math.min(timeoutMs, 800),
      onFastResult: options?.onFastResult,
      onSourceResolved: (info) => {
        sourceStatus = info;
      },
    }),
  ]);

  return {
    event: dbEvent,
    firestoreConnected: fsStatus.connected || sourceStatus.firestoreOk,
    serverConnected: healthOk || sourceStatus.serverOk,
    reconnected: fsStatus.reconnected,
    latencyMs: fsStatus.latencyMs,
    databaseId: fsStatus.databaseId || firebaseConfig.firestoreDatabaseId,
    projectId: fsStatus.projectId || firebaseConfig.projectId,
  };
}

/**
 * Fetch all saved/custom events belonging strictly to a specific ownerId (from personal DB + top-level)
 */
export async function fetchUserTemplatesFromFirebase(
  ownerId: string,
  options?: { timeoutMs?: number }
): Promise<WeddingEvent[]> {
  if (!ownerId || ownerId === GUEST_PUBLIC_SCOPE) return [];
  const results = new Map<string, WeddingEvent>();
  const targetDbId = resolveRecordDatabaseId({ ownerId });
  const timeoutMs = options?.timeoutMs ?? 2000;

  const restPromise = (async () => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timerId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetch(
        `/api/templates?ownerId=${encodeURIComponent(ownerId)}`,
        controller ? { signal: controller.signal } : undefined
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.success && Array.isArray(data.templates)) {
          return data.templates
            .map((t: any) => t?.event || t)
            .filter((evt: any) => evt && evt.id && !isGlobalSharedPresetId(evt.id) && evt.ownerId === ownerId) as WeddingEvent[];
        }
      }
    } catch {
      // ignore
    } finally {
      if (timerId !== null) clearTimeout(timerId);
    }
    return [] as WeddingEvent[];
  })();

  const skipFsTemplates = IS_FIRESTORE_WRITE_DISABLED || isFirestoreKnownUnavailable();
  const fsTemplateTimeoutMs = Math.min(timeoutMs, 600);

  const subFsPromise: Promise<WeddingEvent[]> =
    !skipFsTemplates && targetDbId && targetDbId !== GUEST_PUBLIC_SCOPE
      ? raceWithTimeout(
          getDocs(collection(db, USER_DATABASES_COLLECTION, targetDbId, 'events'))
            .then((subSnap) => {
              const list: WeddingEvent[] = [];
              subSnap.forEach((docSnap) => {
                const evt = docSnap.data() as WeddingEvent;
                if (evt && docSnap.id && !isGlobalSharedPresetId(docSnap.id)) {
                  list.push({ ...evt, id: evt.id || docSnap.id });
                }
              });
              return list;
            })
            .catch(() => [] as WeddingEvent[]),
          fsTemplateTimeoutMs,
          [] as WeddingEvent[]
        ).then((r) => {
          if (r.timedOut) markFirestoreUnavailable(45_000);
          return r.value;
        })
      : Promise.resolve([]);

  const topFsPromise: Promise<WeddingEvent[]> = !skipFsTemplates
    ? raceWithTimeout(
        getDocs(query(collection(db, 'events'), where('ownerId', '==', ownerId)))
          .then((snap) => {
            const list: WeddingEvent[] = [];
            snap.forEach((docSnap) => {
              const evt = docSnap.data() as WeddingEvent;
              if (evt && docSnap.id && !isGlobalSharedPresetId(docSnap.id)) {
                list.push({ ...evt, id: evt.id || docSnap.id });
              }
            });
            return list;
          })
          .catch(() => [] as WeddingEvent[]),
        fsTemplateTimeoutMs,
        [] as WeddingEvent[]
      ).then((r) => {
        if (r.timedOut) markFirestoreUnavailable(45_000);
        return r.value;
      })
    : Promise.resolve([]);

  const [restList, subList, topList] = await Promise.all([restPromise, subFsPromise, topFsPromise]);

  for (const evt of [...topList, ...subList, ...restList]) {
    const prev = results.get(evt.id);
    if (!prev) {
      results.set(evt.id, evt);
    } else {
      const picked = pickNewestDatabaseEvent<WeddingEvent>([prev, evt]);
      if (picked) results.set(evt.id, picked);
    }
  }

  return Array.from(results.values());
}

export interface SaveEventReliableResult {
  event: WeddingEvent;
  serverOk: boolean;
  firestoreOk: boolean;
  serverEvent?: WeddingEvent | null;
  error?: string;
}

/**
 * Save wedding event config to both Server and Firestore in parallel with exact status reporting,
 * strict rules boundary enforcement, and self-healing per-user database provisioning.
 */
export async function saveEventReliable(
  event: WeddingEvent,
  options?: { skipRestApi?: boolean; writeTimeoutMs?: number }
): Promise<SaveEventReliableResult> {
  const safeEventId =
    String(event.id || DEFAULT_PRESET_EVENT_ID)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 128) || DEFAULT_PRESET_EVENT_ID;

  const targetDbId = resolveRecordDatabaseId({
    ownerId: event.ownerId,
    ownerEmail: event.ownerEmail,
    eventId: safeEventId,
  });

  const serverPayload: WeddingEvent = {
    ...event,
    id: safeEventId,
    name: (event.name || 'អាពាហ៍ពិពាហ៍').slice(0, 300),
    slug: (event.slug || 'wedding').slice(0, 128),
    groom: (event.groom || '').slice(0, 200),
    bride: (event.bride || '').slice(0, 200),
    ...(targetDbId && targetDbId !== GUEST_PUBLIC_SCOPE ? { ownerId: targetDbId } : {}),
    updatedAt: event.updatedAt || new Date().toISOString(),
  };

  let serverOk = Boolean(options?.skipRestApi);
  let serverEvent: WeddingEvent | null = null;
  let firestoreOk = false;
  let lastError: string | undefined;

  const serverPromise: Promise<void> = !options?.skipRestApi
    ? (async () => {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timerId = controller ? setTimeout(() => controller.abort(), options?.writeTimeoutMs ?? 7000) : null;
        try {
          const res = await fetch('/api/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(serverPayload),
            signal: controller?.signal,
          });
          if (res.ok) {
            const json = await res.json().catch(() => null);
            if (json?.success) {
              serverOk = true;
              if (json.event && typeof json.event === 'object') {
                serverEvent = json.event as WeddingEvent;
              }
            }
          } else {
            lastError = `Server responded with HTTP ${res.status}`;
          }
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
          console.warn('REST API save event error:', e);
        } finally {
          if (timerId !== null) clearTimeout(timerId);
        }
      })()
    : Promise.resolve();

  const firestorePromise: Promise<void> = !IS_FIRESTORE_WRITE_DISABLED
    ? (async () => {
        const writeWork = async () => {
          try {
            const scopedOwner = targetDbId && targetDbId !== GUEST_PUBLIC_SCOPE ? targetDbId : undefined;
            const firestorePayload = await prepareFirestorePayload(serverPayload, scopedOwner);

            const writePromises: Promise<boolean>[] = [];

            if (scopedOwner) {
              if (!provisionedDbIds.has(scopedOwner)) {
                await ensureUserDatabaseInFirebase({
                  scopeId: scopedOwner,
                  email: serverPayload.ownerEmail,
                  skipRestApi: true,
                });
              }

              const scopedRef = doc(db, USER_DATABASES_COLLECTION, scopedOwner, 'events', safeEventId);
              const writeScoped = async () => {
                try {
                  await setDoc(scopedRef, firestorePayload);
                  return true;
                } catch (err: any) {
                  // Self-heal if user_databases root doc was missing or not yet provisioned in Firestore
                  const msg = String(err?.message || err?.code || '');
                  if (msg.includes('permission-denied') || msg.includes('Missing or insufficient permissions')) {
                    provisionedDbIds.delete(scopedOwner);
                    await ensureUserDatabaseInFirebase({
                      scopeId: scopedOwner,
                      email: serverPayload.ownerEmail,
                      forceSync: true,
                      skipRestApi: true,
                    });
                    await setDoc(scopedRef, firestorePayload);
                    return true;
                  }
                  throw err;
                }
              };
              writePromises.push(writeScoped());
            }

            if (!scopedOwner || !isGlobalSharedPresetId(safeEventId)) {
              const docRef = doc(db, 'events', safeEventId);
              writePromises.push(
                setDoc(docRef, firestorePayload)
                  .then(() => true)
                  .catch((err) => {
                    // Only treat top-level write failure as fatal when there is no scoped DB target
                    if (!scopedOwner) throw err;
                    console.warn('Firestore top-level mirror notice:', err);
                    return false;
                  })
              );
            }

            const results = await Promise.all(writePromises);
            firestoreOk = results.some(Boolean);
          } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
            console.warn('Firestore write event error (handled defensively):', error);
            handleFirestoreError(error, OperationType.WRITE, `events/${safeEventId}`);
          }
        };

        const timeoutMs = options?.writeTimeoutMs ?? 5500;
        await raceWithTimeout(writeWork(), timeoutMs, undefined);
      })()
    : Promise.resolve();

  await Promise.all([serverPromise, firestorePromise]);

  return {
    event: serverEvent || serverPayload,
    serverOk,
    firestoreOk,
    serverEvent,
    error: lastError,
  };
}

/**
 * Save wedding event config to both Server and Firestore with defensive size enforcement
 */
export async function saveEventToFirebase(
  event: WeddingEvent,
  options?: { skipRestApi?: boolean; writeTimeoutMs?: number }
) {
  const result = await saveEventReliable(event, options);
  return result.event;
}

/**
 * Delete wedding event / template from both server REST API and Firestore (top-level + personal email database)
 */
export async function deleteEventFromFirebase(eventId: string, ownerId?: string): Promise<void> {
  if (!eventId) return;
  const ownerQuery = ownerId ? `&ownerId=${encodeURIComponent(ownerId)}` : '';

  // 1. Delete from REST API
  try {
    await fetch(`/api/event?id=${encodeURIComponent(eventId)}${ownerQuery}`, {
      method: 'DELETE',
    });
  } catch (e) {
    console.warn('REST API delete event error:', e);
  }

  // 2. Delete from Firestore
  if (!IS_FIRESTORE_WRITE_DISABLED) {
    try {
      const targetDbId = resolveRecordDatabaseId({ ownerId, eventId });
      if (targetDbId && targetDbId !== GUEST_PUBLIC_SCOPE) {
        try {
          await deleteDoc(doc(db, USER_DATABASES_COLLECTION, targetDbId, 'events', eventId));
        } catch {
          // ignore
        }
      }
      const docRef = doc(db, 'events', eventId);
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `events/${eventId}`);
    }
  }
}

/**
 * Real-time listener for events (subscribes to both personal user_databases and top-level /events,
 * falls back to polling API)
 */
export function subscribeToEvent(
  eventId: string,
  callback: (event: WeddingEvent) => void,
  ownerId?: string
) {
  const targetId = eventId || 'cmgrawhnk0003le0434762j7n';
  const targetDbId = resolveRecordDatabaseId({ ownerId, eventId: targetId });

  const isOwnedByTarget = (incoming: WeddingEvent | null | undefined): incoming is WeddingEvent => {
    if (!incoming || typeof incoming !== 'object') return false;
    if (!targetDbId || targetDbId === GUEST_PUBLIC_SCOPE) {
      return !incoming.ownerId || incoming.ownerId === GUEST_PUBLIC_SCOPE || incoming.ownerId === extractScopeFromEventId(targetId);
    }
    return !incoming.ownerId || incoming.ownerId === targetDbId || incoming.ownerId === ownerId;
  };

  // If writes/reads are enabled, subscribe to Firestore real-time updates
  if (!IS_FIRESTORE_WRITE_DISABLED) {
    try {
      let latestMs = -1;
      const emitIfFresh = (incoming: WeddingEvent) => {
        if (!isOwnedByTarget(incoming)) return;
        const ms = getEventTimestampMs(incoming);
        if (latestMs < 0 || ms >= latestMs) {
          latestMs = ms;
          callback(incoming);
        }
      };

      const unsubs: Array<() => void> = [];

      if (targetDbId && targetDbId !== GUEST_PUBLIC_SCOPE) {
        const scopedRef = doc(db, USER_DATABASES_COLLECTION, targetDbId, 'events', targetId);
        unsubs.push(
          onSnapshot(
            scopedRef,
            (snap) => {
              if (snap.exists()) {
                emitIfFresh(snap.data() as WeddingEvent);
              }
            },
            () => {
              // fallback handled by top-level listener
            }
          )
        );
      }

      if (!targetDbId || targetDbId === GUEST_PUBLIC_SCOPE || !isGlobalSharedPresetId(targetId)) {
        const docRef = doc(db, 'events', targetId);
        unsubs.push(
          onSnapshot(
            docRef,
            (snap) => {
              if (snap.exists()) {
                emitIfFresh(snap.data() as WeddingEvent);
              }
            },
            (error) => {
              handleFirestoreError(error, OperationType.GET, `events/${targetId}`);
            }
          )
        );
      }

      return () => {
        unsubs.forEach((unsub) => {
          try {
            unsub();
          } catch {}
        });
      };
    } catch (e) {
      console.warn('Firestore subscription failed, falling back to REST polling:', e);
    }
  }

  // Fallback server REST polling (highly resilient)
  const intervalId = setInterval(async () => {
    try {
      const ownerParam = ownerId && ownerId !== GUEST_PUBLIC_SCOPE ? `&ownerId=${encodeURIComponent(ownerId)}` : '';
      const res = await fetch(`/api/event?id=${encodeURIComponent(targetId)}${ownerParam}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.event && json.source !== 'preset' && isOwnedByTarget(json.event)) {
          callback(json.event);
        }
      }
    } catch (e) {
      // ignore
    }
  }, 10000);

  return () => clearInterval(intervalId);
}

/**
 * Real-time listener for wishes/blessings scoped strictly to a specific eventId & ownerId
 */
export function subscribeToWishes(
  eventIdOrCallback: string | ((wishes: any[]) => void),
  maybeCallback?: (wishes: any[]) => void,
  ownerId?: string
) {
  const targetEventId =
    typeof eventIdOrCallback === 'string' && eventIdOrCallback
      ? eventIdOrCallback
      : DEFAULT_PRESET_EVENT_ID;
  const callback =
    typeof eventIdOrCallback === 'function'
      ? eventIdOrCallback
      : maybeCallback!;
  const targetDbId = resolveRecordDatabaseId({ ownerId, eventId: targetEventId });

  if (!IS_FIRESTORE_WRITE_DISABLED) {
    try {
      const filterAndSort = (rawList: any[]) => {
        const seen = new Map<string, any>();
        for (const data of rawList) {
          if (!data || typeof data !== 'object') continue;
          const matchesEvent =
            targetEventId === DEFAULT_PRESET_EVENT_ID
              ? !data.eventId || data.eventId === targetEventId
              : data.eventId === targetEventId;
          const matchesOwner =
            targetDbId && targetDbId !== GUEST_PUBLIC_SCOPE
              ? !data.ownerId || data.ownerId === targetDbId
              : !data.ownerId || data.ownerId === GUEST_PUBLIC_SCOPE;
          if (matchesEvent && matchesOwner && data.id) {
            seen.set(data.id, data);
          }
        }
        const merged = Array.from(seen.values());
        merged.sort((a, b) => new Date(b.createdAt || b.timestamp || 0).getTime() - new Date(a.createdAt || a.timestamp || 0).getTime());
        return merged;
      };

      let subWishes: any[] = [];
      let topWishes: any[] = [];
      const emitMerged = () => callback(filterAndSort([...topWishes, ...subWishes]));

      const unsubs: Array<() => void> = [];

      if (targetDbId && targetDbId !== GUEST_PUBLIC_SCOPE) {
        const scopedCol = collection(db, USER_DATABASES_COLLECTION, targetDbId, 'wishes');
        const scopedQuery =
          targetEventId === DEFAULT_PRESET_EVENT_ID
            ? scopedCol
            : query(scopedCol, where('eventId', '==', targetEventId));
        unsubs.push(
          onSnapshot(
            scopedQuery,
            (snap) => {
              subWishes = snap.docs.map((d) => ({ ...d.data(), id: d.data().id || d.id }));
              emitMerged();
            },
            () => {
              // ignore scoped subcollection listener errors
            }
          )
        );
      }

      const wishesCol = collection(db, 'wishes');
      const sourceQuery =
        targetEventId === DEFAULT_PRESET_EVENT_ID
          ? wishesCol
          : query(wishesCol, where('eventId', '==', targetEventId));

      unsubs.push(
        onSnapshot(
          sourceQuery,
          (snap) => {
            topWishes = snap.docs.map((d) => ({ ...d.data(), id: d.data().id || d.id }));
            emitMerged();
          },
          (error) => {
            handleFirestoreError(error, OperationType.GET, 'wishes');
          }
        )
      );

      return () => {
        unsubs.forEach((u) => {
          try {
            u();
          } catch {}
        });
      };
    } catch (e) {
      console.warn('Firestore subscription for wishes failed, falling back to REST polling:', e);
    }
  }

  // Fallback polling scoped by eventId & ownerId
  const pollWishes = async () => {
    try {
      const ownerParam = targetDbId && targetDbId !== GUEST_PUBLIC_SCOPE ? `&ownerId=${encodeURIComponent(targetDbId)}` : '';
      const res = await fetch(`/api/wishes?eventId=${encodeURIComponent(targetEventId)}${ownerParam}`);
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
 * Register or update system user in Firestore, REST API, and provision their dedicated personal database
 */
export async function registerSystemUserInFirebase(userRecord: { name: string; email: string; passcode: string; role?: string }) {
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

  // 3. Auto-provision dedicated per-email database
  await ensureUserDatabaseInFirebase({
    email: userRecord.email,
    name: userRecord.name,
    role: userRecord.role,
  });

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


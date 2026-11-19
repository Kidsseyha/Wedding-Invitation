export function shouldSkipImageRecompression(
  value: unknown,
  minBytesThreshold = 90_000
): boolean {
  if (typeof value !== 'string') return true;
  if (!value.startsWith('data:image/')) return true;
  return value.length < minBytesThreshold;
}

export function needsFirestoreCompaction(
  payloadByteLength: number,
  maxSafeBytes = 550_000
): boolean {
  return payloadByteLength >= maxSafeBytes;
}

export async function raceWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallbackValue: T
): Promise<{ timedOut: boolean; value: T }> {
  if (timeoutMs <= 0) {
    return { timedOut: true, value: fallbackValue };
  }

  let timerId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<{ timedOut: boolean; value: T }>((resolve) => {
    timerId = setTimeout(() => {
      resolve({ timedOut: true, value: fallbackValue });
    }, timeoutMs);
  });

  const wrappedPromise = promise.then((value) => ({
    timedOut: false,
    value,
  }));

  try {
    return await Promise.race([wrappedPromise, timeoutPromise]);
  } finally {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
  }
}

export function getEventTimestampMs(event: { updatedAt?: string } | null | undefined): number {
  if (!event || !event.updatedAt) return 0;
  const ms = Date.parse(event.updatedAt);
  return Number.isFinite(ms) ? ms : 0;
}

export function pickNewestDatabaseEvent<
  T extends { updatedAt?: string; image?: string; config?: Record<string, any> }
>(candidates: Array<T | null | undefined>): T | null {
  let best: T | null = null;
  let bestMs = -1;

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const ms = getEventTimestampMs(candidate);
    if (!best) {
      best = candidate;
      bestMs = ms;
      continue;
    }
    if (ms > bestMs) {
      best = candidate;
      bestMs = ms;
    } else if (ms === bestMs) {
      const bestSize = JSON.stringify(best).length;
      const candSize = JSON.stringify(candidate).length;
      if (candSize > bestSize) {
        best = candidate;
      }
    }
  }

  return best;
}

/**
 * Returns exact UTF-8 byte length of a string (accurate for multi-byte Khmer script).
 */
export function getUtf8ByteLength(value: string): number {
  if (!value) return 0;
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }
  return unescape(encodeURIComponent(value)).length;
}

/**
 * Recursively clones plain objects/arrays while removing any `undefined` properties
 * so Firestore `setDoc` never rejects unsupported values.
 */
export function stripUndefinedDeep<T>(input: T): T {
  if (input === null || typeof input !== 'object') {
    return input;
  }
  if (Array.isArray(input)) {
    return input
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(input as Record<string, any>)) {
    if (v === undefined) continue;
    out[k] = stripUndefinedDeep(v);
  }
  return out as T;
}

/**
 * Normalizes an event object so all fields checked by Firestore security rules
 * (`isValidWeddingEvent` & `isValidId`) always satisfy type and max-length constraints.
 */
export function enforceFirestoreEventBounds<T extends Record<string, any>>(
  rawEvent: T,
  forcedOwnerId?: string
): T {
  const cleaned = stripUndefinedDeep({ ...(rawEvent || {}) }) as Record<string, any>;

  const safeId =
    String(cleaned.id || 'cmgrawhnk0003le0434762j7n')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 128) || 'cmgrawhnk0003le0434762j7n';
  cleaned.id = safeId;

  const rawName = typeof cleaned.name === 'string' ? cleaned.name.trim() : '';
  cleaned.name = (rawName || 'អាពាហ៍ពិពាហ៍').slice(0, 300);

  const boundedOptionalStrings: Array<[string, number]> = [
    ['templateId', 128],
    ['eventType', 50],
    ['title', 300],
    ['slug', 128],
    ['groom', 200],
    ['bride', 200],
    ['groom_name', 200],
    ['bride_name', 200],
    ['ownerId', 128],
    ['ownerEmail', 256],
    ['updatedAt', 64],
  ];

  for (const [field, maxLen] of boundedOptionalStrings) {
    if (field in cleaned) {
      if (typeof cleaned[field] === 'string') {
        cleaned[field] = cleaned[field].slice(0, maxLen);
      } else {
        delete cleaned[field];
      }
    }
  }

  if (forcedOwnerId && forcedOwnerId !== 'guest_public') {
    cleaned.ownerId = forcedOwnerId.slice(0, 128);
  }

  if (!cleaned.updatedAt) {
    cleaned.updatedAt = new Date().toISOString().slice(0, 64);
  }

  return cleaned as T;
}


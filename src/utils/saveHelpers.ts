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


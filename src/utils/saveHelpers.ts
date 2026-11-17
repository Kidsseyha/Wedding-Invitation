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

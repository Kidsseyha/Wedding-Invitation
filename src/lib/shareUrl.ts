export const PUBLIC_APP_URL = 'https://ais-pre-oi572nxogafsw6nsowqaaj-935767504529.asia-southeast1.run.app';
export const VERCEL_APP_URL = 'https://invitationonline-six.vercel.app';

export interface ShareUrlOptions {
  customOrigin?: string;
  lang?: string;
}

/**
 * Generates the live working share URL for wedding guests.
 * Automatically converts internal dev URLs (ais-dev-) and localhost to publicly accessible preview URLs (ais-pre-)
 * or honors customOrigin (such as Vercel domain) and adds Khmer language support.
 */
export function getPublicShareUrl(
  guestName?: string,
  eventId?: string,
  eventType?: string,
  options?: ShareUrlOptions
): string {
  let origin = options?.customOrigin || PUBLIC_APP_URL;

  if (!options?.customOrigin && typeof window !== 'undefined') {
    const currentOrigin = window.location.origin;
    // If running on a public custom domain or live host (and not localhost or internal dev)
    if (
      currentOrigin &&
      !currentOrigin.includes('localhost') &&
      !currentOrigin.includes('127.0.0.1')
    ) {
      if (currentOrigin.includes('ais-dev-')) {
        origin = currentOrigin.replace('ais-dev-', 'ais-pre-');
      } else {
        origin = currentOrigin;
      }
    }
  }

  const url = new URL(origin + '/');

  // Append ID if customized or needed for the invitation type (ប្រភេទធៀប)
  if (eventId) {
    url.searchParams.set('id', eventId);
  }

  if (eventType && eventType.trim()) {
    url.searchParams.set('type', eventType.trim());
  }

  // Language parameter for 100% Khmer support across social networks and Vercel
  const targetLang = options?.lang || 'kh';
  if (targetLang) {
    url.searchParams.set('lang', targetLang);
  }

  url.searchParams.set('share', '1');

  if (guestName && guestName.trim() && guestName.trim() !== 'Your Name') {
    url.searchParams.set('name', guestName.trim());
  }

  return url.toString();
}

/**
 * In-memory cache for shortened URLs so repeated requests are instantaneous
 */
const shortUrlCache = new Map<string, string>();

/**
 * Returns the preferred Vercel origin (uses current .vercel.app origin if running on Vercel, otherwise VERCEL_APP_URL)
 */
export function getPreferredVercelOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin?.includes('.vercel.app')) {
    return window.location.origin;
  }
  return VERCEL_APP_URL;
}

/**
 * Converts a long URL to a short link (using in-app /s/:code) with Khmer language support
 */
export async function shortenUrl(longUrl: string, customOrigin?: string): Promise<string> {
  if (!longUrl) return '';

  const fallbackOrigin = (
    customOrigin ||
    (longUrl.includes('.vercel.app') ? new URL(longUrl).origin : PUBLIC_APP_URL)
  ).replace(/\/+$/, '');

  let cleanedUrl = longUrl;
  if (cleanedUrl.includes('localhost') || cleanedUrl.includes('127.0.0.1')) {
    cleanedUrl = cleanedUrl.replace(/http:\/\/localhost:\d+/, fallbackOrigin).replace(/https:\/\/localhost:\d+/, fallbackOrigin);
  }
  if (cleanedUrl.includes('ais-dev-')) {
    cleanedUrl = cleanedUrl.replace('ais-dev-', 'ais-pre-');
  }

  // Guarantee Khmer language & share=1 parameters are preserved in target URL
  let targetLang = 'kh';
  try {
    const parsed = new URL(cleanedUrl);
    if (!parsed.searchParams.get('lang')) {
      parsed.searchParams.set('lang', 'kh');
    }
    targetLang = parsed.searchParams.get('lang') || 'kh';
    if (!parsed.searchParams.get('share')) {
      parsed.searchParams.set('share', '1');
    }
    cleanedUrl = parsed.toString();
  } catch {
    // ignore URL parse error
  }

  const cacheKey = `${fallbackOrigin}::${cleanedUrl}`;
  if (shortUrlCache.has(cacheKey)) {
    return shortUrlCache.get(cacheKey)!;
  }

  // Try server-side shortener endpoint (/api/shorten on Express or Vercel)
  try {
    const res = await fetch('/api/shorten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: cleanedUrl, origin: fallbackOrigin, lang: targetLang }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.shortUrl) {
        let finalShortUrl = String(data.shortUrl);
        if (finalShortUrl.includes('localhost') || finalShortUrl.includes('127.0.0.1')) {
          finalShortUrl = finalShortUrl.replace(/http:\/\/localhost:\d+/, fallbackOrigin).replace(/https:\/\/localhost:\d+/, fallbackOrigin);
        }
        if (finalShortUrl.includes('ais-dev-')) {
          finalShortUrl = finalShortUrl.replace('ais-dev-', 'ais-pre-');
        }
        if (customOrigin) {
          try {
            const u = new URL(finalShortUrl);
            finalShortUrl = `${fallbackOrigin}${u.pathname}${u.search}`;
          } catch {}
        }
        shortUrlCache.set(cacheKey, finalShortUrl);
        return finalShortUrl;
      }
    }
  } catch (err) {
    console.warn('API shorten failed, trying Firestore direct short link:', err);
  }

  // Client-side Firestore fallback so Vercel short links still work even if /api/shorten is unreachable
  try {
    const { doc, setDoc } = await import('firebase/firestore');
    const { db } = await import('./firebase');
    const rand = Math.random().toString(36).substring(2, 7);
    const code = `kh-${rand}`;
    await setDoc(doc(db, 'short_links', code), {
      code,
      url: cleanedUrl,
      lang: targetLang,
      createdAt: new Date().toISOString(),
    });
    const firestoreShortUrl = `${fallbackOrigin}/s/${code}`;
    shortUrlCache.set(cacheKey, firestoreShortUrl);
    return firestoreShortUrl;
  } catch {
    // fallback to cleanedUrl if offline
  }

  return cleanedUrl;
}


import { GUEST_PUBLIC_SCOPE, extractScopeFromEventId } from './userScope.js';

export const PUBLIC_APP_URL = 'https://ais-pre-hjj7vuznhhxkva5mjjwpax-816970112678.asia-southeast1.run.app';
export const VERCEL_APP_URL = 'https://invitationonline-six.vercel.app';

export interface ShareUrlOptions {
  customOrigin?: string;
  lang?: string;
  ownerId?: string;
}

/**
 * Generates a deterministic, collision-resistant base36 hash for a full target URL
 * so distinct guests always receive distinct short codes and identical URLs share the same code.
 */
export function hashTargetUrlBase36(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193);
    h2 = Math.imul(h2 ^ ch, 0x85ebca6b);
  }
  const p1 = (h1 >>> 0).toString(36).padStart(7, '0').slice(-4);
  const p2 = (h2 >>> 0).toString(36).padStart(7, '0').slice(-4);
  return `${p1}${p2}`;
}

/**
 * Generates a clean short link code whose prefix reflects the guest slug (when ASCII) or event type,
 * paired with a deterministic 8-char hash derived from the full URL (including guest name).
 */
export function generateDeterministicShortCode(targetUrl: string): string {
  let prefix = 'kh';
  try {
    const parsed = new URL(targetUrl);
    const typeParam = (parsed.searchParams.get('type') || '').toLowerCase().trim();
    if (typeParam.startsWith('wedding')) prefix = 'wd';
    else if (typeParam.startsWith('engage')) prefix = 'eg';
    else if (typeParam.startsWith('house')) prefix = 'hw';
    else if (typeParam.startsWith('birth')) prefix = 'bd';
    else if (typeParam.startsWith('anniv')) prefix = 'an';

    const nameParam = parsed.searchParams.get('name') || '';
    const asciiSlug = nameParam
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 10);
    if (asciiSlug) prefix = asciiSlug;
  } catch {
    // fallback prefix
  }
  return `${prefix}-${hashTargetUrlBase36(targetUrl)}`;
}

/**
 * Extracts the invited guest name from a URL query string (?i=, ?guest=, ?name=, ?to=).
 */
export function extractGuestNameFromSearch(search: string): string {
  const params = new URLSearchParams(search || '');
  const raw =
    params.get('i') ||
    params.get('guest') ||
    params.get('name') ||
    params.get('to') ||
    '';
  const trimmed = raw.trim();
  return trimmed && trimmed !== 'Your Name' ? trimmed : '';
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

  // Include ownerId if provided and not already encoded inside scoped eventId
  const cleanOwnerId = options?.ownerId?.trim();
  if (
    cleanOwnerId &&
    cleanOwnerId !== GUEST_PUBLIC_SCOPE &&
    extractScopeFromEventId(eventId) !== cleanOwnerId
  ) {
    url.searchParams.set('ownerId', cleanOwnerId);
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
 * Returns 'vercel' only when currently running on a *.vercel.app host,
 * otherwise 'preview' so shared links resolve to the live working server.
 */
export function getDefaultShareDomain(): 'vercel' | 'preview' {
  if (typeof window !== 'undefined' && window.location?.origin?.includes('.vercel.app')) {
    return 'vercel';
  }
  return 'preview';
}

/**
 * Converts a long URL to a short link (using in-app /s/:code) with Khmer language support
 */
export async function shortenUrl(longUrl: string, customOrigin?: string): Promise<string> {
  if (!longUrl) return '';

  let inferredOrigin = PUBLIC_APP_URL;
  try {
    const parsedOrigin = new URL(longUrl).origin;
    if (
      parsedOrigin &&
      parsedOrigin.startsWith('http') &&
      !parsedOrigin.includes('localhost') &&
      !parsedOrigin.includes('127.0.0.1')
    ) {
      inferredOrigin = parsedOrigin.includes('ais-dev-')
        ? parsedOrigin.replace('ais-dev-', 'ais-pre-')
        : parsedOrigin;
    }
  } catch {
    // ignore invalid URL
  }

  if (!customOrigin && inferredOrigin === PUBLIC_APP_URL && typeof window !== 'undefined') {
    const winOrigin = window.location?.origin || '';
    if (winOrigin && !winOrigin.includes('localhost') && !winOrigin.includes('127.0.0.1')) {
      inferredOrigin = winOrigin.includes('ais-dev-')
        ? winOrigin.replace('ais-dev-', 'ais-pre-')
        : winOrigin;
    }
  }

  const fallbackOrigin = (customOrigin || inferredOrigin).replace(/\/+$/, '');

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
    const code = generateDeterministicShortCode(cleanedUrl);
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

/**
 * Determines whether the current URL represents a shared invitation being opened by a viewer.
 * Returns true when share/guest params are present, on /s/:code short routes, or when an
 * unauthenticated viewer opens an event-specific URL (?id=..., ?type=..., ?ownerId=...).
 */
export function isSharedInvitationSearch(
  search: string,
  options?: { isAdmin?: boolean; pathname?: string }
): boolean {
  const params = new URLSearchParams(search || '');
  const hasExplicitShareParam = Boolean(
    params.get('name') ||
    params.get('i') ||
    params.get('guest') ||
    params.get('to') ||
    params.get('share')
  );
  if (hasExplicitShareParam) return true;
  if (options?.pathname && options.pathname.startsWith('/s/')) return true;
  if (!options?.isAdmin) {
    return Boolean(
      params.get('id') ||
      params.get('type') ||
      params.get('category') ||
      params.get('ownerId')
    );
  }
  return false;
}

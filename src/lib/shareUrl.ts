import { GUEST_PUBLIC_SCOPE, extractScopeFromEventId } from './userScope.js';

export const PUBLIC_APP_URL = 'https://ais-pre-hjj7vuznhhxkva5mjjwpax-816970112678.asia-southeast1.run.app';
export const VERCEL_APP_URL = 'https://wedding-invitation-inky-kappa.vercel.app';

export interface KhmerShareFontOption {
  slug: string;
  labelKh: string;
  labelEn: string;
  fontFamily: string;
  sampleKh: string;
}

/**
 * Web-safe Khmer fonts backed by Google Fonts + Khmer OS local fallbacks.
 * Every font listed here is preloaded in index.html, src/index.css, and api/og.ts
 * so viewers opening a Vercel share link on iOS, Android, Windows, or macOS
 * always render authentic Khmer typography without missing glyphs.
 */
export const KHMER_SHARE_FONTS: KhmerShareFontOption[] = [
  {
    slug: 'moul',
    labelKh: 'អក្សរមូល (Moul)',
    labelEn: 'Khmer Moul (Royal)',
    fontFamily: "'Moul', 'Moulpali', 'Khmer OS Moul', 'Khmer OS Muol Light', serif",
    sampleKh: 'ភ្ញៀវកិត្តិយស',
  },
  {
    slug: 'moulpali',
    labelKh: 'មូលបាលី (Moulpali)',
    labelEn: 'Khmer Moulpali',
    fontFamily: "'Moulpali', 'Moul', 'Khmer OS Muol Light', serif",
    sampleKh: 'ភ្ញៀវកិត្តិយស',
  },
  {
    slug: 'kbach',
    labelKh: 'ក្បាច់បុរាណ (Kbach / Moul)',
    labelEn: 'Khmer Royal Kbach',
    fontFamily: "'Moul', 'Moulpali', 'AKbalthom Kbach', serif",
    sampleKh: 'ភ្ញៀវកិត្តិយស',
  },
  {
    slug: 'bokor',
    labelKh: 'បូកគោ (Bokor)',
    labelEn: 'Khmer Bokor',
    fontFamily: "'Bokor', 'Khmer OS Bokor', serif",
    sampleKh: 'ភ្ញៀវកិត្តិយស',
  },
  {
    slug: 'angkor',
    labelKh: 'អង្គរ (Angkor)',
    labelEn: 'Khmer Angkor',
    fontFamily: "'Angkor', 'Moul', serif",
    sampleKh: 'ភ្ញៀវកិត្តិយស',
  },
  {
    slug: 'kantumruy',
    labelKh: 'កន្ទុមរុយ (Kantumruy Pro)',
    labelEn: 'Kantumruy Pro',
    fontFamily: "'Kantumruy Pro', 'Noto Sans Khmer', sans-serif",
    sampleKh: 'ភ្ញៀវកិត្តិយស',
  },
  {
    slug: 'battambang',
    labelKh: 'បាត់ដំបង (Battambang)',
    labelEn: 'Khmer Battambang',
    fontFamily: "'Battambang', 'Khmer OS Battambang', serif",
    sampleKh: 'ភ្ញៀវកិត្តិយស',
  },
  {
    slug: 'siemreap',
    labelKh: 'សៀមរាប (Siemreap)',
    labelEn: 'Khmer Siemreap',
    fontFamily: "'Siemreap', 'Khmer OS Siemreap', sans-serif",
    sampleKh: 'ភ្ញៀវកិត្តិយស',
  },
  {
    slug: 'freehand',
    labelKh: 'សរសេរដៃ (Freehand)',
    labelEn: 'Khmer Freehand',
    fontFamily: "'Freehand', 'Khmer OS Freehand', cursive",
    sampleKh: 'ភ្ញៀវកិត្តិយស',
  },
  {
    slug: 'fasthand',
    labelKh: 'សរសេរដៃរហ័ស (Fasthand)',
    labelEn: 'Khmer Fasthand',
    fontFamily: "'Fasthand', 'Khmer OS Fasthand', cursive",
    sampleKh: 'ភ្ញៀវកិត្តិយស',
  },
  {
    slug: 'taprom',
    labelKh: 'តាព្រហ្ម (Taprom)',
    labelEn: 'Khmer Taprom',
    fontFamily: "'Taprom', 'Freehand', cursive",
    sampleKh: 'ភ្ញៀវកិត្តិយស',
  },
  {
    slug: 'dangrek',
    labelKh: 'ដងរែក (Dangrek)',
    labelEn: 'Khmer Dangrek',
    fontFamily: "'Dangrek', 'Kantumruy Pro', sans-serif",
    sampleKh: 'ភ្ញៀវកិត្តិយស',
  },
  {
    slug: 'noto-serif',
    labelKh: 'ណូតូ សេរីហ្វ (Noto Serif)',
    labelEn: 'Noto Serif Khmer',
    fontFamily: "'Noto Serif Khmer', 'Battambang', serif",
    sampleKh: 'ភ្ញៀវកិត្តិយស',
  },
  {
    slug: 'noto-sans',
    labelKh: 'ណូតូ សាន់ (Noto Sans)',
    labelEn: 'Noto Sans Khmer',
    fontFamily: "'Noto Sans Khmer', 'Kantumruy Pro', sans-serif",
    sampleKh: 'ភ្ញៀវកិត្តិយស',
  },
  {
    slug: 'konkhmer',
    labelKh: 'កូនខ្មែរស្លឹកឈើ (Sleokchher)',
    labelEn: 'Konkhmer Sleokchher',
    fontFamily: "'Konkhmer Sleokchher', 'Moul', cursive",
    sampleKh: 'ភ្ញៀវកិត្តិយស',
  },
  {
    slug: 'content',
    labelKh: 'ខន់ថេន (Content)',
    labelEn: 'Khmer Content',
    fontFamily: "'Content', 'Khmer OS Content', sans-serif",
    sampleKh: 'ភ្ញៀវកិត្តិយស',
  },
];

/**
 * Resolves any CSS font-family string or font slug into a canonical short slug
 * for embedding in Vercel share URLs (`?font=<slug>`).
 */
export function resolveKhmerFontSlug(fontFamilyOrSlug?: string | null): string {
  if (!fontFamilyOrSlug || typeof fontFamilyOrSlug !== 'string') return 'moul';
  const raw = fontFamilyOrSlug.trim().toLowerCase();
  if (!raw) return 'moul';

  const exactBySlug = KHMER_SHARE_FONTS.find((f) => f.slug === raw);
  if (exactBySlug) return exactBySlug.slug;

  if (raw.includes('moulpali')) return 'moulpali';
  if (raw.includes('akbalthom') || raw.includes('kbach')) return 'kbach';
  if (raw.includes('bokor')) return 'bokor';
  if (raw.includes('angkor')) return 'angkor';
  if (raw.includes('kantumruy')) return 'kantumruy';
  if (raw.includes('battambang')) return 'battambang';
  if (raw.includes('siemreap')) return 'siemreap';
  if (raw.includes('freehand')) return 'freehand';
  if (raw.includes('fasthand')) return 'fasthand';
  if (raw.includes('taprom')) return 'taprom';
  if (raw.includes('dangrek')) return 'dangrek';
  if (raw.includes('noto serif')) return 'noto-serif';
  if (raw.includes('noto sans')) return 'noto-sans';
  if (raw.includes('konkhmer') || raw.includes('sleokchher')) return 'konkhmer';
  if (raw.includes('content')) return 'content';
  if (raw.includes('moul') || raw.includes('muol')) return 'moul';

  return 'moul';
}

/**
 * Resolves a font slug or partial font-family string into a web-safe CSS font-family stack
 * backed by Google Fonts so it renders on Vercel across all viewer devices.
 */
export function resolveKhmerFontFamily(fontFamilyOrSlug?: string | null): string | null {
  if (!fontFamilyOrSlug || typeof fontFamilyOrSlug !== 'string') return null;
  const trimmed = fontFamilyOrSlug.trim();
  if (!trimmed) return null;

  const slug = resolveKhmerFontSlug(trimmed);
  const matched = KHMER_SHARE_FONTS.find((f) => f.slug === slug);
  if (matched) {
    const lower = trimmed.toLowerCase();
    const isKnownKhmerOrSlug =
      KHMER_SHARE_FONTS.some((f) => f.slug === lower) ||
      /(moul|muol|moulpali|kbach|akbalthom|bokor|angkor|kantumruy|battambang|siemreap|freehand|fasthand|taprom|dangrek|noto|konkhmer|sleokchher|content|khmer)/i.test(
        trimmed
      );
    if (isKnownKhmerOrSlug) {
      return matched.fontFamily;
    }
  }
  return trimmed;
}

/**
 * Extracts the shared Khmer font family from URL search parameters (`?font=...` or `?khFont=...`).
 */
export function extractKhmerFontFromSearch(search?: string | null): string | null {
  if (!search || typeof search !== 'string') return null;
  const normalized = search.startsWith('?') ? search.slice(1) : search;
  if (!normalized) return null;

  try {
    const params = new URLSearchParams(normalized);
    const rawFont = (params.get('font') || params.get('khFont') || params.get('gf') || '').trim();
    if (!rawFont) return null;
    return resolveKhmerFontFamily(rawFont);
  } catch {
    return null;
  }
}

export interface ShareUrlOptions {
  customOrigin?: string;
  lang?: string;
  ownerId?: string;
  /** Optional Khmer font slug or CSS font-family for viewer guest name & Khmer typography on Vercel */
  khFont?: string | null;
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
 * Safely decodes Khmer/UTF-8 query parameter values (handles %XX, + spaces, and raw Unicode).
 */
export function decodeKhmerQueryValue(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const withSpaces = raw.replace(/\+/g, ' ');
  try {
    return withSpaces.includes('%') ? decodeURIComponent(withSpaces).trim() : withSpaces.trim();
  } catch {
    return withSpaces.trim();
  }
}

/**
 * Resolves invitation language from URL search params (?lang=kh|km|en, ?l=...) and path (/kh).
 * Defaults to Khmer ('kh') when sharing on Vercel or unspecified.
 */
export function detectLanguageFromUrl(search?: string | null, pathname?: string | null): 'kh' | 'en' {
  const params = new URLSearchParams(search || '');
  const rawLang = (params.get('lang') || params.get('l') || '').toLowerCase().trim();
  if (rawLang === 'en') return 'en';
  if (rawLang === 'kh' || rawLang === 'km') return 'kh';
  const cleanPath = (pathname || '').toLowerCase().trim();
  if (cleanPath === '/en' || cleanPath.startsWith('/en/')) return 'en';
  return 'kh';
}

/**
 * Normalizes URL query spaces from '+' to '%20' so Khmer guest names never show '+' in chat apps.
 */
export function normalizeShareUrlEncoding(urlStr: string): string {
  if (!urlStr) return '';
  const hashIdx = urlStr.indexOf('#');
  const baseAndQuery = hashIdx >= 0 ? urlStr.slice(0, hashIdx) : urlStr;
  const hashPart = hashIdx >= 0 ? urlStr.slice(hashIdx) : '';
  const queryIdx = baseAndQuery.indexOf('?');
  if (queryIdx < 0) return urlStr;
  const basePart = baseAndQuery.slice(0, queryIdx);
  const queryPart = baseAndQuery.slice(queryIdx + 1).replace(/\+/g, '%20');
  return `${basePart}?${queryPart}${hashPart}`;
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
  const trimmed = decodeKhmerQueryValue(raw);
  return trimmed && trimmed !== 'Your Name' ? trimmed : '';
}

/**
 * Generates the live working share URL for wedding guests.
 * Automatically converts internal dev URLs (ais-dev-) and localhost to publicly accessible URLs
 * or honors customOrigin (such as Vercel domain) and guarantees Khmer language (?lang=kh) and Khmer font (?font=...) support.
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
  const rawLang = (options?.lang || 'kh').toLowerCase().trim();
  const targetLang = rawLang === 'en' ? 'en' : 'kh';
  url.searchParams.set('lang', targetLang);

  // Khmer font parameter so Vercel viewers render the exact chosen Khmer font on any device
  if (options?.khFont && options.khFont.trim()) {
    const fontSlug = resolveKhmerFontSlug(options.khFont);
    url.searchParams.set('font', fontSlug);
  }

  url.searchParams.set('share', '1');

  if (guestName && guestName.trim() && guestName.trim() !== 'Your Name') {
    url.searchParams.set('name', guestName.trim());
  }

  return normalizeShareUrlEncoding(url.toString());
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
 * Defaults to 'vercel' so shared invitation links use the live Vercel domain with full Khmer language support.
 */
export function getDefaultShareDomain(): 'vercel' | 'preview' {
  return 'vercel';
}

/**
 * Converts a long URL to a short link (using in-app /s/:code) with Khmer language support.
 * Only returns a /s/:code URL when short-link persistence succeeds; otherwise falls back to the
 * self-contained full personalized URL so viewers never open a dead/unresolved short link.
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
    const rawLang = (parsed.searchParams.get('lang') || parsed.searchParams.get('l') || '').toLowerCase().trim();
    targetLang = rawLang === 'en' ? 'en' : 'kh';
    parsed.searchParams.set('lang', targetLang);
    if (!parsed.searchParams.get('share')) {
      parsed.searchParams.set('share', '1');
    }
    cleanedUrl = normalizeShareUrlEncoding(parsed.toString());
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
      if (data?.success !== false && data?.persisted !== false && data?.shortUrl) {
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

  // Client-side Firestore fallback with strict timeout so missing/offline DB never hangs or returns a dead /s/ link
  const isQuotaBlocked =
    typeof window !== 'undefined' &&
    typeof localStorage !== 'undefined' &&
    localStorage.getItem('firestore_quota_exceeded') === 'true';

  if (!isQuotaBlocked) {
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      const { db, IS_FIRESTORE_WRITE_DISABLED } = await import('./firebase');
      if (!IS_FIRESTORE_WRITE_DISABLED) {
        const code = generateDeterministicShortCode(cleanedUrl);
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          setDoc(doc(db, 'short_links', code), {
            code,
            url: cleanedUrl,
            lang: targetLang,
            createdAt: new Date().toISOString(),
          }),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Short link Firestore write timed out')), 2500);
          }),
        ]).finally(() => {
          if (timeoutId !== undefined) clearTimeout(timeoutId);
        });
        const firestoreShortUrl = `${fallbackOrigin}/s/${code}`;
        shortUrlCache.set(cacheKey, firestoreShortUrl);
        return firestoreShortUrl;
      }
    } catch {
      // fallback to self-contained cleanedUrl when Firestore is unreachable/not provisioned
    }
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

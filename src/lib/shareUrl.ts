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
    fontFamily: "'Moul', 'Khmer OS Moul', 'Khmer OS Muol Light', 'Noto Serif Khmer', serif",
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
    fontFamily: "'AKbalthom Kbach', 'AKbalthom-Kbach', 'Moul', 'Moulpali', serif",
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

function matchSingleFontTokenToSlug(token: string): string | null {
  const clean = token.replace(/['"]/g, '').trim().toLowerCase();
  if (!clean) return null;

  const exactBySlug = KHMER_SHARE_FONTS.find((f) => f.slug === clean);
  if (exactBySlug) return exactBySlug.slug;

  if (clean.includes('moulpali')) return 'moulpali';
  if (clean.includes('akbalthom') || clean.includes('kbach')) return 'kbach';
  if (clean.includes('konkhmer') || clean.includes('sleokchher')) return 'konkhmer';
  if (clean.includes('noto serif')) return 'noto-serif';
  if (clean.includes('noto sans')) return 'noto-sans';
  if (clean.includes('taprom')) return 'taprom';
  if (clean.includes('dangrek')) return 'dangrek';
  if (clean.includes('fasthand')) return 'fasthand';
  if (clean.includes('freehand')) return 'freehand';
  if (clean.includes('siemreap')) return 'siemreap';
  if (clean.includes('battambang')) return 'battambang';
  if (clean.includes('kantumruy')) return 'kantumruy';
  if (clean.includes('angkor')) return 'angkor';
  if (clean.includes('bokor')) return 'bokor';
  if (clean.includes('content')) return 'content';
  if (clean.includes('moul') || clean.includes('muol')) return 'moul';
  return null;
}

/**
 * Resolves any CSS font-family string or font slug into a canonical short slug
 * for embedding in Vercel share URLs (`?font=<slug>`).
 */
export function resolveKhmerFontSlug(fontFamilyOrSlug?: string | null): string {
  if (!fontFamilyOrSlug || typeof fontFamilyOrSlug !== 'string') return 'moul';
  const raw = fontFamilyOrSlug.trim().toLowerCase();
  if (!raw) return 'moul';

  const exactBySlugOrFamily = KHMER_SHARE_FONTS.find(
    (f) => f.slug === raw || f.fontFamily.toLowerCase() === raw
  );
  if (exactBySlugOrFamily) return exactBySlugOrFamily.slug;

  // Match the primary (first) font in the CSS font-family list first so fallback fonts never hijack resolution
  const tokens = raw.split(',');
  for (const token of tokens) {
    const matchedSlug = matchSingleFontTokenToSlug(token);
    if (matchedSlug) return matchedSlug;
  }

  return matchSingleFontTokenToSlug(raw) || 'moul';
}

/**
 * Resolves a font slug or partial font-family string into a web-safe CSS font-family stack
 * backed by Google Fonts so it renders on Vercel across all viewer devices.
 */
export function resolveKhmerFontFamily(fontFamilyOrSlug?: string | null): string | null {
  if (!fontFamilyOrSlug || typeof fontFamilyOrSlug !== 'string') return null;
  const trimmed = fontFamilyOrSlug.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  const directMatch = KHMER_SHARE_FONTS.find(
    (f) => f.slug === lower || f.fontFamily.toLowerCase() === lower
  );
  if (directMatch) return directMatch.fontFamily;

  const primaryToken = lower.split(',')[0] || lower;
  const primarySlug = matchSingleFontTokenToSlug(primaryToken);
  if (primarySlug) {
    const matched = KHMER_SHARE_FONTS.find((f) => f.slug === primarySlug);
    if (matched) return matched.fontFamily;
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
    const typeParam = (parsed.searchParams.get('type') || parsed.searchParams.get('id') || '').toLowerCase().trim();
    if (typeParam.includes('wedding') || typeParam.includes('cmgrawhnk')) prefix = 'wd';
    else if (typeParam.includes('engage')) prefix = 'eg';
    else if (typeParam.includes('house')) prefix = 'hw';
    else if (typeParam.includes('birth')) prefix = 'bd';
    else if (typeParam.includes('anniv')) prefix = 'an';

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
 * Safely decodes Khmer/UTF-8 query parameter values (handles raw Unicode, + spaces,
 * single-encoded %E1%9E..., and double/triple-encoded %25E1%259E... from chat apps).
 */
export function decodeKhmerQueryValue(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  let current = raw.replace(/\+/g, ' ');
  for (let pass = 0; pass < 3; pass++) {
    if (!/%[0-9A-Fa-f]{2}/.test(current)) break;
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current.replace(/\s+/g, ' ').trim();
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
 * Restores percent-encoded UTF-8 Khmer characters (U+1780-U+17FF, U+19E0-U+19FF, U+200B-U+200D)
 * inside a URL query value into readable Khmer script while keeping spaces as %20 and all
 * URL-reserved ASCII characters (&, =, ?, #, +, %, quotes, etc.) safely percent-encoded.
 */
function restoreReadableKhmerPercentEncoding(encodedQuery: string): string {
  // Khmer UTF-8 3-byte sequences:
  //   U+1780..U+17FF => %E1%9E%80 .. %E1%9F%BF
  //   U+19E0..U+19FF => %E1%A7%A0 .. %E1%A7%BF
  //   U+200B..U+200D => %E2%80%8B .. %E2%80%8D (zero-width space/joiner used in Khmer typography)
  return encodedQuery.replace(
    /(?:%E1%(?:9E|9F)%[89AB][0-9A-F]|%E1%A7%[AB][0-9A-F]|%E2%80%8[BCD])+/gi,
    (seq) => {
      try {
        return decodeURIComponent(seq);
      } catch {
        return seq;
      }
    }
  );
}

/**
 * Normalizes URL query encoding so Khmer guest names display in clean, readable Khmer script
 * with '+' word separators (zero '%20' and zero unreadable '%E1%9E%9B...' gibberish) while
 * remaining 100% valid across browsers, Vercel, Telegram, Messenger, WhatsApp, and QR scanners.
 */
export function normalizeShareUrlEncoding(urlStr: string): string {
  if (!urlStr) return '';
  const hashIdx = urlStr.indexOf('#');
  const baseAndQuery = hashIdx >= 0 ? urlStr.slice(0, hashIdx) : urlStr;
  const hashPart = hashIdx >= 0 ? urlStr.slice(hashIdx) : '';
  const queryIdx = baseAndQuery.indexOf('?');
  if (queryIdx < 0) return urlStr;
  const basePart = baseAndQuery.slice(0, queryIdx);
  const queryPart = restoreReadableKhmerPercentEncoding(
    baseAndQuery.slice(queryIdx + 1).replace(/%20/gi, '+')
  );
  return `${basePart}?${queryPart}${hashPart}`;
}

/**
 * Checks whether an eventId already uniquely implies its invitation category
 * so redundant `&type=...` clutter can be omitted from public share links.
 */
function doesEventIdImplyType(eventId?: string, eventType?: string): boolean {
  if (!eventId || !eventType) return false;
  const cleanId = eventId.includes('__') ? eventId.split('__').slice(1).join('__') : eventId;
  const lowerId = cleanId.toLowerCase().trim();
  const lowerType = eventType.toLowerCase().trim();
  if (!lowerId || !lowerType) return false;
  if (lowerType === 'wedding') {
    return lowerId === 'cmgrawhnk0003le0434762j7n' || lowerId.includes('wedding');
  }
  if (lowerType === 'engagement') return lowerId.includes('engagement');
  if (lowerType === 'housewarming') return lowerId.includes('housewarming');
  if (lowerType === 'birthday') return lowerId.includes('birthday');
  if (lowerType === 'anniversary') return lowerId.includes('anniversary');
  return false;
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
 * or honors customOrigin (such as Vercel domain) and guarantees Khmer language (?lang=kh),
 * Khmer font (?font=...), and readable Khmer guest name support.
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

  // 1. Put the Khmer guest name FIRST so viewers immediately see their name in Khmer right after the domain
  const decodedGuest = decodeKhmerQueryValue(guestName);
  const hasGuestName = Boolean(decodedGuest && decodedGuest !== 'Your Name');
  if (hasGuestName) {
    url.searchParams.set('name', decodedGuest);
  }

  // 2. Append event ID so the exact invitation template & owner edits load
  if (eventId) {
    url.searchParams.set('id', eventId);
  }

  // 3. Only append type when the eventId does not already uniquely identify the category
  const cleanType = eventType?.trim() || '';
  if (cleanType && !doesEventIdImplyType(eventId, cleanType)) {
    url.searchParams.set('type', cleanType);
  }

  // 4. Include ownerId only when provided and not already encoded inside scoped eventId
  const cleanOwnerId = options?.ownerId?.trim();
  if (
    cleanOwnerId &&
    cleanOwnerId !== GUEST_PUBLIC_SCOPE &&
    extractScopeFromEventId(eventId) !== cleanOwnerId
  ) {
    url.searchParams.set('ownerId', cleanOwnerId);
  }

  // 5. Khmer ('kh') is the default everywhere on Vercel & SPA, so only append lang=en when English is selected
  const rawLang = (options?.lang || 'kh').toLowerCase().trim();
  if (rawLang === 'en') {
    url.searchParams.set('lang', 'en');
  }

  // 6. Moul is the default royal Khmer font; only append font=<slug> when a custom Khmer font is chosen
  if (options?.khFont && options.khFont.trim()) {
    const fontSlug = resolveKhmerFontSlug(options.khFont);
    if (fontSlug && fontSlug !== 'moul') {
      url.searchParams.set('font', fontSlug);
    }
  }

  // 7. Presence of ?name= already activates viewer share mode; only add share=1 when no guest name is present
  if (!hasGuestName) {
    url.searchParams.set('share', '1');
  }

  return normalizeShareUrlEncoding(url.toString());
}

const SHORT_URL_CACHE_STORAGE_KEY = 'wedding_short_url_cache_v3';

/**
 * In-memory cache for shortened URLs (hydrated from localStorage) so repeated requests are 0ms instantaneous
 */
const shortUrlCache = new Map<string, string>();
const inFlightShortenRequests = new Map<string, Promise<string>>();

function hydrateShortUrlCache(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    try {
      localStorage.removeItem('wedding_short_url_cache_v2');
    } catch {
      // ignore
    }
    const raw = localStorage.getItem(SHORT_URL_CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof k === 'string' && typeof v === 'string' && v) {
          shortUrlCache.set(k, v);
        }
      }
    }
  } catch {
    // ignore storage errors
  }
}

hydrateShortUrlCache();

function persistShortUrlToCache(cacheKey: string, shortUrl: string): void {
  shortUrlCache.set(cacheKey, shortUrl);
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const entries = Array.from(shortUrlCache.entries()).slice(-300);
    const serialized: Record<string, string> = {};
    for (const [k, v] of entries) {
      serialized[k] = v;
    }
    localStorage.setItem(SHORT_URL_CACHE_STORAGE_KEY, JSON.stringify(serialized));
  } catch {
    // ignore quota errors
  }
}

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

function prepareShortenTarget(longUrl: string, customOrigin?: string): {
  fallbackOrigin: string;
  cleanedUrl: string;
  targetLang: 'kh' | 'en';
  cacheKey: string;
  code: string;
} {
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
    cleanedUrl = cleanedUrl
      .replace(/http:\/\/localhost:\d+/, fallbackOrigin)
      .replace(/https:\/\/localhost:\d+/, fallbackOrigin);
  }
  if (cleanedUrl.includes('ais-dev-')) {
    cleanedUrl = cleanedUrl.replace('ais-dev-', 'ais-pre-');
  }

  let targetLang: 'kh' | 'en' = 'kh';
  try {
    const parsed = new URL(cleanedUrl);
    const rawLang = (parsed.searchParams.get('lang') || parsed.searchParams.get('l') || '').toLowerCase().trim();
    targetLang = rawLang === 'en' ? 'en' : 'kh';
    if (targetLang === 'en') {
      parsed.searchParams.set('lang', 'en');
    } else {
      parsed.searchParams.delete('lang');
      parsed.searchParams.delete('l');
    }
    const hasGuest = Boolean(
      parsed.searchParams.get('name') ||
      parsed.searchParams.get('i') ||
      parsed.searchParams.get('guest') ||
      parsed.searchParams.get('to')
    );
    if (!hasGuest && !parsed.searchParams.get('share')) {
      parsed.searchParams.set('share', '1');
    }
    cleanedUrl = normalizeShareUrlEncoding(parsed.toString());
  } catch {
    // ignore URL parse error
  }

  const cacheKey = `${fallbackOrigin}::${cleanedUrl}`;
  const code = generateDeterministicShortCode(cleanedUrl);
  return { fallbackOrigin, cleanedUrl, targetLang, cacheKey, code };
}

/**
 * Synchronously returns a previously shortened and cached `/s/:code` URL in 0ms, or empty string if not cached yet.
 */
export function getCachedShortUrl(longUrl: string, customOrigin?: string): string {
  if (!longUrl) return '';
  const { cacheKey } = prepareShortenTarget(longUrl, customOrigin);
  return shortUrlCache.get(cacheKey) || '';
}

/**
 * Synchronously returns a confirmed persisted `/s/:code` URL if already cached,
 * or the self-contained working full share URL immediately while triggering
 * background persistence to `/api/shorten` and Firestore `short_links/{code}`.
 */
export function getInstantShareUrl(longUrl: string, customOrigin?: string): string {
  if (!longUrl) return '';
  const { cleanedUrl, cacheKey } = prepareShortenTarget(longUrl, customOrigin);
  const existing = shortUrlCache.get(cacheKey);
  if (existing) return existing;

  // Kick off background persistence immediately without handing out an unpersisted /s/:code
  void shortenUrl(longUrl, customOrigin);
  return cleanedUrl;
}

/**
 * Converts a long URL to a short link (using in-app /s/:code) with Khmer language support.
 * Runs server-side `/api/shorten` and client-side Firestore `short_links` write in parallel
 * so persistence completes in ~80-150ms.
 */
export async function shortenUrl(longUrl: string, customOrigin?: string): Promise<string> {
  if (!longUrl) return '';

  const { fallbackOrigin, cleanedUrl, targetLang, cacheKey, code } = prepareShortenTarget(longUrl, customOrigin);

  if (shortUrlCache.has(cacheKey)) {
    return shortUrlCache.get(cacheKey)!;
  }

  if (inFlightShortenRequests.has(cacheKey)) {
    return inFlightShortenRequests.get(cacheKey)!;
  }

  const shortenPromise = (async (): Promise<string> => {
    const tryServerApi = async (): Promise<string> => {
      const controller = new AbortController();
      const timerId = setTimeout(() => controller.abort(), 1800);
      try {
        const res = await fetch('/api/shorten', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: cleanedUrl, origin: fallbackOrigin, lang: targetLang }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data?.success !== false && data?.persisted !== false && data?.shortUrl) {
          let finalShortUrl = String(data.shortUrl);
          if (finalShortUrl.includes('localhost') || finalShortUrl.includes('127.0.0.1')) {
            finalShortUrl = finalShortUrl
              .replace(/http:\/\/localhost:\d+/, fallbackOrigin)
              .replace(/https:\/\/localhost:\d+/, fallbackOrigin);
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
          return finalShortUrl;
        }
        throw new Error('Server shorten unpersisted');
      } finally {
        clearTimeout(timerId);
      }
    };

    const tryClientFirestore = async (): Promise<string> => {
      const isQuotaBlocked =
        typeof window !== 'undefined' &&
        typeof localStorage !== 'undefined' &&
        localStorage.getItem('firestore_quota_exceeded') === 'true';
      if (isQuotaBlocked) throw new Error('Firestore quota blocked');

      const { doc, setDoc } = await import('firebase/firestore');
      const { db, IS_FIRESTORE_WRITE_DISABLED, isFirestoreKnownUnavailable } = await import('./firebase');
      if (IS_FIRESTORE_WRITE_DISABLED || isFirestoreKnownUnavailable()) {
        throw new Error('Firestore write disabled or unavailable');
      }

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        setDoc(doc(db, 'short_links', code), {
          code,
          url: cleanedUrl,
          lang: targetLang,
          createdAt: new Date().toISOString(),
        }),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Short link Firestore write timed out')), 1800);
        }),
      ]).finally(() => {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
      });

      return `${fallbackOrigin}/s/${code}`;
    };

    try {
      const resolvedShortUrl = await Promise.any([tryServerApi(), tryClientFirestore()]);
      persistShortUrlToCache(cacheKey, resolvedShortUrl);
      return resolvedShortUrl;
    } catch {
      return cleanedUrl;
    } finally {
      inFlightShortenRequests.delete(cacheKey);
    }
  })();

  inFlightShortenRequests.set(cacheKey, shortenPromise);
  return shortenPromise;
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

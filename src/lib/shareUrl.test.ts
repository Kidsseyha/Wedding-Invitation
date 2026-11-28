import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPublicShareUrl,
  isSharedInvitationSearch,
  generateDeterministicShortCode,
  extractGuestNameFromSearch,
  extractKhmerFontFromSearch,
  resolveKhmerFontSlug,
  resolveKhmerFontFamily,
  KHMER_SHARE_FONTS,
  decodeKhmerQueryValue,
  detectLanguageFromUrl,
  getInstantShareUrl,
  shortenUrl,
  getDefaultShareDomain,
  VERCEL_APP_URL,
  PUBLIC_APP_URL,
} from './shareUrl';

test('getPublicShareUrl puts Khmer guest name first and omits redundant default params', () => {
  const urlStr = getPublicShareUrl('សុខ វិបុល', 'event_123', 'housewarming');
  const url = new URL(urlStr);
  assert.ok(urlStr.includes('/?name=សុខ+វិបុល&'), `Expected Khmer guest name first, got: ${urlStr}`);
  assert.equal(url.searchParams.get('id'), 'event_123');
  assert.equal(url.searchParams.get('type'), 'housewarming');
  assert.equal(detectLanguageFromUrl(url.search, url.pathname), 'kh');
  assert.equal(isSharedInvitationSearch(url.search), true);
  assert.equal(url.searchParams.get('name'), 'សុខ វិបុល');

  // When no guest name is provided, share=1 is included so viewer mode still activates
  const noGuestUrl = new URL(getPublicShareUrl('', 'event_123', 'housewarming'));
  assert.equal(noGuestUrl.searchParams.get('share'), '1');
});

test('getPublicShareUrl supports customOrigin for Vercel deployment with clean Khmer guest name', () => {
  const urlStr = getPublicShareUrl('ក្រុមគ្រួសារ និងបងប្អូនសាច់ញាតិ', 'event_QFZHXRKzhgPYeHjpYhuI2blRUBo2', 'housewarming', {
    customOrigin: VERCEL_APP_URL,
    lang: 'kh',
  });
  const url = new URL(urlStr);
  assert.equal(url.origin, 'https://wedding-invitation-inky-kappa.vercel.app');
  assert.equal(url.searchParams.get('id'), 'event_QFZHXRKzhgPYeHjpYhuI2blRUBo2');
  assert.equal(detectLanguageFromUrl(url.search, url.pathname), 'kh');
  assert.equal(url.searchParams.get('name'), 'ក្រុមគ្រួសារ និងបងប្អូនសាច់ញាតិ');
  assert.equal(urlStr.includes('%E1%9E'), false);
});

test('getPublicShareUrl supports English lang override when requested', () => {
  const urlStr = getPublicShareUrl('John Doe', 'event_456', 'birthday', {
    lang: 'en',
  });
  const url = new URL(urlStr);
  assert.equal(url.searchParams.get('lang'), 'en');
});

test('isSharedInvitationSearch identifies viewer links and preserves owner root dashboard', () => {
  assert.equal(isSharedInvitationSearch('?share=1&id=u_123__evt', { isAdmin: true }), true);
  assert.equal(isSharedInvitationSearch('?name=Sok', { isAdmin: false }), true);
  assert.equal(isSharedInvitationSearch('', { isAdmin: false, pathname: '/s/kh-abc' }), true);
  assert.equal(isSharedInvitationSearch('?id=u_123__evt&type=wedding', { isAdmin: false }), true);
  assert.equal(isSharedInvitationSearch('?id=u_123__evt', { isAdmin: true }), false);
  assert.equal(isSharedInvitationSearch('', { isAdmin: false, pathname: '/' }), false);
});

test('getPublicShareUrl includes ownerId only when needed and excludes guest_public', () => {
  const unscoped = new URL(
    getPublicShareUrl('Guest', 'modern-wedding-mw001', 'wedding', { ownerId: 'u_alice_123456' })
  );
  assert.equal(unscoped.searchParams.get('ownerId'), 'u_alice_123456');

  const scoped = new URL(
    getPublicShareUrl('Guest', 'u_alice_123456__modern-wedding-mw001', 'wedding', {
      ownerId: 'u_alice_123456',
    })
  );
  assert.equal(scoped.searchParams.get('ownerId'), null);

  const guestPublic = new URL(
    getPublicShareUrl('Guest', 'modern-wedding-mw001', 'wedding', { ownerId: 'guest_public' })
  );
  assert.equal(guestPublic.searchParams.get('ownerId'), null);
});

test('generateDeterministicShortCode produces unique deterministic codes per guest name', () => {
  const urlSok = getPublicShareUrl('លោក សុខ', 'u_owner__wedding', 'wedding');
  const urlThavy = getPublicShareUrl('អ្នកនាង ថាវី', 'u_owner__wedding', 'wedding');
  const urlJohn1 = getPublicShareUrl('John Smith', 'u_owner__wedding', 'wedding');
  const urlJohn2 = getPublicShareUrl('John Sok', 'u_owner__wedding', 'wedding');

  const codeSok1 = generateDeterministicShortCode(urlSok);
  const codeSok2 = generateDeterministicShortCode(urlSok);
  const codeThavy = generateDeterministicShortCode(urlThavy);
  const codeJohn1 = generateDeterministicShortCode(urlJohn1);
  const codeJohn2 = generateDeterministicShortCode(urlJohn2);

  assert.equal(codeSok1, codeSok2);
  assert.notEqual(codeSok1, codeThavy);
  assert.notEqual(codeJohn1, codeJohn2);
  assert.ok(codeJohn1.startsWith('johnsmith-'));
  assert.ok(codeJohn2.startsWith('johnsok-'));
  assert.ok(codeSok1.startsWith('wd-'));
});

test('extractGuestNameFromSearch handles all guest params, trims whitespace, and ignores placeholder', () => {
  assert.equal(extractGuestNameFromSearch('?name=%20%E1%9E%9B%E1%9F%84%E1%9E%80%20%E1%9E%9F%E1%9E%BB%E1%9E%81%20'), 'លោក សុខ');
  assert.equal(extractGuestNameFromSearch('?i=Dara%20Chan'), 'Dara Chan');
  assert.equal(extractGuestNameFromSearch('?guest=Sokha'), 'Sokha');
  assert.equal(extractGuestNameFromSearch('?to=Vannak'), 'Vannak');
  assert.equal(extractGuestNameFromSearch('?name=Your%20Name'), '');
  assert.equal(extractGuestNameFromSearch('?share=1&id=evt'), '');
});

test('shortenUrl preserves inferred public origin and sends distinct guest URLs to /api/shorten', async () => {
  const originalFetch = globalThis.fetch;
  const postedPayloads: Array<{ url: string; origin: string; lang: string }> = [];

  globalThis.fetch = (async (_input: any, init?: any) => {
    const body = JSON.parse(String(init?.body || '{}'));
    postedPayloads.push(body);
    const code = generateDeterministicShortCode(body.url);
    return new Response(
      JSON.stringify({
        success: true,
        code,
        shortUrl: `${body.origin}/s/${code}`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  try {
    const long1 = getPublicShareUrl('លោក សុខ វិបុល', 'u_1__evt', 'wedding', { customOrigin: PUBLIC_APP_URL });
    const long2 = getPublicShareUrl('កញ្ញា ចន្ទ្រា', 'u_1__evt', 'wedding', { customOrigin: PUBLIC_APP_URL });

    const short1 = await shortenUrl(long1);
    const short2 = await shortenUrl(long2);

    assert.ok(short1.startsWith(`${PUBLIC_APP_URL}/s/`));
    assert.ok(short2.startsWith(`${PUBLIC_APP_URL}/s/`));
    assert.notEqual(short1, short2);
    assert.equal(postedPayloads.length, 2);
    assert.equal(new URL(postedPayloads[0].url).searchParams.get('name'), 'លោក សុខ វិបុល');
    assert.equal(new URL(postedPayloads[1].url).searchParams.get('name'), 'កញ្ញា ចន្ទ្រា');
    assert.equal(postedPayloads[0].origin, PUBLIC_APP_URL);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getDefaultShareDomain defaults to vercel so shared links use Vercel with KH support', () => {
  const originalWindow = (globalThis as any).window;
  try {
    (globalThis as any).window = undefined;
    assert.equal(getDefaultShareDomain(), 'vercel');

    (globalThis as any).window = { location: { origin: PUBLIC_APP_URL } };
    assert.equal(getDefaultShareDomain(), 'vercel');

    (globalThis as any).window = { location: { origin: VERCEL_APP_URL } };
    assert.equal(getDefaultShareDomain(), 'vercel');
  } finally {
    (globalThis as any).window = originalWindow;
  }
});

test('Vercel Khmer share URLs use clean + spaces (zero %20 or %E1%9E) and detectLanguageFromUrl resolves KH/EN cleanly', () => {
  const khUrl = getPublicShareUrl('លោក សុខ រតនៈវិសាល និងភរិយា', 'u_owner__wedding', 'wedding', {
    customOrigin: VERCEL_APP_URL,
    lang: 'km',
  });
  assert.equal(khUrl.includes('%20'), false, 'Khmer guest URL should use clean + instead of %20');
  assert.equal(khUrl.includes('%E1%9E'), false, 'Khmer guest URL should not show %E1%9E gibberish');
  assert.ok(khUrl.startsWith(`${VERCEL_APP_URL}/?name=លោក+សុខ+រតនៈវិសាល+និងភរិយា`));
  const parsed = new URL(khUrl);
  assert.equal(parsed.origin, VERCEL_APP_URL);
  assert.equal(detectLanguageFromUrl(parsed.search, parsed.pathname), 'kh');
  assert.equal(extractGuestNameFromSearch(parsed.search), 'លោក សុខ រតនៈវិសាល និងភរិយា');
  assert.equal(decodeKhmerQueryValue('លោក+សុខ%20រតនៈ'), 'លោក សុខ រតនៈ');

  assert.equal(detectLanguageFromUrl('?lang=kh', '/'), 'kh');
  assert.equal(detectLanguageFromUrl('?lang=km', '/'), 'kh');
  assert.equal(detectLanguageFromUrl('', '/kh'), 'kh');
  assert.equal(detectLanguageFromUrl('', '/'), 'kh');
  assert.equal(detectLanguageFromUrl('?lang=en', '/'), 'en');
});

test('distinct templates and distinct guest names produce unique short codes preserving both guest and template', () => {
  const templates = [
    { id: 'u_owner__cmgrawhnk0003le0434762j7n', type: 'wedding' },
    { id: 'u_owner__modern-wedding-mw001', type: 'wedding' },
    { id: 'u_owner__engagement-cm001', type: 'engagement' },
    { id: 'u_owner__housewarming-hm001', type: 'housewarming' },
    { id: 'u_owner__birthday-bd001', type: 'birthday' },
    { id: 'u_owner__anniversary-an001', type: 'anniversary' },
  ];
  const guests = ['លោក សុខ រតនៈវិសាល', 'កញ្ញា ចន្ទ្រា', 'Mr. Dara'];
  const seenCodes = new Set<string>();

  for (const tpl of templates) {
    for (const guest of guests) {
      const shareUrl = getPublicShareUrl(guest, tpl.id, tpl.type, {
        customOrigin: PUBLIC_APP_URL,
      });
      const parsed = new URL(shareUrl);
      assert.equal(parsed.searchParams.get('id'), tpl.id);
      assert.equal(extractGuestNameFromSearch(parsed.search), guest);
      assert.equal(isSharedInvitationSearch(parsed.search), true);

      const code = generateDeterministicShortCode(shareUrl);
      assert.equal(seenCodes.has(code), false, `Duplicate short code ${code} for ${tpl.id} / ${guest}`);
      seenCodes.add(code);
    }
  }

  assert.equal(seenCodes.size, templates.length * guests.length);
});

test('shortenUrl falls back to self-contained full share URL when short-link persistence fails', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        success: false,
        persisted: false,
        error: 'Database (default) does not exist',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )) as typeof fetch;

  try {
    const longUrl = getPublicShareUrl('លោក សុខ ដារ៉ា', 'u_owner__modern-wedding-mw001', 'wedding', {
      customOrigin: VERCEL_APP_URL,
      lang: 'kh',
    });
    const resolved = await shortenUrl(longUrl, VERCEL_APP_URL);
    const parsed = new URL(resolved);

    assert.equal(parsed.origin, VERCEL_APP_URL);
    assert.equal(parsed.pathname, '/');
    assert.equal(parsed.searchParams.get('id'), 'u_owner__modern-wedding-mw001');
    assert.equal(detectLanguageFromUrl(parsed.search, parsed.pathname), 'kh');
    assert.equal(isSharedInvitationSearch(parsed.search), true);
    assert.equal(extractGuestNameFromSearch(parsed.search), 'លោក សុខ ដារ៉ា');
    assert.ok(resolved.startsWith(`${VERCEL_APP_URL}/?name=លោក+សុខ+ដារ៉ា&id=u_owner__modern-wedding-mw001`));

    const instantUncached = getInstantShareUrl(longUrl, VERCEL_APP_URL);
    assert.equal(instantUncached, resolved);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Vercel Khmer font support encodes non-default &font= slug and resolves web-safe Google Font stacks for viewers', () => {
  assert.ok(KHMER_SHARE_FONTS.length >= 12);
  assert.equal(resolveKhmerFontSlug("'Moulpali', serif"), 'moulpali');
  assert.equal(resolveKhmerFontSlug("'AKbalthom Kbach', 'Moul', serif"), 'kbach');
  assert.equal(resolveKhmerFontSlug("'Khmer OS Bokor', 'Bokor', display"), 'bokor');
  assert.equal(resolveKhmerFontSlug('kantumruy'), 'kantumruy');

  const urlStr = getPublicShareUrl('លោក សុខ វិបុល', 'u_owner__wedding', 'wedding', {
    customOrigin: VERCEL_APP_URL,
    lang: 'kh',
    khFont: "'Moulpali', 'Moul', serif",
  });
  const parsed = new URL(urlStr);
  assert.equal(parsed.origin, VERCEL_APP_URL);
  assert.equal(detectLanguageFromUrl(parsed.search, parsed.pathname), 'kh');
  assert.equal(parsed.searchParams.get('font'), 'moulpali');

  const extractedFont = extractKhmerFontFromSearch(parsed.search);
  assert.ok(extractedFont?.includes("'Moulpali'"));
  assert.equal(
    resolveKhmerFontFamily("'AKbalthom Kbach', 'AKbalthom-Kbach', 'Moul', serif"),
    "'Moul', 'Moulpali', 'AKbalthom Kbach', serif"
  );
});

test('Khmer guest name share links put readable Khmer name first without %E1%9E/%20 or scammy query bloat', () => {
  const encodedSample = '%E1%9E%9B%E1%9F%84%E1%9E%80%20%E1%9E%93%E1%9E%B7%E1%9E%84%E1%9E%A2%E1%9F%92%E1%9E%93%E1%9E%80%E1%9E%9F%E1%9F%92%E1%9E%9A%E1%9E%B8';
  const doubleEncodedSample = encodeURIComponent(encodedSample);

  assert.equal(decodeKhmerQueryValue(encodedSample), 'លោក និងអ្នកស្រី');
  assert.equal(decodeKhmerQueryValue(doubleEncodedSample), 'លោក និងអ្នកស្រី');
  assert.equal(extractGuestNameFromSearch(`?name=${encodedSample}`), 'លោក និងអ្នកស្រី');
  assert.equal(extractGuestNameFromSearch(`?name=${doubleEncodedSample}`), 'លោក និងអ្នកស្រី');

  const urlFromKhmer = getPublicShareUrl('លោក និងអ្នកស្រី', 'u_seyhafb7_2a0lb5__modern-wedding-mw001', 'wedding', {
    customOrigin: VERCEL_APP_URL,
    lang: 'kh',
    khFont: 'moul',
  });
  assert.equal(
    urlFromKhmer,
    `${VERCEL_APP_URL}/?name=លោក+និងអ្នកស្រី&id=u_seyhafb7_2a0lb5__modern-wedding-mw001`,
    `Expected clean Khmer-first URL, got: ${urlFromKhmer}`
  );
  assert.equal(urlFromKhmer.includes('%'), false, 'Clean Khmer link should have zero percent-encoding');
  assert.equal(urlFromKhmer.includes(' '), false, 'Share URL must not contain raw spaces that break hyperlinks in chat apps');
  assert.equal(new URL(urlFromKhmer).searchParams.get('name'), 'លោក និងអ្នកស្រី');

  // Passing an already percent-encoded Khmer guest name must never double-encode
  const urlFromEncoded = getPublicShareUrl(encodedSample, 'u_seyhafb7_2a0lb5__modern-wedding-mw001', 'wedding', {
    customOrigin: VERCEL_APP_URL,
    lang: 'kh',
    khFont: 'moul',
  });
  assert.equal(urlFromEncoded, urlFromKhmer);

  // Reserved URL characters like & inside a Khmer guest name remain safely encoded
  const urlWithAmp = getPublicShareUrl('លោក វ៉ាន់ សុខា & ភរិយា', 'cmgrawhnk0003le0434762j7n', 'wedding', {
    customOrigin: VERCEL_APP_URL,
    lang: 'kh',
  });
  assert.ok(urlWithAmp.startsWith(`${VERCEL_APP_URL}/?name=លោក+វ៉ាន់+សុខា+%26+ភរិយា`));
  assert.equal(new URL(urlWithAmp).searchParams.get('name'), 'លោក វ៉ាន់ សុខា & ភរិយា');
});


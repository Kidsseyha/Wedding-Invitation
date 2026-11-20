import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPublicShareUrl,
  isSharedInvitationSearch,
  generateDeterministicShortCode,
  extractGuestNameFromSearch,
  shortenUrl,
  getDefaultShareDomain,
  VERCEL_APP_URL,
  PUBLIC_APP_URL,
} from './shareUrl';

test('getPublicShareUrl defaults to lang=kh and includes share=1', () => {
  const urlStr = getPublicShareUrl('សុខ វិបុល', 'event_123', 'housewarming');
  const url = new URL(urlStr);
  assert.equal(url.searchParams.get('id'), 'event_123');
  assert.equal(url.searchParams.get('type'), 'housewarming');
  assert.equal(url.searchParams.get('lang'), 'kh');
  assert.equal(url.searchParams.get('share'), '1');
  assert.equal(url.searchParams.get('name'), 'សុខ វិបុល');
});

test('getPublicShareUrl supports customOrigin for Vercel deployment', () => {
  const urlStr = getPublicShareUrl('ក្រុមគ្រួសារ និងបងប្អូនសាច់ញាតិ', 'event_QFZHXRKzhgPYeHjpYhuI2blRUBo2', 'housewarming', {
    customOrigin: VERCEL_APP_URL,
    lang: 'kh',
  });
  const url = new URL(urlStr);
  assert.equal(url.origin, 'https://invitationonline-six.vercel.app');
  assert.equal(url.searchParams.get('id'), 'event_QFZHXRKzhgPYeHjpYhuI2blRUBo2');
  assert.equal(url.searchParams.get('lang'), 'kh');
  assert.equal(url.searchParams.get('name'), 'ក្រុមគ្រួសារ និងបងប្អូនសាច់ញាតិ');
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

test('getDefaultShareDomain defaults to preview outside .vercel.app and vercel on .vercel.app', () => {
  const originalWindow = (globalThis as any).window;
  try {
    (globalThis as any).window = undefined;
    assert.equal(getDefaultShareDomain(), 'preview');

    (globalThis as any).window = { location: { origin: PUBLIC_APP_URL } };
    assert.equal(getDefaultShareDomain(), 'preview');

    (globalThis as any).window = { location: { origin: VERCEL_APP_URL } };
    assert.equal(getDefaultShareDomain(), 'vercel');
  } finally {
    (globalThis as any).window = originalWindow;
  }
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
      assert.equal(parsed.searchParams.get('type'), tpl.type);
      assert.equal(extractGuestNameFromSearch(parsed.search), guest);
      assert.equal(parsed.searchParams.get('share'), '1');

      const code = generateDeterministicShortCode(shareUrl);
      assert.equal(seenCodes.has(code), false, `Duplicate short code ${code} for ${tpl.id} / ${guest}`);
      seenCodes.add(code);
    }
  }

  assert.equal(seenCodes.size, templates.length * guests.length);
});


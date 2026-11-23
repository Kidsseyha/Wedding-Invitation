import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_PRESETS } from '../data/eventTemplates.js';
import {
  buildAllShareTemplates,
  buildInvitationMeta,
  injectMetaIntoHtml,
  resolveEventCoverImage,
  resolveSelectedShareTemplateId,
} from './shareMeta.js';
import { sanitizeWeddingEvent } from './sanitizeEvent.js';
import { findUserDbEvent } from '../lib/serverIsolation.js';
import { getScopedEventId } from '../lib/userScope.js';

test('buildAllShareTemplates and resolveSelectedShareTemplateId preserve Modern Wedding and custom schedules', () => {
  const modernPreset = EVENT_PRESETS.find((p) => p.id === 'preset-modern-wedding');
  assert.ok(modernPreset, 'preset-modern-wedding should exist');

  const customSchedule = [
    {
      id: 'shift-group-1',
      shifts: [
        {
          id: 'modern-day-custom',
          name: 'ពិធីមង្គលការពេលល្ងាចពិសេស',
          nameEn: 'Custom Evening Reception',
          date: '2026-12-20',
          timeLine: [
            {
              id: 'tl-1',
              time: '17:00',
              name: 'ទទួលភ្ញៀវកិត្តិយស',
              nameEn: 'Welcome Guests',
              icon: 'sparkles',
            },
          ],
        },
      ],
    },
  ];

  const userScope = 'u_alice_123456';
  const currentModernEvent = {
    ...modernPreset.sampleEvent,
    id: getScopedEventId(modernPreset.sampleEvent.id, userScope),
    templateId: modernPreset.sampleEvent.id,
    ownerId: userScope,
    eventType: 'wedding',
    groom: 'សុខ ដារ៉ា',
    bride: 'ចន្ទ ស្រីពេជ្រ',
    schedules: customSchedule,
  };

  const options = buildAllShareTemplates({
    presets: EVENT_PRESETS,
    currentEvent: currentModernEvent,
    lastActivePresetId: 'preset-wedding',
  });

  const resolvedId = resolveSelectedShareTemplateId({
    options,
    currentEvent: currentModernEvent,
    lastActivePresetId: 'preset-wedding',
  });

  assert.equal(resolvedId, 'preset-modern-wedding');
  const modernOpt = options.find((o) => o.templateId === 'preset-modern-wedding');
  assert.ok(modernOpt);
  assert.equal(modernOpt.event.groom, 'សុខ ដារ៉ា');
  assert.equal(modernOpt.event.schedules[0].shifts[0].nameEn, 'Custom Evening Reception');
});

test('sanitizeWeddingEvent respects explicit anniversary eventType and preserves schedules', () => {
  const anniversaryPreset = EVENT_PRESETS.find((p) => p.type === 'anniversary');
  assert.ok(anniversaryPreset);

  const sanitized = sanitizeWeddingEvent({
    ...anniversaryPreset.sampleEvent,
    id: 'u_alice_123456__anniversary-001',
    templateId: 'anniversary-001',
    eventType: 'anniversary',
    name: 'ខួបអាពាហ៍ពិពាហ៍ ១០ ឆ្នាំ',
  });

  assert.equal(sanitized.eventType, 'anniversary');
  assert.equal(sanitized.templateId, 'anniversary-001');
  assert.ok(Array.isArray(sanitized.schedules) && sanitized.schedules.length > 0);
});

test('findUserDbEvent does not cross-bleed different templates within same category', () => {
  const USER_A = 'u_alice_123456';
  const tradId = getScopedEventId('cmgrawhnk0003le0434762j7n', USER_A);
  const modernId = getScopedEventId('modern-wedding-mw001', USER_A);

  const userADb = {
    [tradId]: {
      id: tradId,
      templateId: 'cmgrawhnk0003le0434762j7n',
      ownerId: USER_A,
      eventType: 'wedding',
      groom: 'Traditional Groom',
      updatedAt: '2026-05-01T10:00:00.000Z',
    },
    [`user_${USER_A}_type_wedding`]: {
      id: tradId,
      templateId: 'cmgrawhnk0003le0434762j7n',
      ownerId: USER_A,
      eventType: 'wedding',
      groom: 'Traditional Groom',
      updatedAt: '2026-05-01T10:00:00.000Z',
    },
  };

  // Requesting modern wedding specifically must NOT fall back to traditional wedding
  const modernResult = findUserDbEvent(userADb, {
    eventId: modernId,
    eventType: 'wedding',
    dbId: USER_A,
  });
  assert.equal(modernResult, null);

  // Requesting by category only (no specific template eventId) still works
  const categoryOnly = findUserDbEvent(userADb, {
    eventType: 'wedding',
    dbId: USER_A,
  });
  assert.equal(categoryOnly?.groom, 'Traditional Groom');
});

test('buildInvitationMeta returns guest name, custom invitation title, and invitation cover for every event type', () => {
  const origin = 'https://ais-pre-hjj7vuznhhxkva5mjjwpax-816970112678.asia-southeast1.run.app';

  const birthdayMeta = buildInvitationMeta({
    event: {
      id: 'u_alice__birthday-bd001',
      eventType: 'birthday',
      name: 'ខួបកំណើតគម្រប់ ៣០ ឆ្នាំ កែវ ពិសិដ្ឋ',
      groom: 'លោក កែវ ពិសិដ្ឋ',
      config: {
        envelope_header_image: '/assets/images/custom-birthday-cover.jpg',
      },
    },
    guestName: '  លោក សុខ រតនៈ  ',
    queryType: 'birthday',
    eventId: 'u_alice__birthday-bd001',
    origin,
  });

  assert.equal(birthdayMeta.guestName, 'លោក សុខ រតនៈ');
  assert.equal(birthdayMeta.invitationTitle, 'ខួបកំណើតគម្រប់ ៣០ ឆ្នាំ កែវ ពិសិដ្ឋ');
  assert.equal(birthdayMeta.title, 'ខួបកំណើតគម្រប់ ៣០ ឆ្នាំ កែវ ពិសិដ្ឋ - សូមគោរពអញ្ជើញ លោក សុខ រតនៈ');
  assert.equal(birthdayMeta.coverImage, `${origin}/assets/images/custom-birthday-cover.jpg`);
  assert.equal(birthdayMeta.image, `${origin}/assets/images/custom-birthday-cover.jpg`);

  const houseCover = resolveEventCoverImage(
    {
      config: {
        envelope_header_image: 'https://cdn.example.com/house-envelope.jpg',
      },
    },
    'housewarming'
  );
  assert.equal(houseCover, 'https://cdn.example.com/house-envelope.jpg');
});

test('Modern Wedding repairs contaminated Traditional Wedding covers and ignores none sentinel', () => {
  const origin = 'https://ais-pre-hjj7vuznhhxkva5mjjwpax-816970112678.asia-southeast1.run.app';
  const modernPreset = EVENT_PRESETS.find((p) => p.id === 'preset-modern-wedding');
  assert.ok(modernPreset);

  const contaminated = sanitizeWeddingEvent({
    ...modernPreset.sampleEvent,
    id: 'u_user1__modern-wedding-mw001',
    templateId: 'preset-modern-wedding',
    eventType: 'wedding',
    image: '/assets/images/white_arch_columns_wedding_cover_1790394461049.jpg',
    cover_image: '/assets/images/white_arch_columns_wedding_cover_1790394461049.jpg',
    config: {
      ...modernPreset.sampleEvent.config,
      envelope_header_image: 'none',
      cover_background: '/assets/images/white_arch_columns_wedding_cover_1790394461049.jpg',
      details_background: '/assets/images/white_arch_columns_wedding_cover_1790394461049.jpg',
    },
  });

  assert.equal(contaminated.image, modernPreset.coverImage);
  assert.equal(contaminated.cover_image, modernPreset.coverImage);
  assert.notEqual(contaminated.config.cover_background, '/assets/images/white_arch_columns_wedding_cover_1790394461049.jpg');

  const modernMeta = buildInvitationMeta({
    event: {
      ...modernPreset.sampleEvent,
      id: 'u_user1__modern-wedding-mw001',
      templateId: 'preset-modern-wedding',
      image: 'https://cdn.example.com/custom-modern-portrait.jpg',
      cover_image: '/assets/images/white_arch_columns_wedding_cover_1790394461049.jpg',
      config: {
        ...modernPreset.sampleEvent.config,
        envelope_header_image: 'none',
        cover_background: '/assets/images/white_arch_columns_wedding_cover_1790394461049.jpg',
      },
    },
    guestName: 'លោក ដារ៉ា',
    queryType: 'wedding',
    eventId: 'u_user1__modern-wedding-mw001',
    origin,
  });

  assert.equal(modernMeta.coverImage, 'https://cdn.example.com/custom-modern-portrait.jpg');
  assert.equal(modernMeta.image, 'https://cdn.example.com/custom-modern-portrait.jpg');
});

test('injectMetaIntoHtml injects Khmer html lang=km and og:locale=km_KH for Vercel sharing', () => {
  const origin = 'https://wedding-invitation-inky-kappa.vercel.app';
  const meta = buildInvitationMeta({
    event: EVENT_PRESETS[0].sampleEvent,
    guestName: 'លោក សុខ រតនៈ',
    queryType: 'wedding',
    eventId: EVENT_PRESETS[0].sampleEvent.id,
    origin,
    pageUrl: `${origin}/?id=${EVENT_PRESETS[0].sampleEvent.id}&type=wedding&lang=kh&share=1&name=%E1%9E%9B%E1%9F%84%E1%9E%80%20%E1%9E%9F%E1%9E%BB%E1%9E%81%20%E1%9E%9A%E1%9E%8F%E1%9E%93%E1%9F%88`,
  });

  const html = injectMetaIntoHtml(
    '<!doctype html><html lang="en"><head><meta charset="UTF-8" /><title>Old</title></head><body></body></html>',
    meta,
    undefined,
    { lang: 'kh' }
  );

  assert.ok(html.includes('<html lang="km">'));
  assert.ok(html.includes('<meta property="og:locale" content="km_KH" />'));
  assert.ok(html.includes('<meta property="og:site_name" content="លិខិតអញ្ជើញឌីជីថល" />'));
  assert.ok(html.includes('សូមគោរពអញ្ជើញ លោក សុខ រតនៈ'));
});



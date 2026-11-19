import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_PRESETS } from '../data/eventTemplates.js';
import { buildAllShareTemplates, resolveSelectedShareTemplateId } from './shareMeta.js';
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

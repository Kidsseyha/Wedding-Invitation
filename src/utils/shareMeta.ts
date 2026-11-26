import { EVENT_PRESETS, EventTypePreset, findTemplatePreset, getCategoryCoverImage } from '../data/eventTemplates.js';
import { GUEST_PUBLIC_SCOPE, getUserStorageKey, resolveUserScope, stripScopedEventId } from '../lib/userScope.js';
import { resolveRecordDatabaseId } from '../lib/userDatabase.js';
import { decodeKhmerQueryValue } from '../lib/shareUrl.js';
import { pickNewestDatabaseEvent } from './saveHelpers.js';

export type InvitationCategory = 'wedding' | 'engagement' | 'housewarming' | 'birthday' | 'anniversary';

export interface InvitationMetaResult {
  title: string;
  description: string;
  image: string;
  url: string;
  category: InvitationCategory;
  guestName: string;
  invitationTitle: string;
  coverImage: string;
}

export interface ShareTemplateOption {
  templateId: string;
  eventId: string;
  category: InvitationCategory;
  titleKh: string;
  titleEn: string;
  badgeKh: string;
  badgeEn: string;
  accentColor: string;
  isCustom: boolean;
  hasSavedData: boolean;
  coverImage: string;
  dateKh: string;
  dateEn: string;
  locationKh: string;
  locationEn: string;
  event: any;
}

const VALID_CATEGORIES = new Set<InvitationCategory>([
  'wedding',
  'engagement',
  'housewarming',
  'birthday',
  'anniversary',
]);

export function normalizeCategoryString(raw?: string | null): InvitationCategory | null {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.toLowerCase().trim();
  if (!s) return null;
  if (VALID_CATEGORIES.has(s as InvitationCategory)) return s as InvitationCategory;
  if (s.includes('anniversary') || s.includes('ខួបអាពាហ៍ពិពាហ៍')) return 'anniversary';
  if (s.includes('birthday') || s.includes('ខួបកំណើត') || s.includes('ខួប')) return 'birthday';
  if (s.includes('housewarming') || s.includes('ឡើងផ្ទះ') || s.includes('ឡើងគេហដ្ឋាន') || s.includes('house')) return 'housewarming';
  if (s.includes('engagement') || s.includes('ភ្ជាប់ពាក្យ') || s.includes('engage')) return 'engagement';
  if (s.includes('wedding') || s.includes('មង្គលការ') || s.includes('អាពាហ៍ពិពាហ៍')) return 'wedding';
  return null;
}

export function resolveCategoryFromHints(hints: {
  queryType?: string | null;
  eventType?: string | null;
  eventId?: string | null;
  eventName?: string | null;
}): InvitationCategory {
  return (
    normalizeCategoryString(hints.queryType) ||
    normalizeCategoryString(hints.eventType) ||
    normalizeCategoryString(hints.eventId) ||
    normalizeCategoryString(hints.eventName) ||
    'wedding'
  );
}

export function toAbsoluteHttpUrl(rawUrl: string | undefined | null, origin: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith('data:')) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  const cleanOrigin = (origin || '').replace(/\/+$/, '');
  if (!cleanOrigin) return trimmed;
  if (trimmed.startsWith('/')) return `${cleanOrigin}${trimmed}`;
  return `${cleanOrigin}/${trimmed}`;
}

export function isWeddingDefaultCoverUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  return (
    url.includes('491657278') ||
    url.includes('white_arch_columns_wedding_cover') ||
    url.includes('khmer_royal_gold_wedding_cover')
  );
}

export function isInvalidCoverValue(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return true;
  const trimmed = url.trim().toLowerCase();
  return !trimmed || trimmed === 'none' || trimmed === 'null' || trimmed === 'undefined' || trimmed === 'false';
}

export function isModernWeddingEvent(event: any): boolean {
  if (!event || typeof event !== 'object') return false;
  const id = String(event.id || '').toLowerCase();
  const tpl = String(event.templateId || '').toLowerCase();
  const name = String(event.name || '');
  const nameLower = name.toLowerCase();
  return id.includes('modern') || tpl.includes('modern') || nameLower.includes('modern') || name.includes('សម័យ');
}

export function resolveEventCoverImage(event: any, category: InvitationCategory, fallbackCover?: string): string {
  const isModern = category === 'wedding' && isModernWeddingEvent(event);
  const candidates = [
    event?.config?.envelope_header_image,
    event?.image,
    event?.cover_image,
    event?.config?.image,
    event?.config?.cover_background,
    event?.config?.photo_gallary?.photo1,
    fallbackCover,
  ];
  for (const candidate of candidates) {
    if (isInvalidCoverValue(candidate)) continue;
    const trimmed = String(candidate).trim();
    if ((category !== 'wedding' || isModern) && isWeddingDefaultCoverUrl(trimmed)) continue;
    return trimmed;
  }
  return getCategoryCoverImage(isModern ? 'preset-modern-wedding' : category);
}

export function buildAllShareTemplates(params: {
  presets: EventTypePreset[];
  deletedPresetIds?: string[];
  savedEventsById?: Record<string, any>;
  savedEventsByType?: Record<string, any>;
  customTemplates?: any[];
  currentEvent?: any;
  lastActivePresetId?: string | null;
}): ShareTemplateOption[] {
  const {
    presets,
    deletedPresetIds = [],
    savedEventsById = {},
    savedEventsByType = {},
    customTemplates = [],
    currentEvent,
    lastActivePresetId,
  } = params;

  const deletedSet = new Set(deletedPresetIds);
  const availablePresets = presets.filter(
    (p) => !deletedSet.has(p.id) && !deletedSet.has(p.sampleEvent.id)
  );

  const typeCounts: Record<string, number> = {};
  for (const p of availablePresets) {
    typeCounts[p.type] = (typeCounts[p.type] || 0) + 1;
  }

  // Match currentEvent to at most one preset (preferring exact templateId/id/lastActivePresetId/name)
  let matchedCurrentPresetId: string | null = null;
  if (currentEvent) {
    const curTemplateId = currentEvent.templateId;
    const curId = currentEvent.id;
    const curBaseId = curId ? stripScopedEventId(curId) : '';
    const curName = currentEvent.name;
    const curCat = resolveCategoryFromHints({
      eventType: currentEvent.eventType,
      eventId: curBaseId || currentEvent.id,
      eventName: currentEvent.name,
    });

    const exactPreset =
      availablePresets.find((p) => curTemplateId && (p.id === curTemplateId || p.sampleEvent.id === curTemplateId)) ||
      availablePresets.find(
        (p) =>
          curId &&
          (p.sampleEvent.id === curId ||
            p.sampleEvent.id === curBaseId ||
            p.id === curId ||
            p.id === curBaseId)
      ) ||
      availablePresets.find(
        (p) => lastActivePresetId && (p.id === lastActivePresetId || p.sampleEvent.id === lastActivePresetId) && p.type === curCat
      ) ||
      availablePresets.find((p) => curName && p.sampleEvent.name === curName);

    if (exactPreset) {
      matchedCurrentPresetId = exactPreset.id;
    } else if (!String(curBaseId || curId || '').startsWith('custom-event-')) {
      const byCategory = availablePresets.find((p) => p.type === curCat);
      if (byCategory) {
        matchedCurrentPresetId = byCategory.id;
      }
    }
  }

  const toOption = (
    eventData: any,
    meta: {
      templateId: string;
      category: InvitationCategory;
      titleKh: string;
      titleEn: string;
      badgeKh: string;
      badgeEn: string;
      accentColor: string;
      isCustom: boolean;
      hasSavedData: boolean;
      fallbackCover?: string;
    }
  ): ShareTemplateOption => {
    const coverImage = resolveEventCoverImage(eventData, meta.category, meta.fallbackCover);
    const dateKh =
      eventData?.date ||
      eventData?.config?.invitation_kh?.date_time ||
      eventData?.schedules?.[0]?.shifts?.[0]?.date ||
      eventData?.schedules?.[0]?.shifts?.[0]?.name ||
      'ថ្ងៃសៅរ៍ ទី១២ ខែធ្នូ ឆ្នាំ២០២៦';
    const dateEn =
      eventData?.date ||
      eventData?.config?.invitation_en?.date_time ||
      eventData?.schedules?.[0]?.shifts?.[0]?.nameEn ||
      eventData?.schedules?.[0]?.shifts?.[0]?.date ||
      dateKh;
    const locationKh =
      (typeof eventData?.location === 'string'
        ? eventData.location
        : eventData?.location?.name) ||
      eventData?.config?.invitation_kh?.location ||
      'ភ្នំពេញ';
    const locationEn =
      eventData?.locationEn ||
      eventData?.config?.invitation_en?.location ||
      locationKh;

    return {
      templateId: meta.templateId,
      eventId: eventData?.id || meta.templateId,
      category: meta.category,
      titleKh: meta.titleKh,
      titleEn: meta.titleEn,
      badgeKh: meta.badgeKh,
      badgeEn: meta.badgeEn,
      accentColor: meta.accentColor,
      isCustom: meta.isCustom,
      hasSavedData: meta.hasSavedData,
      coverImage,
      dateKh,
      dateEn,
      locationKh,
      locationEn,
      event: {
        ...eventData,
        templateId: meta.templateId,
        eventType: meta.category,
        cover_image: coverImage,
        image: coverImage,
      },
    };
  };

  const options: ShareTemplateOption[] = availablePresets.map((p) => {
    const bySampleId = savedEventsById[p.sampleEvent.id];
    const byPresetId = savedEventsById[p.id];
    const byTypeRaw = savedEventsByType[p.type];
    const byTypeBaseId = byTypeRaw?.id ? stripScopedEventId(byTypeRaw.id) : '';
    const canUseByType =
      Boolean(byTypeRaw) &&
      (typeCounts[p.type] === 1 ||
        byTypeRaw.templateId === p.id ||
        byTypeRaw.id === p.sampleEvent.id ||
        byTypeBaseId === p.sampleEvent.id ||
        byTypeRaw.name === p.sampleEvent.name);

    const saved = bySampleId || byPresetId || (canUseByType ? byTypeRaw : null);
    const isCurrent = matchedCurrentPresetId === p.id && Boolean(currentEvent);
    const mergedEvent = isCurrent
      ? {
          ...p.sampleEvent,
          ...currentEvent,
          schedules:
            Array.isArray(currentEvent.schedules) && currentEvent.schedules.length > 0
              ? currentEvent.schedules
              : p.sampleEvent.schedules,
          config: {
            ...p.sampleEvent.config,
            ...(currentEvent.config || {}),
          },
        }
      : saved
      ? {
          ...p.sampleEvent,
          ...saved,
          schedules:
            Array.isArray(saved.schedules) && saved.schedules.length > 0
              ? saved.schedules
              : p.sampleEvent.schedules,
          config: {
            ...p.sampleEvent.config,
            ...(saved.config || {}),
          },
        }
      : { ...p.sampleEvent };

    return toOption(mergedEvent, {
      templateId: p.id,
      category: p.type,
      titleKh: p.titleKh,
      titleEn: p.titleEn,
      badgeKh: p.badgeKh,
      badgeEn: p.badgeEn,
      accentColor: p.accentColor,
      isCustom: false,
      hasSavedData: Boolean(saved || isCurrent),
      fallbackCover: p.coverImage,
    });
  });

  // Append custom templates (plus currentEvent if it is a custom template not already listed)
  const customMap = new Map<string, any>();
  for (const item of customTemplates) {
    if (!item || typeof item !== 'object') continue;
    const key = String(item.id || item.templateId || '');
    if (!key || deletedSet.has(key)) continue;
    customMap.set(key, item);
  }
  if (currentEvent && !matchedCurrentPresetId) {
    const key = String(currentEvent.id || currentEvent.templateId || '');
    if (key && !deletedSet.has(key)) {
      customMap.set(key, currentEvent);
    }
  }

  for (const [key, customEvt] of Array.from(customMap.entries())) {
    const existingById = options.some((opt) => opt.eventId === key || opt.templateId === key);
    if (existingById) continue;
    const cat = resolveCategoryFromHints({
      eventType: customEvt.eventType,
      eventId: customEvt.id,
      eventName: customEvt.name,
    });
    const basePreset = availablePresets.find((p) => p.type === cat) || presets[0];
    const resolvedEvt =
      currentEvent && (currentEvent.id === key || currentEvent.templateId === key)
        ? { ...customEvt, ...currentEvent }
        : customEvt;
    const customTitle = resolvedEvt.name || basePreset?.titleKh || 'កម្មវិធីផ្ទាល់ខ្លួន';
    options.push(
      toOption(resolvedEvt, {
        templateId: resolvedEvt.templateId || key,
        category: cat,
        titleKh: customTitle,
        titleEn: resolvedEvt.name || basePreset?.titleEn || 'Custom Event',
        badgeKh: basePreset?.badgeKh || 'ផ្ទាល់ខ្លួន',
        badgeEn: basePreset?.badgeEn || 'Custom',
        accentColor: basePreset?.accentColor || '#f5b80f',
        isCustom: true,
        hasSavedData: true,
        fallbackCover: basePreset?.coverImage,
      })
    );
  }

  return options;
}

export function resolveSelectedShareTemplateId(params: {
  options: ShareTemplateOption[];
  currentEvent?: any;
  lastActivePresetId?: string | null;
  queryType?: string | null;
  queryId?: string | null;
}): string {
  const { options, currentEvent, lastActivePresetId, queryType, queryId } = params;
  if (!options.length) return 'preset-wedding';

  if (currentEvent?.templateId) {
    const byTpl = options.find(
      (o) =>
        o.templateId === currentEvent.templateId ||
        stripScopedEventId(o.eventId) === stripScopedEventId(currentEvent.templateId) ||
        stripScopedEventId(o.event?.id || '') === stripScopedEventId(currentEvent.templateId)
    );
    if (byTpl) return byTpl.templateId;
  }

  if (currentEvent?.id) {
    const curStripped = stripScopedEventId(currentEvent.id);
    const byId = options.find(
      (o) =>
        o.eventId === currentEvent.id ||
        o.templateId === currentEvent.id ||
        (curStripped && (stripScopedEventId(o.eventId) === curStripped || o.templateId === curStripped))
    );
    if (byId) return byId.templateId;
  }

  if (queryId) {
    const qStripped = stripScopedEventId(queryId);
    const byQueryId = options.find(
      (o) =>
        o.eventId === queryId ||
        o.templateId === queryId ||
        (qStripped && (stripScopedEventId(o.eventId) === qStripped || o.templateId === qStripped))
    );
    if (byQueryId) return byQueryId.templateId;
  }

  const currentCat = currentEvent
    ? resolveCategoryFromHints({
        eventType: currentEvent.eventType,
        eventId: currentEvent.id,
        eventName: currentEvent.name,
      })
    : null;

  if (lastActivePresetId) {
    const byLastPreset = options.find((o) => o.templateId === lastActivePresetId);
    if (byLastPreset && (!currentCat || byLastPreset.category === currentCat)) {
      return byLastPreset.templateId;
    }
  }

  if (currentEvent?.name) {
    const byName = options.find((o) => o.event?.name === currentEvent.name);
    if (byName) return byName.templateId;
  }

  const targetCategory =
    normalizeCategoryString(queryType) ||
    currentCat ||
    normalizeCategoryString(queryId);
  if (targetCategory) {
    const byCat = options.find((o) => o.category === targetCategory);
    if (byCat) return byCat.templateId;
  }

  return options[0].templateId;
}

export function readShareTemplatesStorageState(userScopeId?: string): {
  deletedPresetIds: string[];
  savedEventsById: Record<string, any>;
  savedEventsByType: Record<string, any>;
  customTemplates: any[];
  lastActivePresetId: string | null;
} {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return {
      deletedPresetIds: [],
      savedEventsById: {},
      savedEventsByType: {},
      customTemplates: [],
      lastActivePresetId: null,
    };
  }

  const effectiveScope = (userScopeId && userScopeId.trim()) || resolveUserScope().scopeId;
  const scopeSuffix = `__${effectiveScope}`;

  let deletedPresetIds: string[] = [];
  let customTemplates: any[] = [];
  const savedEventsById: Record<string, any> = {};
  const savedEventsByType: Record<string, any> = {};
  let lastActivePresetId: string | null = null;

  try {
    const deletedRaw = localStorage.getItem(getUserStorageKey('wedding_deleted_preset_ids', effectiveScope));
    if (deletedRaw) deletedPresetIds = JSON.parse(deletedRaw);
  } catch {}

  try {
    const customRaw = localStorage.getItem(getUserStorageKey('wedding_custom_templates', effectiveScope));
    if (customRaw) customTemplates = JSON.parse(customRaw);
  } catch {}

  try {
    lastActivePresetId = localStorage.getItem(getUserStorageKey('wedding_last_active_preset_id', effectiveScope));
  } catch {}

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.endsWith(scopeSuffix)) continue;
      if (key.startsWith('wedding_template_saved_')) {
        const rawId = key.slice('wedding_template_saved_'.length, key.length - scopeSuffix.length);
        try {
          const val = JSON.parse(localStorage.getItem(key) || 'null');
          if (val) {
            savedEventsById[rawId] = val;
            const stripped = stripScopedEventId(rawId);
            if (stripped && !savedEventsById[stripped]) {
              savedEventsById[stripped] = val;
            }
          }
        } catch {}
      } else if (key.startsWith('wedding_template_type_')) {
        const type = key.slice('wedding_template_type_'.length, key.length - scopeSuffix.length);
        try {
          const val = JSON.parse(localStorage.getItem(key) || 'null');
          if (val) savedEventsByType[type] = val;
        } catch {}
      }
    }
  } catch {}

  return {
    deletedPresetIds: Array.isArray(deletedPresetIds) ? deletedPresetIds : [],
    savedEventsById,
    savedEventsByType,
    customTemplates: Array.isArray(customTemplates) ? customTemplates : [],
    lastActivePresetId,
  };
}

export function buildInvitationMeta(params: {
  event?: any;
  guestName?: string | null;
  queryType?: string | null;
  eventId?: string | null;
  origin: string;
  pageUrl?: string;
}): InvitationMetaResult {
  const { event, guestName, queryType, eventId, origin, pageUrl } = params;

  const eventCategory = event
    ? resolveCategoryFromHints({
        eventType: event?.eventType,
        eventId: event?.id,
        eventName: event?.name,
      })
    : null;

  const explicitCategory = normalizeCategoryString(queryType);
  const category: InvitationCategory =
    explicitCategory ||
    eventCategory ||
    resolveCategoryFromHints({ queryType, eventId });

  // If queryType explicitly requests a different category than the loaded event (or no event was loaded),
  // pull information from that specific preset or category template.
  let effectiveEvent = event;
  const strippedEventId = eventId ? stripScopedEventId(eventId) : '';
  if (!effectiveEvent || (explicitCategory && eventCategory && explicitCategory !== eventCategory)) {
    const preset =
      (strippedEventId ? findTemplatePreset(strippedEventId) : undefined) ||
      EVENT_PRESETS.find((p) => p.type === category) ||
      findTemplatePreset(queryType || strippedEventId || category);
    if (preset) {
      effectiveEvent = preset.sampleEvent;
    }
  }

  const isBday = category === 'birthday';
  const isHouse = category === 'housewarming';
  const isEngage = category === 'engagement';
  const isAnniv = category === 'anniversary';

  const hostKhmerName = (effectiveEvent?.groom || '').trim();
  const brideKhmerName = (effectiveEvent?.bride || '').trim();
  const explicitEventName = (effectiveEvent?.name || '').trim();

  const eventName =
    explicitEventName ||
    (isBday
      ? hostKhmerName
        ? `ពិធីខួបកំណើត ${hostKhmerName}`
        : 'ពិធីខួបកំណើត'
      : isHouse
      ? hostKhmerName
        ? `ពិធីឡើងគេហដ្ឋានថ្មី ${hostKhmerName}`
        : 'ពិធីឡើងគេហដ្ឋានថ្មី'
      : isEngage
      ? hostKhmerName && brideKhmerName
        ? `ពិធីភ្ជាប់ពាក្យ ${hostKhmerName} & ${brideKhmerName}`
        : 'ពិធីភ្ជាប់ពាក្យ'
      : isAnniv
      ? hostKhmerName && brideKhmerName
        ? `ពិធីខួបអាពាហ៍ពិពាហ៍ ${hostKhmerName} & ${brideKhmerName}`
        : 'ពិធីខួបអាពាហ៍ពិពាហ៍'
      : effectiveEvent?.singlePerson
      ? hostKhmerName
        ? `កម្មវិធី ${hostKhmerName}`
        : 'លិខិតអញ្ជើញឌីជីថល'
      : hostKhmerName && brideKhmerName
      ? `អាពាហ៍ពិពាហ៍ ${hostKhmerName} & ${brideKhmerName}`
      : 'លិខិតអញ្ជើញឌីជីថល');

  const decodedGuestName = decodeKhmerQueryValue(guestName);
  const cleanGuest = decodedGuestName && decodedGuestName !== 'Your Name' ? decodedGuestName : '';
  const title = cleanGuest ? `${eventName} - សូមគោរពអញ្ជើញ ${cleanGuest}` : eventName;

  let description = `សូមគោរពអញ្ជើញ ${cleanGuest || 'ភ្ញៀវកិត្តិយស'} ចូលរួមជាអធិបតី និងប្រសិទ្ធពរជ័យ`;
  if (isBday) {
    const milestone = effectiveEvent?.config?.anniversary_milestone || effectiveEvent?.anniversary_milestone;
    description += ` ក្នុងពិធីខួបកំណើត ${hostKhmerName || eventName}${milestone ? ` (${milestone})` : ''}`;
  } else if (isHouse) {
    description += ` ក្នុងពិធីឡើងគេហដ្ឋានថ្មី ${hostKhmerName || eventName}`;
  } else if (isEngage) {
    description += ` ក្នុងពិធីភ្ជាប់ពាក្យ ${hostKhmerName} & ${brideKhmerName}`.trimEnd();
  } else if (isAnniv) {
    description += ` ក្នុងពិធីខួបអាពាហ៍ពិពាហ៍ ${hostKhmerName} & ${brideKhmerName}`.trimEnd();
  } else if (hostKhmerName && brideKhmerName && !effectiveEvent?.singlePerson) {
    description += ` ក្នុងពិធីមង្គលការរវាង ${hostKhmerName} & ${brideKhmerName}`;
  } else if (hostKhmerName) {
    description += ` ក្នុងកម្មវិធី ${hostKhmerName}`;
  }

  const eventDate =
    effectiveEvent?.date ||
    effectiveEvent?.config?.invitation_kh?.date_time ||
    effectiveEvent?.schedules?.[0]?.shifts?.[0]?.date ||
    effectiveEvent?.schedules?.[0]?.shifts?.[0]?.name ||
    '';
  if (eventDate) {
    description += ` នៅថ្ងៃទី ${eventDate}`;
  }

  const eventLocation =
    typeof effectiveEvent?.location === 'string'
      ? effectiveEvent.location
      : effectiveEvent?.location?.name || effectiveEvent?.config?.invitation_kh?.location || '';
  if (eventLocation) {
    description += ` ទីតាំង៖ ${eventLocation}`;
  }

  const isModern =
    category === 'wedding' &&
    (isModernWeddingEvent(effectiveEvent) ||
      String(strippedEventId || '').toLowerCase().includes('modern'));

  const candidateImages = [
    effectiveEvent?.config?.envelope_header_image,
    effectiveEvent?.image,
    effectiveEvent?.cover_image,
    effectiveEvent?.config?.image,
    effectiveEvent?.config?.cover_background,
    effectiveEvent?.config?.photo_gallary?.photo1,
  ];

  let selectedImage = '';
  for (const candidate of candidateImages) {
    if (isInvalidCoverValue(candidate)) continue;
    const trimmed = String(candidate).trim();
    if (trimmed.startsWith('data:')) continue;
    if ((category !== 'wedding' || isModern) && isWeddingDefaultCoverUrl(trimmed)) continue;
    const abs = toAbsoluteHttpUrl(trimmed, origin);
    if (abs) {
      selectedImage = abs;
      break;
    }
  }

  if (!selectedImage) {
    selectedImage = toAbsoluteHttpUrl(getCategoryCoverImage(isModern ? 'preset-modern-wedding' : category), origin);
  }

  return {
    title,
    description,
    image: selectedImage,
    url: pageUrl || origin,
    category,
    guestName: cleanGuest,
    invitationTitle: eventName,
    coverImage: selectedImage,
  };
}

export function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export const KHMER_GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Alex+Brush&family=Angkor&family=Battambang:wght@400;700;900&family=Bokor&family=Cinzel:wght@500;600;700;800&family=Content:wght@400;700&family=Dancing+Script:wght@600;700&family=Dangrek&family=Fasthand&family=Freehand&family=Great+Vibes&family=Kantumruy+Pro:ital,wght@0,300..700;1,300..700&family=Khmer&family=Konkhmer+Sleokchher&family=Moul&family=Moulpali&family=Norican&family=Noto+Sans+Khmer:wght@300;400;500;600;700;800;900&family=Noto+Serif+Khmer:wght@400;500;600;700;800;900&family=Parisienne&family=Playfair+Display:ital,wght@0,500..800;1,500..800&family=Satisfy&family=Siemreap&family=Taprom&display=swap';

export function injectMetaIntoHtml(
  html: string,
  meta: InvitationMetaResult,
  replaceStatePath?: string,
  options?: { lang?: 'kh' | 'en' }
): string {
  const safeTitleText = meta.title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const isEnglish = options?.lang === 'en';
  const htmlLang = isEnglish ? 'en' : 'km';
  const ogLocale = isEnglish ? 'en_US' : 'km_KH';
  const siteName = isEnglish ? 'Digital Invitation' : 'លិខិតអញ្ជើញឌីជីថល';
  let result = html;

  if (/<html\b[^>]*\blang=["'][^"']*["'][^>]*>/i.test(result)) {
    result = result.replace(/(<html\b[^>]*\blang=["'])[^"']*(["'][^>]*>)/i, `$1${htmlLang}$2`);
  } else if (/<html\b[^>]*>/i.test(result)) {
    result = result.replace(/<html\b([^>]*)>/i, `<html lang="${htmlLang}"$1>`);
  }

  // Ensure Google Khmer Fonts stylesheet is always loaded in <head> for Vercel shared links
  if (!result.includes('fonts.googleapis.com/css2') && /<\/head>/i.test(result)) {
    const fontLinks = [
      `    <link rel="preconnect" href="https://fonts.googleapis.com">`,
      `    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
      `    <link href="${KHMER_GOOGLE_FONTS_HREF}" rel="stylesheet">`,
    ].join('\n');
    result = result.replace(/<\/head>/i, `${fontLinks}\n  </head>`);
  }

  if (replaceStatePath && /<head[^>]*>/i.test(result)) {
    const safePathLiteral = JSON.stringify(replaceStatePath).replace(/</g, '\\u003c');
    const replaceScript = `<script>(function(){try{if(window.history&&window.history.replaceState){window.history.replaceState(null,"",${safePathLiteral});}}catch(e){}})();</script>`;
    result = result.replace(/<head[^>]*>/i, (match) => `${match}\n    ${replaceScript}`);
  }

  if (/<title>[\s\S]*?<\/title>/i.test(result)) {
    result = result.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitleText}</title>`);
  } else {
    result = result.replace('</head>', `  <title>${safeTitleText}</title>\n  </head>`);
  }

  const upsertMeta = (attr: 'name' | 'property', key: string, content: string) => {
    if (!content) return;
    const escapedKey = key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`<meta\\b[^>]*\\b${attr}=["']${escapedKey}["'][^>]*>`, 'i');
    const replacement = `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`;
    if (regex.test(result)) {
      result = result.replace(regex, replacement);
    } else {
      result = result.replace('</head>', `    ${replacement}\n  </head>`);
    }
  };

  upsertMeta('name', 'description', meta.description);
  upsertMeta('property', 'og:site_name', siteName);
  upsertMeta('property', 'og:locale', ogLocale);
  upsertMeta('property', 'og:title', meta.title);
  upsertMeta('property', 'og:description', meta.description);
  upsertMeta('property', 'og:type', 'website');
  upsertMeta('property', 'og:image', meta.image);
  upsertMeta('property', 'og:url', meta.url);
  upsertMeta('name', 'twitter:card', 'summary_large_image');
  upsertMeta('name', 'twitter:title', meta.title);
  upsertMeta('name', 'twitter:description', meta.description);
  upsertMeta('name', 'twitter:image', meta.image);

  return result;
}

export function parseFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return val;
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    const values = val.arrayValue?.values;
    return Array.isArray(values) ? values.map(parseFirestoreValue) : [];
  }
  if ('mapValue' in val) {
    return parseFirestoreDocumentFields(val.mapValue?.fields || {});
  }
  return undefined;
}

export function parseFirestoreDocumentFields(fields: Record<string, any> | undefined | null): Record<string, any> {
  if (!fields || typeof fields !== 'object') return {};
  const out: Record<string, any> = {};
  for (const [key, val] of Object.entries(fields)) {
    out[key] = parseFirestoreValue(val);
  }
  return out;
}

export async function fetchEventFromFirestoreRest(options: {
  projectId: string;
  databaseId?: string;
  eventId: string;
  ownerId?: string | null;
  ownerEmail?: string | null;
  apiKey?: string;
  timeoutMs?: number;
}): Promise<Record<string, any> | null> {
  const { projectId, databaseId = '(default)', eventId, ownerId, ownerEmail, apiKey, timeoutMs = 2500 } = options;
  if (!projectId || !eventId) return null;

  const dbSegment = databaseId || '(default)';
  const keyParam = apiKey ? `?key=${encodeURIComponent(apiKey)}` : '';
  const targetDbId = resolveRecordDatabaseId({ ownerId, ownerEmail, eventId });

  const fetchDocAtPath = async (docPath: string): Promise<Record<string, any> | null> => {
    const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      projectId
    )}/databases/${encodeURIComponent(dbSegment)}/documents/${docPath}${keyParam}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let res = await fetch(endpoint, { signal: controller.signal });
      if (!res.ok && dbSegment !== '(default)') {
        const fallbackEndpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
          projectId
        )}/databases/(default)/documents/${docPath}${keyParam}`;
        res = await fetch(fallbackEndpoint, { signal: controller.signal });
      }
      if (!res.ok) return null;
      const json = (await res.json()) as { fields?: Record<string, any> };
      if (!json || !json.fields) return null;
      const parsed = parseFirestoreDocumentFields(json.fields);
      if (!parsed.id) parsed.id = eventId;
      return parsed;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  const scopedPromise =
    targetDbId && targetDbId !== GUEST_PUBLIC_SCOPE
      ? fetchDocAtPath(`user_databases/${encodeURIComponent(targetDbId)}/events/${encodeURIComponent(eventId)}`)
      : Promise.resolve(null);
  const topPromise = fetchDocAtPath(`events/${encodeURIComponent(eventId)}`);

  const [scopedDoc, topDoc] = await Promise.all([scopedPromise, topPromise]);
  const validTopDoc =
    topDoc && targetDbId && targetDbId !== GUEST_PUBLIC_SCOPE && topDoc.ownerId && topDoc.ownerId !== targetDbId
      ? null
      : topDoc;

  return pickNewestDatabaseEvent([scopedDoc, validTopDoc]);
}

export async function fetchShortLinkFromFirestoreRest(options: {
  projectId: string;
  databaseId?: string;
  code: string;
  apiKey?: string;
  timeoutMs?: number;
}): Promise<{ code: string; url: string; lang?: string; createdAt?: string } | null> {
  const { projectId, databaseId = '(default)', code, apiKey, timeoutMs = 2500 } = options;
  if (!projectId || !code || !/^[a-zA-Z0-9_-]{1,128}$/.test(code)) return null;

  const dbSegment = databaseId || '(default)';
  const keyParam = apiKey ? `?key=${encodeURIComponent(apiKey)}` : '';
  const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/${encodeURIComponent(dbSegment)}/documents/short_links/${encodeURIComponent(code)}${keyParam}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let res = await fetch(endpoint, { signal: controller.signal });
    if (!res.ok && dbSegment !== '(default)') {
      const fallbackEndpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
        projectId
      )}/databases/(default)/documents/short_links/${encodeURIComponent(code)}${keyParam}`;
      res = await fetch(fallbackEndpoint, { signal: controller.signal });
    }
    if (!res.ok) return null;
    const json = (await res.json()) as { fields?: Record<string, any> };
    if (!json || !json.fields) return null;
    const parsed = parseFirestoreDocumentFields(json.fields);
    if (typeof parsed.url === 'string' && parsed.url.trim()) {
      return {
        code: String(parsed.code || code),
        url: parsed.url.trim(),
        lang: typeof parsed.lang === 'string' ? parsed.lang : 'kh',
        createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : undefined,
      };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function saveShortLinkToFirestoreRest(options: {
  projectId: string;
  databaseId?: string;
  code: string;
  url: string;
  lang?: string;
  apiKey?: string;
  timeoutMs?: number;
}): Promise<boolean> {
  const { projectId, databaseId = '(default)', code, url, lang = 'kh', apiKey, timeoutMs = 3000 } = options;
  if (!projectId || !code || !url || !/^[a-zA-Z0-9_-]{1,128}$/.test(code)) return false;

  const dbSegment = databaseId || '(default)';
  const keyParam = apiKey ? `?key=${encodeURIComponent(apiKey)}` : '';
  const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/${encodeURIComponent(dbSegment)}/documents/short_links/${encodeURIComponent(code)}${keyParam}`;

  const payload = {
    fields: {
      code: { stringValue: code },
      url: { stringValue: url.slice(0, 2000) },
      lang: { stringValue: (lang || 'kh').slice(0, 10) },
      createdAt: { stringValue: new Date().toISOString() },
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

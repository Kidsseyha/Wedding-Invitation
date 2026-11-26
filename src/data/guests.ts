import {
  getGuestEventToken,
  getScopedGuestId,
  getUserStorageKey,
  normalizeGuestEventId,
  resolveUserScope,
} from '../lib/userScope';

export interface GuestPreset {
  id: string;
  name: string;
  category: 'family' | 'vip' | 'friends' | 'colleagues' | 'general';
  categoryLabelKh: string;
  categoryLabelEn: string;
  note?: string;
  ownerId?: string;
  eventId?: string;
  eventType?: string;
  updatedAt?: string;
}

export const DEFAULT_GUEST_PRESETS: GuestPreset[] = [
  {
    id: 'guest-1',
    name: 'ឯកឧត្តម និងលោកជំទាវ',
    category: 'vip',
    categoryLabelKh: 'ភ្ញៀវកិត្តិយសជាន់ខ្ពស់ (VIP)',
    categoryLabelEn: 'VIP Guests',
    note: 'VIP Guest of Honor',
  },
  {
    id: 'guest-2',
    name: 'លោក និងអ្នកស្រី',
    category: 'general',
    categoryLabelKh: 'ភ្ញៀវកិត្តិយសទូទៅ',
    categoryLabelEn: 'General Honored Guests',
    note: 'General Guest',
  },
  {
    id: 'guest-3',
    name: 'លោក វ៉ាន់ សុខា',
    category: 'friends',
    categoryLabelKh: 'មិត្តភក្តិ (Friends)',
    categoryLabelEn: 'Friends',
    note: 'Close Friend',
  },
  {
    id: 'guest-4',
    name: 'ក្រុមគ្រួសារ និងបងប្អូនសាច់ញាតិ',
    category: 'family',
    categoryLabelKh: 'សាច់ញាតិ (Family)',
    categoryLabelEn: 'Family & Relatives',
    note: 'Family',
  },
  {
    id: 'guest-5',
    name: 'សហការី និងមិត្តរួមការងារ',
    category: 'colleagues',
    categoryLabelKh: 'សហការី (Colleagues)',
    categoryLabelEn: 'Colleagues',
    note: 'Company / Team',
  },
];

const GUEST_STORAGE_KEY = 'wedding_saved_guest_list_v1';

function resolveOwnerId(ownerId?: string): string {
  return (ownerId && ownerId.trim()) || resolveUserScope().scopeId;
}

export function getGuestStorageKey(ownerId?: string, eventId?: string): string {
  const effectiveOwner = resolveOwnerId(ownerId);
  const eventToken = getGuestEventToken(eventId);
  return eventToken
    ? getUserStorageKey(`${GUEST_STORAGE_KEY}__${eventToken}`, effectiveOwner)
    : getUserStorageKey(GUEST_STORAGE_KEY, effectiveOwner);
}

export function getScopedDefaultGuests(
  ownerId?: string,
  eventId?: string,
  eventType?: string
): GuestPreset[] {
  const effectiveOwner = resolveOwnerId(ownerId);
  const normalizedEventId = eventId ? normalizeGuestEventId(eventId, effectiveOwner) : undefined;
  return DEFAULT_GUEST_PRESETS.map((p) => ({
    ...p,
    id: getScopedGuestId(p.id, effectiveOwner, normalizedEventId),
    ownerId: effectiveOwner,
    ...(normalizedEventId ? { eventId: normalizedEventId } : {}),
    ...(eventType ? { eventType } : {}),
  }));
}

export function getSavedGuests(ownerId?: string, eventId?: string, eventType?: string): GuestPreset[] {
  const effectiveOwner = resolveOwnerId(ownerId);
  if (typeof window === 'undefined') return getScopedDefaultGuests(effectiveOwner, eventId, eventType);
  try {
    const raw = localStorage.getItem(getGuestStorageKey(effectiveOwner, eventId));
    if (raw === null) return getScopedDefaultGuests(effectiveOwner, eventId, eventType);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (e) {
    console.error('Failed to load saved guests:', e);
  }
  return getScopedDefaultGuests(effectiveOwner, eventId, eventType);
}

export function updateGuestInList(
  id: string,
  updatedGuest: Partial<GuestPreset>,
  ownerId?: string,
  eventId?: string
): GuestPreset[] {
  const effectiveOwner = resolveOwnerId(ownerId);
  const targetEventId = eventId || updatedGuest.eventId;
  const normalizedEventId = targetEventId ? normalizeGuestEventId(targetEventId, effectiveOwner) : undefined;
  const current = getSavedGuests(effectiveOwner, normalizedEventId);
  const updated = current.map(g =>
    g.id === id
      ? {
          ...g,
          ...updatedGuest,
          ownerId: effectiveOwner,
          ...(normalizedEventId ? { eventId: normalizedEventId } : {}),
        }
      : g
  );
  try {
    localStorage.setItem(getGuestStorageKey(effectiveOwner, normalizedEventId), JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to update guest:', e);
  }
  return updated;
}

export function deleteGuestFromList(id: string, ownerId?: string, eventId?: string): GuestPreset[] {
  const effectiveOwner = resolveOwnerId(ownerId);
  const normalizedEventId = eventId ? normalizeGuestEventId(eventId, effectiveOwner) : undefined;
  const current = getSavedGuests(effectiveOwner, normalizedEventId);
  const updated = current.filter(g => g.id !== id);
  try {
    localStorage.setItem(getGuestStorageKey(effectiveOwner, normalizedEventId), JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to delete guest:', e);
  }
  return updated;
}

export function resetGuestsToDefault(
  ownerId?: string,
  eventId?: string,
  eventType?: string
): GuestPreset[] {
  const effectiveOwner = resolveOwnerId(ownerId);
  const normalizedEventId = eventId ? normalizeGuestEventId(eventId, effectiveOwner) : undefined;
  const defaults = getScopedDefaultGuests(effectiveOwner, normalizedEventId, eventType);
  try {
    localStorage.setItem(getGuestStorageKey(effectiveOwner, normalizedEventId), JSON.stringify(defaults));
  } catch (e) {
    console.error('Failed to reset guests:', e);
  }
  return defaults;
}

export function saveGuestToList(
  newGuest: Omit<GuestPreset, 'id'>,
  ownerId?: string,
  eventId?: string
): GuestPreset[] {
  const effectiveOwner = resolveOwnerId(ownerId || newGuest.ownerId);
  const targetEventId = eventId || newGuest.eventId;
  const normalizedEventId = targetEventId ? normalizeGuestEventId(targetEventId, effectiveOwner) : undefined;
  const current = getSavedGuests(effectiveOwner, normalizedEventId, newGuest.eventType);
  const exists = current.find(g => g.name.toLowerCase() === newGuest.name.trim().toLowerCase());

  let updated: GuestPreset[];
  if (exists) {
    updated = current.map(g =>
      g.id === exists.id
        ? {
            ...g,
            ...newGuest,
            ownerId: effectiveOwner,
            ...(normalizedEventId ? { eventId: normalizedEventId } : {}),
          }
        : g
    );
  } else {
    const newItem: GuestPreset = {
      ...newGuest,
      id: getScopedGuestId(`guest-${Date.now()}`, effectiveOwner, normalizedEventId),
      ownerId: effectiveOwner,
      ...(normalizedEventId ? { eventId: normalizedEventId } : {}),
    };
    updated = [newItem, ...current];
  }

  try {
    localStorage.setItem(getGuestStorageKey(effectiveOwner, normalizedEventId), JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to persist guest list:', e);
  }
  return updated;
}

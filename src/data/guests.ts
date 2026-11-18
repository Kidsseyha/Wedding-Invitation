import { getScopedGuestId, getUserStorageKey, resolveUserScope } from '../lib/userScope';

export interface GuestPreset {
  id: string;
  name: string;
  category: 'family' | 'vip' | 'friends' | 'colleagues' | 'general';
  categoryLabelKh: string;
  categoryLabelEn: string;
  note?: string;
  ownerId?: string;
  eventId?: string;
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

function getGuestStorageKey(ownerId?: string): string {
  return getUserStorageKey(GUEST_STORAGE_KEY, resolveOwnerId(ownerId));
}

export function getScopedDefaultGuests(ownerId?: string): GuestPreset[] {
  const effectiveOwner = resolveOwnerId(ownerId);
  return DEFAULT_GUEST_PRESETS.map((p) => ({
    ...p,
    id: getScopedGuestId(p.id, effectiveOwner),
    ownerId: effectiveOwner,
  }));
}

export function getSavedGuests(ownerId?: string): GuestPreset[] {
  const effectiveOwner = resolveOwnerId(ownerId);
  if (typeof window === 'undefined') return getScopedDefaultGuests(effectiveOwner);
  try {
    const raw = localStorage.getItem(getGuestStorageKey(effectiveOwner));
    if (raw === null) return getScopedDefaultGuests(effectiveOwner);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (e) {
    console.error('Failed to load saved guests:', e);
  }
  return getScopedDefaultGuests(effectiveOwner);
}

export function updateGuestInList(id: string, updatedGuest: Partial<GuestPreset>, ownerId?: string): GuestPreset[] {
  const effectiveOwner = resolveOwnerId(ownerId);
  const current = getSavedGuests(effectiveOwner);
  const updated = current.map(g => (g.id === id ? { ...g, ...updatedGuest, ownerId: effectiveOwner } : g));
  try {
    localStorage.setItem(getGuestStorageKey(effectiveOwner), JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to update guest:', e);
  }
  return updated;
}

export function deleteGuestFromList(id: string, ownerId?: string): GuestPreset[] {
  const effectiveOwner = resolveOwnerId(ownerId);
  const current = getSavedGuests(effectiveOwner);
  const updated = current.filter(g => g.id !== id);
  try {
    localStorage.setItem(getGuestStorageKey(effectiveOwner), JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to delete guest:', e);
  }
  return updated;
}

export function resetGuestsToDefault(ownerId?: string): GuestPreset[] {
  const effectiveOwner = resolveOwnerId(ownerId);
  const defaults = getScopedDefaultGuests(effectiveOwner);
  try {
    localStorage.setItem(getGuestStorageKey(effectiveOwner), JSON.stringify(defaults));
  } catch (e) {
    console.error('Failed to reset guests:', e);
  }
  return defaults;
}

export function saveGuestToList(newGuest: Omit<GuestPreset, 'id'>, ownerId?: string): GuestPreset[] {
  const effectiveOwner = resolveOwnerId(ownerId || newGuest.ownerId);
  const current = getSavedGuests(effectiveOwner);
  const exists = current.find(g => g.name.toLowerCase() === newGuest.name.trim().toLowerCase());
  
  let updated: GuestPreset[];
  if (exists) {
    updated = current.map(g => (g.id === exists.id ? { ...g, ...newGuest, ownerId: effectiveOwner } : g));
  } else {
    const newItem: GuestPreset = {
      ...newGuest,
      id: getScopedGuestId(`guest-${Date.now()}`, effectiveOwner),
      ownerId: effectiveOwner,
    };
    updated = [newItem, ...current];
  }
  
  try {
    localStorage.setItem(getGuestStorageKey(effectiveOwner), JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to persist guest list:', e);
  }
  return updated;
}

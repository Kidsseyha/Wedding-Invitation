import type { User } from 'firebase/auth';

export const GUEST_PUBLIC_SCOPE = 'guest_public';
export const DEFAULT_PRESET_EVENT_ID = 'cmgrawhnk0003le0434762j7n';

export interface UserScopeInfo {
  scopeId: string;
  ownerEmail: string;
  identifier: string;
  isAuthenticated: boolean;
}

/**
 * Deterministic short base-36 hash to prevent slug collisions
 * (e.g. "a.b@gmail.com" vs "a_b@gmail.com").
 */
function shortHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(6, '0').slice(0, 7);
}

/**
 * Converts any email, username, or Firebase UID into a Firestore-safe ID token
 * containing only `[a-zA-Z0-9_-]`.
 */
export function sanitizeScopeToken(raw: string): string {
  const normalized = (raw || '').trim().toLowerCase();
  if (!normalized) return GUEST_PUBLIC_SCOPE;

  const slug = normalized
    .replace(/@.*/, '') // keep username prefix concise while hash preserves full domain/email uniqueness
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);

  const hash = shortHash(normalized);
  return slug ? `u_${slug}_${hash}` : `u_${hash}`;
}

/**
 * Reads the currently logged-in identifier from Firebase Auth or localStorage.
 */
export function resolveUserScope(
  authUser?: Pick<User, 'uid' | 'email' | 'displayName'> | null,
  explicitIdentifier?: string | null
): UserScopeInfo {
  let storedIdentifier = '';
  let hasAdminOverride = false;

  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      storedIdentifier = (localStorage.getItem('wedding_logged_in_identifier') || '').trim();
      hasAdminOverride = localStorage.getItem('wedding_admin_override') === 'true';
    } catch {
      // ignore storage errors
    }
  }

  const email = (
    authUser?.email ||
    (explicitIdentifier && explicitIdentifier.includes('@') ? explicitIdentifier : '') ||
    (storedIdentifier.includes('@') ? storedIdentifier : '')
  )
    .trim()
    .toLowerCase();

  const rawIdentifier = (
    email ||
    authUser?.uid ||
    explicitIdentifier ||
    storedIdentifier ||
    (hasAdminOverride ? 'local_admin_default' : '')
  ).trim();

  if (!rawIdentifier) {
    return {
      scopeId: GUEST_PUBLIC_SCOPE,
      ownerEmail: '',
      identifier: '',
      isAuthenticated: false,
    };
  }

  const scopeKeySource = email || (authUser?.uid ? `uid:${authUser.uid}` : rawIdentifier.toLowerCase());

  return {
    scopeId: sanitizeScopeToken(scopeKeySource),
    ownerEmail: email,
    identifier: rawIdentifier,
    isAuthenticated: true,
  };
}

/**
 * Builds a per-user localStorage key.
 */
export function getUserStorageKey(baseKey: string, scopeId?: string | null): string {
  const effectiveScope = (scopeId && scopeId.trim()) || resolveUserScope().scopeId;
  return `${baseKey}__${effectiveScope}`;
}

/**
 * Strips any existing `u_<scope>__` prefix from an event ID so base template IDs
 * remain recognizable and never get double-prefixed.
 */
export function stripScopedEventId(eventId: string): string {
  if (!eventId) return DEFAULT_PRESET_EVENT_ID;
  const match = eventId.match(/^u_[a-z0-9_]+__(.+)$/);
  return match ? match[1] : eventId;
}

/**
 * Extracts the owner scopeId from a user-scoped event ID (`u_<scope>__<baseId>`), if present.
 */
export function extractScopeFromEventId(eventId?: string | null): string | null {
  if (!eventId) return null;
  const match = eventId.match(/^(u_[a-z0-9_]+)__.+$/);
  return match ? match[1] : null;
}

/**
 * Converts a base template/preset/custom event ID into a user-scoped Firestore-safe event ID.
 * When unauthenticated (`guest_public`), returns the clean base ID.
 */
export function getScopedEventId(baseEventId: string, scopeId?: string | null): string {
  const effectiveScope = (scopeId && scopeId.trim()) || resolveUserScope().scopeId;
  const cleanBase = stripScopedEventId(baseEventId || DEFAULT_PRESET_EVENT_ID)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 72);

  if (!effectiveScope || effectiveScope === GUEST_PUBLIC_SCOPE) {
    return cleanBase || DEFAULT_PRESET_EVENT_ID;
  }

  return `${effectiveScope}__${cleanBase || DEFAULT_PRESET_EVENT_ID}`.slice(0, 128);
}

/**
 * Converts a guest record ID into a user-scoped Firestore-safe guest document ID.
 */
export function getScopedGuestId(rawGuestId: string, scopeId?: string | null): string {
  const effectiveScope = (scopeId && scopeId.trim()) || resolveUserScope().scopeId;
  const cleanBase = (rawGuestId || `guest-${Date.now()}`)
    .replace(/^g_u_[a-z0-9_]+__/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 64);

  if (!effectiveScope || effectiveScope === GUEST_PUBLIC_SCOPE) {
    return cleanBase;
  }

  return `g_${effectiveScope}__${cleanBase}`.slice(0, 128);
}

/**
 * True if an event ID refers to one of the built-in shared global preset IDs
 * that must never be deleted or globally overwritten by individual users.
 */
export function isGlobalSharedPresetId(eventId?: string | null): boolean {
  if (!eventId) return false;
  return (
    eventId === DEFAULT_PRESET_EVENT_ID ||
    eventId.startsWith('preset-') ||
    eventId === 'engagement-event-001' ||
    eventId === 'housewarming-event-001' ||
    eventId === 'birthday-event-001' ||
    eventId === 'anniversary-event-001' ||
    eventId === 'modern-wedding-001' ||
    eventId === 'default'
  );
}

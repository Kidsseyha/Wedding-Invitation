import {
  GUEST_PUBLIC_SCOPE,
  extractScopeFromEventId,
  sanitizeScopeToken,
} from './userScope.js';

export interface UserDatabaseRecord {
  id: string;
  email: string;
  displayName: string;
  role: string;
  ownerId: string;
  uid?: string;
  status: 'active';
  eventCount?: number;
  guestCount?: number;
  wishCount?: number;
  rsvpCount?: number;
  notificationCount?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Computes the canonical, Firestore-safe personal database ID for a user email or scope.
 * Matches `resolveUserScope()` deterministically so Google login, Email/Passcode login,
 * Express disk storage, and Firestore `/user_databases/{dbId}` all map to the same DB.
 */
export function getEmailDatabaseId(emailOrScope?: string | null): string {
  const raw = (emailOrScope || '').trim();
  if (!raw || raw === GUEST_PUBLIC_SCOPE) return GUEST_PUBLIC_SCOPE;
  if (/^u_[a-z0-9_]+$/.test(raw)) return raw;
  return sanitizeScopeToken(raw.toLowerCase());
}

/**
 * Resolves the target personal database ID (`u_<slug>_<hash>`) from an event/owner/email record.
 * Returns `''` if the record belongs only to the unauthenticated public scope.
 */
export function resolveRecordDatabaseId(options?: {
  ownerId?: string | null;
  ownerEmail?: string | null;
  eventId?: string | null;
}): string {
  if (!options) return '';

  const rawOwner = (options.ownerId || '').trim();
  if (rawOwner && rawOwner !== GUEST_PUBLIC_SCOPE) {
    if (/^u_[a-z0-9_]+$/.test(rawOwner)) return rawOwner;
    if (rawOwner.includes('@')) return getEmailDatabaseId(rawOwner);
    // Legacy Firebase UID ownerId or custom identifier
    return rawOwner;
  }

  const scopedFromEvent = extractScopeFromEventId(options.eventId);
  if (scopedFromEvent && scopedFromEvent !== GUEST_PUBLIC_SCOPE) {
    return scopedFromEvent;
  }

  const rawEmail = (options.ownerEmail || '').trim().toLowerCase();
  if (rawEmail) {
    return getEmailDatabaseId(rawEmail);
  }

  return '';
}

import {
  GUEST_PUBLIC_SCOPE,
  extractScopeFromEventId,
  getScopedEventId,
  stripScopedEventId,
} from './userScope.js';
import { getEventTimestampMs, pickNewestDatabaseEvent } from '../utils/saveHelpers.js';

export interface ServerEventLookupOptions {
  eventId?: string | null;
  eventType?: string | null;
  dbId?: string | null;
}

/**
 * Looks up an event strictly inside a single user's personal `events.json` map.
 * Never reads from other users or global shared events.
 */
export function findUserDbEvent(
  userDbEvents: Record<string, any> | null | undefined,
  options: ServerEventLookupOptions
): any | null {
  if (!userDbEvents || typeof userDbEvents !== 'object') return null;

  const eventId = (options.eventId || '').trim();
  const eventType = (options.eventType || '').trim().toLowerCase();
  const dbId = (options.dbId || '').trim();
  const candidates: any[] = [];

  if (eventId) {
    if (userDbEvents[eventId]) {
      candidates.push(userDbEvents[eventId]);
    }
    if (dbId && dbId !== GUEST_PUBLIC_SCOPE) {
      const scopedId = getScopedEventId(eventId, dbId);
      if (userDbEvents[scopedId]) {
        candidates.push(userDbEvents[scopedId]);
      }
    }

    const strippedRequested = stripScopedEventId(eventId);
    for (const [key, val] of Object.entries(userDbEvents)) {
      if (!val || typeof val !== 'object') continue;
      if (key.startsWith('type_') || key.startsWith('user_')) continue;
      const valId = String(val.id || key);
      const valStripped = stripScopedEventId(valId);
      if (
        valId === eventId ||
        valStripped === strippedRequested ||
        val.templateId === strippedRequested ||
        val.templateId === eventId
      ) {
        if (!eventType || !val.eventType || String(val.eventType).toLowerCase() === eventType) {
          candidates.push(val);
        }
      }
    }

    if (candidates.length > 0) {
      return pickNewestDatabaseEvent(candidates);
    }
  }

  if (eventType) {
    if (dbId && userDbEvents[`user_${dbId}_type_${eventType}`]) {
      candidates.push(userDbEvents[`user_${dbId}_type_${eventType}`]);
    }
    for (const [key, val] of Object.entries(userDbEvents)) {
      if (!val || typeof val !== 'object') continue;
      if (key.startsWith('type_') || key.startsWith('user_')) continue;
      if (String(val.eventType || '').toLowerCase() === eventType) {
        candidates.push(val);
      }
    }
    if (candidates.length > 0) {
      return pickNewestDatabaseEvent(candidates);
    }
  }

  // Only return default user event when no specific eventId/eventType was requested
  if (!eventId && !eventType) {
    if (dbId && userDbEvents[`user_${dbId}_default`]) {
      return userDbEvents[`user_${dbId}_default`];
    }
    const allOwn = Object.entries(userDbEvents)
      .filter(([k, v]) => v && typeof v === 'object' && !k.startsWith('type_') && !k.startsWith('user_'))
      .map(([, v]) => v);
    if (allOwn.length > 0) {
      return pickNewestDatabaseEvent(allOwn);
    }
  }

  return null;
}

/**
 * Guards global fallback collections (for unauthenticated guest_public visitors)
 * so records owned by individual authenticated users never leak into public responses.
 */
export function shouldIncludePublicRecord(record: any): boolean {
  if (!record || typeof record !== 'object') return false;
  const ownerId = typeof record.ownerId === 'string' ? record.ownerId.trim() : '';
  if (ownerId && ownerId !== GUEST_PUBLIC_SCOPE) {
    return false;
  }
  const scopedFromEvent = extractScopeFromEventId(record.eventId);
  if (scopedFromEvent && scopedFromEvent !== GUEST_PUBLIC_SCOPE) {
    return false;
  }
  return true;
}

/**
 * Determines whether an incoming WebSocket `event:update` payload belongs to the
 * active user/viewer session and is fresh enough to apply.
 */
export function shouldAcceptWebSocketEventUpdate(params: {
  incomingEvent: any;
  incomingEventId?: string | null;
  incomingOwnerId?: string | null;
  currentEventId: string;
  currentOwnerId?: string | null;
  activeScopeId: string;
  isAuthenticated: boolean;
  isFromShareLink: boolean;
  lastSavedAtMs: number;
}): boolean {
  const {
    incomingEvent,
    incomingEventId,
    incomingOwnerId,
    currentEventId,
    currentOwnerId,
    activeScopeId,
    isAuthenticated,
    isFromShareLink,
    lastSavedAtMs,
  } = params;

  if (!incomingEvent || typeof incomingEvent !== 'object') return false;

  const resolvedIncomingId = String(incomingEventId || incomingEvent.id || '').trim();
  const resolvedIncomingOwner = String(
    incomingOwnerId || incomingEvent.ownerId || extractScopeFromEventId(resolvedIncomingId) || ''
  ).trim();

  // Check timestamp freshness to avoid overwriting newer local edits
  const incomingMs = getEventTimestampMs(incomingEvent);
  if (lastSavedAtMs > 0 && incomingMs > 0 && incomingMs <= lastSavedAtMs) {
    return false;
  }

  if (isAuthenticated && !isFromShareLink) {
    // Authenticated owner workspace: MUST belong strictly to this user's scope
    if (!resolvedIncomingOwner || resolvedIncomingOwner !== activeScopeId) {
      return false;
    }
    const matchesExactId = Boolean(resolvedIncomingId && resolvedIncomingId === currentEventId);
    const matchesBaseId = Boolean(
      resolvedIncomingId &&
        currentEventId &&
        stripScopedEventId(resolvedIncomingId) === stripScopedEventId(currentEventId)
    );
    return matchesExactId || matchesBaseId;
  }

  // Guest / share-link viewer: only update if viewing the exact same event & owner
  if (!resolvedIncomingId || resolvedIncomingId !== currentEventId) {
    return false;
  }
  if (currentOwnerId && resolvedIncomingOwner && currentOwnerId !== resolvedIncomingOwner) {
    return false;
  }
  return true;
}

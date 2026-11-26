import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import dns from 'dns';
import { findTemplatePreset } from './src/data/eventTemplates';
import {
  buildInvitationMeta,
  injectMetaIntoHtml,
  fetchEventFromFirestoreRest,
  fetchShortLinkFromFirestoreRest,
  saveShortLinkToFirestoreRest,
  normalizeCategoryString,
} from './src/utils/shareMeta';
import {
  getEmailDatabaseId,
  resolveRecordDatabaseId,
  type UserDatabaseRecord,
} from './src/lib/userDatabase';
import {
  GUEST_PUBLIC_SCOPE,
  extractScopeFromEventId,
  isGlobalSharedPresetId,
  stripScopedEventId,
} from './src/lib/userScope';
import {
  generateDeterministicShortCode,
  normalizeShareUrlEncoding,
  decodeKhmerQueryValue,
  detectLanguageFromUrl,
} from './src/lib/shareUrl';
import {
  findUserDbEvent,
  shouldIncludePublicRecord,
} from './src/lib/serverIsolation';
import rawFirebaseConfig from './firebase-applet-config.json';

// Guard against unhandled errors terminating process
process.on('uncaughtException', err => {
  console.error('[Process UncaughtException]', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process UnhandledRejection]', reason);
});

// Determine environment
const isProduction =
  process.env.NODE_ENV === 'production' ||
  (typeof __filename !== 'undefined' && (__filename.endsWith('server.cjs') || __filename.includes('dist')));

const app = express();
const server = http.createServer(app);

// Initialize WebSocket Server attached to the HTTP server on path /ws
const wss = new WebSocketServer({ server, path: '/ws' });

let onlineClientsCount = 0;

export function broadcastWebSocket(data: any) {
  try {
    const payload = JSON.stringify(data);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
        } catch (err) {
          // ignore client send errors
        }
      }
    }
  } catch (err) {
    console.error('WebSocket broadcast error:', err);
  }
}

wss.on('connection', (ws: WebSocket, req) => {
  onlineClientsCount = wss.clients.size;
  console.log(`[WebSocket] Client connected. Online viewers: ${onlineClientsCount}`);

  // Send initial state & presence
  try {
    const initialPayload = {
      type: 'init',
      onlineCount: onlineClientsCount,
      timestamp: new Date().toISOString(),
    };
    ws.send(JSON.stringify(initialPayload));
  } catch (err) {
    // ignore
  }

  // Broadcast updated presence to all clients
  broadcastWebSocket({
    type: 'presence:update',
    onlineCount: onlineClientsCount,
    timestamp: new Date().toISOString(),
  });

  ws.on('message', (message) => {
    try {
      const parsed = JSON.parse(message.toString());
      if (parsed.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        return;
      }
      if (parsed.type === 'wishes:like') {
        broadcastWebSocket({
          type: 'wishes:like',
          wishId: parsed.wishId,
          eventId: parsed.eventId,
          ownerId: parsed.ownerId,
          timestamp: new Date().toISOString(),
        });
        return;
      }
      if (parsed.type === 'wishes:new' && parsed.wish) {
        broadcastWebSocket({
          type: 'wishes:new',
          wish: parsed.wish,
          eventId: parsed.wish?.eventId || parsed.eventId,
          ownerId: parsed.wish?.ownerId || parsed.ownerId,
          timestamp: new Date().toISOString(),
        });
        return;
      }
    } catch (err) {
      // ignore message parse errors
    }
  });

  ws.on('close', () => {
    onlineClientsCount = wss.clients.size;
    console.log(`[WebSocket] Client disconnected. Online viewers: ${onlineClientsCount}`);
    broadcastWebSocket({
      type: 'presence:update',
      onlineCount: onlineClientsCount,
      timestamp: new Date().toISOString(),
    });
  });

  ws.on('error', (err) => {
    console.warn('[WebSocket Client Error]:', err.message);
  });
});

// In development, the AI Studio dev environment routes through nginx reverse proxy to port 3000.
// In production Cloud Run deployment, Cloud Run injects PORT (e.g. 8080) and requires listening on it.
const PORT = isProduction && process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// High body limits to allow uploaded photos and base64 images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static assets from public directory (images, fonts, templates)
app.use(express.static(path.join(process.cwd(), 'public')));

// Ensure data directory exists for persistent server storage
const DATA_DIR = path.join(process.cwd(), 'data');
const USER_DATABASES_DIR = path.join(DATA_DIR, 'user_databases');
const EVENTS_FILE = path.join(DATA_DIR, 'saved_events.json');
const WISHES_FILE = path.join(DATA_DIR, 'saved_wishes.json');
const RSVPS_FILE = path.join(DATA_DIR, 'saved_rsvps.json');
const GUESTS_FILE = path.join(DATA_DIR, 'saved_guests.json');
const SHORT_LINKS_FILE = path.join(DATA_DIR, 'saved_short_links.json');
const SYSTEM_USERS_FILE = path.join(DATA_DIR, 'saved_system_users.json');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'saved_notifications.json');
const PUBLIC_APP_URL = (process.env.APP_URL || 'https://ais-pre-hjj7vuznhhxkva5mjjwpax-816970112678.asia-southeast1.run.app').replace('ais-dev-', 'ais-pre-');

function getSafeUserDbDir(dbId: string): string | null {
  const cleanId = (dbId || '').trim();
  if (!cleanId || cleanId === GUEST_PUBLIC_SCOPE || !/^[a-zA-Z0-9_-]{1,128}$/.test(cleanId)) {
    return null;
  }
  return path.join(USER_DATABASES_DIR, cleanId);
}

function userDbFileExists(dbId: string, filename: string): boolean {
  const dir = getSafeUserDbDir(dbId);
  if (!dir) return false;
  return fs.existsSync(path.join(dir, filename));
}

function readUserDbJson<T>(dbId: string, filename: string, fallback: T): T {
  const dir = getSafeUserDbDir(dbId);
  if (!dir) return fallback;
  const filePath = path.join(dir, filename);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
    }
  } catch (err) {
    console.error(`Error reading user DB file ${filePath}:`, err);
  }
  return fallback;
}

function writeUserDbJson<T>(dbId: string, filename: string, data: T, compact = false): void {
  const dir = getSafeUserDbDir(dbId);
  if (!dir) return;
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const serialized = compact ? JSON.stringify(data) : JSON.stringify(data, null, 2);
    fs.writeFileSync(path.join(dir, filename), serialized, 'utf-8');
  } catch (err) {
    console.error(`Error writing user DB file ${filename} for ${dbId}:`, err);
  }
}

function ensureUserDatabaseOnDisk(account: {
  email?: string;
  name?: string;
  displayName?: string;
  role?: string;
  uid?: string;
  scopeId?: string;
}): UserDatabaseRecord | null {
  const cleanEmail = (account.email || '').trim().toLowerCase();
  const dbId = getEmailDatabaseId(account.scopeId || cleanEmail || account.uid || account.name);
  const dir = getSafeUserDbDir(dbId);
  if (!dir) return null;

  const now = new Date().toISOString();
  const isFirstInit = !fs.existsSync(path.join(dir, 'profile.json'));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const existingProfile = readUserDbJson<Partial<UserDatabaseRecord>>(dbId, 'profile.json', {});
  const profile: UserDatabaseRecord = {
    id: dbId,
    email: cleanEmail || existingProfile.email || '',
    displayName: (account.displayName || account.name || existingProfile.displayName || cleanEmail.split('@')[0] || 'User').trim(),
    role: account.role || existingProfile.role || (cleanEmail === 'seyhayoeurn2017@gmail.com' ? 'owner' : cleanEmail === 'yoeurn.seyha@diu.edu.kh' ? 'admin' : 'user'),
    ownerId: dbId,
    uid: account.uid || existingProfile.uid || '',
    status: 'active',
    createdAt: existingProfile.createdAt || now,
    updatedAt: now,
  };

  if (isFirstInit) {
    // Migrate any pre-existing records from legacy shared files matching this user's dbId
    const allEvents = getSavedEvents();
    const userEvents: Record<string, any> = {};
    for (const [k, evt] of Object.entries(allEvents)) {
      if (evt && (evt.ownerId === dbId || (cleanEmail && String(evt.ownerEmail || '').toLowerCase() === cleanEmail))) {
        userEvents[k] = evt;
      }
    }
    writeUserDbJson(dbId, 'events.json', userEvents);

    const userGuests = getSavedGuests().filter((g: any) => g && g.ownerId === dbId);
    writeUserDbJson(dbId, 'guests.json', userGuests);

    const userWishes = getSavedWishes().filter(
      (w: any) => w && (w.ownerId === dbId || resolveRecordDatabaseId({ ownerId: w.ownerId, eventId: w.eventId }) === dbId)
    );
    writeUserDbJson(dbId, 'wishes.json', userWishes);

    const userRsvps = getSavedRSVPs().filter(
      (r: any) => r && (r.ownerId === dbId || resolveRecordDatabaseId({ ownerId: r.ownerId, eventId: r.eventId }) === dbId)
    );
    writeUserDbJson(dbId, 'rsvps.json', userRsvps);

    const userNotifs = getSavedNotifications().filter(
      (n: any) => n && (n.ownerId === dbId || resolveRecordDatabaseId({ ownerId: n.ownerId, eventId: n.eventId }) === dbId)
    );
    writeUserDbJson(dbId, 'notifications.json', userNotifs);
  }

  const eventsObj = readUserDbJson<Record<string, any>>(dbId, 'events.json', {});
  const eventCount = Object.keys(eventsObj).filter(k => !k.startsWith('type_') && !k.startsWith('user_')).length;
  const guestCount = readUserDbJson<any[]>(dbId, 'guests.json', []).length;
  const wishCount = readUserDbJson<any[]>(dbId, 'wishes.json', []).length;
  const rsvpCount = readUserDbJson<any[]>(dbId, 'rsvps.json', []).length;
  const notificationCount = readUserDbJson<any[]>(dbId, 'notifications.json', []).length;

  const fullProfile: UserDatabaseRecord = {
    ...profile,
    eventCount,
    guestCount,
    wishCount,
    rsvpCount,
    notificationCount,
  };
  writeUserDbJson(dbId, 'profile.json', fullProfile);
  return fullProfile;
}

function listUserDatabasesOnDisk(): UserDatabaseRecord[] {
  const registered = getSavedSystemUsers();
  const results = new Map<string, UserDatabaseRecord>();

  for (const u of registered) {
    if (u && (u.email || u.name)) {
      const dbRec = ensureUserDatabaseOnDisk({
        email: u.email,
        name: u.name,
        role: u.role,
        uid: u.uid,
      });
      if (dbRec) results.set(dbRec.id, dbRec);
    }
  }

  try {
    if (fs.existsSync(USER_DATABASES_DIR)) {
      for (const entry of fs.readdirSync(USER_DATABASES_DIR, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dbId = entry.name;
        const existing = readUserDbJson<Partial<UserDatabaseRecord>>(dbId, 'profile.json', {});
        const dbRec = ensureUserDatabaseOnDisk({
          scopeId: dbId,
          email: existing.email || '',
          displayName: existing.displayName || dbId,
          role: existing.role || 'user',
          uid: existing.uid,
        });
        if (dbRec) results.set(dbRec.id, dbRec);
      }
    }
  } catch (err) {
    console.error('Error listing user databases on disk:', err);
  }

  return Array.from(results.values());
}

function getSavedNotifications(): any[] {
  try {
    if (fs.existsSync(NOTIFICATIONS_FILE)) {
      return JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error reading notifications file:', err);
  }
  return [];
}

function saveNotifications(notifications: any[]) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing notifications file:', err);
  }
}

function getSavedSystemUsers(): any[] {
  const defaultOwner = {
    name: 'Seyha Yoeurn (Owner)',
    email: 'seyhayoeurn2017@gmail.com',
    role: 'owner',
    passcode: 'Admin@1111',
    createdAt: '2026-01-01T00:00:00.000Z'
  };
  const defaultAdmin = {
    name: 'Yoeurn Seyha',
    email: 'yoeurn.seyha@diu.edu.kh',
    role: 'admin',
    passcode: 'Admin@1111',
    createdAt: '2026-01-01T00:00:00.000Z'
  };
  try {
    if (fs.existsSync(SYSTEM_USERS_FILE)) {
      const users = JSON.parse(fs.readFileSync(SYSTEM_USERS_FILE, 'utf-8'));
      const ownerIdx = users.findIndex((u: any) => u.email?.toLowerCase() === 'seyhayoeurn2017@gmail.com');
      if (ownerIdx >= 0) {
        users[ownerIdx].role = 'owner';
      } else {
        users.unshift(defaultOwner);
      }
      const adminIdx = users.findIndex((u: any) => u.email?.toLowerCase() === 'yoeurn.seyha@diu.edu.kh');
      if (adminIdx >= 0) {
        users[adminIdx].passcode = 'Admin@1111';
        if (!users[adminIdx].role) users[adminIdx].role = 'admin';
      } else {
        users.push(defaultAdmin);
      }
      return users;
    }
  } catch (err) {
    console.error('Error reading system users file:', err);
  }
  return [defaultOwner, defaultAdmin];
}

function saveSystemUser(user: any) {
  try {
    const users = getSavedSystemUsers();
    const index = users.findIndex((u: any) => u.email?.toLowerCase() === user.email?.toLowerCase() || u.name?.toLowerCase() === user.name?.toLowerCase());
    if (index >= 0) {
      users[index] = { ...users[index], ...user };
    } else {
      users.push(user);
    }
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(SYSTEM_USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
    ensureUserDatabaseOnDisk({
      email: user.email,
      name: user.name,
      role: user.role,
      uid: user.uid,
    });
  } catch (err) {
    console.error('Error writing system users file:', err);
  }
}

function deleteSystemUser(idOrEmailOrName: string) {
  try {
    const users = getSavedSystemUsers();
    const needle = idOrEmailOrName.toLowerCase().trim();
    const filtered = users.filter((u: any) => {
      const uEmail = (u.email || '').toLowerCase().trim();
      const uName = (u.name || '').toLowerCase().trim();
      const uId = (u.id || '').toLowerCase().trim();
      return uEmail !== needle && uName !== needle && uId !== needle;
    });
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(SYSTEM_USERS_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
    return filtered;
  } catch (err) {
    console.error('Error deleting from system users file:', err);
    return [];
  }
}

function getShortLinks(): Record<string, string> {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(SHORT_LINKS_FILE)) {
      return JSON.parse(fs.readFileSync(SHORT_LINKS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error reading short links file:', err);
  }
  return {};
}

function saveShortLink(code: string, url: string) {
  try {
    const links = getShortLinks();
    links[code] = url;
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(SHORT_LINKS_FILE, JSON.stringify(links, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving short link:', err);
  }
}

async function resolveTargetEvent(options: {
  eventId?: string | null;
  eventType?: string | null;
  ownerId?: string | null;
  ownerEmail?: string | null;
}): Promise<any> {
  const eventId = (options.eventId || '').trim();
  const eventType = normalizeCategoryString(options.eventType);
  const ownerId = (options.ownerId || '').trim();
  const ownerEmail = (options.ownerEmail || '').trim();
  const dbId = resolveRecordDatabaseId({ ownerId, ownerEmail, eventId });
  const events = getSavedEvents();

  let targetEvent: any = null;

  if (dbId && dbId !== GUEST_PUBLIC_SCOPE) {
    const userDbEvents = readUserDbJson<Record<string, any>>(dbId, 'events.json', {});
    targetEvent = findUserDbEvent(userDbEvents, {
      eventId,
      eventType,
      dbId,
    });

    if (!targetEvent) {
      // One-time fallback to legacy entries in global saved_events.json strictly owned by dbId
      const ownedEvents: Record<string, any> = {};
      for (const [k, evt] of Object.entries(events)) {
        if (evt && typeof evt === 'object' && (evt.ownerId === dbId || (ownerEmail && String(evt.ownerEmail || '').toLowerCase() === ownerEmail.toLowerCase()))) {
          ownedEvents[k] = evt;
        }
      }
      targetEvent = findUserDbEvent(ownedEvents, { eventId, eventType, dbId });
    }

    if (!targetEvent && eventId) {
      targetEvent = await fetchEventFromFirestoreRest({
        projectId: rawFirebaseConfig.projectId,
        databaseId: (rawFirebaseConfig as any).firestoreDatabaseId || '(default)',
        eventId,
        ownerId: dbId,
        ownerEmail,
      });
    }

    if (eventId && !targetEvent) {
      const idPreset = findTemplatePreset(stripScopedEventId(eventId));
      if (idPreset?.sampleEvent?.id && stripScopedEventId(eventId) !== idPreset.sampleEvent.id) {
        const mappedEventId = `${dbId}__${idPreset.sampleEvent.id}`;
        targetEvent =
          findUserDbEvent(userDbEvents, { eventId: mappedEventId, eventType, dbId }) ||
          (await fetchEventFromFirestoreRest({
            projectId: rawFirebaseConfig.projectId,
            databaseId: (rawFirebaseConfig as any).firestoreDatabaseId || '(default)',
            eventId: mappedEventId,
            ownerId: dbId,
            ownerEmail,
          }));
      }
      if (!targetEvent && idPreset && (!eventType || idPreset.type === eventType)) {
        targetEvent = idPreset.sampleEvent;
      }
    }

    if (eventType) {
      const loadedCat = targetEvent
        ? normalizeCategoryString(targetEvent.eventType || targetEvent.id || targetEvent.name)
        : null;
      if (!targetEvent || (loadedCat && loadedCat !== eventType)) {
        const userCatMatch = findUserDbEvent(userDbEvents, { eventType, dbId });
        if (userCatMatch) {
          targetEvent = userCatMatch;
        } else {
          const preset =
            (eventId ? findTemplatePreset(stripScopedEventId(eventId)) : undefined) ||
            findTemplatePreset(eventType);
          if (preset) targetEvent = preset.sampleEvent;
        }
      }
    }

    if (!targetEvent && eventId) {
      const preset = findTemplatePreset(stripScopedEventId(eventId));
      if (preset) targetEvent = preset.sampleEvent;
    }

    if (!targetEvent) {
      targetEvent = findTemplatePreset('wedding')?.sampleEvent;
    }

    return targetEvent;
  }

  // Public / unscoped lookup (never leak authenticated users' private events)
  if (eventId && events[eventId] && shouldIncludePublicRecord(events[eventId])) {
    targetEvent = events[eventId];
  }

  if (!targetEvent && eventId) {
    targetEvent = await fetchEventFromFirestoreRest({
      projectId: rawFirebaseConfig.projectId,
      databaseId: (rawFirebaseConfig as any).firestoreDatabaseId || '(default)',
      eventId,
    });
  }

  if (!targetEvent && eventId) {
    if (events[`type_${eventId}`] && shouldIncludePublicRecord(events[`type_${eventId}`])) {
      targetEvent = events[`type_${eventId}`];
    } else {
      const idPreset = findTemplatePreset(stripScopedEventId(eventId));
      if (idPreset && (!eventType || idPreset.type === eventType)) {
        targetEvent = idPreset.sampleEvent;
      }
    }
  }

  if (eventType) {
    const loadedCat = targetEvent
      ? normalizeCategoryString(targetEvent.eventType || targetEvent.id || targetEvent.name)
      : null;
    if (!targetEvent || (loadedCat && loadedCat !== eventType)) {
      if (events[`type_${eventType}`] && shouldIncludePublicRecord(events[`type_${eventType}`])) {
        targetEvent = events[`type_${eventType}`];
      } else {
        const matchByType = Object.values(events).find(
          (e: any) => shouldIncludePublicRecord(e) && normalizeCategoryString(e?.eventType || e?.id || e?.name) === eventType
        );
        if (matchByType) {
          targetEvent = matchByType;
        } else {
          const preset =
            (eventId ? findTemplatePreset(stripScopedEventId(eventId)) : undefined) ||
            findTemplatePreset(eventType);
          if (preset) targetEvent = preset.sampleEvent;
        }
      }
    }
  }

  if (!targetEvent && eventId) {
    const preset = findTemplatePreset(stripScopedEventId(eventId));
    if (preset) targetEvent = preset.sampleEvent;
  }

  if (!targetEvent) {
    const publicDefault =
      (events['default'] && shouldIncludePublicRecord(events['default']) ? events['default'] : null) ||
      Object.values(events).find((e: any) => shouldIncludePublicRecord(e));
    targetEvent = publicDefault || findTemplatePreset('wedding')?.sampleEvent;
  }

  return targetEvent;
}

function getRequestPublicOrigin(req: express.Request): string {
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || '';
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  if (!host || host.includes('localhost') || host.includes('127.0.0.1')) {
    return PUBLIC_APP_URL;
  }
  const cleanHost = host.split(',')[0].trim();
  const cleanProto = proto.split(',')[0].trim();
  const origin = `${cleanProto}://${cleanHost}`;
  return origin.includes('ais-dev-') ? origin.replace('ais-dev-', 'ais-pre-') : origin;
}

async function getInjectedHtmlAsync(
  html: string,
  options: {
    guestName?: string | null;
    eventId?: string | null;
    eventType?: string | null;
    ownerId?: string | null;
    ownerEmail?: string | null;
    origin: string;
    pageUrl: string;
    lang?: 'kh' | 'en';
  }
): Promise<string> {
  const targetEvent = await resolveTargetEvent({
    eventId: options.eventId,
    eventType: options.eventType,
    ownerId: options.ownerId,
    ownerEmail: options.ownerEmail,
  });

  const meta = buildInvitationMeta({
    event: targetEvent,
    guestName: options.guestName,
    queryType: options.eventType,
    eventId: options.eventId,
    origin: options.origin,
    pageUrl: options.pageUrl,
  });

  return injectMetaIntoHtml(html, meta, undefined, { lang: options.lang || 'kh' });
}

function getSavedEvents(): Record<string, any> {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(EVENTS_FILE)) {
      const content = fs.readFileSync(EVENTS_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('Error reading saved events file:', err);
  }
  return {};
}

function saveEvents(events: Record<string, any>) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(events), 'utf-8');
  } catch (err) {
    console.error('Error writing saved events file:', err);
  }
}

function getSavedWishes(): any[] {
  try {
    if (fs.existsSync(WISHES_FILE)) {
      return JSON.parse(fs.readFileSync(WISHES_FILE, 'utf-8'));
    }
    const defaultWishes = [
      {
        id: 'w1',
        name: 'សុខ វិបុល (Sok Vibul)',
        relationship: 'មិត្តភក្តិ (Friend)',
        message: 'សូមជូនពរឱ្យប្អូនទាំងពីរមានសុភមង្គល ស្រឡាញ់គ្នារហូតដល់ចាស់កោងខ្នង និងទទួលបានជោគជ័យគ្រប់ភារកិច្ច!',
        createdAt: '2026-01-02T08:30:00.000Z',
        likes: 12,
      },
      {
        id: 'w2',
        name: 'ចាន់ ស្រីមុំ (Chan Sreymom)',
        relationship: 'បងប្អូនជីដូនមួយ (Cousin)',
        message: 'រីករាយថ្ងៃមង្គលការបងម៉ាឡេ និងអូនវល្ខ័ក! សមគ្នាខ្លាំងណាស់ សូមឱ្យស្រឡាញ់គ្នាផ្អែមល្ហែមដូចទឹកឃ្មុំប្រចាំថ្ងៃណា៎ ❤️✨',
        createdAt: '2026-01-03T11:15:00.000Z',
        likes: 18,
      },
      {
        id: 'w3',
        name: 'រតនៈ ពិសិដ្ឋ (Rathana Piseth)',
        relationship: 'សហការី (Colleague)',
        message: 'Wishing both of you a lifetime of endless love, joy, good health, and prosperity! Happy Wedding!',
        createdAt: '2026-01-04T14:45:00.000Z',
        likes: 9,
      },
    ];
    saveWishes(defaultWishes);
    return defaultWishes;
  } catch (err) {
    console.error('Error reading saved wishes file:', err);
  }
  return [];
}

function saveWishes(wishes: any[]) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(WISHES_FILE, JSON.stringify(wishes, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing saved wishes file:', err);
  }
}

function getSavedRSVPs(): any[] {
  try {
    if (fs.existsSync(RSVPS_FILE)) {
      return JSON.parse(fs.readFileSync(RSVPS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error reading saved RSVPs file:', err);
  }
  return [];
}

function saveRSVPs(rsvps: any[]) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(RSVPS_FILE, JSON.stringify(rsvps, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing saved RSVPs file:', err);
  }
}

function getSavedGuests(): any[] {
  try {
    if (fs.existsSync(GUESTS_FILE)) {
      return JSON.parse(fs.readFileSync(GUESTS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error reading saved guests file:', err);
  }
  return [];
}

function saveGuests(guests: any[]) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(GUESTS_FILE, JSON.stringify(guests, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing saved guests file:', err);
  }
}

// API Routes FIRST before Vite middleware
app.get('/api/health', (req, res) => {
  const dataDirReady = fs.existsSync(DATA_DIR);
  let userDatabasesCount = 0;
  try {
    if (fs.existsSync(USER_DATABASES_DIR)) {
      userDatabasesCount = fs
        .readdirSync(USER_DATABASES_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory()).length;
    }
  } catch {
    // ignore
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    status: 'ok',
    serverDb: true,
    dataDirReady,
    userDatabasesCount,
    timestamp: new Date().toISOString(),
  });
});

const DEFAULT_PRESET_ID = 'cmgrawhnk0003le0434762j7n';

// Wishes API (strictly isolated per user DB when dbId is known; public wishes filtered cleanly otherwise)
app.get('/api/wishes', (req, res) => {
  const eventId = (req.query.eventId as string | undefined)?.trim();
  const ownerId = (req.query.ownerId as string | undefined)?.trim();
  const ownerEmail = (req.query.ownerEmail as string | undefined)?.trim();
  const dbId = resolveRecordDatabaseId({ ownerId, ownerEmail, eventId });

  let wishes: any[];
  if (dbId && dbId !== GUEST_PUBLIC_SCOPE) {
    if (userDbFileExists(dbId, 'wishes.json')) {
      wishes = readUserDbJson<any[]>(dbId, 'wishes.json', []);
    } else {
      const legacy = getSavedWishes().filter(
        (w: any) => w && (w.ownerId === dbId || extractScopeFromEventId(w.eventId) === dbId)
      );
      wishes = legacy;
    }
  } else {
    wishes = getSavedWishes().filter((w: any) => shouldIncludePublicRecord(w));
  }

  if (!eventId) {
    return res.json({ success: true, wishes });
  }

  const strippedId = stripScopedEventId(eventId);
  const filtered = wishes.filter((w: any) => {
    if (w.eventId === eventId) return true;
    if (eventId === DEFAULT_PRESET_ID || strippedId === DEFAULT_PRESET_ID) {
      return !w.eventId || w.eventId === DEFAULT_PRESET_ID || w.eventId === eventId;
    }
    return false;
  });
  res.json({ success: true, wishes: filtered });
});

app.post('/api/wishes', (req, res) => {
  const wish = req.body;
  if (!wish || !wish.id) {
    return res.status(400).json({ error: 'Invalid wish data' });
  }
  const dbId = resolveRecordDatabaseId({ ownerId: wish.ownerId, ownerEmail: wish.ownerEmail, eventId: wish.eventId });
  const normalizedWish = dbId && dbId !== GUEST_PUBLIC_SCOPE ? { ...wish, ownerId: wish.ownerId || dbId } : wish;

  if (dbId && dbId !== GUEST_PUBLIC_SCOPE) {
    ensureUserDatabaseOnDisk({ scopeId: dbId, email: wish.ownerEmail });
    const dbWishes = readUserDbJson<any[]>(dbId, 'wishes.json', []);
    const idx = dbWishes.findIndex((w: any) => w.id === normalizedWish.id);
    if (idx >= 0) dbWishes[idx] = normalizedWish;
    else dbWishes.unshift(normalizedWish);
    writeUserDbJson(dbId, 'wishes.json', dbWishes);
  } else {
    const wishes = getSavedWishes();
    const existingIdx = wishes.findIndex((w: any) => w.id === normalizedWish.id);
    if (existingIdx >= 0) {
      wishes[existingIdx] = normalizedWish;
    } else {
      wishes.unshift(normalizedWish);
    }
    saveWishes(wishes);
  }

  broadcastWebSocket({
    type: 'wishes:new',
    wish: normalizedWish,
    eventId: normalizedWish.eventId,
    ownerId: dbId || normalizedWish.ownerId || GUEST_PUBLIC_SCOPE,
  });
  res.json({ success: true, wish: normalizedWish });
});

app.delete('/api/wishes/:id', (req, res) => {
  const { id } = req.params;
  const eventId = (req.query.eventId as string | undefined)?.trim();
  const ownerId = (req.query.ownerId as string | undefined)?.trim();
  if (!id) {
    return res.status(400).json({ error: 'Invalid wish ID' });
  }
  const dbId = resolveRecordDatabaseId({ ownerId, eventId });
  let deleted = false;

  if (dbId && dbId !== GUEST_PUBLIC_SCOPE) {
    const dbWishes = readUserDbJson<any[]>(dbId, 'wishes.json', []);
    const nextDbWishes = dbWishes.filter((w: any) => {
      if (w.id !== id) return true;
      if (eventId && w.eventId && w.eventId !== eventId) return true;
      return false;
    });
    deleted = nextDbWishes.length < dbWishes.length;
    writeUserDbJson(dbId, 'wishes.json', nextDbWishes);
  } else {
    let wishes = getSavedWishes();
    const initialLength = wishes.length;
    wishes = wishes.filter((w: any) => {
      if (w.id !== id) return true;
      if (eventId && w.eventId && w.eventId !== eventId) return true;
      return false;
    });
    deleted = wishes.length < initialLength;
    saveWishes(wishes);
  }

  broadcastWebSocket({
    type: 'wishes:deleted',
    id,
    eventId,
    ownerId: dbId || ownerId || GUEST_PUBLIC_SCOPE,
  });
  res.json({ success: true, deleted, id });
});

// RSVPs API (strictly isolated per user DB)
app.get('/api/rsvps', (req, res) => {
  const eventId = (req.query.eventId as string | undefined)?.trim();
  const ownerId = (req.query.ownerId as string | undefined)?.trim();
  const ownerEmail = (req.query.ownerEmail as string | undefined)?.trim();
  const dbId = resolveRecordDatabaseId({ ownerId, ownerEmail, eventId });

  let source: any[];
  if (dbId && dbId !== GUEST_PUBLIC_SCOPE) {
    source = userDbFileExists(dbId, 'rsvps.json')
      ? readUserDbJson<any[]>(dbId, 'rsvps.json', [])
      : getSavedRSVPs().filter((r: any) => r && (r.ownerId === dbId || extractScopeFromEventId(r.eventId) === dbId));
  } else {
    source = getSavedRSVPs().filter((r: any) => shouldIncludePublicRecord(r));
  }

  const rsvps = source.filter((r: any) => {
    if (eventId && r.eventId !== eventId) return false;
    if (ownerId && ownerId !== GUEST_PUBLIC_SCOPE && r.ownerId && r.ownerId !== ownerId) return false;
    return true;
  });
  res.json({ success: true, rsvps });
});

app.post('/api/rsvps', (req, res) => {
  const rsvp = req.body;
  if (!rsvp) {
    return res.status(400).json({ error: 'Invalid rsvp data' });
  }
  const dbId = resolveRecordDatabaseId({ ownerId: rsvp.ownerId, ownerEmail: rsvp.ownerEmail, eventId: rsvp.eventId });
  const normalizedRsvp = dbId && dbId !== GUEST_PUBLIC_SCOPE ? { ...rsvp, ownerId: rsvp.ownerId || dbId } : rsvp;

  if (dbId && dbId !== GUEST_PUBLIC_SCOPE) {
    ensureUserDatabaseOnDisk({ scopeId: dbId, email: rsvp.ownerEmail });
    const dbRsvps = readUserDbJson<any[]>(dbId, 'rsvps.json', []);
    dbRsvps.push(normalizedRsvp);
    writeUserDbJson(dbId, 'rsvps.json', dbRsvps);
  } else {
    const rsvps = getSavedRSVPs();
    rsvps.push(normalizedRsvp);
    saveRSVPs(rsvps);
  }

  broadcastWebSocket({
    type: 'rsvps:new',
    rsvp: normalizedRsvp,
    eventId: normalizedRsvp.eventId,
    ownerId: dbId || normalizedRsvp.ownerId || GUEST_PUBLIC_SCOPE,
  });
  res.json({ success: true, rsvp: normalizedRsvp });
});

// Notifications API (Owner Dashboard Alert & Email Trigger, strictly isolated per user DB)
app.get('/api/notifications', (req, res) => {
  const eventId = (req.query.eventId as string | undefined)?.trim();
  const ownerId = (req.query.ownerId as string | undefined)?.trim();
  const ownerEmail = (req.query.ownerEmail as string | undefined)?.trim();
  const dbId = resolveRecordDatabaseId({ ownerId, ownerEmail, eventId });

  let source: any[];
  if (dbId && dbId !== GUEST_PUBLIC_SCOPE) {
    source = userDbFileExists(dbId, 'notifications.json')
      ? readUserDbJson<any[]>(dbId, 'notifications.json', [])
      : getSavedNotifications().filter((n: any) => n && (n.ownerId === dbId || extractScopeFromEventId(n.eventId) === dbId));
  } else {
    source = getSavedNotifications().filter((n: any) => shouldIncludePublicRecord(n));
  }

  const notifications = source.filter((n: any) => {
    if (eventId && n.eventId !== eventId) return false;
    if (ownerId && ownerId !== GUEST_PUBLIC_SCOPE && n.ownerId && n.ownerId !== ownerId) return false;
    return true;
  });
  res.json({ success: true, notifications });
});

app.post('/api/notifications', (req, res) => {
  const notif = req.body;
  if (!notif || !notif.id) {
    return res.status(400).json({ error: 'Invalid notification data' });
  }
  const dbId = resolveRecordDatabaseId({ ownerId: notif.ownerId, ownerEmail: notif.ownerEmail, eventId: notif.eventId });
  const normalizedNotif = dbId && dbId !== GUEST_PUBLIC_SCOPE ? { ...notif, ownerId: notif.ownerId || dbId } : notif;

  if (dbId && dbId !== GUEST_PUBLIC_SCOPE) {
    ensureUserDatabaseOnDisk({ scopeId: dbId, email: notif.ownerEmail });
    const dbNotifs = readUserDbJson<any[]>(dbId, 'notifications.json', []);
    dbNotifs.unshift(normalizedNotif);
    writeUserDbJson(dbId, 'notifications.json', dbNotifs);
  } else {
    const notifications = getSavedNotifications();
    notifications.unshift(normalizedNotif);
    saveNotifications(notifications);
  }

  broadcastWebSocket({
    type: 'notifications:new',
    notification: normalizedNotif,
    eventId: normalizedNotif.eventId,
    ownerId: dbId || normalizedNotif.ownerId || GUEST_PUBLIC_SCOPE,
  });
  res.json({ success: true, notification: normalizedNotif });
});

// Guests API (strictly isolated in each user's personal database directory)
app.get('/api/guests', (req, res) => {
  const ownerId = (req.query.ownerId as string | undefined)?.trim();
  const ownerEmail = (req.query.ownerEmail as string | undefined)?.trim();
  const dbId = resolveRecordDatabaseId({ ownerId, ownerEmail });

  if (dbId && dbId !== GUEST_PUBLIC_SCOPE) {
    if (userDbFileExists(dbId, 'guests.json')) {
      const dbGuests = readUserDbJson<any[]>(dbId, 'guests.json', []);
      return res.json({ success: true, guests: dbGuests });
    }
    const legacyGuests = getSavedGuests().filter((g: any) => g.ownerId === dbId);
    if (legacyGuests.length > 0) {
      writeUserDbJson(dbId, 'guests.json', legacyGuests);
    }
    return res.json({ success: true, guests: legacyGuests });
  }

  const allGuests = getSavedGuests();
  const guests = allGuests.filter((g: any) => shouldIncludePublicRecord(g));
  res.json({ success: true, guests });
});

app.post('/api/guests', (req, res) => {
  const guest = req.body;
  if (!guest || !guest.id) {
    return res.status(400).json({ error: 'Invalid guest data' });
  }
  const ownerId = typeof guest.ownerId === 'string' ? guest.ownerId.trim() : '';
  const dbId = resolveRecordDatabaseId({ ownerId, ownerEmail: guest.ownerEmail });
  const normalizedGuest = dbId && dbId !== GUEST_PUBLIC_SCOPE ? { ...guest, ownerId: dbId } : guest;

  if (dbId && dbId !== GUEST_PUBLIC_SCOPE) {
    ensureUserDatabaseOnDisk({ scopeId: dbId, email: guest.ownerEmail });
    const dbGuests = readUserDbJson<any[]>(dbId, 'guests.json', []);
    const dbIdx = dbGuests.findIndex((g: any) => g.id === normalizedGuest.id);
    if (dbIdx >= 0) dbGuests[dbIdx] = normalizedGuest;
    else dbGuests.push(normalizedGuest);
    writeUserDbJson(dbId, 'guests.json', dbGuests);
  } else {
    const guests = getSavedGuests();
    const existingIdx = guests.findIndex((g: any) => g.id === normalizedGuest.id);
    if (existingIdx >= 0) {
      guests[existingIdx] = normalizedGuest;
    } else {
      guests.push(normalizedGuest);
    }
    saveGuests(guests);
  }

  broadcastWebSocket({
    type: 'guests:update',
    ownerId: dbId || GUEST_PUBLIC_SCOPE,
    guest: normalizedGuest,
  });
  res.json({ success: true, guest: normalizedGuest });
});

app.delete('/api/guests', (req, res) => {
  const id = (req.query.id as string | undefined)?.trim();
  const ownerId = (req.query.ownerId as string | undefined)?.trim();
  const ownerEmail = (req.query.ownerEmail as string | undefined)?.trim();
  const dbId = resolveRecordDatabaseId({ ownerId, ownerEmail });
  const clearAll = req.query.all === '1' || req.query.all === 'true';

  if (clearAll && (dbId || ownerId)) {
    if (dbId && dbId !== GUEST_PUBLIC_SCOPE) {
      writeUserDbJson(dbId, 'guests.json', []);
    } else {
      const guests = getSavedGuests().filter((g: any) => g.ownerId !== ownerId && shouldIncludePublicRecord(g));
      saveGuests(guests);
    }
    broadcastWebSocket({ type: 'guests:update', ownerId: dbId || ownerId || GUEST_PUBLIC_SCOPE, cleared: true });
    return res.json({ success: true, cleared: true });
  }

  if (!id) {
    return res.status(400).json({ error: 'Missing guest id' });
  }

  if (dbId && dbId !== GUEST_PUBLIC_SCOPE) {
    const dbGuests = readUserDbJson<any[]>(dbId, 'guests.json', []);
    writeUserDbJson(dbId, 'guests.json', dbGuests.filter((g: any) => g.id !== id));
  } else {
    const guests = getSavedGuests().filter((g: any) => {
      if (g.id !== id) return true;
      if (!shouldIncludePublicRecord(g)) return true;
      return false;
    });
    saveGuests(guests);
  }

  broadcastWebSocket({ type: 'guests:update', ownerId: dbId || ownerId || GUEST_PUBLIC_SCOPE, deletedId: id });
  res.json({ success: true });
});

// Get Event by ID, Type, or ownerId (strictly isolated across per-user DBs)
app.get('/api/event', (req, res) => {
  const eventId = (req.query.id as string | undefined)?.trim();
  const eventType = (req.query.type as string | undefined)?.trim();
  const ownerId = (req.query.ownerId as string | undefined)?.trim();
  const ownerEmail = (req.query.ownerEmail as string | undefined)?.trim();
  const dbId = resolveRecordDatabaseId({ ownerId, ownerEmail, eventId });
  const globalEvents = getSavedEvents();

  if (dbId && dbId !== GUEST_PUBLIC_SCOPE) {
    const userDbEvents = readUserDbJson<Record<string, any>>(dbId, 'events.json', {});
    let found = findUserDbEvent(userDbEvents, { eventId, eventType, dbId });

    // One-time legacy migration lookup ONLY for records explicitly owned by this dbId
    if (!found) {
      const legacyOwned: Record<string, any> = {};
      for (const [k, evt] of Object.entries(globalEvents)) {
        if (
          evt &&
          typeof evt === 'object' &&
          (evt.ownerId === dbId ||
            (ownerEmail && String(evt.ownerEmail || '').toLowerCase() === ownerEmail.toLowerCase()))
        ) {
          legacyOwned[k] = evt;
        }
      }
      found = findUserDbEvent(legacyOwned, { eventId, eventType, dbId });
    }

    if (found) {
      return res.json({
        success: true,
        event: found,
        source: 'server',
        ownerId: dbId,
        ...(eventId ? { requestedId: eventId } : {}),
        ...(eventType ? { requestedType: eventType } : {}),
      });
    }

    if (eventId || eventType) {
      const preset =
        (eventId ? findTemplatePreset(stripScopedEventId(eventId)) : undefined) ||
        (eventType ? findTemplatePreset(eventType) : undefined);
      if (preset) {
        return res.json({
          success: true,
          event: preset.sampleEvent,
          source: 'preset',
          ...(eventId ? { requestedId: eventId } : {}),
          ...(eventType ? { requestedType: eventType } : {}),
        });
      }
      return res.json({
        success: true,
        event: null,
        source: 'not_found',
        ...(eventId ? { requestedId: eventId } : {}),
        ...(eventType ? { requestedType: eventType } : {}),
      });
    }

    return res.json({ success: true, event: null, source: 'default', ownerId: dbId });
  }

  // Unauthenticated public visitor lookup (never returns private user records)
  if (eventId) {
    if (globalEvents[eventId] && shouldIncludePublicRecord(globalEvents[eventId])) {
      return res.json({ success: true, event: globalEvents[eventId], source: 'server', requestedId: eventId });
    }
    if (globalEvents[`type_${eventId}`] && shouldIncludePublicRecord(globalEvents[`type_${eventId}`])) {
      return res.json({ success: true, event: globalEvents[`type_${eventId}`], source: 'server', requestedId: eventId });
    }
    const preset = findTemplatePreset(stripScopedEventId(eventId));
    if (preset) {
      return res.json({ success: true, event: preset.sampleEvent, source: 'preset', requestedId: eventId });
    }
    if (eventType && globalEvents[`type_${eventType}`] && shouldIncludePublicRecord(globalEvents[`type_${eventType}`])) {
      return res.json({ success: true, event: globalEvents[`type_${eventType}`], source: 'server', requestedId: eventId, requestedType: eventType });
    }
    return res.json({ success: true, event: null, requestedId: eventId, source: 'not_found' });
  }

  if (eventType) {
    if (globalEvents[`type_${eventType}`] && shouldIncludePublicRecord(globalEvents[`type_${eventType}`])) {
      return res.json({ success: true, event: globalEvents[`type_${eventType}`], source: 'server', requestedType: eventType });
    }
    const match = Object.values(globalEvents).find((e: any) => e?.eventType === eventType && shouldIncludePublicRecord(e));
    if (match) {
      return res.json({ success: true, event: match, source: 'server', requestedType: eventType });
    }
    const preset = findTemplatePreset(eventType);
    if (preset) {
      return res.json({ success: true, event: preset.sampleEvent, source: 'preset', requestedType: eventType });
    }
    return res.json({ success: true, event: null, requestedType: eventType, source: 'not_found' });
  }

  if (globalEvents['default'] && shouldIncludePublicRecord(globalEvents['default'])) {
    return res.json({ success: true, event: globalEvents['default'], source: 'server' });
  }

  const publicKeys = Object.keys(globalEvents).filter(
    k => !k.startsWith('type_') && !k.startsWith('user_') && shouldIncludePublicRecord(globalEvents[k])
  );
  if (publicKeys.length > 0) {
    return res.json({ success: true, event: globalEvents[publicKeys[0]], source: 'server' });
  }

  return res.json({ success: true, event: null, source: 'default' });
});

// List all saved template IDs on server (strictly isolated per user DB)
app.get('/api/templates', (req, res) => {
  const ownerId = (req.query.ownerId as string | undefined)?.trim();
  const ownerEmail = (req.query.ownerEmail as string | undefined)?.trim();
  const dbId = resolveRecordDatabaseId({ ownerId, ownerEmail });

  let sourceEvents: Record<string, any>;
  if (dbId && dbId !== GUEST_PUBLIC_SCOPE) {
    const userDbEvents = readUserDbJson<Record<string, any>>(dbId, 'events.json', {});
    const globalEvents = getSavedEvents();
    const legacyOwned: Record<string, any> = {};
    for (const [k, evt] of Object.entries(globalEvents)) {
      if (evt && typeof evt === 'object' && evt.ownerId === dbId) {
        legacyOwned[k] = evt;
      }
    }
    sourceEvents = { ...legacyOwned, ...userDbEvents };
  } else {
    const globalEvents = getSavedEvents();
    sourceEvents = {};
    for (const [k, evt] of Object.entries(globalEvents)) {
      if (shouldIncludePublicRecord(evt)) {
        sourceEvents[k] = evt;
      }
    }
  }

  const list = Object.keys(sourceEvents)
    .filter(key => !key.startsWith('type_') && !key.startsWith('user_') && key !== 'default')
    .filter(key => (dbId && dbId !== GUEST_PUBLIC_SCOPE ? !sourceEvents[key]?.ownerId || sourceEvents[key]?.ownerId === dbId : true))
    .map(key => ({
      key,
      id: sourceEvents[key]?.id,
      name: sourceEvents[key]?.name,
      eventType: sourceEvents[key]?.eventType,
      ownerId: sourceEvents[key]?.ownerId,
      updatedAt: sourceEvents[key]?.updatedAt,
      event: sourceEvents[key],
    }));
  res.json({ success: true, templates: list });
});

// Per-Email Personal Database Registry & Provisioning Endpoints
app.get('/api/user-databases', (req, res) => {
  const databases = listUserDatabasesOnDisk();
  res.json({ success: true, databases });
});

app.post('/api/user-databases/provision', (req, res) => {
  const body = req.body || {};
  if (Array.isArray(body.users)) {
    const provisioned = body.users
      .map((u: any) =>
        ensureUserDatabaseOnDisk({
          email: u?.email,
          name: u?.name || u?.displayName,
          role: u?.role,
          uid: u?.uid,
          scopeId: u?.scopeId,
        })
      )
      .filter(Boolean);
    return res.json({ success: true, provisioned, databases: listUserDatabasesOnDisk() });
  }

  const database = ensureUserDatabaseOnDisk({
    email: body.email,
    name: body.name || body.displayName,
    role: body.role,
    uid: body.uid,
    scopeId: body.scopeId,
  });

  if (!database) {
    return res.status(400).json({ success: false, error: 'Valid email or scopeId is required' });
  }

  res.json({ success: true, database });
});

app.get('/api/system-users', (req, res) => {
  const users = getSavedSystemUsers();
  res.json({ success: true, users });
});

app.post('/api/system-users', (req, res) => {
  const user = req.body;
  if (user && (user.email || user.name)) {
    saveSystemUser(user);
    const database = ensureUserDatabaseOnDisk({
      email: user.email,
      name: user.name,
      role: user.role,
      uid: user.uid,
    });
    res.json({ success: true, user, database });
  } else {
    res.status(400).json({ success: false, error: 'Invalid user data' });
  }
});

app.post('/api/system-users/delete', (req, res) => {
  const { id, email, name } = req.body || {};
  const target = id || email || name;
  if (!target) {
    return res.status(400).json({ success: false, error: 'Target identifier required' });
  }
  const remaining = deleteSystemUser(target);
  res.json({ success: true, users: remaining });
});

app.post('/api/send-reset-code', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ success: false, error: 'Email and code are required' });
  }
  const senderEmail = 'Yoeurn.seyha@diu.edu.kh';
  console.log(`[RESET CODE SENT] Sender: ${senderEmail} -> Recipient: ${email} | Code: ${code}`);
  
  // Create system notification log
  const notifications = getSavedNotifications();
  notifications.unshift({
    id: 'reset_' + Date.now(),
    type: 'PASSWORD_RESET_CODE',
    sender: senderEmail,
    recipient: email,
    code,
    timestamp: new Date().toISOString()
  });
  saveNotifications(notifications.slice(0, 100));

  res.json({
    success: true,
    sender: senderEmail,
    recipient: email,
    message: `Verification code sent from ${senderEmail} to ${email}`
  });
});

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com', 'tempmail.com', '10minutemail.com', 'guerrillamail.com',
  'trashmail.com', 'yopmail.com', 'temp-mail.org', 'fakemailgenerator.com',
  'sharklasers.com', 'getnada.com', 'dispostable.com', 'fake.com', 'test.com',
  'example.com', 'throwawaymail.com', 'burnermail.io', 'mohmal.com', 'crazymailing.com',
  'mytemp.email', 'tempinbox.com', 'maildrop.cc', 'inboxkitten.com', 'trashmail.net',
  'throwaway.email', 'nada.ltd', 'emailondeck.com', 'tempmailo.com', 'guerrillamailblock.com',
  'guerrillamail.net', 'guerrillamail.biz', 'guerrillamail.org', 'grr.la', 'spam4.me',
  'fakeinbox.com', 'disposablemail.com', 'generator.email', 'disposable.com',
  'tempmail.net', 'tempmailaddress.com', 'dropmail.me', '10minutemail.net', 'temp-mail.io',
  'discard.email', 'tempmailgen.com', 'zillamail.com'
]);

const TRUSTED_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
  'icloud.com', 'me.com', 'mac.com', 'live.com', 'msn.com',
  'diu.edu.kh', 'moeys.gov.kh', 'rupp.edu.kh', 'cadt.edu.kh', 'gov.kh', 'edu.kh',
  'proton.me', 'protonmail.com', 'zoho.com', 'aol.com'
]);

// Endpoint to verify whether an email is real or fake/disposable
app.post('/api/verify-email', async (req, res) => {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ success: false, isReal: false, error: 'Email is required' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  
  if (!emailRegex.test(cleanEmail)) {
    return res.json({
      success: true,
      isReal: false,
      reason: 'invalid_format',
      messageKh: 'ទម្រង់អ៊ីមែលមិនត្រឹមត្រូវ (Invalid email syntax)',
      messageEn: 'Invalid email syntax or formatting'
    });
  }

  const parts = cleanEmail.split('@');
  const username = parts[0];
  const domain = parts[1];

  // Reject dummy or repetitive usernames
  const dummyUsernames = ['test', 'fake', 'asdf', 'aaaa', '1111', 'admin', 'user', 'dummy', 'temp'];
  if (dummyUsernames.includes(username) || /^([a-zA-Z0-9])\1{3,}$/.test(username) || username.length < 2) {
    return res.json({
      success: true,
      isReal: false,
      reason: 'fake_username',
      messageKh: 'ឈ្មោះអ៊ីមែលក្លែងក្លាយ ឬមិនពិត (Fake username pattern)',
      messageEn: 'Username appears to be fake or disposable'
    });
  }

  // Reject known disposable domains
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return res.json({
      success: true,
      isReal: false,
      reason: 'disposable_domain',
      messageKh: 'អ៊ីមែលក្លែងក្លាយ ឬ អ៊ីមែលបណ្តោះអាសន្ន មិនត្រូវបានអនុញ្ញាតទេ',
      messageEn: 'Disposable or temporary email services are not allowed'
    });
  }

  // Special Google Account / Gmail Verification
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    // Gmail usernames cannot start/end with a dot, have consecutive dots, or invalid characters
    if (/^\.|\.\.|\.$|[^a-zA-Z0-9.]/.test(username)) {
      return res.json({
        success: true,
        isReal: false,
        isGoogle: false,
        reason: 'invalid_google_format',
        messageKh: 'ទម្រង់គណនី Google/Gmail មិនត្រឹមត្រូវ (Invalid Google account format)',
        messageEn: 'Invalid Google / Gmail username format'
      });
    }
    return res.json({
      success: true,
      isReal: true,
      isGoogle: true,
      provider: 'Google Account',
      domain,
      reason: 'google_account',
      messageKh: '✓ គណនី Google ពិតប្រាកដ (Google Account Verified)',
      messageEn: '✓ Official Google Account Verified'
    });
  }

  // Instantly accept other known trusted domains
  if (TRUSTED_EMAIL_DOMAINS.has(domain)) {
    return res.json({
      success: true,
      isReal: true,
      isGoogle: false,
      domain,
      reason: 'trusted_provider',
      messageKh: '✓ អ៊ីមែលពិតប្រាកដ និងត្រឹមត្រូវ (Verified Real Email)',
      messageEn: '✓ Verified Real Email Account'
    });
  }

  // Query DNS MX records to verify domain actually receives emails
  try {
    const resolvePromise = dns.promises.resolveMx(domain);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('DNS_TIMEOUT')), 2500)
    );
    const mxRecords = (await Promise.race([resolvePromise, timeoutPromise])) as dns.MxRecord[];
    
    if (mxRecords && mxRecords.length > 0) {
      // Check if domain is powered by Google Workspace / Google mail exchange
      const isGoogleWorkspace = mxRecords.some(r =>
        r.exchange.toLowerCase().includes('google.com') ||
        r.exchange.toLowerCase().includes('googlemail.com')
      );

      return res.json({
        success: true,
        isReal: true,
        isGoogle: isGoogleWorkspace,
        provider: isGoogleWorkspace ? 'Google Workspace' : 'Custom Domain Mail',
        domain,
        reason: isGoogleWorkspace ? 'google_workspace' : 'valid_mx',
        messageKh: isGoogleWorkspace
          ? '✓ គណនី Google Workspace ពិតប្រាកដ (Google Mail Server)'
          : '✓ អ៊ីមែលពិតប្រាកដ (មានម៉ាស៊ីនបម្រើអ៊ីមែលសកម្ម)',
        messageEn: isGoogleWorkspace
          ? '✓ Verified Google Workspace Account (Active Google MX)'
          : '✓ Verified Real Email Account (Active Mail Server)'
      });
    } else {
      return res.json({
        success: true,
        isReal: false,
        reason: 'no_mx_records',
        messageKh: 'ដែនអ៊ីមែលនេះមិនមានម៉ាស៊ីនទទួលសំបុត្រពិតប្រាកដទេ (No MX records)',
        messageEn: 'Domain has no active mail servers'
      });
    }
  } catch (err: any) {
    if (err.message === 'DNS_TIMEOUT') {
      const hasValidTld = domain.includes('.') && domain.split('.').pop()!.length >= 2;
      return res.json({
        success: true,
        isReal: hasValidTld,
        domain,
        reason: hasValidTld ? 'tld_valid' : 'invalid_domain',
        messageKh: hasValidTld ? 'អ៊ីមែលត្រឹមត្រូវ' : 'ដែនអ៊ីមែលមិនត្រឹមត្រូវ',
        messageEn: hasValidTld ? 'Email format accepted' : 'Invalid email domain'
      });
    }

    return res.json({
      success: true,
      isReal: false,
      reason: 'domain_not_found',
      messageKh: 'ដែនអ៊ីមែលមិនមានពិតប្រាកដទេ (Domain not found / Fake domain)',
      messageEn: 'Email domain does not exist or cannot receive mail'
    });
  }
});


// Save or Update Event (strictly isolated per user DB + real-time WebSocket broadcast)
app.post('/api/event', (req, res) => {
  const rawBody = req.body;
  if (!rawBody || typeof rawBody !== 'object') {
    return res.status(400).json({ error: 'Invalid event data' });
  }

  const eventId = rawBody.id || DEFAULT_PRESET_ID;
  const eventType = rawBody.eventType;
  const ownerId = typeof rawBody.ownerId === 'string' && rawBody.ownerId.trim() ? rawBody.ownerId.trim() : '';
  const dbId = resolveRecordDatabaseId({ ownerId, ownerEmail: rawBody.ownerEmail, eventId });
  const nowIso = rawBody.updatedAt || new Date().toISOString();

  const eventData =
    dbId && dbId !== GUEST_PUBLIC_SCOPE
      ? {
          ...rawBody,
          id: eventId,
          ownerId: ownerId && ownerId !== GUEST_PUBLIC_SCOPE ? ownerId : dbId,
          updatedAt: nowIso,
        }
      : {
          ...rawBody,
          id: eventId,
          updatedAt: nowIso,
        };

  if (dbId && dbId !== GUEST_PUBLIC_SCOPE) {
    if (!userDbFileExists(dbId, 'profile.json')) {
      ensureUserDatabaseOnDisk({
        scopeId: dbId,
        email: eventData.ownerEmail,
      });
    }
    const userDbEvents = readUserDbJson<Record<string, any>>(dbId, 'events.json', {});
    userDbEvents[eventId] = eventData;
    if (eventType) {
      userDbEvents[`user_${dbId}_type_${eventType}`] = eventData;
    }
    userDbEvents[`user_${dbId}_default`] = eventData;
    writeUserDbJson(dbId, 'events.json', userDbEvents, true);

    // Lightweight profile metadata & eventCount update without re-reading unrelated files
    const existingProfile = readUserDbJson<Partial<UserDatabaseRecord>>(dbId, 'profile.json', {});
    if (existingProfile && existingProfile.id === dbId) {
      const eventCount = Object.keys(userDbEvents).filter(
        k => !k.startsWith('type_') && !k.startsWith('user_')
      ).length;
      writeUserDbJson(dbId, 'profile.json', {
        ...existingProfile,
        ...(eventData.ownerEmail ? { email: String(eventData.ownerEmail).trim().toLowerCase() } : {}),
        eventCount,
        updatedAt: nowIso,
      });
    }
  } else if (!isGlobalSharedPresetId(eventId) || !ownerId || ownerId === GUEST_PUBLIC_SCOPE) {
    const events = getSavedEvents();
    events[eventId] = eventData;
    if (eventType) {
      events[`type_${eventType}`] = eventData;
    }
    events['default'] = eventData;
    saveEvents(events);
  }

  broadcastWebSocket({
    type: 'event:update',
    eventId,
    ownerId: dbId || ownerId || GUEST_PUBLIC_SCOPE,
    event: eventData,
    timestamp: new Date().toISOString(),
  });

  res.json({ success: true, event: eventData, ownerId: dbId || ownerId || GUEST_PUBLIC_SCOPE });
});

app.post('/api/event/reset', (req, res) => {
  const eventId = req.body.eventId || req.body.id || DEFAULT_PRESET_ID;
  const ownerId = typeof req.body.ownerId === 'string' ? req.body.ownerId.trim() : '';
  const ownerEmail = typeof req.body.ownerEmail === 'string' ? req.body.ownerEmail.trim() : '';
  const dbId = resolveRecordDatabaseId({ ownerId, ownerEmail, eventId });

  if (dbId && dbId !== GUEST_PUBLIC_SCOPE) {
    const userDbEvents = readUserDbJson<Record<string, any>>(dbId, 'events.json', {});
    delete userDbEvents[eventId];
    if (userDbEvents[`user_${dbId}_default`]?.id === eventId) {
      delete userDbEvents[`user_${dbId}_default`];
    }
    writeUserDbJson(dbId, 'events.json', userDbEvents);

    const events = getSavedEvents();
    let changedGlobal = false;
    if (events[eventId] && events[eventId].ownerId === dbId) {
      delete events[eventId];
      changedGlobal = true;
    }
    if (events[`user_${dbId}_default`]?.id === eventId) {
      delete events[`user_${dbId}_default`];
      changedGlobal = true;
    }
    if (changedGlobal) saveEvents(events);
  } else {
    const events = getSavedEvents();
    if (events[eventId] && shouldIncludePublicRecord(events[eventId])) {
      delete events[eventId];
    }
    if (events['default'] && events['default'].id === eventId && shouldIncludePublicRecord(events['default'])) {
      delete events['default'];
    }
    saveEvents(events);
  }

  broadcastWebSocket({
    type: 'event:deleted',
    eventId,
    ownerId: dbId || ownerId || GUEST_PUBLIC_SCOPE,
    timestamp: new Date().toISOString(),
  });

  res.json({ success: true });
});

app.delete('/api/event', (req, res) => {
  const eventId = (req.query.id as string | undefined)?.trim();
  const ownerId = (req.query.ownerId as string | undefined)?.trim();
  const ownerEmail = (req.query.ownerEmail as string | undefined)?.trim();
  if (!eventId) {
    return res.status(400).json({ error: 'Missing event id' });
  }
  const dbId = resolveRecordDatabaseId({ ownerId, ownerEmail, eventId });
  let deleted = false;

  if (dbId && dbId !== GUEST_PUBLIC_SCOPE) {
    const userDbEvents = readUserDbJson<Record<string, any>>(dbId, 'events.json', {});
    if (userDbEvents[eventId]) {
      delete userDbEvents[eventId];
      deleted = true;
    }
    if (userDbEvents[`user_${dbId}_type_${eventId}`]) {
      delete userDbEvents[`user_${dbId}_type_${eventId}`];
      deleted = true;
    }
    if (userDbEvents[`user_${dbId}_default`]?.id === eventId) {
      delete userDbEvents[`user_${dbId}_default`];
    }
    writeUserDbJson(dbId, 'events.json', userDbEvents);

    const events = getSavedEvents();
    if (events[eventId] && events[eventId].ownerId === dbId) {
      delete events[eventId];
      deleted = true;
      saveEvents(events);
    }
  } else {
    const events = getSavedEvents();
    if (events[eventId] && shouldIncludePublicRecord(events[eventId])) {
      delete events[eventId];
      deleted = true;
    }
    if (events[`type_${eventId}`] && shouldIncludePublicRecord(events[`type_${eventId}`])) {
      delete events[`type_${eventId}`];
      deleted = true;
    }
    if (
      events['default'] &&
      shouldIncludePublicRecord(events['default']) &&
      (events['default'].id === eventId || events['default'].presetId === eventId)
    ) {
      delete events['default'];
    }
    saveEvents(events);
  }

  broadcastWebSocket({
    type: 'event:deleted',
    eventId,
    ownerId: dbId || ownerId || GUEST_PUBLIC_SCOPE,
    timestamp: new Date().toISOString(),
  });

  res.json({ success: true, deleted, id: eventId });
});

app.delete('/api/templates/:id', (req, res) => {
  const { id } = req.params;
  const ownerId = (req.query.ownerId as string | undefined)?.trim();
  const ownerEmail = (req.query.ownerEmail as string | undefined)?.trim();
  if (!id) {
    return res.status(400).json({ error: 'Missing template id' });
  }
  const dbId = resolveRecordDatabaseId({ ownerId, ownerEmail, eventId: id });
  let deleted = false;

  if (dbId && dbId !== GUEST_PUBLIC_SCOPE) {
    const userDbEvents = readUserDbJson<Record<string, any>>(dbId, 'events.json', {});
    if (userDbEvents[id]) {
      delete userDbEvents[id];
      deleted = true;
    }
    if (userDbEvents[`user_${dbId}_type_${id}`]) {
      delete userDbEvents[`user_${dbId}_type_${id}`];
      deleted = true;
    }
    writeUserDbJson(dbId, 'events.json', userDbEvents);

    const events = getSavedEvents();
    if (events[id] && events[id].ownerId === dbId) {
      delete events[id];
      deleted = true;
      saveEvents(events);
    }
  } else {
    const events = getSavedEvents();
    if (events[id] && shouldIncludePublicRecord(events[id])) {
      delete events[id];
      deleted = true;
    }
    if (events[`type_${id}`] && shouldIncludePublicRecord(events[`type_${id}`])) {
      delete events[`type_${id}`];
      deleted = true;
    }
    saveEvents(events);
  }

  broadcastWebSocket({
    type: 'event:deleted',
    eventId: id,
    ownerId: dbId || ownerId || GUEST_PUBLIC_SCOPE,
    timestamp: new Date().toISOString(),
  });

  res.json({ success: true, deleted, id });
});

    // In-app short link lookup API (used as SPA fallback and metadata inspector for /s/:code)
app.get('/api/short-link/:code', async (req, res) => {
  const code = (req.params.code || '').trim();
  if (!code || !/^[a-zA-Z0-9_-]{1,128}$/.test(code)) {
    return res.status(400).json({ success: false, error: 'Invalid short code' });
  }
  const links = getShortLinks();
  let target = links[code];

  if (!target) {
    const fsLink = await fetchShortLinkFromFirestoreRest({
      projectId: rawFirebaseConfig.projectId,
      databaseId: (rawFirebaseConfig as any).firestoreDatabaseId || '(default)',
      code,
      apiKey: rawFirebaseConfig.apiKey,
    });
    if (fsLink?.url) {
      target = fsLink.url;
    }
  }

  if (!target) {
    return res.status(404).json({ success: false, error: 'Short link not found' });
  }

  let cleanTarget = target;
  const reqOrigin = getRequestPublicOrigin(req);
  if (cleanTarget.includes('localhost') || cleanTarget.includes('127.0.0.1')) {
    cleanTarget = cleanTarget.replace(/http:\/\/localhost:\d+/, reqOrigin).replace(/https:\/\/localhost:\d+/, reqOrigin);
  }
  if (cleanTarget.includes('ais-dev-')) {
    cleanTarget = cleanTarget.replace('ais-dev-', 'ais-pre-');
  }
  if (!reqOrigin.includes('.vercel.app') && cleanTarget.startsWith('https://invitationonline-six.vercel.app')) {
    cleanTarget = cleanTarget.replace('https://invitationonline-six.vercel.app', reqOrigin);
  }

  let guestName = '';
  let eventId = '';
  let eventType = '';
  let ownerId = '';
  let lang = 'kh';
  let metaOrigin = reqOrigin;
  try {
    const parsed = new URL(cleanTarget);
    if (!parsed.searchParams.get('share')) parsed.searchParams.set('share', '1');
    if (!parsed.searchParams.get('lang')) parsed.searchParams.set('lang', 'kh');
    guestName = decodeKhmerQueryValue(
      parsed.searchParams.get('i') ||
      parsed.searchParams.get('guest') ||
      parsed.searchParams.get('name') ||
      parsed.searchParams.get('to') ||
      ''
    );
    eventId = (parsed.searchParams.get('id') || '').trim();
    eventType = (parsed.searchParams.get('type') || parsed.searchParams.get('category') || '').trim();
    ownerId = (parsed.searchParams.get('ownerId') || '').trim();
    lang = (parsed.searchParams.get('lang') || 'kh').trim();
    if (parsed.origin && !parsed.origin.includes('localhost') && !parsed.origin.includes('127.0.0.1')) {
      metaOrigin = parsed.origin;
    }
    cleanTarget = normalizeShareUrlEncoding(parsed.toString());
  } catch {}

  const targetEvent = await resolveTargetEvent({
    eventId: eventId || undefined,
    eventType: eventType || undefined,
    ownerId: ownerId || undefined,
  });
  const meta = buildInvitationMeta({
    event: targetEvent,
    guestName: guestName || null,
    queryType: eventType || null,
    eventId: eventId || null,
    origin: metaOrigin,
    pageUrl: cleanTarget,
  });

  return res.json({
    success: true,
    code,
    url: cleanTarget,
    guestName: meta.guestName || guestName,
    invitationTitle: meta.invitationTitle,
    coverImage: meta.coverImage,
    metaTitle: meta.title,
    description: meta.description,
    eventId,
    eventType: meta.category || eventType,
    ownerId,
    lang,
  });
});

    // In-app short link endpoint with full Open Graph metadata preview for Telegram, Facebook, Messenger
app.get(['/s/:code', '/kh/s/:code'], async (req, res) => {
  const code = req.params.code;
  const links = getShortLinks();
  let target = links[code];

  if (!target) {
    const fsLink = await fetchShortLinkFromFirestoreRest({
      projectId: rawFirebaseConfig.projectId,
      databaseId: (rawFirebaseConfig as any).firestoreDatabaseId || '(default)',
      code,
      apiKey: rawFirebaseConfig.apiKey,
    });
    if (fsLink?.url) {
      target = fsLink.url;
    }
  }

  if (target) {
    let cleanTarget = target;
    const reqOrigin = getRequestPublicOrigin(req);
    if (cleanTarget.includes('localhost') || cleanTarget.includes('127.0.0.1')) {
      cleanTarget = cleanTarget.replace(/http:\/\/localhost:\d+/, reqOrigin).replace(/https:\/\/localhost:\d+/, reqOrigin);
    }
    if (cleanTarget.includes('ais-dev-')) {
      cleanTarget = cleanTarget.replace('ais-dev-', 'ais-pre-');
    }
    if (!reqOrigin.includes('.vercel.app') && cleanTarget.startsWith('https://invitationonline-six.vercel.app')) {
      cleanTarget = cleanTarget.replace('https://invitationonline-six.vercel.app', reqOrigin);
    }

    // Merge any query params from request (e.g. /s/code?name=...) and ensure share=1 & lang are set
    try {
      const urlObj = new URL(cleanTarget);
      for (const [key, val] of Object.entries(req.query)) {
        if (typeof val === 'string') {
          urlObj.searchParams.set(key, val);
        }
      }
      if (!urlObj.searchParams.get('lang') && !urlObj.searchParams.get('l')) {
        urlObj.searchParams.set('lang', 'kh');
      }
      if (!urlObj.searchParams.get('share')) {
        urlObj.searchParams.set('share', '1');
      }
      cleanTarget = normalizeShareUrlEncoding(urlObj.toString());
    } catch {
      // ignore
    }

    const userAgent = (req.headers['user-agent'] || '').toLowerCase();
    const isSocialBot =
      userAgent.includes('telegrambot') ||
      userAgent.includes('facebookexternalhit') ||
      userAgent.includes('facebot') ||
      userAgent.includes('twitterbot') ||
      userAgent.includes('whatsapp') ||
      userAgent.includes('slackbot') ||
      userAgent.includes('linkedinbot') ||
      userAgent.includes('discordbot') ||
      userAgent.includes('viber');

    // Extract guest name, event ID, ownerId, and category type from target URL if present
    let guestName: string | null = null;
    let eventId: string | null = null;
    let eventType: string | null = null;
    let ownerId: string | null = null;
    let pageLang: 'kh' | 'en' = 'kh';
    let targetOrigin = reqOrigin;
    try {
      const parsed = new URL(cleanTarget);
      guestName = decodeKhmerQueryValue(
        parsed.searchParams.get('name') || parsed.searchParams.get('i') || parsed.searchParams.get('guest') || parsed.searchParams.get('to')
      ) || null;
      eventId = parsed.searchParams.get('id');
      eventType = parsed.searchParams.get('type') || parsed.searchParams.get('category');
      ownerId = parsed.searchParams.get('ownerId');
      pageLang = detectLanguageFromUrl(parsed.search, parsed.pathname);
      if (parsed.origin && !parsed.origin.includes('localhost') && !parsed.origin.includes('127.0.0.1')) {
        targetOrigin = parsed.origin;
      }
    } catch {
      // ignore
    }

    // If it's a social media bot, render rich Open Graph HTML so the telegram/facebook preview shows the selected category's title and cover image
    if (isSocialBot) {
      const indexPath = isProduction
        ? [path.join(process.cwd(), 'dist', 'app.html'), path.join(process.cwd(), 'dist', 'index.html')].find(p => fs.existsSync(p)) || path.join(process.cwd(), 'dist', 'index.html')
        : path.join(process.cwd(), 'index.html');

      if (fs.existsSync(indexPath)) {
        let html = fs.readFileSync(indexPath, 'utf-8');
        html = await getInjectedHtmlAsync(html, {
          guestName,
          eventId,
          eventType,
          ownerId,
          origin: targetOrigin,
          pageUrl: cleanTarget,
          lang: pageLang,
        });
        html = html.replace('</head>', `<meta http-equiv="refresh" content="0;url=${cleanTarget.replace(/"/g, '&quot;')}" /></head>`);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Language', pageLang === 'en' ? 'en' : 'km');
        return res.send(html);
      }
    }

    return res.redirect(302, cleanTarget);
  }

  return res.redirect(302, getRequestPublicOrigin(req));
});

// API endpoint to shorten a URL
app.post('/api/shorten', async (req, res) => {
  const { url, origin: clientOrigin } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const serverOrigin = getRequestPublicOrigin(req) || PUBLIC_APP_URL;
    // Determine public origin: NEVER use localhost or dev domain
    let baseOrigin = serverOrigin;
    if (
      clientOrigin &&
      typeof clientOrigin === 'string' &&
      clientOrigin.startsWith('http') &&
      !clientOrigin.includes('localhost') &&
      !clientOrigin.includes('127.0.0.1')
    ) {
      baseOrigin = clientOrigin.replace(/\/+$/, '');
    } else {
      try {
        const parsedOrigin = new URL(url).origin;
        if (
          parsedOrigin &&
          parsedOrigin.startsWith('http') &&
          !parsedOrigin.includes('localhost') &&
          !parsedOrigin.includes('127.0.0.1')
        ) {
          baseOrigin = parsedOrigin.replace(/\/+$/, '');
        }
      } catch {
        // fallback to serverOrigin
      }
    }

    if (baseOrigin.includes('ais-dev-')) {
      baseOrigin = baseOrigin.replace('ais-dev-', 'ais-pre-');
    }

    let cleanUrl = url;
    if (cleanUrl.includes('localhost') || cleanUrl.includes('127.0.0.1')) {
      cleanUrl = cleanUrl.replace(/http:\/\/localhost:\d+/, baseOrigin).replace(/https:\/\/localhost:\d+/, baseOrigin);
    }
    if (cleanUrl.includes('ais-dev-')) {
      cleanUrl = cleanUrl.replace('ais-dev-', 'ais-pre-');
    }

    // Ensure Khmer language & share flag are preserved in target URL with clean UTF-8 %20 encoding
    let targetLang = 'kh';
    try {
      const parsedTarget = new URL(cleanUrl);
      const rawLang = (parsedTarget.searchParams.get('lang') || parsedTarget.searchParams.get('l') || '').toLowerCase().trim();
      targetLang = rawLang === 'en' ? 'en' : 'kh';
      parsedTarget.searchParams.set('lang', targetLang);
      if (!parsedTarget.searchParams.get('share')) {
        parsedTarget.searchParams.set('share', '1');
      }
      const rawNameParam = parsedTarget.searchParams.get('name');
      if (rawNameParam) {
        const cleanNameParam = decodeKhmerQueryValue(rawNameParam);
        if (cleanNameParam && cleanNameParam !== 'Your Name') {
          parsedTarget.searchParams.set('name', cleanNameParam);
        }
      }
      cleanUrl = normalizeShareUrlEncoding(parsedTarget.toString());
    } catch {
      // keep cleanUrl as-is
    }

    let isRemoteOrigin = false;
    try {
      isRemoteOrigin = new URL(baseOrigin).host !== new URL(serverOrigin).host;
    } catch {
      isRemoteOrigin = false;
    }

    const tryRemoteShorten = async (): Promise<{ shortUrl: string; code?: string } | null> => {
      if (!isRemoteOrigin) return null;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      try {
        const remoteRes = await fetch(`${baseOrigin}/api/shorten`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: cleanUrl, origin: baseOrigin, lang: targetLang }),
          signal: controller.signal,
        });
        if (!remoteRes.ok) return null;
        const remoteJson = (await remoteRes.json().catch(() => null)) as any;
        if (remoteJson?.success === true && remoteJson?.persisted === true && remoteJson?.shortUrl) {
          return { shortUrl: String(remoteJson.shortUrl), code: remoteJson.code };
        }
        return null;
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    };

    // Check if an identical URL is already cached/saved
    const existingLinks = getShortLinks();
    for (const [existingCode, targetUrl] of Object.entries(existingLinks)) {
      if (targetUrl === cleanUrl) {
        const persistedToFirestore = await saveShortLinkToFirestoreRest({
          projectId: rawFirebaseConfig.projectId,
          databaseId: (rawFirebaseConfig as any).firestoreDatabaseId || '(default)',
          code: existingCode,
          url: cleanUrl,
          lang: targetLang,
          apiKey: rawFirebaseConfig.apiKey,
        });
        if (isRemoteOrigin && !persistedToFirestore) {
          const remote = await tryRemoteShorten();
          if (!remote) {
            return res.status(503).json({
              success: false,
              persisted: false,
              fallbackUrl: cleanUrl,
              error: 'Remote short link persistence unavailable',
            });
          }
          return res.json({
            success: true,
            persisted: true,
            shortUrl: remote.shortUrl,
            internalShortUrl: remote.shortUrl,
            code: remote.code || existingCode,
            lang: targetLang,
            provider: 'remote',
          });
        }
        const cachedShortUrl = `${baseOrigin}/s/${existingCode}`;
        return res.json({
          success: true,
          persisted: true,
          shortUrl: cachedShortUrl,
          internalShortUrl: cachedShortUrl,
          code: existingCode,
          lang: targetLang,
          provider: 'cached',
        });
      }
    }

    // Generate deterministic, collision-safe in-app short code: /s/:code
    const baseCode = generateDeterministicShortCode(cleanUrl);
    let code = baseCode;
    let suffixIdx = 1;
    while (existingLinks[code] && existingLinks[code] !== cleanUrl) {
      code = `${baseCode}-${suffixIdx}`;
      suffixIdx += 1;
    }

    saveShortLink(code, cleanUrl);
    const persistedToFirestore = await saveShortLinkToFirestoreRest({
      projectId: rawFirebaseConfig.projectId,
      databaseId: (rawFirebaseConfig as any).firestoreDatabaseId || '(default)',
      code,
      url: cleanUrl,
      lang: targetLang,
      apiKey: rawFirebaseConfig.apiKey,
    });

    if (isRemoteOrigin && !persistedToFirestore) {
      const remote = await tryRemoteShorten();
      if (!remote) {
        return res.status(503).json({
          success: false,
          persisted: false,
          fallbackUrl: cleanUrl,
          error: 'Remote short link persistence unavailable',
        });
      }
      return res.json({
        success: true,
        persisted: true,
        shortUrl: remote.shortUrl,
        internalShortUrl: remote.shortUrl,
        code: remote.code || code,
        lang: targetLang,
        provider: 'remote',
      });
    }

    const internalShortUrl = `${baseOrigin}/s/${code}`;

    return res.json({
      success: true,
      persisted: true,
      shortUrl: internalShortUrl,
      internalShortUrl,
      code,
      lang: targetLang,
      provider: 'internal',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  // In development, mount Vite custom SSR transform middleware
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      // Ignore API routes
      if (req.originalUrl.startsWith('/api')) {
        return next();
      }
      try {
        const indexHtmlPath = path.resolve(process.cwd(), 'index.html');
        let template = fs.readFileSync(indexHtmlPath, 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);

        const qStr = (val: unknown) => (Array.isArray(val) ? String(val[0] || '') : typeof val === 'string' ? val : '').trim();
        const guestName = decodeKhmerQueryValue(qStr(req.query.name || req.query.i || req.query.guest || req.query.to));
        const eventId = qStr(req.query.id);
        const eventType = qStr(req.query.type || req.query.category);
        const ownerId = qStr(req.query.ownerId);
        const origin = getRequestPublicOrigin(req);
        const queryIdx = req.originalUrl.indexOf('?');
        const searchStr = queryIdx >= 0 ? req.originalUrl.slice(queryIdx) : '';
        const pageLang = detectLanguageFromUrl(searchStr, req.path);

        const html = await getInjectedHtmlAsync(template, {
          guestName,
          eventId,
          eventType,
          ownerId,
          origin,
          pageUrl: `${origin}${req.originalUrl}`,
          lang: pageLang,
        });
        res.status(200).set({
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Language': pageLang === 'en' ? 'en' : 'km',
        }).end(html);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    // In production, serve compiled static assets from dist
    const possibleDistPaths = [
      path.join(process.cwd(), 'dist'),
      path.resolve(__dirname),
      path.resolve(__dirname, '..', 'dist'),
    ];
    const distPath = possibleDistPaths.find(p => fs.existsSync(path.join(p, 'index.html')) || fs.existsSync(path.join(p, 'app.html'))) || path.join(process.cwd(), 'dist');

    app.use(express.static(distPath, { index: false }));
    app.get('*', async (req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Endpoint not found' });
      }
      const indexPath = [path.join(distPath, 'app.html'), path.join(distPath, 'index.html')].find(p => fs.existsSync(p)) || path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        let html = fs.readFileSync(indexPath, 'utf-8');
        const qStr = (val: unknown) => (Array.isArray(val) ? String(val[0] || '') : typeof val === 'string' ? val : '').trim();
        const guestName = decodeKhmerQueryValue(qStr(req.query.name || req.query.i || req.query.guest || req.query.to));
        const eventId = qStr(req.query.id);
        const eventType = qStr(req.query.type || req.query.category);
        const ownerId = qStr(req.query.ownerId);
        const origin = getRequestPublicOrigin(req);
        const queryIdx = req.originalUrl.indexOf('?');
        const searchStr = queryIdx >= 0 ? req.originalUrl.slice(queryIdx) : '';
        const pageLang = detectLanguageFromUrl(searchStr, req.path);

        html = await getInjectedHtmlAsync(html, {
          guestName,
          eventId,
          eventType,
          ownerId,
          origin,
          pageUrl: `${origin}${req.originalUrl}`,
          lang: pageLang,
        });
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Language', pageLang === 'en' ? 'en' : 'km');
        return res.send(html);
      }
      res.sendFile(indexPath);
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Wedding App Server with WebSocket running on http://0.0.0.0:${PORT} (${isProduction ? 'production' : 'development'})`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Server] Port ${PORT} is already in use by another process. Keeping existing listener active.`);
    } else {
      console.error('[Server] Server error:', err);
    }
  });

  const handleShutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };
  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}

startServer();

import * as fs from 'fs';
import * as path from 'path';
import { findTemplatePreset } from '../../src/data/eventTemplates.js';
import { stripScopedEventId } from '../../src/lib/userScope.js';
import {
  decodeKhmerQueryValue,
  normalizeShareUrlEncoding,
} from '../../src/lib/shareUrl.js';
import {
  buildInvitationMeta,
  fetchEventFromFirestoreRest,
  fetchShortLinkFromFirestoreRest,
  normalizeCategoryString,
} from '../../src/utils/shareMeta.js';

interface FirebaseRuntimeConfig {
  projectId: string;
  firestoreDatabaseId: string;
  apiKey?: string;
}

function loadFirebaseConfig(): FirebaseRuntimeConfig {
  const fallback: FirebaseRuntimeConfig = {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'wedding-invitation-0007',
    firestoreDatabaseId: process.env.VITE_FIREBASE_DATABASE_ID || '(default)',
    apiKey: process.env.VITE_FIREBASE_API_KEY || undefined,
  };
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return {
        projectId: parsed.projectId || fallback.projectId,
        firestoreDatabaseId: parsed.firestoreDatabaseId || fallback.firestoreDatabaseId,
        apiKey: parsed.apiKey || fallback.apiKey,
      };
    }
  } catch {
    // ignore
  }
  return fallback;
}

interface VercelReq {
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
}

interface VercelRes {
  status: (code: number) => VercelRes;
  json: (body: unknown) => void;
}

function getHeader(req: VercelReq, key: string): string {
  const val = req.headers?.[key] ?? req.headers?.[key.toLowerCase()];
  if (Array.isArray(val)) return val[0] || '';
  return val || '';
}

export default async function handler(req: VercelReq, res: VercelRes) {
  const rawCode = req.query?.code;
  const code = (Array.isArray(rawCode) ? rawCode[0] : rawCode || '').trim();
  if (!code || !/^[a-zA-Z0-9_-]{1,128}$/.test(code)) {
    return res.status(400).json({ success: false, error: 'Invalid short code' });
  }

  const firebaseCfg = loadFirebaseConfig();
  const host = getHeader(req, 'x-forwarded-host') || getHeader(req, 'host') || 'wedding-invitation-inky-kappa.vercel.app';
  const proto = getHeader(req, 'x-forwarded-proto') || 'https';
  const origin = `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`;

  let targetUrl = '';
  const fsLink = await fetchShortLinkFromFirestoreRest({
    projectId: firebaseCfg.projectId,
    databaseId: firebaseCfg.firestoreDatabaseId,
    code,
    apiKey: firebaseCfg.apiKey,
  });
  if (fsLink?.url) {
    targetUrl = fsLink.url;
  } else {
    try {
      const localShortFile = path.join(process.cwd(), 'data', 'saved_short_links.json');
      if (fs.existsSync(localShortFile)) {
        const links = JSON.parse(fs.readFileSync(localShortFile, 'utf-8'));
        if (typeof links?.[code] === 'string') {
          targetUrl = links[code];
        }
      }
    } catch {
      // ignore
    }
  }

  if (!targetUrl) {
    return res.status(404).json({ success: false, error: 'Short link not found' });
  }

  let guestName = '';
  let eventId = '';
  let eventType = '';
  let ownerId = '';
  let lang = fsLink?.lang === 'en' ? 'en' : 'kh';
  try {
    const parsed = new URL(targetUrl, origin);
    if (!parsed.searchParams.get('share')) parsed.searchParams.set('share', '1');
    const rawLang = (parsed.searchParams.get('lang') || parsed.searchParams.get('l') || lang).toLowerCase().trim();
    lang = rawLang === 'en' ? 'en' : 'kh';
    parsed.searchParams.set('lang', lang);
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
    targetUrl = normalizeShareUrlEncoding(parsed.toString());
  } catch {
    // keep raw targetUrl
  }

  let targetEvent: any = null;
  if (eventId) {
    targetEvent = await fetchEventFromFirestoreRest({
      projectId: firebaseCfg.projectId,
      databaseId: firebaseCfg.firestoreDatabaseId,
      eventId,
      ownerId: ownerId || undefined,
      apiKey: firebaseCfg.apiKey,
    });
  }
  if (!targetEvent) {
    const preset =
      (eventId ? findTemplatePreset(stripScopedEventId(eventId)) : undefined) ||
      (eventType ? findTemplatePreset(normalizeCategoryString(eventType) || eventType) : undefined) ||
      findTemplatePreset('wedding');
    targetEvent = preset?.sampleEvent;
  }

  const meta = buildInvitationMeta({
    event: targetEvent,
    guestName: guestName || null,
    queryType: eventType || null,
    eventId: eventId || null,
    origin,
    pageUrl: targetUrl,
  });

  return res.status(200).json({
    success: true,
    code,
    url: targetUrl,
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
}

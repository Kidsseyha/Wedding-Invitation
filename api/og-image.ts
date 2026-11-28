import * as fs from 'fs';
import * as path from 'path';
import { findTemplatePreset } from '../src/data/eventTemplates.js';
import { stripScopedEventId } from '../src/lib/userScope.js';
import {
  fetchEventFromFirestoreRest,
  normalizeCategoryString,
  resolveCategoryFromHints,
  resolveEventCoverImage,
  toAbsoluteHttpUrl,
} from '../src/utils/shareMeta.js';

interface FirebaseRuntimeConfig {
  projectId: string;
  firestoreDatabaseId: string;
  apiKey?: string;
}

function loadFirebaseConfig(): FirebaseRuntimeConfig {
  const fallback: FirebaseRuntimeConfig = {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'wedding-invitation-0007',
    firestoreDatabaseId:
      process.env.VITE_FIREBASE_DATABASE_ID ||
      'ai-studio-invitationonline-6145d4e3-f054-4b92-8181-aa9c53ee300a',
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
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
}

interface VercelRes {
  status: (code: number) => VercelRes;
  setHeader: (name: string, value: string) => void;
  send: (body: string | Buffer) => void;
  redirect?: (code: number, url: string) => void;
}

function getHeader(req: VercelReq, key: string): string {
  const val = req.headers?.[key] ?? req.headers?.[key.toLowerCase()];
  if (Array.isArray(val)) return val[0] || '';
  return val || '';
}

function getQueryParam(params: URLSearchParams, req: VercelReq, key: string): string {
  const fromUrl = params.get(key);
  if (fromUrl) return fromUrl;
  const fromReq = req.query?.[key];
  if (Array.isArray(fromReq)) return fromReq[0] || '';
  return fromReq || '';
}

export default async function handler(req: VercelReq, res: VercelRes) {
  try {
    const firebaseCfg = loadFirebaseConfig();
    const host = getHeader(req, 'x-forwarded-host') || getHeader(req, 'host') || 'wedding-invitation-inky-kappa.vercel.app';
    const proto = getHeader(req, 'x-forwarded-proto') || 'https';
    const origin = `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`;

    const parsedUrl = new URL(req.url || '/api/og-image', origin);
    const params = parsedUrl.searchParams;

    const eventId = getQueryParam(params, req, 'id').trim();
    const ownerId = getQueryParam(params, req, 'ownerId').trim();
    const tplHint = getQueryParam(params, req, 'tpl').trim();
    const rawType = (getQueryParam(params, req, 'type') || getQueryParam(params, req, 'category')).trim();
    const eventType = normalizeCategoryString(rawType);

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

    if (!targetEvent && (eventId || tplHint)) {
      const strippedId = eventId ? stripScopedEventId(eventId) : '';
      const idPreset =
        (strippedId ? findTemplatePreset(strippedId) : undefined) ||
        (tplHint ? findTemplatePreset(stripScopedEventId(tplHint)) : undefined);
      const effectiveOwner = ownerId || (eventId.includes('__') ? eventId.split('__')[0] : '');
      if (idPreset && effectiveOwner) {
        const candidateIds = Array.from(
          new Set([idPreset.sampleEvent?.id, idPreset.id, tplHint ? stripScopedEventId(tplHint) : ''].filter((cid): cid is string => Boolean(cid) && cid !== strippedId))
        );
        for (const cid of candidateIds) {
          targetEvent = await fetchEventFromFirestoreRest({
            projectId: firebaseCfg.projectId,
            databaseId: firebaseCfg.firestoreDatabaseId,
            eventId: `${effectiveOwner}__${cid}`,
            ownerId: effectiveOwner,
            apiKey: firebaseCfg.apiKey,
          });
          if (targetEvent) break;
        }
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
        const preset =
          (eventId ? findTemplatePreset(stripScopedEventId(eventId)) : undefined) ||
          (tplHint ? findTemplatePreset(stripScopedEventId(tplHint)) : undefined) ||
          findTemplatePreset(eventType);
        if (preset) targetEvent = preset.sampleEvent;
      }
    }

    if (!targetEvent) {
      const preset =
        (eventId ? findTemplatePreset(stripScopedEventId(eventId)) : undefined) ||
        (tplHint ? findTemplatePreset(stripScopedEventId(tplHint)) : undefined) ||
        findTemplatePreset('wedding');
      targetEvent = preset?.sampleEvent;
    }

    const category = resolveCategoryFromHints({
      queryType: rawType || null,
      eventType: targetEvent?.eventType,
      eventId: targetEvent?.id || eventId,
      eventName: targetEvent?.name,
    });

    const cover = resolveEventCoverImage(targetEvent, category);

    if (cover.startsWith('data:image/')) {
      const match = cover.match(/^data:(image\/[a-zA-Z0-9.+-]+)(?:;[^,]*)?;base64,([\s\S]+)$/i);
      if (match && match[1] && match[2]) {
        const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
        const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Length', String(buffer.length));
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
        return res.status(200).send(buffer);
      }
    }

    const absoluteUrl = toAbsoluteHttpUrl(cover, origin);
    if (res.redirect) {
      return res.redirect(302, absoluteUrl);
    }
    res.setHeader('Location', absoluteUrl);
    return res.status(302).send('');
  } catch (err) {
    console.error('[Vercel OG Image Handler Error]:', err);
    res.setHeader('Location', '/assets/images/white_arch_columns_wedding_cover_1790394461049.jpg');
    return res.status(302).send('');
  }
}

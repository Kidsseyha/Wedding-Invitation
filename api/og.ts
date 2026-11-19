import * as fs from 'fs';
import * as path from 'path';
import { findTemplatePreset } from '../src/data/eventTemplates.js';
import { stripScopedEventId } from '../src/lib/userScope.js';
import {
  buildInvitationMeta,
  injectMetaIntoHtml,
  fetchEventFromFirestoreRest,
  fetchShortLinkFromFirestoreRest,
  normalizeCategoryString,
} from '../src/utils/shareMeta.js';

interface FirebaseRuntimeConfig {
  projectId: string;
  firestoreDatabaseId: string;
  apiKey?: string;
}

function loadFirebaseConfig(): FirebaseRuntimeConfig {
  const fallback: FirebaseRuntimeConfig = {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'gen-lang-client-0635510191',
    firestoreDatabaseId:
      process.env.VITE_FIREBASE_DATABASE_ID || 'ai-studio-invitationonline-6145d4e3-f054-4b92-8181-aa9c53ee300a',
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
    // ignore file read errors and use fallback
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
  send: (body: string) => void;
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
    const host = getHeader(req, 'x-forwarded-host') || getHeader(req, 'host') || 'invitationonline-six.vercel.app';
    const proto = getHeader(req, 'x-forwarded-proto') || 'https';
    const origin = `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`;

    const rawUrl = req.url || '/';
    let parsedUrl = new URL(rawUrl, origin);
    let params = parsedUrl.searchParams;
    let replaceStatePath: string | undefined;

    // Resolve short links (/s/:code) from Firestore or local saved_short_links.json
    const shortMatch = parsedUrl.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)\/?$/);
    if (shortMatch && shortMatch[1]) {
      const shortCode = shortMatch[1];
      let resolvedTargetUrl: string | null = null;

      const fsShortLink = await fetchShortLinkFromFirestoreRest({
        projectId: firebaseCfg.projectId,
        databaseId: firebaseCfg.firestoreDatabaseId,
        code: shortCode,
        apiKey: firebaseCfg.apiKey,
      });

      if (fsShortLink?.url) {
        resolvedTargetUrl = fsShortLink.url;
      } else {
        try {
          const localShortFile = path.join(process.cwd(), 'data', 'saved_short_links.json');
          if (fs.existsSync(localShortFile)) {
            const links = JSON.parse(fs.readFileSync(localShortFile, 'utf-8'));
            if (typeof links?.[shortCode] === 'string') {
              resolvedTargetUrl = links[shortCode];
            }
          }
        } catch {
          // ignore local short link lookup errors
        }
      }

      if (resolvedTargetUrl) {
        try {
          const targetObj = new URL(resolvedTargetUrl, origin);
          // Merge any extra query params passed on the short URL (e.g. ?name=...)
          for (const [k, v] of Array.from(params.entries())) {
            if (v) targetObj.searchParams.set(k, v);
          }
          if (!targetObj.searchParams.get('lang')) {
            targetObj.searchParams.set('lang', fsShortLink?.lang || 'kh');
          }
          if (!targetObj.searchParams.get('share')) {
            targetObj.searchParams.set('share', '1');
          }
          parsedUrl = targetObj;
          params = targetObj.searchParams;
          replaceStatePath = `/${targetObj.search}`;
        } catch {
          // ignore invalid URL
        }
      }
    }

    const eventId = getQueryParam(params, req, 'id').trim();
    const ownerId = getQueryParam(params, req, 'ownerId').trim();
    const rawType = (getQueryParam(params, req, 'type') || getQueryParam(params, req, 'category')).trim();
    const rawGuest = (
      getQueryParam(params, req, 'name') ||
      getQueryParam(params, req, 'i') ||
      getQueryParam(params, req, 'guest') ||
      getQueryParam(params, req, 'to')
    ).trim();

    let guestName = rawGuest;
    try {
      if (rawGuest && rawGuest.includes('%')) {
        guestName = decodeURIComponent(rawGuest);
      }
    } catch {
      guestName = rawGuest;
    }

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

    if (!targetEvent && eventId) {
      const idPreset = findTemplatePreset(stripScopedEventId(eventId));
      if (idPreset && (!eventType || idPreset.type === eventType)) {
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
          findTemplatePreset(eventType);
        if (preset) targetEvent = preset.sampleEvent;
      }
    }

    if (!targetEvent && eventId) {
      const preset = findTemplatePreset(stripScopedEventId(eventId));
      if (preset) targetEvent = preset.sampleEvent;
    }

    if (!targetEvent) {
      targetEvent = findTemplatePreset('wedding')?.sampleEvent;
    }

    let html = '';
    const candidatePaths = [
      path.join(process.cwd(), 'dist', 'app.html'),
      path.join(process.cwd(), 'dist', 'index.html'),
      path.join(process.cwd(), 'index.html'),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        html = fs.readFileSync(p, 'utf-8');
        break;
      }
    }

    if (!html) {
      try {
        const fallbackRes = await fetch(`${origin}/app.html`);
        if (fallbackRes.ok) {
          html = await fallbackRes.text();
        } else {
          const indexRes = await fetch(`${origin}/index.html`);
          if (indexRes.ok) {
            html = await indexRes.text();
          }
        }
      } catch {
        // ignore
      }
    }

    if (!html) {
      html = `<!doctype html><html lang="km"><head><meta charset="UTF-8" /><title>Digital Invitation</title></head><body><div id="root"></div></body></html>`;
    }

    const meta = buildInvitationMeta({
      event: targetEvent,
      guestName: guestName || null,
      queryType: rawType || null,
      eventId: eventId || null,
      origin,
      pageUrl: parsedUrl.toString(),
    });

    const injected = injectMetaIntoHtml(html, meta, replaceStatePath);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.status(200).send(injected);
  } catch (err: any) {
    console.error('[Vercel OG Handler Error]:', err);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(`<!doctype html><html lang="km"><head><meta charset="UTF-8" /><title>Digital Invitation</title></head><body><div id="root"></div></body></html>`);
  }
}

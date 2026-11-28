import * as fs from 'fs';
import * as path from 'path';
import { findTemplatePreset } from '../src/data/eventTemplates.js';
import { stripScopedEventId } from '../src/lib/userScope.js';
import {
  decodeKhmerQueryValue,
  detectLanguageFromUrl,
  normalizeShareUrlEncoding,
} from '../src/lib/shareUrl.js';
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
    const host = getHeader(req, 'x-forwarded-host') || getHeader(req, 'host') || 'wedding-invitation-inky-kappa.vercel.app';
    const proto = getHeader(req, 'x-forwarded-proto') || 'https';
    const origin = `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`;

    const rawUrl = req.url || '/';
    let parsedUrl = new URL(rawUrl, origin);
    let params = parsedUrl.searchParams;
    let replaceStatePath: string | undefined;
    let unresolvedShortLink = false;

    // Resolve short links (/s/:code or /kh/s/:code) from Firestore or local saved_short_links.json
    const shortMatch = parsedUrl.pathname.match(/^(?:\/(?:kh|km|en))?\/s\/([a-zA-Z0-9_-]+)\/?$/i);
    if (shortMatch && shortMatch[1]) {
      unresolvedShortLink = true;
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
          const rawShortLang = (
            targetObj.searchParams.get('lang') ||
            fsShortLink?.lang ||
            (parsedUrl.pathname.toLowerCase().startsWith('/en') ? 'en' : 'kh')
          ).toLowerCase();
          targetObj.searchParams.set('lang', rawShortLang === 'en' ? 'en' : 'kh');
          if (!targetObj.searchParams.get('share')) {
            targetObj.searchParams.set('share', '1');
          }
          parsedUrl = targetObj;
          params = targetObj.searchParams;
          replaceStatePath = normalizeShareUrlEncoding(`/${targetObj.search}`);
          unresolvedShortLink = false;
        } catch {
          // ignore invalid URL
        }
      }
    }

    const pageLang = detectLanguageFromUrl(parsedUrl.search, parsedUrl.pathname);

    // Support /kh or /kh/ direct Khmer invitation routes on Vercel
    if (!replaceStatePath && /^\/(?:kh|km)\/?$/i.test(parsedUrl.pathname)) {
      const khUrl = new URL(parsedUrl.toString());
      khUrl.searchParams.set('lang', 'kh');
      replaceStatePath = normalizeShareUrlEncoding(`/${khUrl.search}`);
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

    const guestName = decodeKhmerQueryValue(rawGuest);

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
      const strippedId = stripScopedEventId(eventId);
      const idPreset = findTemplatePreset(strippedId);
      const effectiveOwner = ownerId || (eventId.includes('__') ? eventId.split('__')[0] : '');
      if (idPreset && effectiveOwner) {
        const candidateIds = Array.from(
          new Set([idPreset.sampleEvent?.id, idPreset.id].filter((cid): cid is string => Boolean(cid) && cid !== strippedId))
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
      pageUrl: normalizeShareUrlEncoding(parsedUrl.toString()),
    });

    const injected = injectMetaIntoHtml(html, meta, replaceStatePath, { lang: pageLang });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Language', pageLang === 'en' ? 'en' : 'km');
    res.setHeader(
      'Cache-Control',
      unresolvedShortLink
        ? 'no-store, max-age=0'
        : 'public, s-maxage=15, stale-while-revalidate=60'
    );
    res.status(200).send(injected);
  } catch (err: any) {
    console.error('[Vercel OG Handler Error]:', err);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(`<!doctype html><html lang="km"><head><meta charset="UTF-8" /><title>Digital Invitation</title></head><body><div id="root"></div></body></html>`);
  }
}

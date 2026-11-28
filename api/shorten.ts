import * as fs from 'fs';
import * as path from 'path';
import { decodeKhmerQueryValue, generateDeterministicShortCode, normalizeShareUrlEncoding } from '../src/lib/shareUrl.js';
import { saveShortLinkToFirestoreRest } from '../src/utils/shareMeta.js';

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
    // ignore and use fallback
  }
  return fallback;
}

interface VercelReq {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: any;
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
  if ((req.method || 'POST').toUpperCase() !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { url, origin: clientOrigin } = body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing url parameter' });
    }

    const host = getHeader(req, 'x-forwarded-host') || getHeader(req, 'host') || 'wedding-invitation-inky-kappa.vercel.app';
    const proto = getHeader(req, 'x-forwarded-proto') || 'https';
    const requestOrigin = `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`;

    let baseOrigin = requestOrigin;
    if (
      clientOrigin &&
      typeof clientOrigin === 'string' &&
      clientOrigin.startsWith('http') &&
      !clientOrigin.includes('localhost') &&
      !clientOrigin.includes('127.0.0.1')
    ) {
      baseOrigin = clientOrigin.replace(/\/+$/, '');
    }
    if (baseOrigin.includes('ais-dev-')) {
      baseOrigin = baseOrigin.replace('ais-dev-', 'ais-pre-');
    }

    let cleanUrl = url;
    if (cleanUrl.includes('localhost') || cleanUrl.includes('127.0.0.1')) {
      cleanUrl = cleanUrl
        .replace(/http:\/\/localhost:\d+/, baseOrigin)
        .replace(/https:\/\/localhost:\d+/, baseOrigin);
    }
    if (cleanUrl.includes('ais-dev-')) {
      cleanUrl = cleanUrl.replace('ais-dev-', 'ais-pre-');
    }

    // Keep clean Khmer guest name and omit redundant default params
    let targetLang = 'kh';
    try {
      const parsed = new URL(cleanUrl);
      const rawLang = (parsed.searchParams.get('lang') || parsed.searchParams.get('l') || '').toLowerCase().trim();
      targetLang = rawLang === 'en' ? 'en' : 'kh';
      if (targetLang === 'en') {
        parsed.searchParams.set('lang', 'en');
      } else {
        parsed.searchParams.delete('lang');
        parsed.searchParams.delete('l');
      }
      const rawGuest = parsed.searchParams.get('name');
      if (rawGuest) {
        const cleanGuest = decodeKhmerQueryValue(rawGuest);
        if (cleanGuest && cleanGuest !== 'Your Name') {
          parsed.searchParams.set('name', cleanGuest);
        }
      }
      const hasGuest = Boolean(
        parsed.searchParams.get('name') ||
        parsed.searchParams.get('i') ||
        parsed.searchParams.get('guest') ||
        parsed.searchParams.get('to')
      );
      if (!hasGuest && !parsed.searchParams.get('share')) {
        parsed.searchParams.set('share', '1');
      }
      cleanUrl = normalizeShareUrlEncoding(parsed.toString());
    } catch {
      // keep cleanUrl as-is
    }

    const code = generateDeterministicShortCode(cleanUrl);
    const firebaseCfg = loadFirebaseConfig();
    const persisted = await saveShortLinkToFirestoreRest({
      projectId: firebaseCfg.projectId,
      databaseId: firebaseCfg.firestoreDatabaseId,
      code,
      url: cleanUrl,
      lang: targetLang,
      apiKey: firebaseCfg.apiKey,
      timeoutMs: 1800,
    });

    if (!persisted) {
      return res.status(503).json({
        success: false,
        persisted: false,
        fallbackUrl: cleanUrl,
        error: 'Short link persistence unavailable',
      });
    }

    const shortUrl = `${baseOrigin}/s/${code}`;
    return res.status(200).json({
      success: true,
      persisted: true,
      shortUrl,
      internalShortUrl: shortUrl,
      code,
      lang: targetLang,
      provider: 'vercel-firestore',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Shorten failed' });
  }
}

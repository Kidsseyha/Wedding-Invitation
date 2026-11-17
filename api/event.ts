import * as fs from 'fs';
import * as path from 'path';
import { findTemplatePreset } from '../src/data/eventTemplates.js';
import {
  fetchEventFromFirestoreRest,
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
    // ignore and use fallback
  }
  return fallback;
}

interface VercelReq {
  method?: string;
  url?: string;
  body?: any;
  query?: Record<string, string | string[] | undefined>;
}

interface VercelRes {
  status: (code: number) => VercelRes;
  json: (body: unknown) => void;
}

function getParam(params: URLSearchParams, req: VercelReq, key: string): string {
  const fromUrl = params.get(key);
  if (fromUrl) return fromUrl;
  const fromReq = req.query?.[key];
  if (Array.isArray(fromReq)) return fromReq[0] || '';
  return fromReq || '';
}

export default async function handler(req: VercelReq, res: VercelRes) {
  const method = (req.method || 'GET').toUpperCase();

  if (method === 'POST') {
    const eventData = req.body;
    if (!eventData || typeof eventData !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid event data' });
    }
    // Primary persistence on Vercel is handled via Firestore client SDK
    return res.status(200).json({ success: true, event: eventData, storage: 'firestore' });
  }

  if (method === 'DELETE') {
    const parsedUrl = new URL(req.url || '/api/event', 'https://localhost');
    const eventId = getParam(parsedUrl.searchParams, req, 'id').trim();
    return res.status(200).json({ success: true, deleted: Boolean(eventId), id: eventId });
  }

  const firebaseCfg = loadFirebaseConfig();
  const parsedUrl = new URL(req.url || '/api/event', 'https://localhost');
  const eventId = getParam(parsedUrl.searchParams, req, 'id').trim();
  const rawType = getParam(parsedUrl.searchParams, req, 'type').trim();
  const eventType = normalizeCategoryString(rawType) || rawType;

  if (eventId) {
    const fbEvent = await fetchEventFromFirestoreRest({
      projectId: firebaseCfg.projectId,
      databaseId: firebaseCfg.firestoreDatabaseId,
      eventId,
      apiKey: firebaseCfg.apiKey,
    });
    if (fbEvent) {
      return res.status(200).json({
        success: true,
        event: fbEvent,
        source: 'firestore',
        requestedId: eventId,
      });
    }
    const preset = findTemplatePreset(eventId) || (eventType ? findTemplatePreset(eventType) : undefined);
    if (preset) {
      return res.status(200).json({
        success: true,
        event: preset.sampleEvent,
        source: 'preset',
        requestedId: eventId,
      });
    }
    return res.status(200).json({
      success: true,
      event: null,
      source: 'not_found',
      requestedId: eventId,
    });
  }

  if (eventType) {
    const preset = findTemplatePreset(eventType);
    if (preset) {
      return res.status(200).json({
        success: true,
        event: preset.sampleEvent,
        source: 'preset',
        requestedType: eventType,
      });
    }
  }

  const defaultPreset = findTemplatePreset('wedding');
  return res.status(200).json({
    success: true,
    event: defaultPreset?.sampleEvent || null,
    source: 'default',
  });
}

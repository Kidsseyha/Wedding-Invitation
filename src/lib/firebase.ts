import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDocFromServer, disableNetwork, enableNetwork, setLogLevel } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import rawConfig from '../../firebase-applet-config.json';

// Use environment variables if set (e.g. in Vercel project settings), otherwise fallback to bundled config
export const firebaseConfig = {
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string) || rawConfig.projectId,
  appId: (import.meta.env.VITE_FIREBASE_APP_ID as string) || rawConfig.appId,
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string) || rawConfig.apiKey,
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string) || rawConfig.authDomain,
  firestoreDatabaseId: (import.meta.env.VITE_FIREBASE_DATABASE_ID as string) || (rawConfig as any).firestoreDatabaseId || '(default)',
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string) || rawConfig.storageBucket,
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string) || rawConfig.messagingSenderId,
  oAuthClientId: (import.meta.env.VITE_FIREBASE_OAUTH_CLIENT_ID as string) || rawConfig.oAuthClientId,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Silence internal Firestore SDK retry and warning logs
try {
  setLogLevel('silent');
} catch {
  // ignore
}

// Initialize Firestore with the database ID specified in config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Automatically attempt to keep network connected
enableNetwork(db).catch(() => {});

// Enable direct Firestore writes
export const IS_FIRESTORE_WRITE_DISABLED = false;

if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('firestore_quota_exceeded');
  } catch {
    // ignore
  }
}

let isNetworkDisabled = false;
let firestoreUnavailableUntil = 0;

export function isFirestoreKnownUnavailable(): boolean {
  return Date.now() < firestoreUnavailableUntil;
}

export function markFirestoreUnavailable(ttlMs = 45_000): void {
  firestoreUnavailableUntil = Date.now() + ttlMs;
  if (!isNetworkDisabled) {
    isNetworkDisabled = true;
    disableNetwork(db).catch(() => {});
  }
}

export function markFirestoreAvailable(): void {
  firestoreUnavailableUntil = 0;
  if (isNetworkDisabled) {
    isNetworkDisabled = false;
    enableNetwork(db).catch(() => {});
  }
}

export async function ensureFirestoreNetwork(): Promise<void> {
  if (isNetworkDisabled) {
    isNetworkDisabled = false;
    await enableNetwork(db).catch(() => {});
  }
}

export interface FirestoreConnectionStatus {
  connected: boolean;
  reconnected: boolean;
  databaseId: string;
  projectId: string;
  latencyMs: number;
  error?: string;
}

// Test connection on boot and on manual database checks
export async function testFirestoreConnection(timeoutMs = 2500): Promise<FirestoreConnectionStatus> {
  const startedAt = Date.now();
  let reconnected = false;

  if (isFirestoreKnownUnavailable()) {
    return {
      connected: false,
      reconnected: false,
      databaseId: firebaseConfig.firestoreDatabaseId,
      projectId: firebaseConfig.projectId,
      latencyMs: 0,
      error: 'Firestore temporarily unavailable (cached)',
    };
  }

  try {
    if (isNetworkDisabled) {
      await enableNetwork(db).catch(() => {});
      isNetworkDisabled = false;
      reconnected = true;
    }

    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('firestore_quota_exceeded');
      } catch {
        // ignore
      }
    }

    await Promise.race([
      getDocFromServer(doc(db, 'test', 'connection')),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Firestore connection check timed out')), timeoutMs)
      ),
    ]);

    markFirestoreAvailable();
    return {
      connected: true,
      reconnected,
      databaseId: firebaseConfig.firestoreDatabaseId,
      projectId: firebaseConfig.projectId,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error: any) {
    const code = String(error?.code || '');
    const message = error instanceof Error ? error.message : String(error || '');

    // Receiving permission-denied from Firestore server confirms live server reachability
    if (
      code === 'permission-denied' ||
      code.includes('permission-denied') ||
      message.includes('Missing or insufficient permissions')
    ) {
      markFirestoreAvailable();
      return {
        connected: true,
        reconnected,
        databaseId: firebaseConfig.firestoreDatabaseId,
        projectId: firebaseConfig.projectId,
        latencyMs: Date.now() - startedAt,
      };
    }

    // Only disable Firestore network when the database is missing or quota is exhausted;
    // transient cold-start timeouts must never lock out subsequent writes.
    if (
      code === 'not-found' ||
      code.includes('not-found') ||
      message.includes('does not exist') ||
      code === 'resource-exhausted' ||
      code.includes('resource-exhausted')
    ) {
      markFirestoreUnavailable(45_000);
    }

    return {
      connected: false,
      reconnected,
      databaseId: firebaseConfig.firestoreDatabaseId,
      projectId: firebaseConfig.projectId,
      latencyMs: Date.now() - startedAt,
      error: message || code || 'Unknown Firestore error',
    };
  }
}

// Error handling helper as required by Firebase specification
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorObj = error as any;
  const code = errorObj?.code || '';
  const message = error instanceof Error ? error.message : String(error);

  if (
    code === 'resource-exhausted' ||
    code.includes('resource-exhausted') ||
    message.includes('resource-exhausted') ||
    message.includes('Quota limit exceeded') ||
    message.includes('Quota exceeded')
  ) {
    try {
      localStorage.setItem('firestore_quota_exceeded', 'true');
    } catch (e) {}

    if (!isNetworkDisabled) {
      isNetworkDisabled = true;
      disableNetwork(db).catch(() => {});
      console.warn('Firestore write quota exceeded. Disabled Firestore network to stop backoff retry loops.');
    }
    return { error: message, operationType, path, authInfo: {} };
  }

  // Handle missing Firestore database / offline states gracefully without repeated stall loops
  if (
    code === 'not-found' ||
    code.includes('not-found') ||
    message.includes('does not exist') ||
    message.includes('NOT_FOUND')
  ) {
    markFirestoreUnavailable(60_000);
    return { error: message, operationType, path, authInfo: {} };
  }

  // Handle temporary offline network states gracefully
  if (message.includes('client is offline') || message.includes('offline') || code === 'unavailable') {
    console.warn(`Firestore network offline (${operationType} at ${path}):`, message);
    markFirestoreUnavailable(30_000);
    return { error: message, operationType, path, authInfo: {} };
  }

  const errInfo: FirestoreErrorInfo = {
    error: message,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

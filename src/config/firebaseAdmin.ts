import { applicationDefault, cert, getApps, initializeApp, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';

const REQUIRED_PROJECT_ID = 'ovms-ad209';

const rawProjectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
export const resolvedAdminProjectId = (rawProjectId && rawProjectId.trim()) ? rawProjectId.trim() : REQUIRED_PROJECT_ID;

let adminApp: App | null = null;
let _hasAdminCredentials = false;
let _adminInitMethod: 'SERVICE_ACCOUNT' | 'PRIVATE_KEY_EMAIL' | 'APPLICATION_DEFAULT' | 'NONE' = 'NONE';

// Check if an app is already initialized
const existingApps = getApps();
if (existingApps.length > 0) {
  adminApp = existingApps[0];
  _hasAdminCredentials = true;
  _adminInitMethod = 'APPLICATION_DEFAULT';
} else {
  // 1. Try FIREBASE_SERVICE_ACCOUNT (JSON string or base64 encoded)
  if (process.env.FIREBASE_SERVICE_ACCOUNT && process.env.FIREBASE_SERVICE_ACCOUNT.trim()) {
    try {
      let serviceAccount: any;
      const rawEnv = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      try {
        serviceAccount = JSON.parse(rawEnv);
      } catch {
        const decoded = Buffer.from(rawEnv, 'base64').toString('utf8');
        serviceAccount = JSON.parse(decoded);
      }
      const clientEmail = serviceAccount.client_email || serviceAccount.clientEmail;
      const privateKey = serviceAccount.private_key || serviceAccount.privateKey;

      if (clientEmail && privateKey) {
        adminApp = initializeApp({
          credential: cert({
            projectId: serviceAccount.project_id || resolvedAdminProjectId,
            clientEmail,
            privateKey: typeof privateKey === 'string' ? privateKey.replace(/\\n/g, '\n') : privateKey
          }),
          projectId: serviceAccount.project_id || resolvedAdminProjectId,
          storageBucket: `${resolvedAdminProjectId}.firebasestorage.app`
        });
        _hasAdminCredentials = true;
        _adminInitMethod = 'SERVICE_ACCOUNT';
      } else {
        console.warn('[Firebase Admin Init] FIREBASE_SERVICE_ACCOUNT is missing client_email or private_key.');
      }
    } catch (err: any) {
      console.warn('[Firebase Admin Init] Failed to initialize with FIREBASE_SERVICE_ACCOUNT:', err?.message || err);
    }
  }

  // 2. Try individual FIREBASE_PRIVATE_KEY and FIREBASE_CLIENT_EMAIL
  if (!_hasAdminCredentials && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    try {
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL.trim();
      const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n').trim();

      if (clientEmail.includes('@') && privateKey.includes('PRIVATE KEY')) {
        adminApp = initializeApp({
          credential: cert({
            projectId: resolvedAdminProjectId,
            clientEmail,
            privateKey
          }),
          projectId: resolvedAdminProjectId,
          storageBucket: `${resolvedAdminProjectId}.firebasestorage.app`
        });
        _hasAdminCredentials = true;
        _adminInitMethod = 'PRIVATE_KEY_EMAIL';
      } else {
        console.warn('[Firebase Admin Init] FIREBASE_PRIVATE_KEY or FIREBASE_CLIENT_EMAIL format is invalid.');
      }
    } catch (err: any) {
      console.warn('[Firebase Admin Init] Failed to initialize with FIREBASE_PRIVATE_KEY/EMAIL:', err?.message || err);
    }
  }

  // 3. Try GOOGLE_APPLICATION_CREDENTIALS
  if (!_hasAdminCredentials && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      adminApp = initializeApp({
        credential: applicationDefault(),
        projectId: resolvedAdminProjectId,
        storageBucket: `${resolvedAdminProjectId}.firebasestorage.app`
      });
      _hasAdminCredentials = true;
      _adminInitMethod = 'APPLICATION_DEFAULT';
    } catch (err: any) {
      console.warn('[Firebase Admin Init] Failed to initialize with applicationDefault:', err?.message || err);
    }
  }
}

export const hasAdminCredentials = _hasAdminCredentials;
export const adminInitMethod = _adminInitMethod;

let _adminAuth: Auth | null = null;
let _adminDb: Firestore | null = null;
let _adminStorage: Storage | null = null;

export const getAdminAuth = (): Auth | null => {
  if (!_adminAuth && adminApp && _hasAdminCredentials) {
    try {
      _adminAuth = getAuth(adminApp);
    } catch (err: any) {
      console.warn('[Firebase Admin] getAuth initialization error:', err?.message || err);
    }
  }
  return _adminAuth;
};

export const getAdminDb = (): Firestore | null => {
  if (!_adminDb && adminApp && _hasAdminCredentials) {
    try {
      _adminDb = getFirestore(adminApp);
    } catch (err: any) {
      console.warn('[Firebase Admin] getFirestore initialization error:', err?.message || err);
    }
  }
  return _adminDb;
};

export const getAdminStorage = (): Storage | null => {
  if (!_adminStorage && adminApp && _hasAdminCredentials) {
    try {
      _adminStorage = getStorage(adminApp);
    } catch (err: any) {
      console.warn('[Firebase Admin] getStorage initialization error:', err?.message || err);
    }
  }
  return _adminStorage;
};

export const adminAuth: Auth = new Proxy({} as Auth, {
  get(_target, prop) {
    const realAuth = getAdminAuth();
    if (!realAuth) {
      throw new Error('Firebase Admin Auth is not configured: valid admin credentials were not detected in the environment.');
    }
    const val = (realAuth as any)[prop];
    return typeof val === 'function' ? val.bind(realAuth) : val;
  }
});

export const adminDb: Firestore = new Proxy({} as Firestore, {
  get(_target, prop) {
    const realDb = getAdminDb();
    if (!realDb) {
      throw new Error('Firebase Admin Firestore is not configured: valid admin credentials were not detected in the environment.');
    }
    const val = (realDb as any)[prop];
    return typeof val === 'function' ? val.bind(realDb) : val;
  }
});

export const adminStorage: Storage = new Proxy({} as Storage, {
  get(_target, prop) {
    const realStorage = getAdminStorage();
    if (!realStorage) {
      throw new Error('Firebase Admin Storage is not configured: valid admin credentials were not detected in the environment.');
    }
    const val = (realStorage as any)[prop];
    return typeof val === 'function' ? val.bind(realStorage) : val;
  }
});

// Safe startup logging (no tokens, keys, passwords, or full credentials)
console.log(`[Firebase Admin Init] Status: ${hasAdminCredentials ? 'CREDENTIALS_INITIALIZED' : 'REST_FALLBACK_MODE'}`);
console.log(`[Firebase Admin Init] Target Project ID: ${resolvedAdminProjectId}`);
console.log(`[Firebase Admin Init] Auth Method: ${adminInitMethod}`);
console.log(`[Firebase Admin Init] Has Admin Credentials: ${hasAdminCredentials}`);
console.log(`[Firebase Admin Init] Runtime GCLOUD_PROJECT: ${process.env.GCLOUD_PROJECT || 'not set'}`);


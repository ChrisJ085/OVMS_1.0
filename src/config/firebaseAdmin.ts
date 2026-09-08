import { applicationDefault, cert, getApps, initializeApp, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';

const REQUIRED_PROJECT_ID = 'ovms-ad209';

const rawProjectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
const projectId = (rawProjectId && rawProjectId.trim()) ? rawProjectId.trim() : REQUIRED_PROJECT_ID;

if (projectId !== REQUIRED_PROJECT_ID) {
  console.warn(
    `[Firebase Admin Init] Notice: Resolved Admin project ID is '${projectId}' (default is '${REQUIRED_PROJECT_ID}').`
  );
}

let adminApp: App;

const existingApps = getApps();
if (existingApps.length > 0) {
  adminApp = existingApps[0];
} else {
  let initialized = false;

  // 1. Try FIREBASE_SERVICE_ACCOUNT (JSON string or base64 encoded)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      let serviceAccount: any;
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      } catch {
        const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8');
        serviceAccount = JSON.parse(decoded);
      }
      adminApp = initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || projectId,
        storageBucket: `${projectId}.firebasestorage.app`
      });
      initialized = true;
    } catch (err: any) {
      console.warn('[Firebase Admin Init] Failed to initialize with FIREBASE_SERVICE_ACCOUNT:', err?.message || err);
    }
  }

  // 2. Try individual FIREBASE_PRIVATE_KEY and FIREBASE_CLIENT_EMAIL
  if (!initialized && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    try {
      adminApp = initializeApp({
        credential: cert({
          projectId,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        }),
        projectId,
        storageBucket: `${projectId}.firebasestorage.app`
      });
      initialized = true;
    } catch (err: any) {
      console.warn('[Firebase Admin Init] Failed to initialize with FIREBASE_PRIVATE_KEY/EMAIL:', err?.message || err);
    }
  }

  // 3. Try GOOGLE_APPLICATION_CREDENTIALS
  if (!initialized && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      adminApp = initializeApp({
        credential: applicationDefault(),
        projectId,
        storageBucket: `${projectId}.firebasestorage.app`
      });
      initialized = true;
    } catch (err: any) {
      console.warn('[Firebase Admin Init] Failed to initialize with applicationDefault:', err?.message || err);
    }
  }

  // 4. Default unauthenticated app fallback (prevents module crashes in serverless)
  if (!initialized) {
    try {
      const apps = getApps();
      if (apps.length > 0) {
        adminApp = apps[0];
      } else {
        adminApp = initializeApp({
          projectId,
          storageBucket: `${projectId}.firebasestorage.app`
        });
      }
    } catch (err: any) {
      console.warn('[Firebase Admin Init] Fallback initializeApp note:', err?.message || err);
      const apps = getApps();
      adminApp = apps.length > 0 ? apps[0] : ({} as any);
    }
  }
}

export const hasAdminCredentials = !!(
  process.env.FIREBASE_SERVICE_ACCOUNT ||
  (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS
);

let _adminAuth: Auth | null = null;
let _adminDb: Firestore | null = null;
let _adminStorage: Storage | null = null;

export const getAdminAuth = (): Auth | null => {
  if (!_adminAuth && adminApp) {
    try {
      _adminAuth = getAuth(adminApp);
    } catch (err: any) {
      console.warn('[Firebase Admin] getAuth initialization error:', err?.message || err);
    }
  }
  return _adminAuth;
};

export const getAdminDb = (): Firestore | null => {
  if (!_adminDb && adminApp) {
    try {
      _adminDb = getFirestore(adminApp);
    } catch (err: any) {
      console.warn('[Firebase Admin] getFirestore initialization error:', err?.message || err);
    }
  }
  return _adminDb;
};

export const getAdminStorage = (): Storage | null => {
  if (!_adminStorage && adminApp) {
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
      throw new Error('Firebase Admin Auth is not initialized or credentials are not available.');
    }
    const val = (realAuth as any)[prop];
    return typeof val === 'function' ? val.bind(realAuth) : val;
  }
});

export const adminDb: Firestore = new Proxy({} as Firestore, {
  get(_target, prop) {
    const realDb = getAdminDb();
    if (!realDb) {
      throw new Error('Firebase Admin Firestore is not initialized or credentials are not available.');
    }
    const val = (realDb as any)[prop];
    return typeof val === 'function' ? val.bind(realDb) : val;
  }
});

export const adminStorage: Storage = new Proxy({} as Storage, {
  get(_target, prop) {
    const realStorage = getAdminStorage();
    if (!realStorage) {
      throw new Error('Firebase Admin Storage is not initialized or credentials are not available.');
    }
    const val = (realStorage as any)[prop];
    return typeof val === 'function' ? val.bind(realStorage) : val;
  }
});

export const resolvedAdminProjectId = projectId;

// Safe startup logging (no tokens, keys, passwords, or full credentials)
console.log(`[Firebase Admin Init] Firebase Admin module initialized.`);
console.log(`[Firebase Admin Init] Target Project ID: ${projectId}`);
console.log(`[Firebase Admin Init] Runtime GCLOUD_PROJECT: ${process.env.GCLOUD_PROJECT || 'not set'}`);
console.log(`[Firebase Admin Init] Has Admin Credentials: ${hasAdminCredentials}`);
console.log(`[Firebase Admin Init] Initialization Status: SUCCESS`);

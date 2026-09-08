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

const createAdminProxy = <T extends object>(dummy: T, getReal: () => T | null, name: string): T => {
  const overrides = new Map<string | symbol, any>();
  return new Proxy(dummy, {
    get(target, prop, receiver) {
      if (overrides.has(prop)) {
        return overrides.get(prop);
      }
      const real = getReal();
      if (!real) {
        if (prop in target) {
          return (target as any)[prop];
        }
        throw new Error(`Firebase Admin ${name} is not configured: valid admin credentials were not detected in the environment.`);
      }
      const val = (real as any)[prop];
      return typeof val === 'function' ? val.bind(real) : val;
    },
    set(target, prop, value) {
      overrides.set(prop, value);
      (target as any)[prop] = value;
      return true;
    },
    defineProperty(target, prop, descriptor) {
      if ('value' in descriptor) {
        overrides.set(prop, descriptor.value);
      }
      return Reflect.defineProperty(target, prop, descriptor);
    },
    deleteProperty(target, prop) {
      overrides.delete(prop);
      return Reflect.deleteProperty(target, prop);
    },
    has(target, prop) {
      if (overrides.has(prop)) return true;
      const real = getReal();
      return real ? prop in real : prop in target;
    },
    getOwnPropertyDescriptor(target, prop) {
      if (overrides.has(prop)) {
        return {
          configurable: true,
          enumerable: true,
          writable: true,
          value: overrides.get(prop)
        };
      }
      const real = getReal();
      if (real && prop in real) {
        return {
          configurable: true,
          enumerable: true,
          writable: true,
          value: typeof (real as any)[prop] === 'function' ? (real as any)[prop].bind(real) : (real as any)[prop]
        };
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    }
  });
};

const authDummy: any = {
  verifyIdToken: async (_token: string) => ({} as any),
  createUser: async (_props: any) => ({} as any),
  deleteUser: async (_uid: string) => {},
  getUser: async (_uid: string) => ({} as any),
  getUserByEmail: async (_email: string) => ({} as any),
  setCustomUserClaims: async (_uid: string, _claims: any) => {},
  createCustomToken: async (_uid: string) => '',
  app: { options: { projectId: resolvedAdminProjectId } }
};

export const adminAuth: Auth = createAdminProxy(authDummy as Auth, getAdminAuth, 'Auth');

const dbDummy: any = {
  collection: (_path: string) => ({} as any),
  doc: (_path: string) => ({} as any),
  batch: () => ({} as any),
  runTransaction: async (_updateFunction: any) => ({} as any),
  projectId: resolvedAdminProjectId,
  app: { options: { projectId: resolvedAdminProjectId } }
};

export const adminDb: Firestore = createAdminProxy(dbDummy as Firestore, getAdminDb, 'Firestore');

const storageDummy: any = {
  bucket: (_name?: string) => ({} as any),
  app: { options: { projectId: resolvedAdminProjectId } }
};

export const adminStorage: Storage = createAdminProxy(storageDummy as Storage, getAdminStorage, 'Storage');

// Safe startup logging (no tokens, keys, passwords, or full credentials)
console.log(`[Firebase Admin Init] Status: ${hasAdminCredentials ? 'CREDENTIALS_INITIALIZED' : 'REST_FALLBACK_MODE'}`);
console.log(`[Firebase Admin Init] Target Project ID: ${resolvedAdminProjectId}`);
console.log(`[Firebase Admin Init] Auth Method: ${adminInitMethod}`);
console.log(`[Firebase Admin Init] Has Admin Credentials: ${hasAdminCredentials}`);
console.log(`[Firebase Admin Init] Runtime GCLOUD_PROJECT: ${process.env.GCLOUD_PROJECT || 'not set'}`);


import { applicationDefault, getApps, initializeApp, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';

const REQUIRED_PROJECT_ID = 'ovms-ad209';

const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  REQUIRED_PROJECT_ID;

if (process.env.NODE_ENV === 'production' && projectId !== REQUIRED_PROJECT_ID) {
  throw new Error(
    `Fatal: Resolved Admin project ID '${projectId}' is not '${REQUIRED_PROJECT_ID}' in production.`
  );
}

let adminApp: App;

if (getApps().length > 0) {
  adminApp = getApps()[0];
} else {
  try {
    adminApp = initializeApp({
      credential: applicationDefault(),
      projectId,
      storageBucket: `${projectId}.firebasestorage.app`
    });
  } catch (err) {
    adminApp = initializeApp({
      projectId,
      storageBucket: `${projectId}.firebasestorage.app`
    });
  }
}

export const adminAuth: Auth = getAuth(adminApp);
export const adminDb: Firestore = getFirestore(adminApp);
export const adminStorage: Storage = getStorage(adminApp);
export const resolvedAdminProjectId = projectId;

// Safe startup logging (no tokens, keys, passwords, or full credentials)
console.log(`[Firebase Admin Init] Firebase Admin module initialized.`);
console.log(`[Firebase Admin Init] Target Project ID: ${projectId}`);
console.log(`[Firebase Admin Init] Runtime GCLOUD_PROJECT: ${process.env.GCLOUD_PROJECT || 'not set'}`);
console.log(`[Firebase Admin Init] Initialization Status: SUCCESS`);

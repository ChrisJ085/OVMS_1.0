import express from "express";
import { FieldValue, Query, DocumentReference } from 'firebase-admin/firestore';
import { adminAuth as auth, adminDb as db, resolvedAdminProjectId } from "../config/firebaseAdmin";

const FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY || "AIzaSyBi4tywQk5WaNIvalD3uSrz4Au7WxolJlM";
const FIREBASE_PROJECT_ID = resolvedAdminProjectId || "ovms-ad209";

function jsToFirestoreFields(obj: any): any {
  const fields: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      fields[key] = jsToFirestoreValue(val);
    }
  }
  return fields;
}

function jsToFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (typeof val === "string") return { stringValue: val };
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(jsToFirestoreValue) } };
  }
  if (typeof val === "object") {
    return { mapValue: { fields: jsToFirestoreFields(val) } };
  }
  return { stringValue: String(val) };
}

function firestoreFieldsToJs(fields: any): any {
  if (!fields) return {};
  const obj: Record<string, any> = {};
  for (const [key, val] of Object.entries(fields)) {
    obj[key] = firestoreValueToJs(val);
  }
  return obj;
}

function firestoreValueToJs(val: any): any {
  if (!val) return null;
  if ("stringValue" in val) return val.stringValue;
  if ("booleanValue" in val) return val.booleanValue;
  if ("integerValue" in val) return parseInt(val.integerValue, 10);
  if ("doubleValue" in val) return parseFloat(val.doubleValue);
  if ("timestampValue" in val) return val.timestampValue;
  if ("nullValue" in val) return null;
  if ("arrayValue" in val) {
    return (val.arrayValue.values || []).map(firestoreValueToJs);
  }
  if ("mapValue" in val) {
    return firestoreFieldsToJs(val.mapValue.fields);
  }
  return null;
}

async function safeGetUserProfile(uid: string, callerToken?: string): Promise<{ exists: boolean; data?: any }> {
  try {
    const callerDoc = await db.collection("users").doc(uid).get();
    if (callerDoc.exists) {
      return { exists: true, data: callerDoc.data() };
    } else {
      return { exists: false };
    }
  } catch (err: any) {
    if (callerToken) {
      try {
        console.info(`[Server REST Integration] Fetching user profile via Firestore REST API.`);
        const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`;
        const res = await fetch(url, {
          headers: { "Authorization": `Bearer ${callerToken}` }
        });
        if (res.status === 200) {
          const json = await res.json();
          return { exists: true, data: firestoreFieldsToJs(json.fields) };
        } else if (res.status === 404) {
          return { exists: false };
        }
      } catch (restErr) {
        console.warn(`[Server REST Integration] Fetch profile REST error:`, restErr);
      }
    }
    return { exists: false };
  }
}

async function safeCheckUserExistsByEmailInFirestore(email: string, callerToken?: string, tenantId?: string | null): Promise<boolean> {
  try {
    let q: any = db.collection("users").where("email", "==", email);
    if (tenantId) {
      q = q.where("tenantId", "==", tenantId);
    }
    const snap = await q.get();
    return !snap.empty;
  } catch (err: any) {
    if (callerToken) {
      try {
        console.info(`[Server REST Integration] Querying user profile via Firestore REST API.`);
        const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`;
        
        const filters: any[] = [
          {
            fieldFilter: {
              field: { fieldPath: "email" },
              op: "EQUAL",
              value: { stringValue: email }
            }
          }
        ];

        if (tenantId) {
          filters.push({
            fieldFilter: {
              field: { fieldPath: "tenantId" },
              op: "EQUAL",
              value: { stringValue: tenantId }
            }
          });
        }

        const whereClause = filters.length === 1 
          ? filters[0] 
          : { compositeFilter: { op: "AND", filters } };

        const res = await fetch(url, {
          method: "POST",
          headers: { "Authorization": `Bearer ${callerToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            structuredQuery: {
              from: [{ collectionId: "users" }],
              where: whereClause
            }
          })
        });
        if (res.ok) {
          const results = await res.json();
          return Array.isArray(results) && results.some((r: any) => r.document);
        } else {
          console.warn(`[Server REST Integration] runQuery returned status ${res.status}`);
          return false;
        }
      } catch (restErr) {
        console.warn(`[Server REST Integration] runQuery REST exception:`, restErr);
        return false;
      }
    }
    return false;
  }
}

async function safeCreateAuthUser(email: string, password?: string, displayName?: string): Promise<{ uid: string; email: string }> {
  try {
    const userRecord = await auth.createUser({
      email,
      password: password || 'TempPass123!',
      displayName,
    });
    return { uid: userRecord.uid, email: userRecord.email || email };
  } catch (err: any) {
    console.info(`[Server REST Integration] Creating Auth account via Identity Toolkit REST API.`);
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password: password || 'TempPass123!',
        returnSecureToken: true
      })
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.error?.message === 'EMAIL_EXISTS') {
        const dupErr: any = new Error(`An account with email '${email}' already exists in Firebase Authentication.`);
        dupErr.code = 'auth/email-already-exists';
        throw dupErr;
      }
      throw new Error(`Failed to create Auth account via REST: ${data.error?.message || JSON.stringify(data)}`);
    }
    return { uid: data.localId, email: data.email || email };
  }
}

async function safeCreateUserProfileDoc(uid: string, profilePayload: any, callerToken?: string): Promise<void> {
  try {
    await db.collection("users").doc(uid).set(profilePayload);
  } catch (err: any) {
    if (callerToken) {
      console.info(`[Server REST Integration] Writing user profile doc via Firestore REST API.`);
      const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`;
      const restPayload = { ...profilePayload };
      const nowIso = new Date().toISOString();
      for (const k of Object.keys(restPayload)) {
        if (restPayload[k] && typeof restPayload[k] === 'object' && ('_isServerTimestamp' in restPayload[k] || restPayload[k].methodName === 'serverTimestamp' || typeof restPayload[k].isEqual === 'function')) {
          restPayload[k] = nowIso;
        }
      }
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Authorization": `Bearer ${callerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: jsToFirestoreFields(restPayload) })
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(`Firestore REST set profile failed (${res.status}): ${errJson.error?.message || JSON.stringify(errJson)}`);
      }
      return;
    }
    throw err;
  }
}

async function safeCreateAuditLog(auditPayload: any, callerToken?: string): Promise<void> {
  try {
    await db.collection("auditLogs").add(auditPayload);
  } catch (err: any) {
    if (callerToken) {
      console.info(`[Server REST Integration] Creating audit log entry via Firestore REST API.`);
      const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/auditLogs`;
      const restPayload = { ...auditPayload };
      const nowIso = new Date().toISOString();
      for (const k of Object.keys(restPayload)) {
        if (restPayload[k] && typeof restPayload[k] === 'object' && ('_isServerTimestamp' in restPayload[k] || restPayload[k].methodName === 'serverTimestamp' || typeof restPayload[k].isEqual === 'function')) {
          restPayload[k] = nowIso;
        }
      }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Authorization": `Bearer ${callerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: jsToFirestoreFields(restPayload) })
      });
      if (!res.ok) {
        console.error(`Firestore REST audit log failed (${res.status})`, await res.text());
      }
      return;
    }
    throw err;
  }
}

// Collections that have tenantId as a field
const TENANT_COLLECTIONS = [
  'siteSettings',
  'users',
  'products',
  'locations',
  'destinations',
  'productionLines',
  'unitsOfMeasure',
  'productCategories',
  'storageAreas',
  'actionTypes',
  'priorityLevels',
  'inventoryBalances',
  'inventoryMovements',
  'planningRules',
  'promotions',
  'promotionProductRules',
  'decisionConfigurations',
  'productionEvents',
  'recommendations',
  'priorities',
  'displayPriorities',
  'priorityEvents',
  'announcements',
  'exceptions',
  'productionPlanEntries',
  'productionPlanImports',
  'productionLinePlanNotes',
  'importJobs',
  'sessions',
  'auditLogs',
  'settings'
];

async function deleteQueryBatch(query: Query, resolve: () => void, jobRef: DocumentReference) {
  const snapshot = await query.get();

  const batchSize = snapshot.size;
  if (batchSize === 0) {
    resolve();
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  await jobRef.update({
    documentsDeleted: FieldValue.increment(batchSize)
  });

  process.nextTick(() => {
    deleteQueryBatch(query, resolve, jobRef).catch((err) => {
      console.error(err);
      resolve();
    });
  });
}

async function processDeletion(jobId: string) {
  const jobRef = db.collection("tenantDeletionJobs").doc(jobId);
  const jobDoc = await jobRef.get();
  
  if (!jobDoc.exists) return;
  const jobData = jobDoc.data()!;
  const tenantId = jobData.tenantId;
  
  try {
    await jobRef.update({
      status: "IN_PROGRESS",
      startedAt: FieldValue.serverTimestamp()
    });

    // 1. Delete all subcollections of productionPlanImports (e.g. rows)
    await jobRef.update({ currentStage: "DELETING_SUBCOLLECTIONS" });
    const importsSnapshot = await db.collection("productionPlanImports").where("tenantId", "==", tenantId).get();
    for (const importDoc of importsSnapshot.docs) {
      const rowsQuery = importDoc.ref.collection("rows").limit(500);
      await new Promise<void>((resolve, reject) => {
        deleteQueryBatch(rowsQuery, resolve, jobRef).catch(reject);
      });
    }

    // 2. Delete main tenant collections
    await jobRef.update({ currentStage: "DELETING_COLLECTIONS" });
    for (const collectionName of TENANT_COLLECTIONS) {
      if (jobData.collectionsProcessed && jobData.collectionsProcessed.includes(collectionName)) {
        continue;
      }
      
      const query = db.collection(collectionName).where("tenantId", "==", tenantId).limit(500);
      await new Promise<void>((resolve, reject) => {
        deleteQueryBatch(query, resolve, jobRef).catch(reject);
      });
      
      await jobRef.update({
        collectionsProcessed: FieldValue.arrayUnion(collectionName)
      });
    }

    // 3. Delete tenant sites
    await jobRef.update({ currentStage: "DELETING_SITES" });
    const sitesQuery = db.collection("sites").where("tenantId", "==", tenantId).limit(500);
    await new Promise<void>((resolve, reject) => {
      deleteQueryBatch(sitesQuery, resolve, jobRef).catch(reject);
    });
    
    // 4. Platform users deleted via users collection
    await jobRef.update({ currentStage: "DELETING_AUTH_USERS" });
    
    // 5. Delete the tenant document
    await jobRef.update({ currentStage: "DELETING_TENANT" });
    await db.collection("tenants").doc(tenantId).delete();
    
    // 6. Platform receipt
    await jobRef.update({ currentStage: "CREATING_RECEIPT" });
    const finalJobDoc = await jobRef.get();
    await db.collection("platformDeletionReceipts").add({
      deletedTenantId: tenantId,
      deletedTenantName: jobData.tenantName,
      jobId,
      requestedBy: jobData.requestedBy,
      requestedByEmail: jobData.requestedByEmail,
      requestedAt: jobData.requestedAt,
      completedAt: FieldValue.serverTimestamp(),
      finalDocumentCount: finalJobDoc.data()?.documentsDeleted || 0,
      finalUserCount: finalJobDoc.data()?.usersDeleted || 0,
      finalFileCount: finalJobDoc.data()?.filesDeleted || 0,
      failureCount: finalJobDoc.data()?.failures?.length || 0,
      status: "COMPLETED"
    });

    await jobRef.update({
      status: "COMPLETED",
      completedAt: FieldValue.serverTimestamp()
    });

  } catch (error: any) {
    console.error("Deletion failed:", error);
    await jobRef.update({
      status: "FAILED",
      failedAt: FieldValue.serverTimestamp(),
      failures: FieldValue.arrayUnion(error.message)
    });
  }
}

// Create Express API App
const apiApp = express();

apiApp.use(express.json());

// CORS & Preflight headers for cross-origin or serverless invocations
apiApp.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Router for API endpoints
const router = express.Router();

router.get("/", (req, res) => {
  res.json({ status: "ok", service: "OVMS API" });
});

router.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Protected Firebase diagnostics endpoint (PLATFORM_SUPERUSER only)
router.get("/admin/firebase-diagnostics", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Unauthorized: Missing authorization header" });
    }

    const callerToken = authHeader.split('Bearer ')[1];
    let verifiedToken;
    try {
      verifiedToken = await auth.verifyIdToken(callerToken);
    } catch (error: any) {
      return res.status(401).json({ error: `Unauthorized: Invalid token (${error.message})` });
    }

    const verifiedUid = verifiedToken.uid;
    const callerRes = await safeGetUserProfile(verifiedUid, callerToken);
    if (!callerRes.exists) {
      return res.status(403).json({ error: "Forbidden: Caller user profile not found" });
    }

    const callerProfile = callerRes.data;
    if (callerProfile?.accountStatus !== 'ACTIVE' || callerProfile?.role !== 'PLATFORM_SUPERUSER') {
      return res.status(403).json({ error: "Forbidden: Only active Platform Superusers can access diagnostics" });
    }

    return res.json({
      adminProjectId: resolvedAdminProjectId,
      tokenAudience: verifiedToken.aud,
      tokenIssuer: verifiedToken.iss,
      uid: verifiedUid,
      status: "healthy"
    });
  } catch (error: any) {
    console.error("Diagnostics endpoint error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});

// Start tenant deletion job
router.post("/tenant-deletion", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const callerToken = authHeader.split('Bearer ')[1];
    let verifiedToken;
    try {
      verifiedToken = await auth.verifyIdToken(callerToken);
    } catch (error) {
      return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }

    const verifiedUid = verifiedToken.uid;
    const userRes = await safeGetUserProfile(verifiedUid, callerToken);
    const userProfile = userRes.data;

    const isActive = userProfile && userProfile.accountStatus === 'ACTIVE';
    if (!userRes.exists || userProfile?.role !== "PLATFORM_SUPERUSER" || !isActive) {
      return res.status(403).json({ error: "Forbidden: Insufficient privileges or inactive account" });
    }

    const { tenantId, tenantName } = req.body;
    if (!tenantId || !tenantName) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const requestedBy = verifiedUid;
    const requestedByEmail = verifiedToken.email || userProfile?.email || "unknown";

    const tenantDoc = await db.collection("tenants").doc(tenantId).get();
    if (tenantDoc.exists && tenantDoc.data()?.isSystemTenant) {
      return res.status(400).json({ error: "Cannot delete system tenant" });
    }

    const jobId = db.collection("tenantDeletionJobs").doc().id;

    const jobData = {
      jobId,
      tenantId,
      tenantName,
      requestedBy,
      requestedByEmail,
      requestedAt: FieldValue.serverTimestamp(),
      status: "QUEUED",
      currentStage: "INITIALIZING",
      collectionsProcessed: [],
      documentsDeleted: 0,
      usersDeleted: 0,
      filesDeleted: 0,
      failures: [],
      retryCount: 0
    };

    await db.collection("tenantDeletionJobs").doc(jobId).set(jobData);
    
    if (tenantDoc.exists) {
      await db.collection("tenants").doc(tenantId).update({
        status: "DELETION_PENDING",
        deletionJobId: jobId,
        deletionRequestedBy: requestedBy,
        deletionRequestedAt: FieldValue.serverTimestamp()
      });
    }

    processDeletion(jobId).catch(console.error);

    res.json({ success: true, jobId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/tenant-deletion/:jobId/retry", async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const callerToken = authHeader.split('Bearer ')[1];
    let verifiedToken;
    try {
      verifiedToken = await auth.verifyIdToken(callerToken);
    } catch (error) {
      return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }

    const verifiedUid = verifiedToken.uid;
    const userRes = await safeGetUserProfile(verifiedUid, callerToken);
    const userProfile = userRes.data;

    const isActive = userProfile && userProfile.accountStatus === 'ACTIVE';
    if (!userRes.exists || userProfile?.role !== "PLATFORM_SUPERUSER" || !isActive) {
      return res.status(403).json({ error: "Forbidden: Insufficient privileges or inactive account" });
    }
    
    const jobDocRef = db.collection("tenantDeletionJobs").doc(jobId);
    const jobDoc = await jobDocRef.get();
    if (!jobDoc.exists) {
      return res.status(404).json({ error: "Job not found" });
    }
    
    await jobDocRef.update({
      status: "QUEUED",
      retryCount: FieldValue.increment(1)
    });
    
    processDeletion(jobId).catch(console.error);
    
    res.json({ success: true, jobId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Provision User Account Endpoint (PLATFORM_SUPERUSER and TENANT_ADMIN)
router.post("/admin/provision-user", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: "Unauthorized: Missing authorization header" });
    }

    const callerToken = authHeader.split('Bearer ')[1];
    let verifiedToken;
    try {
      verifiedToken = await auth.verifyIdToken(callerToken);
    } catch (error: any) {
      return res.status(401).json({ success: false, error: `Unauthorized: Invalid token (${error.message})` });
    }

    const verifiedUid = verifiedToken.uid;
    const callerRes = await safeGetUserProfile(verifiedUid, callerToken);
    if (!callerRes.exists) {
      return res.status(403).json({ success: false, error: "Forbidden: Caller user profile not found" });
    }

    const callerProfile = callerRes.data;
    if (callerProfile?.accountStatus !== 'ACTIVE') {
      return res.status(403).json({ success: false, error: "Forbidden: Your administrator account is not active" });
    }

    if (callerProfile?.role !== 'PLATFORM_SUPERUSER' && callerProfile?.role !== 'TENANT_ADMIN') {
      return res.status(403).json({ success: false, error: "Forbidden: Only Platform Superusers and Tenant Admins can provision accounts" });
    }

    const { email, displayName, jobTitle, role, tenantId, siteIds, temporaryPassword } = req.body;

    if (!email || !displayName || !role) {
      return res.status(400).json({ success: false, error: "Email, Display Name, and Role are required" });
    }

    const validRoles = ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER', 'WAREHOUSE_OPERATOR', 'VIEWER', 'DISPLAY'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, error: `Invalid role specified: ${role}` });
    }

    if (callerProfile.role === 'TENANT_ADMIN') {
      if (role === 'PLATFORM_SUPERUSER') {
        return res.status(403).json({ success: false, error: "Tenant Admins cannot create Platform Superusers" });
      }
      if (tenantId !== callerProfile.tenantId) {
        return res.status(403).json({ success: false, error: "Tenant Admins can only create users within their own tenant" });
      }
    }

    const targetTenantId = role === 'PLATFORM_SUPERUSER' ? null : (tenantId ? tenantId.trim() : null);
    if (role !== 'PLATFORM_SUPERUSER' && !targetTenantId) {
      return res.status(400).json({ success: false, error: "A valid tenant must be selected for non-superuser accounts" });
    }

    const cleanEmail = email.toLowerCase().trim();

    const existsInFirestore = await safeCheckUserExistsByEmailInFirestore(cleanEmail, callerToken, targetTenantId);
    if (existsInFirestore) {
      return res.status(409).json({ success: false, error: `A user profile with email '${cleanEmail}' already exists in Firestore.` });
    }

    let userRecord;
    try {
      userRecord = await safeCreateAuthUser(cleanEmail, temporaryPassword || 'TempPass123!', displayName.trim());
    } catch (error: any) {
      if (error.code === 'auth/email-already-exists') {
        return res.status(409).json({ success: false, error: `An account with email '${cleanEmail}' already exists in Firebase Authentication.` });
      }
      return res.status(400).json({ success: false, error: `Failed to create Firebase Authentication account: ${error.message}` });
    }

    try {
      const timestampNow = FieldValue.serverTimestamp();
      const profilePayload = {
        uid: userRecord.uid,
        email: cleanEmail,
        displayName: displayName.trim(),
        jobTitle: jobTitle ? jobTitle.trim() : '',
        role,
        tenantId: targetTenantId,
        siteIds: role === 'PLATFORM_SUPERUSER' ? [] : (siteIds || []),
        accountStatus: 'ACTIVE',
        requiresPasswordChange: true,
        failedLoginAttempts: 0,
        failedAttemptWindowStartedAt: null,
        lockedAt: null,
        lastLoginAt: null,
        passwordChangedAt: null,
        createdBy: verifiedUid,
        createdDate: timestampNow,
        modifiedBy: verifiedUid,
        modifiedDate: timestampNow,
      };

      await safeCreateUserProfileDoc(userRecord.uid, profilePayload, callerToken);

      await safeCreateAuditLog({
        tenantId: targetTenantId,
        siteId: (siteIds && siteIds.length > 0) ? siteIds[0] : null,
        eventType: 'USER_CREATION',
        entityType: 'UserProfile',
        entityId: userRecord.uid,
        summary: `Created user account for ${cleanEmail} with role ${role}`,
        performedBy: verifiedUid,
        createdDate: timestampNow,
        timestamp: timestampNow,
      }, callerToken);

      return res.json({
        success: true,
        uid: userRecord.uid,
        message: `User ${cleanEmail} successfully created with role ${role}.`
      });
    } catch (error: any) {
      try {
        await auth.deleteUser(userRecord.uid);
      } catch (delErr) {
        // ignore rollback error if admin lacks permission
      }
      return res.status(500).json({ success: false, error: `Failed to create user profile in Firestore: ${error.message}` });
    }
  } catch (error: any) {
    console.error('Provisioning endpoint error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

// Mount the router on both '/api' and '/'
// This allows apiApp to handle requests whether the '/api' prefix was stripped or preserved
apiApp.use('/api', router);
apiApp.use('/', router);

// Unmatched API requests return 404 JSON, never index.html
apiApp.use((req, res) => {
  res.status(404).json({ error: `Not Found: ${req.method} ${req.originalUrl || req.url}` });
});

export default apiApp;

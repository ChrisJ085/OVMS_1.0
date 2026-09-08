// src/server/apiApp.ts
import express from "express";
import { FieldValue } from "firebase-admin/firestore";

// src/config/firebaseAdmin.ts
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
var REQUIRED_PROJECT_ID = "ovms-ad209";
var rawProjectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
var resolvedAdminProjectId = rawProjectId && rawProjectId.trim() ? rawProjectId.trim() : REQUIRED_PROJECT_ID;
var adminApp = null;
var _hasAdminCredentials = false;
var _adminInitMethod = "NONE";
var existingApps = getApps();
if (existingApps.length > 0) {
  adminApp = existingApps[0];
  _hasAdminCredentials = true;
  _adminInitMethod = "APPLICATION_DEFAULT";
} else {
  if (process.env.FIREBASE_SERVICE_ACCOUNT && process.env.FIREBASE_SERVICE_ACCOUNT.trim()) {
    try {
      let serviceAccount;
      const rawEnv = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      try {
        serviceAccount = JSON.parse(rawEnv);
      } catch {
        const decoded = Buffer.from(rawEnv, "base64").toString("utf8");
        serviceAccount = JSON.parse(decoded);
      }
      const clientEmail = serviceAccount.client_email || serviceAccount.clientEmail;
      const privateKey = serviceAccount.private_key || serviceAccount.privateKey;
      if (clientEmail && privateKey) {
        adminApp = initializeApp({
          credential: cert({
            projectId: serviceAccount.project_id || resolvedAdminProjectId,
            clientEmail,
            privateKey: typeof privateKey === "string" ? privateKey.replace(/\\n/g, "\n") : privateKey
          }),
          projectId: serviceAccount.project_id || resolvedAdminProjectId,
          storageBucket: `${resolvedAdminProjectId}.firebasestorage.app`
        });
        _hasAdminCredentials = true;
        _adminInitMethod = "SERVICE_ACCOUNT";
      } else {
        console.warn("[Firebase Admin Init] FIREBASE_SERVICE_ACCOUNT is missing client_email or private_key.");
      }
    } catch (err) {
      console.warn("[Firebase Admin Init] Failed to initialize with FIREBASE_SERVICE_ACCOUNT:", err?.message || err);
    }
  }
  if (!_hasAdminCredentials && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    try {
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL.trim();
      const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n").trim();
      if (clientEmail.includes("@") && privateKey.includes("PRIVATE KEY")) {
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
        _adminInitMethod = "PRIVATE_KEY_EMAIL";
      } else {
        console.warn("[Firebase Admin Init] FIREBASE_PRIVATE_KEY or FIREBASE_CLIENT_EMAIL format is invalid.");
      }
    } catch (err) {
      console.warn("[Firebase Admin Init] Failed to initialize with FIREBASE_PRIVATE_KEY/EMAIL:", err?.message || err);
    }
  }
  if (!_hasAdminCredentials && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      adminApp = initializeApp({
        credential: applicationDefault(),
        projectId: resolvedAdminProjectId,
        storageBucket: `${resolvedAdminProjectId}.firebasestorage.app`
      });
      _hasAdminCredentials = true;
      _adminInitMethod = "APPLICATION_DEFAULT";
    } catch (err) {
      console.warn("[Firebase Admin Init] Failed to initialize with applicationDefault:", err?.message || err);
    }
  }
}
var hasAdminCredentials = _hasAdminCredentials;
var adminInitMethod = _adminInitMethod;
var _adminAuth = null;
var _adminDb = null;
var _adminStorage = null;
var getAdminAuth = () => {
  if (!_adminAuth && adminApp && _hasAdminCredentials) {
    try {
      _adminAuth = getAuth(adminApp);
    } catch (err) {
      console.warn("[Firebase Admin] getAuth initialization error:", err?.message || err);
    }
  }
  return _adminAuth;
};
var getAdminDb = () => {
  if (!_adminDb && adminApp && _hasAdminCredentials) {
    try {
      _adminDb = getFirestore(adminApp);
    } catch (err) {
      console.warn("[Firebase Admin] getFirestore initialization error:", err?.message || err);
    }
  }
  return _adminDb;
};
var getAdminStorage = () => {
  if (!_adminStorage && adminApp && _hasAdminCredentials) {
    try {
      _adminStorage = getStorage(adminApp);
    } catch (err) {
      console.warn("[Firebase Admin] getStorage initialization error:", err?.message || err);
    }
  }
  return _adminStorage;
};
var createAdminProxy = (dummy, getReal, name) => {
  const overrides = /* @__PURE__ */ new Map();
  return new Proxy(dummy, {
    get(target, prop, receiver) {
      if (overrides.has(prop)) {
        return overrides.get(prop);
      }
      const real = getReal();
      if (!real) {
        if (prop in target) {
          return target[prop];
        }
        throw new Error(`Firebase Admin ${name} is not configured: valid admin credentials were not detected in the environment.`);
      }
      const val = real[prop];
      return typeof val === "function" ? val.bind(real) : val;
    },
    set(target, prop, value) {
      overrides.set(prop, value);
      target[prop] = value;
      return true;
    },
    defineProperty(target, prop, descriptor) {
      if ("value" in descriptor) {
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
          value: typeof real[prop] === "function" ? real[prop].bind(real) : real[prop]
        };
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    }
  });
};
var authDummy = {
  verifyIdToken: async (_token) => ({}),
  createUser: async (_props) => ({}),
  deleteUser: async (_uid) => {
  },
  getUser: async (_uid) => ({}),
  getUserByEmail: async (_email) => ({}),
  setCustomUserClaims: async (_uid, _claims) => {
  },
  createCustomToken: async (_uid) => "",
  app: { options: { projectId: resolvedAdminProjectId } }
};
var adminAuth = createAdminProxy(authDummy, getAdminAuth, "Auth");
var dbDummy = {
  collection: (_path) => ({}),
  doc: (_path) => ({}),
  batch: () => ({}),
  runTransaction: async (_updateFunction) => ({}),
  projectId: resolvedAdminProjectId,
  app: { options: { projectId: resolvedAdminProjectId } }
};
var adminDb = createAdminProxy(dbDummy, getAdminDb, "Firestore");
var storageDummy = {
  bucket: (_name) => ({}),
  app: { options: { projectId: resolvedAdminProjectId } }
};
var adminStorage = createAdminProxy(storageDummy, getAdminStorage, "Storage");
console.log(`[Firebase Admin Init] Status: ${hasAdminCredentials ? "CREDENTIALS_INITIALIZED" : "REST_FALLBACK_MODE"}`);
console.log(`[Firebase Admin Init] Target Project ID: ${resolvedAdminProjectId}`);
console.log(`[Firebase Admin Init] Auth Method: ${adminInitMethod}`);
console.log(`[Firebase Admin Init] Has Admin Credentials: ${hasAdminCredentials}`);
console.log(`[Firebase Admin Init] Runtime GCLOUD_PROJECT: ${process.env.GCLOUD_PROJECT || "not set"}`);

// src/server/apiApp.ts
var FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY || "AIzaSyBi4tywQk5WaNIvalD3uSrz4Au7WxolJlM";
var FIREBASE_PROJECT_ID = resolvedAdminProjectId || "ovms-ad209";
function isServerTimestamp(val) {
  if (!val || typeof val !== "object") return false;
  if ("_isServerTimestamp" in val) return true;
  if (val.methodName === "serverTimestamp" || val.methodName === "FieldValue.serverTimestamp") return true;
  if (val.constructor && (val.constructor.name === "ServerTimestampTransform" || val.constructor.name === "FieldValue")) return true;
  return false;
}
function jsToFirestoreFields(obj) {
  const fields = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== void 0) {
      fields[key] = jsToFirestoreValue(val);
    }
  }
  return fields;
}
function jsToFirestoreValue(val) {
  if (val === null || val === void 0) return { nullValue: null };
  if (isServerTimestamp(val)) return { timestampValue: (/* @__PURE__ */ new Date()).toISOString() };
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
function firestoreFieldsToJs(fields) {
  if (!fields) return {};
  const obj = {};
  for (const [key, val] of Object.entries(fields)) {
    obj[key] = firestoreValueToJs(val);
  }
  return obj;
}
function firestoreValueToJs(val) {
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
async function safeVerifyCallerToken(callerToken) {
  try {
    const decoded = await adminAuth.verifyIdToken(callerToken);
    return { uid: decoded.uid, email: decoded.email };
  } catch (adminErr) {
    console.info("[Server Auth Verification] Admin SDK verifyIdToken fallback to Identity Toolkit lookup:", adminErr?.message || adminErr);
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: callerToken })
    });
    const data = await res.json();
    if (!res.ok || !data.users || data.users.length === 0) {
      throw new Error(data.error?.message || "Invalid or expired Firebase ID token.");
    }
    const user = data.users[0];
    return { uid: user.localId, email: user.email };
  }
}
async function safeGetUserProfile(uid, callerToken) {
  if (hasAdminCredentials) {
    try {
      const callerDoc = await adminDb.collection("users").doc(uid).get();
      if (callerDoc.exists) {
        return { exists: true, data: callerDoc.data() };
      } else {
        return { exists: false };
      }
    } catch (adminErr) {
      console.warn("[Server Admin SDK] Admin getUserProfile failed, falling back to REST:", adminErr?.message || adminErr);
    }
  }
  if (callerToken) {
    try {
      console.info(`[Server REST Integration] Fetching user profile via Firestore REST API for uid: ${uid}`);
      const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`;
      const res = await fetch(url, {
        headers: { "Authorization": `Bearer ${callerToken}` }
      });
      if (res.status === 200) {
        const json = await res.json();
        return { exists: true, data: firestoreFieldsToJs(json.fields) };
      } else if (res.status === 404) {
        return { exists: false };
      } else {
        console.warn(`[Server REST Integration] Fetch profile returned status ${res.status}`);
      }
    } catch (restErr) {
      console.warn(`[Server REST Integration] Fetch profile REST error:`, restErr);
    }
  }
  return { exists: false };
}
async function safeCheckUserExistsByEmailInFirestore(email, callerToken, tenantId) {
  if (hasAdminCredentials) {
    try {
      let q = adminDb.collection("users").where("email", "==", email);
      if (tenantId) {
        q = q.where("tenantId", "==", tenantId);
      }
      const snap = await q.get();
      return !snap.empty;
    } catch (adminErr) {
      console.warn("[Server Admin SDK] Admin query users failed, falling back to REST:", adminErr?.message || adminErr);
    }
  }
  if (callerToken) {
    try {
      console.info(`[Server REST Integration] Querying user profile via Firestore REST API for email: ${email}`);
      const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`;
      const filters = [
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
      const whereClause = filters.length === 1 ? filters[0] : { compositeFilter: { op: "AND", filters } };
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
        return Array.isArray(results) && results.some((r) => r.document);
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
async function safeCreateAuthUser(email, password, displayName) {
  if (hasAdminCredentials) {
    try {
      const userRecord = await adminAuth.createUser({
        email,
        password: password || "TempPass123!",
        displayName
      });
      return { uid: userRecord.uid, email: userRecord.email || email };
    } catch (err) {
      if (err.code === "auth/email-already-exists") {
        throw err;
      }
      console.warn("[Server Admin SDK] Admin createUser failed, falling back to REST:", err?.message || err);
    }
  }
  console.info(`[Server REST Integration] Creating Auth account via Identity Toolkit REST API.`);
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: password || "TempPass123!",
      returnSecureToken: true
    })
  });
  const data = await res.json();
  if (!res.ok) {
    if (data.error?.message === "EMAIL_EXISTS") {
      const dupErr = new Error(`An account with email '${email}' already exists in Firebase Authentication.`);
      dupErr.code = "auth/email-already-exists";
      throw dupErr;
    }
    throw new Error(`Failed to create Auth account via REST: ${data.error?.message || JSON.stringify(data)}`);
  }
  if (displayName && data.idToken) {
    try {
      await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${FIREBASE_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken: data.idToken,
          displayName,
          returnSecureToken: false
        })
      });
    } catch (updErr) {
      console.warn("Failed to update displayName on Auth account:", updErr);
    }
  }
  return { uid: data.localId, email: data.email || email };
}
async function safeDeleteAuthUser(uid) {
  if (hasAdminCredentials) {
    try {
      await adminAuth.deleteUser(uid);
      console.info(`[Server Admin SDK] Successfully deleted Auth user ${uid} during rollback`);
    } catch (delErr) {
      console.warn("Failed to delete auth user during rollback via Admin SDK:", delErr?.message || delErr);
    }
  }
}
async function safeCreateUserProfileDoc(uid, profilePayload, callerToken) {
  if (hasAdminCredentials) {
    try {
      await adminDb.collection("users").doc(uid).set(profilePayload);
      return;
    } catch (adminErr) {
      console.warn("[Server Admin SDK] Admin set user profile doc failed, falling back to REST:", adminErr?.message || adminErr);
    }
  }
  if (!callerToken) {
    throw new Error("Unable to create user profile: Admin credentials not configured and caller token is missing");
  }
  console.info(`[Server REST Integration] Writing user profile doc via Firestore REST API for uid: ${uid}`);
  const restPayload = { ...profilePayload };
  const now = /* @__PURE__ */ new Date();
  for (const k of Object.keys(restPayload)) {
    if (isServerTimestamp(restPayload[k])) {
      restPayload[k] = now;
    }
  }
  const fields = jsToFirestoreFields(restPayload);
  const createUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users?documentId=${uid}`;
  let res = await fetch(createUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${callerToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fields })
  });
  if (res.ok) {
    console.info(`[Server REST Integration] Successfully created user profile doc via POST for uid: ${uid}`);
    return;
  }
  const postErrText = await res.text();
  console.warn(`[Server REST Integration] POST create doc returned status ${res.status}: ${postErrText.slice(0, 150)}. Attempting PATCH...`);
  const patchUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`;
  res = await fetch(patchUrl, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${callerToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fields })
  });
  if (res.ok) {
    console.info(`[Server REST Integration] Successfully updated user profile doc via PATCH for uid: ${uid}`);
    return;
  }
  const patchErrText = await res.text();
  let errMsg = `Firestore REST set profile failed with status ${res.status}`;
  try {
    const errJson = JSON.parse(patchErrText);
    if (errJson.error?.message) {
      errMsg = `Firestore REST set profile failed: ${errJson.error.message}`;
    }
  } catch {
    errMsg = `${errMsg}: ${patchErrText.slice(0, 200)}`;
  }
  throw new Error(errMsg);
}
async function safeCreateAuditLog(auditPayload, callerToken) {
  if (hasAdminCredentials) {
    try {
      await adminDb.collection("auditLogs").add(auditPayload);
      return;
    } catch (adminErr) {
      console.warn("[Server Admin SDK] Admin add audit log failed, falling back to REST:", adminErr?.message || adminErr);
    }
  }
  if (callerToken) {
    try {
      console.info(`[Server REST Integration] Creating audit log entry via Firestore REST API.`);
      const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/auditLogs`;
      const restPayload = { ...auditPayload };
      const now = /* @__PURE__ */ new Date();
      for (const k of Object.keys(restPayload)) {
        if (isServerTimestamp(restPayload[k])) {
          restPayload[k] = now;
        }
      }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Authorization": `Bearer ${callerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: jsToFirestoreFields(restPayload) })
      });
      if (!res.ok) {
        console.warn(`Firestore REST audit log failed (${res.status}):`, await res.text());
      }
    } catch (restErr) {
      console.warn(`[Server REST Integration] Audit log REST error:`, restErr);
    }
    return;
  }
}
var TENANT_COLLECTIONS = [
  "siteSettings",
  "users",
  "products",
  "locations",
  "destinations",
  "productionLines",
  "unitsOfMeasure",
  "productCategories",
  "storageAreas",
  "actionTypes",
  "priorityLevels",
  "inventoryBalances",
  "inventoryMovements",
  "planningRules",
  "promotions",
  "promotionProductRules",
  "decisionConfigurations",
  "productionEvents",
  "recommendations",
  "priorities",
  "displayPriorities",
  "priorityEvents",
  "announcements",
  "exceptions",
  "productionPlanEntries",
  "productionPlanImports",
  "productionLinePlanNotes",
  "importJobs",
  "sessions",
  "auditLogs",
  "settings"
];
async function deleteQueryBatch(query, resolve, jobRef) {
  const snapshot = await query.get();
  const batchSize = snapshot.size;
  if (batchSize === 0) {
    resolve();
    return;
  }
  const batch = adminDb.batch();
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
async function processDeletion(jobId) {
  const jobRef = adminDb.collection("tenantDeletionJobs").doc(jobId);
  const jobDoc = await jobRef.get();
  if (!jobDoc.exists) return;
  const jobData = jobDoc.data();
  const tenantId = jobData.tenantId;
  try {
    await jobRef.update({
      status: "IN_PROGRESS",
      startedAt: FieldValue.serverTimestamp()
    });
    await jobRef.update({ currentStage: "DELETING_SUBCOLLECTIONS" });
    const importsSnapshot = await adminDb.collection("productionPlanImports").where("tenantId", "==", tenantId).get();
    for (const importDoc of importsSnapshot.docs) {
      const rowsQuery = importDoc.ref.collection("rows").limit(500);
      await new Promise((resolve, reject) => {
        deleteQueryBatch(rowsQuery, resolve, jobRef).catch(reject);
      });
    }
    await jobRef.update({ currentStage: "DELETING_COLLECTIONS" });
    for (const collectionName of TENANT_COLLECTIONS) {
      if (jobData.collectionsProcessed && jobData.collectionsProcessed.includes(collectionName)) {
        continue;
      }
      const query = adminDb.collection(collectionName).where("tenantId", "==", tenantId).limit(500);
      await new Promise((resolve, reject) => {
        deleteQueryBatch(query, resolve, jobRef).catch(reject);
      });
      await jobRef.update({
        collectionsProcessed: FieldValue.arrayUnion(collectionName)
      });
    }
    await jobRef.update({ currentStage: "DELETING_SITES" });
    const sitesQuery = adminDb.collection("sites").where("tenantId", "==", tenantId).limit(500);
    await new Promise((resolve, reject) => {
      deleteQueryBatch(sitesQuery, resolve, jobRef).catch(reject);
    });
    await jobRef.update({ currentStage: "DELETING_AUTH_USERS" });
    await jobRef.update({ currentStage: "DELETING_TENANT" });
    await adminDb.collection("tenants").doc(tenantId).delete();
    await jobRef.update({ currentStage: "CREATING_RECEIPT" });
    const finalJobDoc = await jobRef.get();
    await adminDb.collection("platformDeletionReceipts").add({
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
  } catch (error) {
    console.error("Deletion failed:", error);
    await jobRef.update({
      status: "FAILED",
      failedAt: FieldValue.serverTimestamp(),
      failures: FieldValue.arrayUnion(error.message)
    });
  }
}
var apiApp = express();
apiApp.use((req, _res, next) => {
  if (req.body && typeof req.body === "object") {
    req._body = true;
  }
  next();
});
apiApp.use(express.json());
apiApp.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization"
  );
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});
apiApp.use((req, _res, next) => {
  const forwardedPath = req.headers["x-matched-path"] || req.headers["x-original-url"] || req.headers["x-forwarded-uri"];
  if (forwardedPath && (req.url === "/" || req.url === "/api" || req.url === "/api/")) {
    req.url = forwardedPath;
  }
  next();
});
var router = express.Router();
router.get("/", (req, res) => {
  res.json({ status: "ok", service: "OVMS API" });
});
router.get("/health", (req, res) => {
  res.json({ status: "ok" });
});
router.get("/admin/firebase-diagnostics", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: Missing authorization header" });
    }
    const callerToken = authHeader.split("Bearer ")[1];
    let verifiedToken;
    try {
      verifiedToken = await safeVerifyCallerToken(callerToken);
    } catch (error) {
      return res.status(401).json({ error: `Unauthorized: Invalid token (${error.message})` });
    }
    const verifiedUid = verifiedToken.uid;
    const callerRes = await safeGetUserProfile(verifiedUid, callerToken);
    if (!callerRes.exists) {
      return res.status(403).json({ error: "Forbidden: Caller user profile not found" });
    }
    const callerProfile = callerRes.data;
    if (callerProfile?.accountStatus !== "ACTIVE" || callerProfile?.role !== "PLATFORM_SUPERUSER") {
      return res.status(403).json({ error: "Forbidden: Only active Platform Superusers can access diagnostics" });
    }
    return res.json({
      adminProjectId: resolvedAdminProjectId,
      tokenAudience: verifiedToken.aud,
      tokenIssuer: verifiedToken.iss,
      uid: verifiedUid,
      status: "healthy"
    });
  } catch (error) {
    console.error("Diagnostics endpoint error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
});
router.post("/tenant-deletion", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const callerToken = authHeader.split("Bearer ")[1];
    let verifiedToken;
    try {
      verifiedToken = await safeVerifyCallerToken(callerToken);
    } catch (error) {
      return res.status(401).json({ error: `Unauthorized: Invalid token (${error.message})` });
    }
    const verifiedUid = verifiedToken.uid;
    const userRes = await safeGetUserProfile(verifiedUid, callerToken);
    const userProfile = userRes.data;
    const isActive = userProfile && userProfile.accountStatus === "ACTIVE";
    if (!userRes.exists || userProfile?.role !== "PLATFORM_SUPERUSER" || !isActive) {
      return res.status(403).json({ error: "Forbidden: Insufficient privileges or inactive account" });
    }
    const { tenantId, tenantName } = req.body;
    if (!tenantId || !tenantName) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const requestedBy = verifiedUid;
    const requestedByEmail = verifiedToken.email || userProfile?.email || "unknown";
    const tenantDoc = await adminDb.collection("tenants").doc(tenantId).get();
    if (tenantDoc.exists && tenantDoc.data()?.isSystemTenant) {
      return res.status(400).json({ error: "Cannot delete system tenant" });
    }
    const jobId = adminDb.collection("tenantDeletionJobs").doc().id;
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
    await adminDb.collection("tenantDeletionJobs").doc(jobId).set(jobData);
    if (tenantDoc.exists) {
      await adminDb.collection("tenants").doc(tenantId).update({
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
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const callerToken = authHeader.split("Bearer ")[1];
    let verifiedToken;
    try {
      verifiedToken = await safeVerifyCallerToken(callerToken);
    } catch (error) {
      return res.status(401).json({ error: `Unauthorized: Invalid token (${error.message})` });
    }
    const verifiedUid = verifiedToken.uid;
    const userRes = await safeGetUserProfile(verifiedUid, callerToken);
    const userProfile = userRes.data;
    const isActive = userProfile && userProfile.accountStatus === "ACTIVE";
    if (!userRes.exists || userProfile?.role !== "PLATFORM_SUPERUSER" || !isActive) {
      return res.status(403).json({ error: "Forbidden: Insufficient privileges or inactive account" });
    }
    const jobDocRef = adminDb.collection("tenantDeletionJobs").doc(jobId);
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
router.post("/admin/provision-user", async (req, res) => {
  let currentStage = "PROVISION_START";
  try {
    const clientIp = req.headers && req.headers["x-forwarded-for"] || req.socket && req.socket.remoteAddress || "unknown";
    console.log(`[PROVISION_STAGE: PROVISION_START] Provisioning request received from ${clientIp}`);
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.warn(`[PROVISION_STAGE: PROVISION_FAILURE] Stage: ${currentStage} - Missing or invalid authorization header`);
      return res.status(401).json({
        success: false,
        error: "Unauthorized: Missing authorization header",
        stage: currentStage
      });
    }
    const callerToken = authHeader.split("Bearer ")[1]?.trim();
    if (!callerToken) {
      console.warn(`[PROVISION_STAGE: PROVISION_FAILURE] Stage: ${currentStage} - Empty bearer token`);
      return res.status(401).json({
        success: false,
        error: "Unauthorized: Empty bearer token",
        stage: currentStage
      });
    }
    currentStage = "CALLER_TOKEN_VERIFICATION";
    console.log(`[PROVISION_STAGE: CALLER_TOKEN_VERIFICATION] Verifying caller authentication token`);
    let verifiedToken;
    try {
      verifiedToken = await safeVerifyCallerToken(callerToken);
    } catch (error) {
      console.warn(`[PROVISION_STAGE: PROVISION_FAILURE] Stage: ${currentStage} - Token verification failed: ${error?.message || error}`);
      return res.status(401).json({
        success: false,
        error: `Unauthorized: Invalid token (${error?.message || "verification failed"})`,
        stage: currentStage
      });
    }
    const verifiedUid = verifiedToken.uid;
    currentStage = "CALLER_PROFILE_LOOKUP";
    console.log(`[PROVISION_STAGE: CALLER_PROFILE_LOOKUP] Fetching profile for caller UID: ${verifiedUid}`);
    const callerRes = await safeGetUserProfile(verifiedUid, callerToken);
    if (!callerRes.exists || !callerRes.data) {
      console.warn(`[PROVISION_STAGE: PROVISION_FAILURE] Stage: ${currentStage} - Caller profile not found in Firestore for UID: ${verifiedUid}`);
      return res.status(403).json({
        success: false,
        error: "Forbidden: Caller user profile not found",
        stage: currentStage
      });
    }
    const callerProfile = callerRes.data;
    currentStage = "CALLER_AUTHORIZATION";
    console.log(`[PROVISION_STAGE: CALLER_AUTHORIZATION] Authorizing caller role: ${callerProfile.role}`);
    const isAccountActive = callerProfile.accountStatus === "ACTIVE" || callerProfile.accountStatus === "active" || !callerProfile.accountStatus;
    if (!isAccountActive) {
      console.warn(`[PROVISION_STAGE: PROVISION_FAILURE] Stage: ${currentStage} - Inactive administrator account: ${callerProfile.accountStatus}`);
      return res.status(403).json({
        success: false,
        error: "Forbidden: Your administrator account is not active",
        stage: currentStage
      });
    }
    if (callerProfile.role !== "PLATFORM_SUPERUSER" && callerProfile.role !== "TENANT_ADMIN") {
      console.warn(`[PROVISION_STAGE: PROVISION_FAILURE] Stage: ${currentStage} - Insufficient privileges: role is ${callerProfile.role}`);
      return res.status(403).json({
        success: false,
        error: "Forbidden: Only Platform Superusers and Tenant Admins can provision accounts",
        stage: currentStage
      });
    }
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) || {};
    const { email, displayName, jobTitle, role, tenantId, siteIds, temporaryPassword } = body;
    if (!email || typeof email !== "string" || !email.trim()) {
      console.warn(`[PROVISION_STAGE: PROVISION_FAILURE] Stage: ${currentStage} - Missing or invalid email`);
      return res.status(400).json({ success: false, error: "A valid email is required", stage: currentStage });
    }
    if (!displayName || typeof displayName !== "string" || !displayName.trim()) {
      console.warn(`[PROVISION_STAGE: PROVISION_FAILURE] Stage: ${currentStage} - Missing or invalid displayName`);
      return res.status(400).json({ success: false, error: "Display Name is required", stage: currentStage });
    }
    if (!role || typeof role !== "string") {
      console.warn(`[PROVISION_STAGE: PROVISION_FAILURE] Stage: ${currentStage} - Missing role`);
      return res.status(400).json({ success: false, error: "Role is required", stage: currentStage });
    }
    const validRoles = ["PLATFORM_SUPERUSER", "TENANT_ADMIN", "PLANNER", "WAREHOUSE_OPERATOR", "VIEWER", "DISPLAY"];
    if (!validRoles.includes(role)) {
      console.warn(`[PROVISION_STAGE: PROVISION_FAILURE] Stage: ${currentStage} - Invalid role: ${role}`);
      return res.status(400).json({ success: false, error: `Invalid role specified: ${role}`, stage: currentStage });
    }
    if (callerProfile.role === "TENANT_ADMIN") {
      if (role === "PLATFORM_SUPERUSER") {
        console.warn(`[PROVISION_STAGE: PROVISION_FAILURE] Stage: ${currentStage} - Tenant Admin tried to provision PLATFORM_SUPERUSER`);
        return res.status(403).json({ success: false, error: "Tenant Admins cannot create Platform Superusers", stage: currentStage });
      }
      if (tenantId && tenantId !== callerProfile.tenantId) {
        console.warn(`[PROVISION_STAGE: PROVISION_FAILURE] Stage: ${currentStage} - Tenant Admin tried to provision across tenants`);
        return res.status(403).json({ success: false, error: "Tenant Admins can only create users within their own tenant", stage: currentStage });
      }
    }
    const targetTenantId = role === "PLATFORM_SUPERUSER" ? null : tenantId ? tenantId.trim() : callerProfile.role === "TENANT_ADMIN" ? callerProfile.tenantId : null;
    if (role !== "PLATFORM_SUPERUSER" && !targetTenantId) {
      console.warn(`[PROVISION_STAGE: PROVISION_FAILURE] Stage: ${currentStage} - Missing tenant for non-superuser account`);
      return res.status(400).json({ success: false, error: "A valid tenant must be selected for non-superuser accounts", stage: currentStage });
    }
    const cleanEmail = email.toLowerCase().trim();
    currentStage = "TARGET_USER_FIRESTORE_CHECK";
    console.log(`[PROVISION_STAGE: TARGET_USER_FIRESTORE_CHECK] Checking for existing user profile in Firestore for email: ${cleanEmail}`);
    const existsInFirestore = await safeCheckUserExistsByEmailInFirestore(cleanEmail, callerToken, targetTenantId);
    if (existsInFirestore) {
      console.warn(`[PROVISION_STAGE: PROVISION_FAILURE] Stage: ${currentStage} - User profile already exists in Firestore for: ${cleanEmail}`);
      return res.status(409).json({
        success: false,
        error: `A user profile with email '${cleanEmail}' already exists in Firestore.`,
        stage: currentStage
      });
    }
    currentStage = "FIREBASE_AUTH_CREATE";
    console.log(`[PROVISION_STAGE: FIREBASE_AUTH_CREATE] Creating user in Firebase Authentication for: ${cleanEmail}`);
    let userRecord;
    try {
      userRecord = await safeCreateAuthUser(cleanEmail, temporaryPassword || "TempPass123!", displayName.trim());
    } catch (error) {
      console.warn(`[PROVISION_STAGE: PROVISION_FAILURE] Stage: ${currentStage} - Firebase Auth creation failed: ${error?.message || error}`);
      if (error?.code === "auth/email-already-exists") {
        return res.status(409).json({
          success: false,
          error: `An account with email '${cleanEmail}' already exists in Firebase Authentication.`,
          stage: currentStage
        });
      }
      return res.status(400).json({
        success: false,
        error: `Failed to create Firebase Authentication account: ${error?.message || "unknown error"}`,
        stage: currentStage
      });
    }
    currentStage = "USER_PROFILE_CREATE";
    console.log(`[PROVISION_STAGE: USER_PROFILE_CREATE] Creating user profile document in Firestore for UID: ${userRecord.uid}`);
    const timestampNow = FieldValue.serverTimestamp();
    const profilePayload = {
      uid: userRecord.uid,
      email: cleanEmail,
      displayName: displayName.trim(),
      jobTitle: jobTitle ? String(jobTitle).trim() : "",
      role,
      tenantId: targetTenantId,
      siteIds: role === "PLATFORM_SUPERUSER" ? [] : siteIds || [],
      accountStatus: "ACTIVE",
      requiresPasswordChange: true,
      failedLoginAttempts: 0,
      failedAttemptWindowStartedAt: null,
      lockedAt: null,
      lastLoginAt: null,
      passwordChangedAt: null,
      createdBy: verifiedUid,
      createdDate: timestampNow,
      modifiedBy: verifiedUid,
      modifiedDate: timestampNow
    };
    try {
      await safeCreateUserProfileDoc(userRecord.uid, profilePayload, callerToken);
    } catch (docErr) {
      console.error(`[PROVISION_STAGE: PROVISION_FAILURE] Stage: ${currentStage} - Firestore profile doc creation failed: ${docErr?.message || docErr}`);
      await safeDeleteAuthUser(userRecord.uid);
      return res.status(500).json({
        success: false,
        error: `Failed to create user profile in Firestore: ${docErr?.message || "unknown error"}`,
        stage: currentStage
      });
    }
    currentStage = "AUDIT_LOG_CREATE";
    console.log(`[PROVISION_STAGE: AUDIT_LOG_CREATE] Creating audit log entry for user creation: ${userRecord.uid}`);
    await safeCreateAuditLog({
      tenantId: targetTenantId,
      siteId: siteIds && siteIds.length > 0 ? siteIds[0] : null,
      eventType: "USER_CREATION",
      entityType: "UserProfile",
      entityId: userRecord.uid,
      summary: `Created user account for ${cleanEmail} with role ${role}`,
      performedBy: verifiedUid,
      createdDate: timestampNow,
      timestamp: timestampNow
    }, callerToken);
    currentStage = "PROVISION_SUCCESS";
    console.log(`[PROVISION_STAGE: PROVISION_SUCCESS] User ${cleanEmail} successfully provisioned with UID: ${userRecord.uid}`);
    return res.status(200).json({
      success: true,
      uid: userRecord.uid,
      message: `User ${cleanEmail} successfully created with role ${role}.`,
      stage: "PROVISION_SUCCESS"
    });
  } catch (error) {
    console.error(`[PROVISION_STAGE: PROVISION_FAILURE] Stage: ${currentStage} - Unexpected error:`, error);
    return res.status(500).json({
      success: false,
      error: error?.message || "Internal server error",
      stage: currentStage || "PROVISION_FAILURE"
    });
  }
});
apiApp.use("/api", router);
apiApp.use("/", router);
apiApp.use((req, res) => {
  res.status(404).json({ error: `Not Found: ${req.method} ${req.originalUrl || req.url}` });
});
apiApp.use((err, _req, res, _next) => {
  console.error("[API Express Error Handler]", err);
  const statusCode = typeof err?.status === "number" && err.status >= 400 && err.status < 600 ? err.status : typeof err?.statusCode === "number" && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
  if (!res.headersSent) {
    res.status(statusCode).json({
      success: false,
      error: err?.message || "Internal server error",
      stage: "EXPRESS_UNHANDLED_ERROR"
    });
  }
});
var apiApp_default = apiApp;
export {
  apiApp_default as default
};
//# sourceMappingURL=index.js.map

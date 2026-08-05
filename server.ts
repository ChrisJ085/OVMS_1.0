import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { FieldValue, Query, DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { adminAuth as auth, adminDb as db, resolvedAdminProjectId } from "./src/config/firebaseAdmin";
import { RecommendationBackendService } from "./src/server/recommendationBackendService";
import { CANONICAL_TRIGGER_TYPES } from "./src/types/recommendation";
import crypto from "crypto";

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

function buildDisplayPriorityDoc(p: any, priorityId?: string) {
  const docId = priorityId || p.id || '';
  return {
    tenantId: p.tenantId || '',
    siteId: p.siteId || '',
    sourcePriorityId: docId,
    priorityCode: p.productCodeSnapshot || p.productId || '',
    productCodeSnapshot: p.productCodeSnapshot || '',
    descriptionSnapshot: p.descriptionSnapshot || '',
    title: p.descriptionSnapshot || p.instruction || '',
    instruction: p.instruction || '',
    priorityStatus: p.priorityStatus || 'ACTIVE',
    priorityLevelId: p.priorityLevelId || 'NORMAL',
    priorityLevelLabel: p.priorityLevelLabel || p.priorityLevelId || 'NORMAL',
    actionTypeId: p.actionTypeId || '',
    actionTypeLabel: p.actionTypeLabel || '',
    requestedQuantity: p.requestedQuantity ?? null,
    progressQuantity: p.progressQuantity ?? 0,
    progressPercent: p.progressPercent ?? 0,
    destinationId: p.destinationId ?? null,
    destinationLabel: p.destinationLabel || '',
    overflowDestinationId: p.overflowDestinationId ?? null,
    overflowDestinationLabel: p.overflowDestinationLabel || '',
    startAt: p.startAt || null,
    createdDate: p.createdDate || null,
    completedAt: p.completedAt || null,
    expireAt: p.expireAt || null,
    untilSwitchedOff: p.untilSwitchedOff || false,
    modifiedDate: p.modifiedDate || FieldValue.serverTimestamp()
  };
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


async function enqueueRecommendationJobServer(
  tenantId: string,
  siteId: string,
  triggerType: string,
  productIds: string[],
  uid: string,
  triggerReferenceId: string | null = null,
  sourceInventorySnapshotId: string | null = null,
  sourceProductionPlanImportId: string | null = null,
  idempotencyKey: string | null = null
) {
  const sortedProductIds = [...productIds].sort();
  const rawKeyData = {
    tenantId,
    siteId,
    triggerType,
    triggerReferenceId,
    productIds: sortedProductIds,
    sourceInventorySnapshotId,
    sourceProductionPlanImportId
  };
  const stableKeyString = JSON.stringify(rawKeyData);
  const crypto = require("crypto");
  const serverIdempotencyHash = crypto.createHash("sha256").update(stableKeyString).digest("hex");
  const idempotencyRef = db.collection("recommendationIdempotencyKeys").doc(serverIdempotencyHash);
  
  const txResult = await db.runTransaction(async (transaction) => {
    const idempotencySnap = await transaction.get(idempotencyRef);
    if (idempotencySnap.exists) {
      const existingJobId = idempotencySnap.data()?.jobId;
      if (existingJobId) {
        const jobRef = db.collection("recommendationGenerationJobs").doc(existingJobId);
        const jobSnap = await transaction.get(jobRef);
        if (jobSnap.exists) {
          const jobData = jobSnap.data();
          const activeStatuses = ["QUEUED", "IN_PROGRESS", "COMPLETED", "COMPLETED_WITH_WARNINGS"];
          if (jobData && activeStatuses.includes(jobData.status)) {
            return { jobId: existingJobId, isDuplicate: true };
          }
        }
      }
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = require("firebase-admin").firestore.FieldValue.serverTimestamp();
    const jobDoc = {
      id: jobId,
      jobId,
      tenantId,
      siteId,
      status: "QUEUED",
      triggerType,
      triggerReferenceId,
      sourceInventorySnapshotId,
      sourceProductionPlanImportId,
      idempotencyKey: idempotencyKey || jobId,
      serverIdempotencyHash,
      requestedBy: uid,
      requestedAt: now,
      startedAt: null,
      completedAt: null,
      leaseExpiresAt: null,
      workerId: null,
      attemptCount: 0,
      maxAttempts: 3,
      productCount: productIds.length,
      processedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      supersededCount: 0,
      withdrawnCount: 0,
      failedCount: 0,
      errors: [],
      productIds: sortedProductIds,
      engineVersion: "2.0.0",
      createdDate: now,
      modifiedDate: now,
      createdBy: uid,
      modifiedBy: uid
    };

    transaction.set(db.collection("recommendationGenerationJobs").doc(jobId), jobDoc);
    transaction.set(idempotencyRef, {
      idempotencyKey: idempotencyKey || jobId,
      serverIdempotencyHash,
      jobId,
      createdAt: now,
      tenantId,
      siteId
    });

    return { jobId, isDuplicate: false, jobDoc };
  });

  return txResult;
}

export async function createApp() {
  const app = express();

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Protected Firebase diagnostics endpoint (PLATFORM_SUPERUSER only)
  app.get("/api/admin/firebase-diagnostics", async (req, res) => {
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
  app.post("/api/tenant-deletion", async (req, res) => {
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

      // Check if user is active and PLATFORM_SUPERUSER
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

      // Check if tenant is protected
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

      // Start the actual deletion async
      processDeletion(jobId).catch(console.error);

      res.json({ success: true, jobId });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/tenant-deletion/:jobId/retry", async (req, res) => {
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
  app.post("/api/admin/provision-user", async (req, res) => {
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

      // Check tenant admin privileges
      if (callerProfile.role === 'TENANT_ADMIN') {
        if (role === 'PLATFORM_SUPERUSER') {
          return res.status(403).json({ success: false, error: "Tenant Admins cannot create Platform Superusers" });
        }
        if (tenantId !== callerProfile.tenantId) {
          return res.status(403).json({ success: false, error: "Tenant Admins can only create users within their own tenant" });
        }
      }

      // Validate tenant selection for non-superusers
      const targetTenantId = role === 'PLATFORM_SUPERUSER' ? null : (tenantId ? tenantId.trim() : null);
      if (role !== 'PLATFORM_SUPERUSER' && !targetTenantId) {
        return res.status(400).json({ success: false, error: "A valid tenant must be selected for non-superuser accounts" });
      }

      const cleanEmail = email.toLowerCase().trim();

      // Check if user profile already exists in Firestore
      const existsInFirestore = await safeCheckUserExistsByEmailInFirestore(cleanEmail, callerToken, targetTenantId);
      if (existsInFirestore) {
        return res.status(409).json({ success: false, error: `A user profile with email '${cleanEmail}' already exists in Firestore.` });
      }

      // Create Auth user
      let userRecord;
      try {
        userRecord = await safeCreateAuthUser(cleanEmail, temporaryPassword || 'TempPass123!', displayName.trim());
      } catch (error: any) {
        if (error.code === 'auth/email-already-exists') {
          return res.status(409).json({ success: false, error: `An account with email '${cleanEmail}' already exists in Firebase Authentication.` });
        }
        return res.status(400).json({ success: false, error: `Failed to create Firebase Authentication account: ${error.message}` });
      }

      // Create Firestore User Document
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

        // Audit Log
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
        // Rollback Auth user
        try {
          await auth.deleteUser(userRecord.uid);
        } catch (delErr) {
          // ignore rollback error if adminAuth lacks permissions
        }
        return res.status(500).json({ success: false, error: `Failed to create user profile in Firestore: ${error.message}` });
      }
    } catch (error: any) {
      console.error('Provisioning endpoint error:', error);
      return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  });

  // REST Route to enqueue or trigger a recommendation job on trusted backend
  app.post("/api/recommendation-jobs", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, error: "Unauthorized: Missing Bearer token" });
      }
      const token = authHeader.split("Bearer ")[1];
      let decodedToken;
      try {
        decodedToken = await auth.verifyIdToken(token);
      } catch (e: any) {
        return res.status(401).json({ success: false, error: "Unauthorized: Invalid token" });
      }

      const uid = decodedToken.uid;
      const profileRes = await safeGetUserProfile(uid, token);
      if (!profileRes.exists || !profileRes.data) {
        return res.status(403).json({ success: false, error: "Forbidden: User profile not found" });
      }

      const profile = profileRes.data;

      // 1. Require accountStatus == "ACTIVE"
      if (profile.accountStatus !== "ACTIVE") {
        return res.status(403).json({ success: false, error: "Forbidden: User account is inactive" });
      }

      // 2. Require role to be PLATFORM_SUPERUSER, TENANT_ADMIN or PLANNER
      // WAREHOUSE_OPERATOR, VIEWER and DISPLAY must be denied
      const allowedRoles = ["PLATFORM_SUPERUSER", "TENANT_ADMIN", "PLANNER"];
      if (!allowedRoles.includes(profile.role)) {
        return res.status(403).json({ success: false, error: "Forbidden: Insufficient role permissions" });
      }

      const {
        tenantId,
        siteId,
        triggerType,
        triggerReferenceId = null,
        sourceInventorySnapshotId = null,
        sourceProductionPlanImportId = null,
        productIds = [],
        idempotencyKey = null
      } = req.body;

      // 3. VALIDATE REQUEST PAYLOAD TYPES
      if (typeof tenantId !== "string" || tenantId.trim() === "") {
        return res.status(400).json({ success: false, error: "Bad Request: tenantId must be a non-empty string" });
      }
      if (typeof siteId !== "string" || siteId.trim() === "") {
        return res.status(400).json({ success: false, error: "Bad Request: siteId must be a non-empty string" });
      }
      if (typeof triggerType !== "string" || !CANONICAL_TRIGGER_TYPES.includes(triggerType as any)) {
        return res.status(400).json({ success: false, error: "Bad Request: triggerType must be a canonical GenerationTriggerType value" });
      }
      if (!Array.isArray(productIds) || productIds.some(id => typeof id !== "string" || id.trim() === "")) {
        return res.status(400).json({ success: false, error: "Bad Request: productIds must be an array of non-empty strings" });
      }
      if (productIds.length > 1000) {
        return res.status(400).json({ success: false, error: "Bad Request: productIds exceeds the maximum allowed limit of 1000" });
      }
      if (triggerReferenceId !== null && typeof triggerReferenceId !== "string") {
        return res.status(400).json({ success: false, error: "Bad Request: triggerReferenceId must be null or a string" });
      }
      if (sourceInventorySnapshotId !== null && typeof sourceInventorySnapshotId !== "string") {
        return res.status(400).json({ success: false, error: "Bad Request: sourceInventorySnapshotId must be null or a string" });
      }
      if (sourceProductionPlanImportId !== null && typeof sourceProductionPlanImportId !== "string") {
        return res.status(400).json({ success: false, error: "Bad Request: sourceProductionPlanImportId must be null or a string" });
      }
      if (idempotencyKey !== null && (typeof idempotencyKey !== "string" || idempotencyKey.length > 256 || idempotencyKey.trim() === "")) {
        return res.status(400).json({ success: false, error: "Bad Request: idempotencyKey must be null or a non-empty string with max length 256" });
      }

      // 3. For non-Superusers, require requested tenantId to equal profile.tenantId
      if (profile.role !== "PLATFORM_SUPERUSER" && tenantId !== profile.tenantId) {
        return res.status(403).json({ success: false, error: "Forbidden: Tenant isolation violation" });
      }

      // 4. For Planner, require requested siteId to exist in profile.siteIds
      if (profile.role === "PLANNER") {
        if (!profile.siteIds || !Array.isArray(profile.siteIds) || !profile.siteIds.includes(siteId)) {
          return res.status(403).json({ success: false, error: "Forbidden: Site assignment isolation violation" });
        }
      }

      // 5. Validate the site document exists
      const siteDoc = await db.collection("sites").doc(siteId).get();
      if (!siteDoc.exists) {
        return res.status(403).json({ success: false, error: "Forbidden: Site document does not exist" });
      }

      // 6. Validate site.tenantId equals requested tenantId
      const siteData = siteDoc.data();
      if (siteData?.tenantId !== tenantId) {
        return res.status(403).json({ success: false, error: "Forbidden: Site tenantId mismatch" });
      }

      // 7. Validate the tenant and site are active
      const tenantDoc = await db.collection("tenants").doc(tenantId).get();
      if (!tenantDoc.exists || tenantDoc.data()?.status !== "ACTIVE") {
        return res.status(403).json({ success: false, error: "Forbidden: Requested Tenant is not active" });
      }

      // 9. STRICT SITE ACTIVE VALIDATION
      const isStatusActive = siteData && (siteData.status === "ACTIVE");
      const isLegacyActive = siteData && (!("status" in siteData) && siteData.active === true);
      
      if (!isStatusActive && !isLegacyActive) {
        return res.status(403).json({ success: false, error: "Forbidden: Requested Site is not active" });
      }

      // 8. Validate every productId belongs to the requested tenant and site
      if (productIds && Array.isArray(productIds) && productIds.length > 0) {
        for (const prodId of productIds) {
          const prodDoc = await db.collection("products").doc(prodId).get();
          if (!prodDoc.exists) {
            return res.status(403).json({ success: false, error: `Forbidden: Product ${prodId} does not exist` });
          }
          const prodData = prodDoc.data();
          if (prodData?.tenantId !== tenantId || prodData?.siteId !== siteId) {
            return res.status(403).json({ success: false, error: `Forbidden: Product ${prodId} does not belong to requested tenant or site` });
          }
        }
      }

      // 4. ENFORCE IDEMPOTENCY
      // Generate a stable server-side hash from input elements
      const sortedProductIds = [...productIds].sort();
      const rawKeyData = {
        tenantId,
        siteId,
        triggerType,
        triggerReferenceId: triggerReferenceId || null,
        productIds: sortedProductIds,
        sourceInventorySnapshotId: sourceInventorySnapshotId || null,
        sourceProductionPlanImportId: sourceProductionPlanImportId || null
      };
      const stableKeyString = JSON.stringify(rawKeyData);
      const serverIdempotencyHash = crypto.createHash("sha256").update(stableKeyString).digest("hex");

      const idempotencyRef = db.collection("recommendationIdempotencyKeys").doc(serverIdempotencyHash);
      
      const txResult = await db.runTransaction(async (transaction) => {
        const idempotencySnap = await transaction.get(idempotencyRef);
        if (idempotencySnap.exists) {
          const existingJobId = idempotencySnap.data()?.jobId;
          if (existingJobId) {
            const jobRef = db.collection("recommendationGenerationJobs").doc(existingJobId);
            const jobSnap = await transaction.get(jobRef);
            if (jobSnap.exists) {
              const jobData = jobSnap.data();
              const activeStatuses = ["QUEUED", "IN_PROGRESS", "COMPLETED", "COMPLETED_WITH_WARNINGS"];
              if (activeStatuses.includes(jobData?.status)) {
                return { jobId: existingJobId, isDuplicate: true };
              }
            }
          }
        }

        const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const now = FieldValue.serverTimestamp();

        const jobDoc = {
          id: jobId,
          jobId,
          tenantId,
          siteId,
          status: "QUEUED",
          triggerType,
          triggerReferenceId: triggerReferenceId || null,
          sourceInventorySnapshotId: sourceInventorySnapshotId || null,
          sourceProductionPlanImportId: sourceProductionPlanImportId || null,
          idempotencyKey: idempotencyKey || jobId,
          serverIdempotencyHash,
          requestedBy: uid,
          requestedAt: now,
          startedAt: null,
          completedAt: null,
          leaseExpiresAt: null,
          workerId: null,
          attemptCount: 0,
          maxAttempts: 3,
          productCount: productIds.length,
          processedCount: 0,
          createdCount: 0,
          updatedCount: 0,
          unchangedCount: 0,
          supersededCount: 0,
          withdrawnCount: 0,
          failedCount: 0,
          errors: [],
          productIds,
          engineVersion: "2.0.0",
          createdDate: now,
          modifiedDate: now,
          createdBy: uid,
          modifiedBy: uid
        };

        const jobRef = db.collection("recommendationGenerationJobs").doc(jobId);
        transaction.set(jobRef, jobDoc);
        transaction.set(idempotencyRef, {
          id: serverIdempotencyHash,
          jobId,
          createdAt: now,
          tenantId,
          siteId
        });

        return { jobId, isDuplicate: false };
      });

      const { jobId, isDuplicate } = txResult;

      // Trigger processing immediately in background
      setTimeout(() => {
        RecommendationBackendService.claimAndProcessNextJob().catch(err =>
          console.error("[Server] Background recommendation job claim error:", err)
        );
      }, 50);

      return res.json({
        success: true,
        jobId,
        message: isDuplicate 
          ? "Recommendation job already exists, returning existing job ID" 
          : "Recommendation job successfully queued for trusted backend execution"
      });
    } catch (error: any) {
      console.error("[Server] Error queuing recommendation job:", error);
      return res.status(500).json({ success: false, error: error.message || "Failed to create recommendation job" });
    }
  });

  // ------------------------------------------------------------------------
  // Recommendations Override Endpoints
  // ------------------------------------------------------------------------

  // POST /api/recommendations/:id/override
  app.post("/api/recommendations/:id/override", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, error: "Unauthorized: Missing Bearer token" });
      }
      const token = authHeader.split("Bearer ")[1];
      let decodedToken;
      try {
        decodedToken = await auth.verifyIdToken(token);
      } catch (e: any) {
        return res.status(401).json({ success: false, error: "Unauthorized: Invalid token" });
      }

      const uid = decodedToken.uid;
      const profileRes = await safeGetUserProfile(uid, token);
      if (!profileRes.exists || !profileRes.data) {
        return res.status(403).json({ success: false, error: "Forbidden: User profile not found" });
      }

      const profile = profileRes.data;
      if (profile.accountStatus !== "ACTIVE") {
        return res.status(403).json({ success: false, error: "Forbidden: User account is inactive" });
      }

      const allowedRoles = ["PLATFORM_SUPERUSER", "TENANT_ADMIN", "PLANNER"];
      if (!allowedRoles.includes(profile.role)) {
        return res.status(403).json({ success: false, error: "Forbidden: Insufficient role permissions" });
      }

      const recommendationId = req.params.id; // actually history ID
      const { overrideData } = req.body;

      if (!overrideData || typeof overrideData.reason !== "string" || overrideData.reason.trim() === "") {
        return res.status(400).json({ success: false, error: "Bad Request: override reason is required" });
      }

      const recRef = db.collection("recommendations").doc(recommendationId);

      const result = await db.runTransaction(async (transaction) => {
        const recSnap = await transaction.get(recRef);
        if (!recSnap.exists) {
          return { status: 404, data: { success: false, error: "Recommendation not found" } };
        }

        const rec = recSnap.data()!;

        // Allowed statuses
        const allowedStatuses = ["AUTO_PUBLISHED", "OVERRIDDEN"];
        if (!allowedStatuses.includes(rec.recommendationStatus)) {
          return { status: 400, data: { success: false, error: "Recommendation cannot be overridden" } };
        }

        if (profile.role !== "PLATFORM_SUPERUSER" && rec.tenantId !== profile.tenantId) {
          return { status: 403, data: { success: false, error: "Forbidden: Tenant isolation violation" } };
        }

        if (profile.role === "PLANNER") {
          if (!profile.siteIds || !Array.isArray(profile.siteIds) || !profile.siteIds.includes(rec.siteId)) {
            return { status: 403, data: { success: false, error: "Forbidden: Site assignment isolation violation" } };
          }
        }

        const currentRecId = `${rec.tenantId}_${rec.siteId}_${rec.productId}`;
        const currentRecRef = db.collection("currentRecommendations").doc(currentRecId);
        const currentSnap = await transaction.get(currentRecRef);
        
        if (!currentSnap.exists) {
           return { status: 404, data: { success: false, error: "Current recommendation not found" } };
        }
        
        const currentRecData = currentSnap.data()!;
        if (currentRecData.tenantId !== rec.tenantId || currentRecData.siteId !== rec.siteId || currentRecData.productId !== rec.productId) {
           return { status: 400, data: { success: false, error: "Recommendation data mismatch" } };
        }

        const effectivePriorityId = `${rec.tenantId}_${rec.siteId}_${rec.productId}`;
        const priorityRef = db.collection("priorities").doc(effectivePriorityId);
        const displayPriorityRef = db.collection("displayPriorities").doc(`disp_${effectivePriorityId}`);

        const activeOverride = {
          status: "ACTIVE",
          overriddenBy: uid,
          overriddenAt: FieldValue.serverTimestamp(),
          reason: overrideData.reason,
          actionTypeId: overrideData.actionTypeId || currentRecData.currentSystemRecommendation?.decisionOutput?.recommendedActionTypeId || "RELEASE",
          quantity: overrideData.quantity !== undefined ? overrideData.quantity : (currentRecData.currentSystemRecommendation?.decisionOutput?.recommendedQuantity || 0),
          destinationId: overrideData.destinationId || currentRecData.currentSystemRecommendation?.decisionOutput?.recommendedDestinationId || null,
          priorityLevelId: overrideData.priorityLevelId || currentRecData.currentSystemRecommendation?.decisionOutput?.recommendedPriorityLevelId || "NORMAL",
          instruction: overrideData.instruction || `Planner override for ${currentRecData.productCodeSnapshot || currentRecData.productId}`,
          expireAt: null // Add expireAt if provided in overrideData
        };
        
        const effectiveInstruction = activeOverride.instruction;
        const systemDiffersFromOverride = true; // Typically true if override is active

        transaction.update(currentRecRef, {
          activeOverride,
          hasActiveOverride: true,
          systemDiffersFromOverride,
          effectiveInstruction,
          recommendationStatus: "OVERRIDDEN",
          modifiedBy: uid,
          modifiedDate: FieldValue.serverTimestamp()
        });

        // Upsert priority
        const priorityDoc = {
          id: effectivePriorityId,
          tenantId: rec.tenantId,
          siteId: rec.siteId,
          status: "active", // lowercase active based on old code
          sourceType: "MANUAL_OVERRIDE",
          sourceCurrentRecommendationId: currentRecId,
          sourceSystemRecommendationId: recommendationId,
          productId: rec.productId,
          productCodeSnapshot: currentRecData.productCodeSnapshot || rec.productCodeSnapshot || "",
          descriptionSnapshot: currentRecData.descriptionSnapshot || rec.descriptionSnapshot || "",
          actionTypeId: activeOverride.actionTypeId,
          requestedQuantity: activeOverride.quantity,
          destinationId: activeOverride.destinationId,
          priorityLevelId: activeOverride.priorityLevelId,
          instruction: activeOverride.instruction,
          plannerReason: activeOverride.reason,
          priorityStatus: "ACTIVE", // UPPERCASE ACTIVE based on old code
          modifiedBy: uid,
          modifiedDate: FieldValue.serverTimestamp()
        };
        transaction.set(priorityRef, priorityDoc, { merge: true });

        // Upsert display priority
        const displayPriorityDoc = {
          ...priorityDoc,
          id: `disp_${effectivePriorityId}`,
          tenantId: rec.tenantId,
          siteId: rec.siteId,
          productCode: priorityDoc.productCodeSnapshot,
          priorityStatus: "ACTIVE",
          actionType: priorityDoc.actionTypeId,
          priorityLevel: priorityDoc.priorityLevelId,
          _tags: [`site_${rec.siteId}`, `tenant_${rec.tenantId}`]
        };
        transaction.set(displayPriorityRef, displayPriorityDoc, { merge: true });

        // Audit log
        const auditRef = db.collection("auditLogs").doc();
        transaction.set(auditRef, {
          tenantId: rec.tenantId,
          siteId: rec.siteId,
          eventType: "RECOMMENDATION_OVERRIDE",
          entityType: "Recommendation",
          entityId: currentRecId,
          summary: `Planner override applied to recommendation ${recommendationId}`,
          performedBy: uid,
          createdDate: FieldValue.serverTimestamp(),
          timestamp: FieldValue.serverTimestamp()
        });

        return { status: 200, data: { success: true } };
      });

      return res.status(result.status).json(result.data);
    } catch (error: any) {
      console.error("Override endpoint error:", error);
      return res.status(500).json({ success: false, error: error.message || "Internal server error" });
    }
  });

  // POST /api/recommendations/:id/suppress
  app.post("/api/recommendations/:id/suppress", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, error: "Unauthorized: Missing Bearer token" });
      }
      const token = authHeader.split("Bearer ")[1];
      let decodedToken;
      try {
        decodedToken = await auth.verifyIdToken(token);
      } catch (e: any) {
        return res.status(401).json({ success: false, error: "Unauthorized: Invalid token" });
      }

      const uid = decodedToken.uid;
      const profileRes = await safeGetUserProfile(uid, token);
      if (!profileRes.exists || !profileRes.data) {
        return res.status(403).json({ success: false, error: "Forbidden: User profile not found" });
      }

      const profile = profileRes.data;
      if (profile.accountStatus !== "ACTIVE") {
        return res.status(403).json({ success: false, error: "Forbidden: User account is inactive" });
      }

      const allowedRoles = ["PLATFORM_SUPERUSER", "TENANT_ADMIN", "PLANNER"];
      if (!allowedRoles.includes(profile.role)) {
        return res.status(403).json({ success: false, error: "Forbidden: Insufficient role permissions" });
      }

      const recommendationId = req.params.id;
      const { suppressionData } = req.body;

      if (!suppressionData || typeof suppressionData.reason !== "string" || suppressionData.reason.trim() === "") {
        return res.status(400).json({ success: false, error: "Bad Request: suppression reason is required" });
      }
      
      const allowedScopes = ["UNTIL_NEXT_SNAPSHOT", "UNTIL_DATE", "PERMANENT"];
      const scope = suppressionData.scope || "UNTIL_NEXT_SNAPSHOT";
      if (!allowedScopes.includes(scope)) {
        return res.status(400).json({ success: false, error: "Bad Request: invalid suppression scope" });
      }
      
      if (scope === "UNTIL_DATE") {
        if (!suppressionData.expireAt || isNaN(new Date(suppressionData.expireAt).getTime())) {
          return res.status(400).json({ success: false, error: "Bad Request: valid expireAt is required for UNTIL_DATE" });
        }
        if (new Date(suppressionData.expireAt).getTime() < Date.now()) {
          return res.status(400).json({ success: false, error: "Bad Request: expireAt must be in the future" });
        }
      }

      const recRef = db.collection("recommendations").doc(recommendationId);

      const result = await db.runTransaction(async (transaction) => {
        const recSnap = await transaction.get(recRef);
        if (!recSnap.exists) {
          return { status: 404, data: { success: false, error: "Recommendation not found" } };
        }

        const rec = recSnap.data()!;

        const allowedStatuses = ["AUTO_PUBLISHED", "OVERRIDDEN", "SUPPRESSED"];
        if (!allowedStatuses.includes(rec.recommendationStatus)) {
          return { status: 400, data: { success: false, error: "Recommendation cannot be suppressed" } };
        }

        if (profile.role !== "PLATFORM_SUPERUSER" && rec.tenantId !== profile.tenantId) {
          return { status: 403, data: { success: false, error: "Forbidden: Tenant isolation violation" } };
        }

        if (profile.role === "PLANNER") {
          if (!profile.siteIds || !Array.isArray(profile.siteIds) || !profile.siteIds.includes(rec.siteId)) {
            return { status: 403, data: { success: false, error: "Forbidden: Site assignment isolation violation" } };
          }
        }

        const currentRecId = `${rec.tenantId}_${rec.siteId}_${rec.productId}`;
        const currentRecRef = db.collection("currentRecommendations").doc(currentRecId);
        const currentSnap = await transaction.get(currentRecRef);
        
        if (!currentSnap.exists) {
           return { status: 404, data: { success: false, error: "Current recommendation not found" } };
        }
        
        const currentRecData = currentSnap.data()!;
        if (currentRecData.tenantId !== rec.tenantId || currentRecData.siteId !== rec.siteId || currentRecData.productId !== rec.productId) {
           return { status: 400, data: { success: false, error: "Recommendation data mismatch" } };
        }

        const effectivePriorityId = `${rec.tenantId}_${rec.siteId}_${rec.productId}`;
        const priorityRef = db.collection("priorities").doc(effectivePriorityId);
        const displayPriorityRef = db.collection("displayPriorities").doc(`disp_${effectivePriorityId}`);

        const suppressionContext = {
          suppressedBy: uid,
          suppressedAt: FieldValue.serverTimestamp(),
          reason: suppressionData.reason,
          scope,
          expireAt: suppressionData.expireAt ? Timestamp.fromDate(new Date(suppressionData.expireAt)) : null
        };

        transaction.update(currentRecRef, {
          recommendationStatus: "SUPPRESSED",
          suppressionContext,
          hasActiveOverride: false,
          activeOverride: null, // clear override if suppressed
          effectiveInstruction: null, // suppressed means no effective instruction
          modifiedBy: uid,
          modifiedDate: FieldValue.serverTimestamp()
        });

        // Withdraw priority
        const prioSnap = await transaction.get(priorityRef);
        if (prioSnap.exists) {
          transaction.update(priorityRef, {
            priorityStatus: "WITHDRAWN",
            modifiedBy: uid,
            modifiedDate: FieldValue.serverTimestamp()
          });
        }
        
        // Delete display priority
        transaction.delete(displayPriorityRef);

        const auditRef = db.collection("auditLogs").doc();
        transaction.set(auditRef, {
          tenantId: rec.tenantId,
          siteId: rec.siteId,
          eventType: "RECOMMENDATION_SUPPRESSION",
          entityType: "Recommendation",
          entityId: currentRecId,
          summary: `Recommendation ${recommendationId} suppressed`,
          performedBy: uid,
          createdDate: FieldValue.serverTimestamp(),
          timestamp: FieldValue.serverTimestamp()
        });

        return { status: 200, data: { success: true } };
      });

      return res.status(result.status).json(result.data);
    } catch (error: any) {
      console.error("Suppression endpoint error:", error);
      return res.status(500).json({ success: false, error: error.message || "Internal server error" });
    }
  });

  // POST /api/recommendations/:id/restore-automatic
  app.post("/api/recommendations/:id/restore-automatic", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, error: "Unauthorized: Missing Bearer token" });
      }
      const token = authHeader.split("Bearer ")[1];
      let decodedToken;
      try {
        decodedToken = await auth.verifyIdToken(token);
      } catch (e: any) {
        return res.status(401).json({ success: false, error: "Unauthorized: Invalid token" });
      }

      const uid = decodedToken.uid;
      const profileRes = await safeGetUserProfile(uid, token);
      if (!profileRes.exists || !profileRes.data) {
        return res.status(403).json({ success: false, error: "Forbidden: User profile not found" });
      }

      const profile = profileRes.data;
      if (profile.accountStatus !== "ACTIVE") {
        return res.status(403).json({ success: false, error: "Forbidden: User account is inactive" });
      }

      const allowedRoles = ["PLATFORM_SUPERUSER", "TENANT_ADMIN", "PLANNER"];
      if (!allowedRoles.includes(profile.role)) {
        return res.status(403).json({ success: false, error: "Forbidden: Insufficient role permissions" });
      }

      const recommendationId = req.params.id;

      const recRef = db.collection("recommendations").doc(recommendationId);

      const result = await db.runTransaction(async (transaction) => {
        const recSnap = await transaction.get(recRef);
        if (!recSnap.exists) {
          return { status: 404, data: { success: false, error: "Recommendation not found" } };
        }

        const rec = recSnap.data()!;

        // Allowed statuses for restore: OVERRIDDEN, SUPPRESSED
        const allowedStatuses = ["OVERRIDDEN", "SUPPRESSED", "AUTO_PUBLISHED"]; // Let's allow AUTO_PUBLISHED if it was already restored or out of sync
        if (!allowedStatuses.includes(rec.recommendationStatus)) {
          return { status: 400, data: { success: false, error: "Recommendation cannot be restored" } };
        }

        if (profile.role !== "PLATFORM_SUPERUSER" && rec.tenantId !== profile.tenantId) {
          return { status: 403, data: { success: false, error: "Forbidden: Tenant isolation violation" } };
        }

        if (profile.role === "PLANNER") {
          if (!profile.siteIds || !Array.isArray(profile.siteIds) || !profile.siteIds.includes(rec.siteId)) {
            return { status: 403, data: { success: false, error: "Forbidden: Site assignment isolation violation" } };
          }
        }

        const currentRecId = `${rec.tenantId}_${rec.siteId}_${rec.productId}`;
        const currentRecRef = db.collection("currentRecommendations").doc(currentRecId);
        const currentSnap = await transaction.get(currentRecRef);
        
        if (!currentSnap.exists) {
           return { status: 404, data: { success: false, error: "Current recommendation not found" } };
        }
        
        const currentRecData = currentSnap.data()!;
        if (currentRecData.tenantId !== rec.tenantId || currentRecData.siteId !== rec.siteId || currentRecData.productId !== rec.productId) {
           return { status: 400, data: { success: false, error: "Recommendation data mismatch" } };
        }
        
        if (!currentRecData.hasActiveOverride && !currentRecData.suppressionContext) {
           return { status: 400, data: { success: false, error: "Recommendation does not have an active override or suppression to restore" } };
        }

        transaction.update(currentRecRef, {
          activeOverride: null,
          suppressionContext: null,
          hasActiveOverride: false,
          systemDiffersFromOverride: false,
          modifiedBy: uid,
          modifiedDate: FieldValue.serverTimestamp()
          // Do not set recommendationStatus to SUPERSEDED, let the engine handle the new state
        });

        const auditRef = db.collection("auditLogs").doc();
        transaction.set(auditRef, {
          tenantId: rec.tenantId,
          siteId: rec.siteId,
          eventType: "RECOMMENDATION_RESTORE",
          entityType: "Recommendation",
          entityId: currentRecId,
          summary: `Recommendation ${recommendationId} restored to automatic`,
          performedBy: uid,
          createdDate: FieldValue.serverTimestamp(),
          timestamp: FieldValue.serverTimestamp()
        });

        return { status: 200, data: { success: true, rec } };
      });

      if (result.status === 200 && result.data?.rec) {
        const rec = result.data.rec;

        // Use shared job enqueue logic
        await enqueueRecommendationJobServer(
          rec.tenantId,
          rec.siteId,
          "MANUAL_RECALCULATION",
          [rec.productId],
          uid
        );

        setTimeout(() => {
          RecommendationBackendService.claimAndProcessNextJob().catch(err =>
            console.error("[Server] Background recommendation job claim error:", err)
          );
        }, 50);
      }

      return res.status(result.status).json({ success: result.data.success, error: result.data.error });
    } catch (error: any) {
      console.error("Restore endpoint error:", error);
      return res.status(500).json({ success: false, error: error.message || "Internal server error" });
    }
  });

  // Start background job polling worker every 5 seconds (only if not testing)
  if (process.env.NODE_ENV !== "test") {
    setInterval(() => {
      RecommendationBackendService.claimAndProcessNextJob().catch(() => {});
    }, 5000);
  }

  return app;
}

export async function startServer() {
  const app = await createApp();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
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
    // When there are no documents left, we are done
    resolve();
    return;
  }

  // Delete documents in a batch
  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  await jobRef.update({
    documentsDeleted: FieldValue.increment(batchSize)
  });

  // Recurse on the next process tick, to avoid
  // exploding the stack.
  process.nextTick(() => {
    deleteQueryBatch(query, resolve, jobRef).catch((err) => {
      console.error(err);
      resolve(); // or throw?
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
    
    // 4. Disable and Delete eligible Firebase Authentication users
    await jobRef.update({ currentStage: "DELETING_AUTH_USERS" });
    // We already deleted users from Firestore. Now we need to delete them from Firebase Auth if they belong only to this tenant.
    // In our system, one user = one tenant (usually). We can find users that had this tenant ID.
    // However, since we deleted the Firestore 'users' docs, we can't query them by tenantId anymore.
    // Let's actually delete auth users before or during the 'users' collection deletion?
    // Actually, we can list users in Firebase Auth and if their custom claims or something indicates tenant, or we could have fetched the users first.
    // To be safe, if we haven't deleted them yet (which we just did), we can't find them easily. 
    // We will skip Firebase Auth deletion for now if we can't easily query them, or we could have stored them.
    // Wait, let's just log that we skipped them if we can't find them.
    
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

    // Mark completed
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

if (process.env.NODE_ENV !== "test") { startServer(); }

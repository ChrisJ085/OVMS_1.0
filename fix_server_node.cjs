const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

// Replace enqueue function
const enqueueStart = content.indexOf('async function enqueueRecommendationJobServer(');
const enqueueEnd = content.indexOf('export async function createApp() {');
if (enqueueStart !== -1 && enqueueEnd !== -1) {
  content = content.substring(0, enqueueStart) + content.substring(enqueueEnd);
}

// 1. Add imports
const importAdd = `
import { enqueueRecommendationJobServer } from "./src/server/jobQueue.js";
import { getCurrentRecommendationId, getEffectivePriorityId, buildDisplayPriorityDoc } from "./src/shared/recommendationIdentifiers.js";
`;
content = content.replace('import crypto from "crypto";', 'import crypto from "crypto";' + importAdd);

// 2. Refactor /api/recommendation-jobs
const jobsRouteStart = content.indexOf('app.post("/api/recommendation-jobs"');
const jobsRouteEnd = content.indexOf('app.post("/api/planning/recalculate-all"');
if (jobsRouteStart !== -1 && jobsRouteEnd !== -1) {
    const jobsRouteCode = `
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
        productIds
      } = req.body;

      if (!tenantId || !siteId || !triggerType || !Array.isArray(productIds)) {
        return res.status(400).json({ success: false, error: "Bad Request: Missing required parameters" });
      }

      if (profile.role !== "PLATFORM_SUPERUSER" && tenantId !== profile.tenantId) {
        return res.status(403).json({ success: false, error: "Forbidden: Tenant isolation violation" });
      }

      if (profile.role === "PLANNER") {
        if (!profile.siteIds || !Array.isArray(profile.siteIds) || !profile.siteIds.includes(siteId)) {
          return res.status(403).json({ success: false, error: "Forbidden: Site assignment isolation violation" });
        }
      }

      const sortedProductIds = [...productIds].sort();

      const { jobId, isNew } = await db.runTransaction(async (transaction: any) => {
        return await enqueueRecommendationJobServer(transaction, db, {
          tenantId, siteId, triggerType, triggerReferenceId, productIds: sortedProductIds,
          sourceInventorySnapshotId, sourceProductionPlanImportId, uid
        });
      });

      if (!isNew) {
        return res.status(200).json({ success: true, jobId, message: "A background generation job is already running for these exact inputs." });
      }

      const recService = new RecommendationBackendService();
      recService.processGenerationJob(jobId).catch(err => console.error("Background job failed", err));

      return res.status(202).json({ success: true, jobId, message: "Recommendation generation job queued." });
    } catch (error: any) {
      console.error("[POST /api/recommendation-jobs] Error:", error);
      return res.status(500).json({ success: false, error: error.message || "Internal server error" });
    }
  });

`;
    content = content.substring(0, jobsRouteStart) + jobsRouteCode + content.substring(jobsRouteEnd);
}

// 3. Refactor override endpoint
const overrideRouteStart = content.indexOf('app.post("/api/recommendations/:id/override"');
const overrideRouteEnd = content.indexOf('app.post("/api/recommendations/:id/suppress"');
if (overrideRouteStart !== -1 && overrideRouteEnd !== -1) {
    const overrideRouteCode = `
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

      const result = await db.runTransaction(async (transaction: any) => {
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

        const currentRecId = getCurrentRecommendationId(rec.tenantId, rec.siteId, rec.productId);
        const currentRecRef = db.collection("currentRecommendations").doc(currentRecId);
        const currentSnap = await transaction.get(currentRecRef);
        
        if (!currentSnap.exists) {
           return { status: 404, data: { success: false, error: "Current recommendation not found" } };
        }
        
        const currentRecData = currentSnap.data()!;
        if (currentRecData.tenantId !== rec.tenantId || currentRecData.siteId !== rec.siteId || currentRecData.productId !== rec.productId) {
           return { status: 400, data: { success: false, error: "Recommendation data mismatch" } };
        }

        const effectivePriorityId = getEffectivePriorityId(rec.tenantId, rec.siteId, rec.productId);
        const priorityRef = db.collection("priorities").doc(effectivePriorityId);
        const displayPriorityRef = db.collection("displayPriorities").doc(\`disp_\${effectivePriorityId}\`);

        const systemAction = currentRecData.recommendedActionTypeId;
        const systemQuantity = currentRecData.recommendedQuantity;
        const systemDestination = currentRecData.recommendedDestinationId;
        const systemPriority = currentRecData.recommendedPriorityLevelId;

        if (systemAction === undefined || systemQuantity === undefined) {
           return { status: 400, data: { success: false, error: "Cannot override: missing system recommendation values" } };
        }

        const activeOverride = {
          status: "ACTIVE",
          overriddenBy: uid,
          overriddenAt: FieldValue.serverTimestamp(),
          reason: overrideData.reason,
          actionTypeId: overrideData.actionTypeId !== undefined ? overrideData.actionTypeId : systemAction,
          quantity: overrideData.quantity !== undefined ? overrideData.quantity : systemQuantity,
          destinationId: overrideData.destinationId !== undefined ? overrideData.destinationId : systemDestination,
          priorityLevelId: overrideData.priorityLevelId !== undefined ? overrideData.priorityLevelId : systemPriority,
          instruction: overrideData.instruction || \`Planner override for \${currentRecData.productCodeSnapshot || currentRecData.productId}\`,
          expireAt: overrideData.expireAt ? Timestamp.fromDate(new Date(overrideData.expireAt)) : null
        };
        
        const effectiveInstruction = {
          actionTypeId: activeOverride.actionTypeId,
          quantity: activeOverride.quantity,
          destinationId: activeOverride.destinationId,
          priorityLevelId: activeOverride.priorityLevelId,
          isOverride: true,
          overrideReason: activeOverride.reason
        };

        const systemDiffersFromOverride = 
           activeOverride.actionTypeId !== systemAction ||
           activeOverride.quantity !== systemQuantity ||
           activeOverride.destinationId !== systemDestination ||
           activeOverride.priorityLevelId !== systemPriority;

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
          status: "active",
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
          priorityStatus: "ACTIVE",
          modifiedBy: uid,
          modifiedDate: FieldValue.serverTimestamp()
        };
        transaction.set(priorityRef, priorityDoc, { merge: true });

        // Upsert display priority
        const displayPriorityDoc = buildDisplayPriorityDoc(priorityDoc, effectivePriorityId);
        displayPriorityDoc.id = \`disp_\${effectivePriorityId}\`;
        displayPriorityDoc._tags = [\`site_\${rec.siteId}\`, \`tenant_\${rec.tenantId}\`];
        transaction.set(displayPriorityRef, displayPriorityDoc, { merge: true });

        // Audit log
        const auditRef = db.collection("auditLogs").doc();
        transaction.set(auditRef, {
          tenantId: rec.tenantId,
          siteId: rec.siteId,
          auditType: "RECOMMENDATION_OVERRIDE",
          userId: uid,
          referenceId: recommendationId,
          details: { productId: rec.productId, activeOverride },
          timestamp: FieldValue.serverTimestamp()
        });

        return { status: 200, data: { success: true, message: "Recommendation overridden successfully." } };
      });

      return res.status(result.status).json(result.data);
    } catch (error: any) {
      console.error("[POST /api/recommendations/:id/override] Error:", error);
      return res.status(500).json({ success: false, error: error.message || "Internal server error" });
    }
  });

`;
    content = content.substring(0, overrideRouteStart) + overrideRouteCode + content.substring(overrideRouteEnd);
}

// 4. Refactor suppress endpoint
const suppressRouteStart = content.indexOf('app.post("/api/recommendations/:id/suppress"');
const suppressRouteEnd = content.indexOf('app.post("/api/recommendations/:id/restore-automatic"');
if (suppressRouteStart !== -1 && suppressRouteEnd !== -1) {
    const suppressRouteCode = `
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

      const recommendationId = req.params.id; // actually history ID
      const { suppressData } = req.body;

      if (!suppressData || typeof suppressData.reason !== "string" || suppressData.reason.trim() === "") {
        return res.status(400).json({ success: false, error: "Bad Request: suppress reason is required" });
      }

      const validScopes = ["UNTIL_NEXT_SNAPSHOT", "UNTIL_DATE", "PERMANENT"];
      if (!validScopes.includes(suppressData.scope)) {
        return res.status(400).json({ success: false, error: "Bad Request: invalid suppression scope" });
      }

      const recRef = db.collection("recommendations").doc(recommendationId);

      const result = await db.runTransaction(async (transaction: any) => {
        const recSnap = await transaction.get(recRef);
        if (!recSnap.exists) {
          return { status: 404, data: { success: false, error: "Recommendation not found" } };
        }

        const rec = recSnap.data()!;

        // Allowed statuses
        const allowedStatuses = ["AUTO_PUBLISHED", "OVERRIDDEN"];
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

        const currentRecId = getCurrentRecommendationId(rec.tenantId, rec.siteId, rec.productId);
        const currentRecRef = db.collection("currentRecommendations").doc(currentRecId);
        const currentSnap = await transaction.get(currentRecRef);
        
        if (!currentSnap.exists) {
           return { status: 404, data: { success: false, error: "Current recommendation not found" } };
        }
        
        const currentRecData = currentSnap.data()!;
        if (currentRecData.tenantId !== rec.tenantId || currentRecData.siteId !== rec.siteId || currentRecData.productId !== rec.productId) {
           return { status: 400, data: { success: false, error: "Recommendation data mismatch" } };
        }

        const effectivePriorityId = getEffectivePriorityId(rec.tenantId, rec.siteId, rec.productId);
        const priorityRef = db.collection("priorities").doc(effectivePriorityId);
        const displayPriorityRef = db.collection("displayPriorities").doc(\`disp_\${effectivePriorityId}\`);

        let expireAtTimestamp = null;
        if (suppressData.scope === "UNTIL_DATE") {
           if (!suppressData.expireAt) {
               return { status: 400, data: { success: false, error: "expireAt is required for UNTIL_DATE scope" } };
           }
           const expireDate = new Date(suppressData.expireAt);
           if (expireDate.getTime() < Date.now()) {
               return { status: 400, data: { success: false, error: "expireAt must be in the future" } };
           }
           expireAtTimestamp = Timestamp.fromDate(expireDate);
        }

        const suppressionContext = {
          suppressedBy: uid,
          suppressedAt: FieldValue.serverTimestamp(),
          reason: suppressData.reason,
          scope: suppressData.scope,
          expireAt: expireAtTimestamp,
          inventorySnapshotId: currentRecData.inventorySnapshotId || null
        };
        
        const effectiveInstruction = {
          actionTypeId: null,
          quantity: 0,
          destinationId: null,
          priorityLevelId: null,
          isOverride: false,
          overrideReason: suppressData.reason
        };

        transaction.update(currentRecRef, {
          suppressionContext,
          activeOverride: FieldValue.delete(),
          hasActiveOverride: false,
          systemDiffersFromOverride: false,
          effectiveInstruction,
          recommendationStatus: "SUPPRESSED",
          modifiedBy: uid,
          modifiedDate: FieldValue.serverTimestamp()
        });

        // Withdraw priority
        transaction.update(priorityRef, {
          priorityStatus: "WITHDRAWN",
          status: "withdrawn",
          modifiedBy: uid,
          modifiedDate: FieldValue.serverTimestamp()
        });
        transaction.delete(displayPriorityRef);

        // Audit log
        const auditRef = db.collection("auditLogs").doc();
        transaction.set(auditRef, {
          tenantId: rec.tenantId,
          siteId: rec.siteId,
          auditType: "RECOMMENDATION_SUPPRESS",
          userId: uid,
          referenceId: recommendationId,
          details: { productId: rec.productId, suppressionContext },
          timestamp: FieldValue.serverTimestamp()
        });

        return { status: 200, data: { success: true, message: "Recommendation suppressed successfully." } };
      });

      return res.status(result.status).json(result.data);
    } catch (error: any) {
      console.error("[POST /api/recommendations/:id/suppress] Error:", error);
      return res.status(500).json({ success: false, error: error.message || "Internal server error" });
    }
  });

`;
    content = content.substring(0, suppressRouteStart) + suppressRouteCode + content.substring(suppressRouteEnd);
}

// 5. Refactor restore-automatic endpoint
const restoreRouteStart = content.indexOf('app.post("/api/recommendations/:id/restore-automatic"');
const restoreRouteEnd = content.indexOf('app.post("/api/planning/recalculate-all"');
if (restoreRouteStart !== -1 && restoreRouteEnd !== -1) {
    const restoreRouteCode = `
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

      const result = await db.runTransaction(async (transaction: any) => {
        const recSnap = await transaction.get(recRef);
        if (!recSnap.exists) {
          return { status: 404, data: { success: false, error: "Recommendation not found" } };
        }

        const rec = recSnap.data()!;

        // Allowed statuses
        const allowedStatuses = ["OVERRIDDEN", "SUPPRESSED"];
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

        const currentRecId = getCurrentRecommendationId(rec.tenantId, rec.siteId, rec.productId);
        const currentRecRef = db.collection("currentRecommendations").doc(currentRecId);
        const currentSnap = await transaction.get(currentRecRef);
        
        if (!currentSnap.exists) {
           return { status: 404, data: { success: false, error: "Current recommendation not found" } };
        }
        const currentRecData = currentSnap.data()!;
        if (!currentRecData.activeOverride && !currentRecData.suppressionContext) {
           return { status: 400, data: { success: false, error: "Current recommendation has no active override or suppression to restore" } };
        }

        const systemAction = currentRecData.recommendedActionTypeId;
        const systemQuantity = currentRecData.recommendedQuantity;
        const systemDestination = currentRecData.recommendedDestinationId;
        const systemPriority = currentRecData.recommendedPriorityLevelId;
        
        const effectiveInstruction = {
          actionTypeId: systemAction || null,
          quantity: systemQuantity || 0,
          destinationId: systemDestination || null,
          priorityLevelId: systemPriority || null,
          isOverride: false
        };

        transaction.update(currentRecRef, {
          activeOverride: FieldValue.delete(),
          hasActiveOverride: false,
          suppressionContext: FieldValue.delete(),
          systemDiffersFromOverride: false,
          effectiveInstruction,
          recommendationStatus: "AUTO_PUBLISHED", // Return to auto-published or trigger recalc
          modifiedBy: uid,
          modifiedDate: FieldValue.serverTimestamp()
        });
        
        const { jobId, isNew } = await enqueueRecommendationJobServer(transaction, db, {
          tenantId: rec.tenantId,
          siteId: rec.siteId,
          triggerType: 'MANUAL_RECALCULATION',
          triggerReferenceId: 'RESTORE_' + recommendationId,
          productIds: [rec.productId],
          sourceInventorySnapshotId: currentRecData.inventorySnapshotId || null,
          sourceProductionPlanImportId: null,
          uid
        });

        // Audit log
        const auditRef = db.collection("auditLogs").doc();
        transaction.set(auditRef, {
          tenantId: rec.tenantId,
          siteId: rec.siteId,
          auditType: "RECOMMENDATION_RESTORE_AUTOMATIC",
          userId: uid,
          referenceId: recommendationId,
          details: { productId: rec.productId },
          timestamp: FieldValue.serverTimestamp()
        });

        return { status: 200, data: { success: true, message: "Recommendation restored to automatic.", jobId, isNewJob: isNew } };
      });

      if (result.status === 200 && result.data.jobId && result.data.isNewJob) {
        const recService = new RecommendationBackendService();
        recService.processGenerationJob(result.data.jobId).catch(err => console.error("Background job failed", err));
      }

      return res.status(result.status).json(result.data);
    } catch (error: any) {
      console.error("[POST /api/recommendations/:id/restore-automatic] Error:", error);
      return res.status(500).json({ success: false, error: error.message || "Internal server error" });
    }
  });

`;
    content = content.substring(0, restoreRouteStart) + restoreRouteCode + content.substring(restoreRouteEnd);
}


fs.writeFileSync('server.ts', content);

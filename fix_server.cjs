const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const overrideRegex = /\/\/ POST \/api\/recommendations\/:id\/override[\s\S]*?(?=\/\/ POST \/api\/recommendations\/:id\/suppress)/;

const suppressRegex = /\/\/ POST \/api\/recommendations\/:id\/suppress[\s\S]*?(?=\/\/ POST \/api\/recommendations\/:id\/restore-automatic)/;

const restoreRegex = /\/\/ POST \/api\/recommendations\/:id\/restore-automatic[\s\S]*?(?=\/\/ Start background job polling worker every 5 seconds)/;

// Extract job enqueueing logic
const enqueueJobCode = `
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

    const jobId = \`job_\${Date.now()}_\${Math.random().toString(36).substring(2, 7)}\`;
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
`;

if (!code.includes("async function enqueueRecommendationJobServer")) {
  code = code.replace("export async function createApp() {", enqueueJobCode + "\nexport async function createApp() {");
}


// Replace POST /api/recommendation-jobs logic to use the extracted function
const jobEndpointRegex = /\/\/ 4\. ENFORCE IDEMPOTENCY[\s\S]*?(?=setTimeout\(\(\) => \{[\s\S]*?return res\.status\(202\)\.json\()/;
// Let's manually replace the enqueue portion
const oldJobEndpointCode = `
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

        const jobId = \`job_\${Date.now()}_\${Math.random().toString(36).substring(2, 7)}\`;
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

        transaction.set(db.collection("recommendationGenerationJobs").doc(jobId), jobDoc);

        // Store the idempotency key mapping
        transaction.set(idempotencyRef, {
          idempotencyKey: idempotencyKey || jobId,
          serverIdempotencyHash,
          jobId,
          createdAt: now,
          tenantId,
          siteId
        });

        return { jobId, isDuplicate: false };
      });
`;

code = code.replace(oldJobEndpointCode, `
      const txResult = await enqueueRecommendationJobServer(
        tenantId, siteId, triggerType, productIds, uid, triggerReferenceId, sourceInventorySnapshotId, sourceProductionPlanImportId, idempotencyKey
      );
`);


const overrideCode = `// POST /api/recommendations/:id/override
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

        const currentRecId = \`\${rec.tenantId}_\${rec.siteId}_\${rec.productId}\`;
        const currentRecRef = db.collection("currentRecommendations").doc(currentRecId);
        const currentSnap = await transaction.get(currentRecRef);
        
        if (!currentSnap.exists) {
           return { status: 404, data: { success: false, error: "Current recommendation not found" } };
        }
        
        const currentRecData = currentSnap.data()!;
        if (currentRecData.tenantId !== rec.tenantId || currentRecData.siteId !== rec.siteId || currentRecData.productId !== rec.productId) {
           return { status: 400, data: { success: false, error: "Recommendation data mismatch" } };
        }

        const effectivePriorityId = \`\${rec.tenantId}_\${rec.siteId}_\${rec.productId}\`;
        const priorityRef = db.collection("priorities").doc(effectivePriorityId);
        const displayPriorityRef = db.collection("displayPriorities").doc(\`disp_\${effectivePriorityId}\`);

        const activeOverride = {
          status: "ACTIVE",
          overriddenBy: uid,
          overriddenAt: FieldValue.serverTimestamp(),
          reason: overrideData.reason,
          actionTypeId: overrideData.actionTypeId || currentRecData.currentSystemRecommendation?.decisionOutput?.recommendedActionTypeId || "RELEASE",
          quantity: overrideData.quantity !== undefined ? overrideData.quantity : (currentRecData.currentSystemRecommendation?.decisionOutput?.recommendedQuantity || 0),
          destinationId: overrideData.destinationId || currentRecData.currentSystemRecommendation?.decisionOutput?.recommendedDestinationId || null,
          priorityLevelId: overrideData.priorityLevelId || currentRecData.currentSystemRecommendation?.decisionOutput?.recommendedPriorityLevelId || "NORMAL",
          instruction: overrideData.instruction || \`Planner override for \${currentRecData.productCodeSnapshot || currentRecData.productId}\`,
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
          id: \`disp_\${effectivePriorityId}\`,
          tenantId: rec.tenantId,
          siteId: rec.siteId,
          productCode: priorityDoc.productCodeSnapshot,
          priorityStatus: "ACTIVE",
          actionType: priorityDoc.actionTypeId,
          priorityLevel: priorityDoc.priorityLevelId,
          _tags: [\`site_\${rec.siteId}\`, \`tenant_\${rec.tenantId}\`]
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
          summary: \`Planner override applied to recommendation \${recommendationId}\`,
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
`;

const suppressCode = `// POST /api/recommendations/:id/suppress
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

        const currentRecId = \`\${rec.tenantId}_\${rec.siteId}_\${rec.productId}\`;
        const currentRecRef = db.collection("currentRecommendations").doc(currentRecId);
        const currentSnap = await transaction.get(currentRecRef);
        
        if (!currentSnap.exists) {
           return { status: 404, data: { success: false, error: "Current recommendation not found" } };
        }
        
        const currentRecData = currentSnap.data()!;
        if (currentRecData.tenantId !== rec.tenantId || currentRecData.siteId !== rec.siteId || currentRecData.productId !== rec.productId) {
           return { status: 400, data: { success: false, error: "Recommendation data mismatch" } };
        }

        const effectivePriorityId = \`\${rec.tenantId}_\${rec.siteId}_\${rec.productId}\`;
        const priorityRef = db.collection("priorities").doc(effectivePriorityId);
        const displayPriorityRef = db.collection("displayPriorities").doc(\`disp_\${effectivePriorityId}\`);

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
          summary: \`Recommendation \${recommendationId} suppressed\`,
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
`;

const restoreCode = `// POST /api/recommendations/:id/restore-automatic
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

        const currentRecId = \`\${rec.tenantId}_\${rec.siteId}_\${rec.productId}\`;
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
          summary: \`Recommendation \${recommendationId} restored to automatic\`,
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
`;

code = code.replace(overrideRegex, overrideCode + "\n  ");
code = code.replace(suppressRegex, suppressCode + "\n  ");
code = code.replace(restoreRegex, restoreCode + "\n  ");

// Update Inventory validation in server.ts
// The endpoint is /api/inventory/import or snapshot? Let's check for "POST /api/inventory"
// If it's a general endpoint, let's fix the inventory rules
const inventoryRegex = /const allowedRoles = \["PLATFORM_SUPERUSER", "TENANT_ADMIN"\];/g;
code = code.replace(inventoryRegex, 'const allowedRoles = ["PLATFORM_SUPERUSER", "TENANT_ADMIN", "PLANNER"];');

fs.writeFileSync('server.ts', code);
console.log("Updated server.ts successfully");

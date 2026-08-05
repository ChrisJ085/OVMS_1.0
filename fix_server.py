import re

with open('server.ts', 'r') as f:
    content = f.read()

# 1. Add imports
imports = """
import { enqueueRecommendationJobServer } from "./src/server/jobQueue";
import { getCurrentRecommendationId, getEffectivePriorityId, buildDisplayPriorityDoc } from "./src/shared/recommendationIdentifiers";
"""
content = re.sub(r'import crypto from "crypto";', 'import crypto from "crypto";\n' + imports, content)

# 2. Refactor /api/recommendation-jobs
def replace_job_queue(match):
    return """
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
"""

content = re.sub(
    r'const sortedProductIds = \[\.\.\.productIds\]\.sort\(\);\n.*?const rawKeyData = \{.*?\n      return res\.status\(202\)\.json\(\{ success: true, jobId, message: "Recommendation generation job queued\." \}\);\n    \} catch \(error: any\) \{',
    replace_job_queue,
    content,
    flags=re.DOTALL
)

# 3. Refactor override endpoint
def replace_override(match):
    return """
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
        const displayPriorityRef = db.collection("displayPriorities").doc(`disp_${effectivePriorityId}`);

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
          instruction: overrideData.instruction || `Planner override for ${currentRecData.productCodeSnapshot || currentRecData.productId}`,
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
        const displayPriorityDoc = buildDisplayPriorityDoc(priorityDoc, effectivePriorityId);
        displayPriorityDoc.id = `disp_${effectivePriorityId}`;
        displayPriorityDoc._tags = [`site_${rec.siteId}`, `tenant_${rec.tenantId}`];
        transaction.set(displayPriorityRef, displayPriorityDoc, { merge: true });

        // Audit log
        const auditRef = db.collection("auditLogs").doc();
        transaction.set(auditRef, {
          tenantId: rec.tenantId,
          siteId: rec.siteId,
"""

content = re.sub(
    r'// Allowed statuses\n        const allowedStatuses = \["AUTO_PUBLISHED", "OVERRIDDEN"\];\n.*?tenantId: rec\.tenantId,\n          siteId: rec\.siteId,',
    replace_override,
    content,
    flags=re.DOTALL
)

# 4. Refactor suppress endpoint
def replace_suppress(match):
    return """
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
        const displayPriorityRef = db.collection("displayPriorities").doc(`disp_${effectivePriorityId}`);

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
        } else if (suppressData.scope === "UNTIL_NEXT_SNAPSHOT") {
            // Keep expireAt null, backend will handle it on next snapshot
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
"""

content = re.sub(
    r'// Allowed statuses\n        const allowedStatuses = \["AUTO_PUBLISHED", "OVERRIDDEN"\];.*?tenantId: rec\.tenantId,\n          siteId: rec\.siteId,',
    replace_suppress,
    content,
    flags=re.DOTALL
)


# 5. Refactor restore endpoint
def replace_restore(match):
    return """
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
"""

content = re.sub(
    r'// Allowed statuses\n        const allowedStatuses = \["AUTO_PUBLISHED", "OVERRIDDEN", "SUPPRESSED"\];.*?return res\.status\(result\.status\)\.json\(result\.data\);',
    replace_restore,
    content,
    flags=re.DOTALL
)

with open('server.ts', 'w') as f:
    f.write(content)


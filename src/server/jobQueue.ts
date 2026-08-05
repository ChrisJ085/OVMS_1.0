import { FieldValue } from 'firebase-admin/firestore';
import crypto from "crypto";

export async function enqueueRecommendationJobServer(
  transaction: any, 
  db: any,
  params: {
    tenantId: string;
    siteId: string;
    triggerType: string;
    triggerReferenceId: string | null;
    productIds: string[];
    sourceInventorySnapshotId: string | null;
    sourceProductionPlanImportId: string | null;
    uid: string;
  }
): Promise<{ jobId: string, isNew: boolean }> {
  
  const rawKeyData = {
    tenantId: params.tenantId,
    siteId: params.siteId,
    triggerType: params.triggerType,
    triggerReferenceId: params.triggerReferenceId || null,
    productIds: params.productIds.slice().sort(),
    sourceInventorySnapshotId: params.sourceInventorySnapshotId || null,
    sourceProductionPlanImportId: params.sourceProductionPlanImportId || null
  };
  
  const stableKeyString = JSON.stringify(rawKeyData);
  const serverIdempotencyHash = crypto.createHash("sha256").update(stableKeyString).digest("hex");
  const idempotencyRef = db.collection("recommendationIdempotencyKeys").doc(serverIdempotencyHash);

  const idempotencySnap = await transaction.get(idempotencyRef);
  if (idempotencySnap.exists) {
    const existingJobId = idempotencySnap.data()?.jobId;
    if (existingJobId) {
      return { jobId: existingJobId, isNew: false };
    }
  }

  const jobRef = db.collection("recommendationGenerationJobs").doc();
  const jobId = jobRef.id;
  const newJobDoc = {
    jobId,
    tenantId: params.tenantId,
    siteId: params.siteId,
    triggerType: params.triggerType,
    triggerReferenceId: params.triggerReferenceId,
    requestedBy: params.uid,
    requestedAt: FieldValue.serverTimestamp(),
    status: "QUEUED",
    productCount: params.productIds.length,
    processedCount: 0,
    createdCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    supersededCount: 0,
    withdrawnCount: 0,
    failedCount: 0,
    errors: [],
    sourceInventorySnapshotId: params.sourceInventorySnapshotId,
    sourceProductionPlanImportId: params.sourceProductionPlanImportId
  };

  transaction.set(jobRef, newJobDoc);
  transaction.set(idempotencyRef, {
    jobId,
    createdAt: FieldValue.serverTimestamp()
  });

  return { jobId, isNew: true };
}

import re

with open('server.ts', 'r') as f:
    content = f.read()

# Replace enqueueRecommendationJobServer
def replace_enqueue(match):
    return """
export async function enqueueRecommendationJobServer(
  transaction: any,
  db: any,
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

  const idempotencySnap = await transaction.get(idempotencyRef);
  if (idempotencySnap.exists) {
    const existingJobId = idempotencySnap.data()?.jobId;
    if (existingJobId) {
      return { jobId: existingJobId, isDuplicate: true };
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
    versionInfo: {
      engineVersion: "2.0.0-backend"
    }
  };

  const jobRef = db.collection("recommendationGenerationJobs").doc(jobId);
  transaction.set(jobRef, jobDoc);
  
  transaction.set(idempotencyRef, {
    jobId,
    createdAt: now
  });

  return { jobId, isDuplicate: false };
}
"""

content = re.sub(
    r'async function enqueueRecommendationJobServer\([\s\S]*?return \{ jobId, isDuplicate: false \};\n    \}\);\n    return txResult;\n  \} catch \(err\) \{\n    console.error\("\[Server\] Failed to enqueue job:", err\);\n    throw err;\n  \}\n\}',
    replace_enqueue,
    content,
    flags=re.DOTALL
)

with open('server.ts', 'w') as f:
    f.write(content)

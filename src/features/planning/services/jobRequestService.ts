import { auth, db } from '../../../config/firebase';
import { doc, onSnapshot, collection, setDoc, serverTimestamp } from 'firebase/firestore';
import { RecommendationGenerationJob, GenerationTriggerType } from '../../../types/recommendation';
import { ServiceResult } from '../../../types/common';

export interface EnqueueJobOptions {
  tenantId: string;
  siteId: string;
  triggerType: GenerationTriggerType;
  triggerReferenceId?: string | null;
  sourceInventorySnapshotId?: string | null;
  sourceProductionPlanImportId?: string | null;
  productIds?: string[];
  requestedBy?: string;
  idempotencyKey?: string;
}

/**
  * Enqueue a recommendation generation job on the trusted backend
  */
export const enqueueRecommendationJob = async (
  options: EnqueueJobOptions
): Promise<ServiceResult<{ jobId: string }>> => {
  try {
    const user = auth?.currentUser;
    const token = user ? await user.getIdToken() : null;

    if (token) {
      try {
        const response = await fetch('/api/recommendation-jobs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(options)
        });

        if (response.ok) {
          const resData = await response.json();
          if (resData.success && resData.jobId) {
            return { success: true, data: { jobId: resData.jobId } };
          }
        }
      } catch (fetchErr) {
        console.warn('[jobRequestService] API fetch error, falling back to direct Firestore queue:', fetchErr);
      }
    }

    // Fallback: create QUEUED job doc directly in Firestore (Requirement 1 & 2 compliant)
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const requestedBy = options.requestedBy || user?.uid || 'user';

    const jobDoc = {
      id: jobId,
      jobId,
      tenantId: options.tenantId,
      siteId: options.siteId,
      status: 'QUEUED',
      triggerType: options.triggerType,
      triggerReferenceId: options.triggerReferenceId || null,
      sourceInventorySnapshotId: options.sourceInventorySnapshotId || null,
      sourceProductionPlanImportId: options.sourceProductionPlanImportId || null,
      idempotencyKey: options.idempotencyKey || jobId,
      requestedBy,
      requestedAt: serverTimestamp(),
      startedAt: null,
      completedAt: null,
      leaseExpiresAt: null,
      workerId: null,
      attemptCount: 0,
      maxAttempts: 3,
      productCount: options.productIds?.length || 0,
      processedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      supersededCount: 0,
      withdrawnCount: 0,
      failedCount: 0,
      errors: [],
      productIds: options.productIds || [],
      engineVersion: '2.0.0',
      createdDate: serverTimestamp(),
      modifiedDate: serverTimestamp(),
      createdBy: requestedBy,
      modifiedBy: requestedBy
    };

    if (db) {
      await setDoc(doc(db, 'recommendationGenerationJobs', jobId), jobDoc);
    }

    return { success: true, data: { jobId } };
  } catch (error: any) {
    console.error('[jobRequestService] Error enqueuing job:', error);
    return { success: false, error: error.message || 'Failed to enqueue recommendation job' };
  }
};

/**
  * Subscribe to job execution progress in real-time
  */
export const subscribeToJobProgress = (
  jobId: string,
  onUpdate: (job: RecommendationGenerationJob | null) => void,
  onError?: (err: Error) => void
): (() => void) => {
  if (!db) {
    onUpdate(null);
    return () => {};
  }

  const jobRef = doc(db, 'recommendationGenerationJobs', jobId);
  return onSnapshot(
    jobRef,
    (snapshot) => {
      if (snapshot.exists()) {
        onUpdate({ id: snapshot.id, ...snapshot.data() } as RecommendationGenerationJob);
      } else {
        onUpdate(null);
      }
    },
    (err) => {
      console.error(`[jobRequestService] Error subscribing to job ${jobId}:`, err);
      if (onError) onError(err);
    }
  );
};

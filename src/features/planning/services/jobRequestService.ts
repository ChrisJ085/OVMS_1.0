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

    if (!token) {
      return { success: false, error: 'Authentication required. Please sign in.' };
    }

    const response = await fetch('/api/recommendation-jobs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(options)
    });

    const resData = await response.json().catch(() => ({ success: false, error: 'Invalid response from server' }));

    if (response.ok) {
      if (resData.success && resData.jobId) {
        return { success: true, data: { jobId: resData.jobId } };
      } else {
        return { success: false, error: resData.error || 'Failed to enqueue recommendation job' };
      }
    } else {
      return { success: false, error: resData.error || `HTTP error ${response.status}: Failed to enqueue recommendation job` };
    }
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

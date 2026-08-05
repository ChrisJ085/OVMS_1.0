import { collection, query, where, getDocs, Timestamp, writeBatch, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../../config/firebase';
import { DecisionInputSnapshot, DecisionOutput } from '../../../types/decision';
import { 
  Recommendation, 
  RecommendationStatus, 
  PlannerDecision, 
  OverrideFlags,
  RecommendationGenerationJob,
  GenerationTriggerType,
  OverrideContext,
  SuppressionContext
} from '../../../types/recommendation';
import { Priority, PriorityStatus } from '../../../types/priority';
import { evaluateDecision, ENGINE_VERSION } from './decisionEngine';
import { getProductInventory } from '../../inventory/services/inventoryService';
import { getProductPlanningRule } from './planningRuleService';
import { getProductProductionContext } from './productionService';
import { withPhase } from './promotionService';
import { PromotionProductRule, Promotion } from '../../../types/promotion';
import { ServiceResult } from '../../../types/common';
import { getProduct, getAllProducts } from '../../inventory/services/productService';
import { getDecisionConfiguration } from './decisionConfigurationService';
import { buildDisplayPriorityDoc } from '../../operations/services/priorityService';
import { enqueueRecommendationJob, subscribeToJobProgress } from './jobRequestService';

const RECOMMENDATIONS_COLLECTION = 'recommendations';
const JOBS_COLLECTION = 'recommendationGenerationJobs';
const PRIORITIES_COLLECTION = 'priorities';
const DISPLAY_PRIORITIES_COLLECTION = 'displayPriorities';
const PROMOTIONS_COLLECTION = 'promotions';
const PROMOTION_RULES_COLLECTION = 'promotionProductRules';
const EXCEPTIONS_COLLECTION = 'exceptions';

// Helper fingerprint generator
export const generateFingerprint = (input: DecisionInputSnapshot): string => {
  const str = JSON.stringify({
    inv: input.inventoryTotal,
    ruleMin: input.planningRule?.minimumQuantity,
    ruleTarget: input.planningRule?.targetQuantity,
    ruleMax: input.planningRule?.maximumQuantity,
    prodContext: input.productionContext ? { running: input.productionContext.isCurrentlyInProduction, risk: input.productionContext.productionRiskStatus } : null,
    promoCount: input.activePromotionImpacts.length,
    priorities: input.existingActivePriorities.length
  });
  
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
};

export interface RunJobOptions {
  triggerType: GenerationTriggerType;
  triggerReferenceId?: string | null;
  requestedBy?: string;
  productIds?: string[];
  forceRecalculate?: boolean;
}

/**
 * Site-wide / Product-scoped automatic Recommendation Generation Engine Job
 */
export const runSiteRecommendationJob = async (
  tenantId: string,
  siteId: string,
  options: RunJobOptions
): Promise<ServiceResult<RecommendationGenerationJob>> => {
  try {
    const enqueueRes = await enqueueRecommendationJob({
      tenantId,
      siteId,
      triggerType: options.triggerType,
      triggerReferenceId: options.triggerReferenceId,
      productIds: options.productIds,
      requestedBy: options.requestedBy
    });

    if (!enqueueRes.success || !enqueueRes.data) {
      return { success: false, error: enqueueRes.error || 'Failed to queue backend recommendation job' };
    }

    const jobId = enqueueRes.data.jobId;

    const finalJob = await new Promise<RecommendationGenerationJob | null>((resolve) => {
      let timeoutId: any = null;
      const unsub = subscribeToJobProgress(jobId, (job) => {
        if (job && (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'COMPLETED_WITH_WARNINGS')) {
          if (timeoutId) clearTimeout(timeoutId);
          unsub();
          resolve(job);
        }
      });

      timeoutId = setTimeout(() => {
        unsub();
        resolve({
          id: jobId,
          jobId,
          tenantId,
          siteId,
          status: 'QUEUED',
          triggerType: options.triggerType,
          triggerReferenceId: options.triggerReferenceId || null,
          requestedBy: options.requestedBy || 'user',
          requestedAt: Timestamp.now(),
          startedAt: null,
          completedAt: null,
          productCount: options.productIds?.length || 0,
          processedCount: 0,
          createdCount: 0,
          updatedCount: 0,
          unchangedCount: 0,
          supersededCount: 0,
          withdrawnCount: 0,
          failedCount: 0,
          errors: [],
          engineVersion: ENGINE_VERSION,
          createdDate: Timestamp.now(),
          modifiedDate: Timestamp.now(),
          createdBy: options.requestedBy || 'user',
          modifiedBy: options.requestedBy || 'user'
        });
      }, 5000);
    });

    return { success: true, data: finalJob || undefined };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to run site recommendation job' };
  }
};

export const reEvaluateRecommendation = async (
  tenantId: string,
  siteId: string,
  productId: string
): Promise<ServiceResult<string>> => {
  const result = await runSiteRecommendationJob(tenantId, siteId, {
    triggerType: 'MANUAL_RECALCULATION',
    productIds: [productId],
    forceRecalculate: true
  });

  if (result.success && result.data) {
    return { success: true, data: result.data.jobId };
  }
  return { success: false, error: result.error || 'Failed to re-evaluate recommendation' };
};

/**
 * Apply Planner / Admin Override to a Recommendation
 */
export const overrideRecommendation = async (
  recommendationId: string,
  overrideData: {
    actionTypeId?: string;
    quantity?: number;
    destinationId?: string;
    priorityLevelId?: string;
    instruction?: string;
    reason: string;
  },
  userId: string = 'planner-user'
): Promise<ServiceResult<void>> => {
  try {
    const user = auth?.currentUser;
    const token = user ? await user.getIdToken() : null;

    if (!token) {
      return { success: false, error: 'Authentication required. Please sign in.' };
    }

    const response = await fetch(`/api/recommendations/${recommendationId}/override`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ overrideData })
    });

    const resData = await response.json().catch(() => ({ success: false, error: 'Invalid response from server' }));

    if (response.ok) {
      if (resData.success) {
        return { success: true };
      } else {
        return { success: false, error: resData.error || 'Failed to override recommendation' };
      }
    } else {
      return { success: false, error: resData.error || `HTTP error ${response.status}: Failed to override recommendation` };
    }
  } catch (error: any) {
    console.error('[recommendationService] Error overriding recommendation:', error);
    return { success: false, error: error.message || 'Failed to override recommendation' };
  }
};

/**
 * Suppress a Recommendation
 */
export const suppressRecommendation = async (
  recommendationId: string,
  suppressionData: {
    reason: string;
    scope: 'UNTIL_NEXT_SNAPSHOT' | 'UNTIL_DATE' | 'PERMANENT';
    expireAt?: Date;
  },
  userId: string = 'planner-user'
): Promise<ServiceResult<void>> => {
  try {
    const user = auth?.currentUser;
    const token = user ? await user.getIdToken() : null;

    if (!token) {
      return { success: false, error: 'Authentication required. Please sign in.' };
    }

    const response = await fetch(`/api/recommendations/${recommendationId}/suppress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        suppressionData: {
          reason: suppressionData.reason,
          scope: suppressionData.scope,
          expireAt: suppressionData.expireAt ? suppressionData.expireAt.toISOString() : undefined
        }
      })
    });

    const resData = await response.json().catch(() => ({ success: false, error: 'Invalid response from server' }));

    if (response.ok) {
      if (resData.success) {
        return { success: true };
      } else {
        return { success: false, error: resData.error || 'Failed to suppress recommendation' };
      }
    } else {
      return { success: false, error: resData.error || `HTTP error ${response.status}: Failed to suppress recommendation` };
    }
  } catch (error: any) {
    console.error('[recommendationService] Error suppressing recommendation:', error);
    return { success: false, error: error.message || 'Failed to suppress recommendation' };
  }
};

/**
 * Restore Automatic Recommendation (Clear Override/Suppression and Re-evaluate)
 */
export const restoreAutomaticRecommendation = async (
  recommendationId: string,
  userId: string = 'planner-user'
): Promise<ServiceResult<void>> => {
  try {
    const user = auth?.currentUser;
    const token = user ? await user.getIdToken() : null;

    if (!token) {
      return { success: false, error: 'Authentication required. Please sign in.' };
    }

    const response = await fetch(`/api/recommendations/${recommendationId}/restore-automatic`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const resData = await response.json().catch(() => ({ success: false, error: 'Invalid response from server' }));

    if (response.ok) {
      if (resData.success) {
        return { success: true };
      } else {
        return { success: false, error: resData.error || 'Failed to restore recommendation' };
      }
    } else {
      return { success: false, error: resData.error || `HTTP error ${response.status}: Failed to restore recommendation` };
    }
  } catch (error: any) {
    console.error('[recommendationService] Error restoring recommendation:', error);
    return { success: false, error: error.message || 'Failed to restore recommendation' };
  }
};

/**
 * Backwards compatible status updater
 */
export const updateRecommendationStatus = async (
  id: string,
  status: RecommendationStatus,
  decision?: PlannerDecision,
  flags?: OverrideFlags,
  reason?: string,
  userId = 'dev-user'
): Promise<ServiceResult<void>> => {
  return { success: false, error: 'Direct client-side status updates are disabled for safety. Please use the override API.' };
};

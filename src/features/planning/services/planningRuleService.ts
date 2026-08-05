import {
  createDocument,
  updateDocument,
  deactivateDocument,
  subscribeToCollection
} from '../../../services/firestoreBase';
import { db } from '../../../config/firebase';
import { collection, query, where, getDocs, doc, getDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { ProductPlanningRule, PlanningBandStatus } from '../../../types/planning';
import { ServiceResult } from '../../../types/common';
import { enqueueRecommendationJob } from './jobRequestService';

const COLLECTION_NAME = 'planningRules';

export const validateRule = (data: Partial<ProductPlanningRule>): string | null => {
  if (!data.productId) return 'Product is required';
  
  const min = data.minimumQuantity || 0;
  const target = data.targetQuantity || 0;
  const max = data.maximumQuantity || 0;
  const ddxm = data.ddxmRetentionQuantity || 0;

  if (min < 0 || target < 0 || max < 0 || ddxm < 0) {
    return 'All quantities must be non-negative';
  }

  if (min > target || target > max) {
    return 'Quantities must satisfy: Minimum <= Target <= Maximum';
  }

  if (data.controllingThresholdMode === 'CUSTOM' && (data.customControllingRetentionQuantity === null || data.customControllingRetentionQuantity === undefined || data.customControllingRetentionQuantity < 0)) {
    return 'Custom controlling quantity is required and must be non-negative when CUSTOM mode is selected';
  }

  if (!data.preferredDestinationId) {
    return 'Preferred destination is required';
  }

  if (!data.untilSwitchedOff && data.effectiveFrom && data.effectiveTo) {
    const fromDate = (data.effectiveFrom as any).toDate ? (data.effectiveFrom as any).toDate() : new Date(data.effectiveFrom as any);
    const toDate = (data.effectiveTo as any).toDate ? (data.effectiveTo as any).toDate() : new Date(data.effectiveTo as any);
    if (toDate <= fromDate) {
      return 'Effective To must be later than Effective From';
    }
  }

  return null;
};

export const checkOverlap = async (
  tenantId: string,
  siteId: string,
  productId: string,
  effectiveFrom: Date,
  effectiveTo: Date | null,
  excludeRuleId?: string
): Promise<boolean> => {
  const rulesRef = collection(db, COLLECTION_NAME);
  // We'll fetch all active rules for the product and site and check overlapping in memory
  // because Firestore range queries on multiple fields are tricky.
  const q = query(
    rulesRef,
    where('tenantId', '==', tenantId),
    where('siteId', '==', siteId),
    where('productId', '==', productId),
    where('status', '==', 'active')
  );

  const snapshot = await getDocs(q);
  
  for (const doc of snapshot.docs) {
    if (excludeRuleId && doc.id === excludeRuleId) continue;
    
    const existingRule = doc.data() as ProductPlanningRule;
    const exFrom = (existingRule.effectiveFrom as any).toDate();
    const exTo = existingRule.effectiveTo ? (existingRule.effectiveTo as any).toDate() : null;

    // Overlap logic:
    // Two periods [start1, end1] and [start2, end2] overlap if:
    // start1 < end2 && start2 < end1
    // (considering null as infinity)
    const start1 = effectiveFrom.getTime();
    const end1 = effectiveTo ? effectiveTo.getTime() : Infinity;
    const start2 = exFrom.getTime();
    const end2 = exTo ? exTo.getTime() : Infinity;

    if (start1 < end2 && start2 < end1) {
      return true; // Overlap found
    }
  }

  return false;
};

export const createPlanningRule = async (
  data: Omit<ProductPlanningRule, 'id' | 'status' | 'createdDate' | 'modifiedDate'>
): Promise<ServiceResult<string>> => {
  const error = validateRule(data);
  if (error) return { success: false, error };

  try {
    const fromDate = (data.effectiveFrom as any).toDate ? (data.effectiveFrom as any).toDate() : new Date(data.effectiveFrom as any);
    const toDate = data.effectiveTo ? ((data.effectiveTo as any).toDate ? (data.effectiveTo as any).toDate() : new Date(data.effectiveTo as any)) : null;
    
    const isOverlapping = await checkOverlap(data.tenantId, data.siteId || '', data.productId, fromDate, toDate);
    if (isOverlapping) {
      return { success: false, error: 'Effective dates overlap with an existing active rule for this product.' };
    }

    const id = await createDocument<any>(COLLECTION_NAME, {
      ...data,
      status: 'active'
    });

    if (data.tenantId && data.siteId && data.productId) {
      enqueueRecommendationJob({
        tenantId: data.tenantId,
        siteId: data.siteId,
        triggerType: 'PLANNING_RULE_CHANGE',
        triggerReferenceId: id,
        productIds: [data.productId]
      }).catch(err => console.error('Recommendation trigger error:', err));
    }

    return { success: true, data: id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
};

export const updatePlanningRule = async (
  id: string,
  data: Partial<ProductPlanningRule>,
  tenantId: string,
  siteId: string
): Promise<ServiceResult<void>> => {
  const error = validateRule(data);
  if (error) return { success: false, error };

  try {
    let productId = data.productId;
    if (!productId && db) {
      const existing = await getDoc(doc(db, COLLECTION_NAME, id));
      if (existing.exists()) {
        productId = existing.data().productId;
      }
    }

    if (data.effectiveFrom || data.effectiveTo || data.productId) {
       const fromDate = (data.effectiveFrom as any).toDate ? (data.effectiveFrom as any).toDate() : new Date(data.effectiveFrom as any);
       const toDate = data.effectiveTo ? ((data.effectiveTo as any).toDate ? (data.effectiveTo as any).toDate() : new Date(data.effectiveTo as any)) : null;
       
       if (data.productId) {
         const isOverlapping = await checkOverlap(tenantId, siteId, data.productId, fromDate, toDate, id);
         if (isOverlapping) {
           return { success: false, error: 'Effective dates overlap with an existing active rule for this product.' };
         }
       }
    }

    await updateDocument(COLLECTION_NAME, id, data);

    if (tenantId && siteId && productId) {
      enqueueRecommendationJob({
        tenantId,
        siteId,
        triggerType: 'PLANNING_RULE_CHANGE',
        triggerReferenceId: id,
        productIds: [productId]
      }).catch(err => console.error('Recommendation trigger error on update:', err));
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
};

export const setPlanningRuleStatus = async (
  id: string,
  active: boolean
): Promise<ServiceResult<void>> => {
  try {
    let tenantId = '';
    let siteId = '';
    let productId = '';

    if (db) {
      const existing = await getDoc(doc(db, COLLECTION_NAME, id));
      if (existing.exists()) {
        const rData = existing.data();
        tenantId = rData.tenantId;
        siteId = rData.siteId;
        productId = rData.productId;
      }
    }

    if (!active) {
      await deactivateDocument(COLLECTION_NAME, id);
    } else {
      await updateDocument(COLLECTION_NAME, id, { status: 'active' });
    }

    if (tenantId && siteId && productId) {
      enqueueRecommendationJob({
        tenantId,
        siteId,
        triggerType: 'PLANNING_RULE_CHANGE',
        triggerReferenceId: id,
        productIds: [productId]
      }).catch(err => console.error('Recommendation trigger error on status change:', err));
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

export const subscribeToPlanningRules = (
  tenantId: string,
  siteId: string,
  onUpdate: (rules: ProductPlanningRule[]) => void,
  onError: (error: Error) => void
) => {
  return subscribeToCollection<ProductPlanningRule>(
    COLLECTION_NAME,
    [
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId)
    ],
    (items) => {
      onUpdate(items);
    },
    onError
  );
};

export const getProductPlanningRule = async (
  tenantId: string,
  siteId: string,
  productId: string
): Promise<ProductPlanningRule | null> => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId),
      where('productId', '==', productId),
      where('status', '==', 'active')
    );
    const snap = await getDocs(q);
    
    // We should ideally filter by effective dates here
    const now = new Date();
    for (const d of snap.docs) {
      const rule = { id: d.id, ...d.data() } as ProductPlanningRule;
      const from = (rule.effectiveFrom as any)?.toDate?.() || new Date(rule.effectiveFrom as any);
      const to = rule.effectiveTo ? ((rule.effectiveTo as any)?.toDate?.() || new Date(rule.effectiveTo as any)) : null;
      
      if (from <= now && (!to || to > now)) {
        return rule;
      }
    }
    
    // If no specific date match, maybe just return the first active one? Or null.
    // Assuming we want strict date matching. If there's an active rule but no date overlap, we might still want it if dates are loose.
    // Let's just return the first one if we can't find a date match but it's active.
    if (!snap.empty) {
       return { id: snap.docs[0].id, ...snap.docs[0].data() } as ProductPlanningRule;
    }
    
    return null;
  } catch (e) {
    console.error(e);
    return null;
  }
};

export const calculateControllingRetention = (rule: ProductPlanningRule): number => {
  switch (rule.controllingThresholdMode) {
    case 'HIGHEST_MANDATORY':
      return Math.max(rule.minimumQuantity, rule.ddxmRetentionQuantity);
    case 'MINIMUM_ONLY':
      return rule.minimumQuantity;
    case 'DDXM_ONLY':
      return rule.ddxmRetentionQuantity;
    case 'CUSTOM':
      return rule.customControllingRetentionQuantity || 0;
    default:
      return 0;
  }
};

export const calculatePlanningMetrics = (rule: ProductPlanningRule, qoh: number) => {
  const controlling = calculateControllingRetention(rule);
  
  const gapToTarget = qoh < rule.targetQuantity ? rule.targetQuantity - qoh : 0;
  const headroomToMax = Math.max(0, rule.maximumQuantity - qoh);
  const availableAboveMin = Math.max(0, qoh - rule.minimumQuantity);
  const availableAboveDDXM = Math.max(0, qoh - rule.ddxmRetentionQuantity);
  const availableToRelease = Math.max(0, qoh - controlling);
  const shortfall = Math.max(0, controlling - qoh);

  let status: PlanningBandStatus;
  
  if (qoh < controlling) {
    status = 'BELOW_CONTROL';
  } else if (qoh === controlling) {
    status = 'AT_CONTROL';
  } else if (qoh < rule.targetQuantity) {
    status = 'BELOW_TARGET';
  } else if (qoh === rule.targetQuantity) {
    status = 'AT_TARGET';
  } else if (qoh <= rule.maximumQuantity) {
    status = 'ABOVE_TARGET';
  } else {
    status = 'ABOVE_MAXIMUM';
  }

  return {
    controllingRetention: controlling,
    gapToTarget,
    headroomToMax,
    availableAboveMin,
    availableAboveDDXM,
    availableToRelease,
    shortfall,
    status
  };
};

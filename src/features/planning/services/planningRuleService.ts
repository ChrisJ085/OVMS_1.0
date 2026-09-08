import { ProductPlanningRule, PlanningBandStatus } from '../../../types/planning';
import { ServiceResult } from '../../../types/common';
import { Timestamp, collection, createDocument, db, deactivateDocument, getDocs, query, serverTimestamp, subscribeToCollection, updateDocument, where } from '../../../services/firestoreBase';

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
      status: 'active',
      createdDate: Timestamp.now(),
      modifiedDate: Timestamp.now()
    });
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
    // Note: if updating dates or productId, we should check for overlaps
    // But typically we don't change productId of an existing rule.
    // If effective dates change:
    if (data.effectiveFrom || data.effectiveTo || data.productId) {
       // We'll need the full rule to check overlap properly if only partial is sent,
       // but typically our form sends the whole object.
       const fromDate = (data.effectiveFrom as any).toDate ? (data.effectiveFrom as any).toDate() : new Date(data.effectiveFrom as any);
       const toDate = data.effectiveTo ? ((data.effectiveTo as any).toDate ? (data.effectiveTo as any).toDate() : new Date(data.effectiveTo as any)) : null;
       
       if (data.productId) {
         const isOverlapping = await checkOverlap(tenantId, siteId, data.productId, fromDate, toDate, id);
         if (isOverlapping) {
           return { success: false, error: 'Effective dates overlap with an existing active rule for this product.' };
         }
       }
    }

    await updateDocument(COLLECTION_NAME, id, {
      ...data,
      modifiedDate: Timestamp.now()
    });
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
    if (!active) {
      await deactivateDocument(COLLECTION_NAME, id);
    } else {
      await updateDocument(COLLECTION_NAME, id, { status: 'active' });
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
    if (snap.empty) return null;

    const rules = snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductPlanningRule));
    
    // Sort descending by modifiedDate or createdDate so the latest saved rule is prioritized
    rules.sort((a, b) => {
      const timeA = (a.modifiedDate as any)?.toDate?.()?.getTime() || (a.modifiedDate as any)?.seconds * 1000 || (a.createdDate as any)?.toDate?.()?.getTime() || (a.createdDate as any)?.seconds * 1000 || 0;
      const timeB = (b.modifiedDate as any)?.toDate?.()?.getTime() || (b.modifiedDate as any)?.seconds * 1000 || (b.createdDate as any)?.toDate?.()?.getTime() || (b.createdDate as any)?.seconds * 1000 || 0;
      return timeB - timeA;
    });

    const now = new Date();
    for (const rule of rules) {
      const from = (rule.effectiveFrom as any)?.toDate?.() || new Date(rule.effectiveFrom as any);
      const to = rule.effectiveTo ? ((rule.effectiveTo as any)?.toDate?.() || new Date(rule.effectiveTo as any)) : null;
      
      if (from <= now && (!to || to > now)) {
        return rule;
      }
    }
    
    return rules[0] || null;
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

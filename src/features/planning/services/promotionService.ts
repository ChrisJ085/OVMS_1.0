import {
  createDocument,
  updateDocument,
  subscribeToCollection,
  subscribeToDocument,
  collection, query, where, getDocs
} from '../../../services/supabaseBase';
import { Promotion, PromotionProductRule, PromotionPhase, PromotionWithPhase } from '../../../types/promotion';
import { ServiceResult, Timestamp } from '../../../types/common';
import { toEpochMillis } from '../../../utils/timeFormatters';

const PROMOTIONS_COLLECTION = 'promotions';
const RULES_COLLECTION = 'promotionProductRules';

export const calculatePromotionPhase = (
  startDate: Timestamp,
  endDate: Timestamp,
  preBuildStartDate: Timestamp | null,
  runDownEndDate: Timestamp | null
): PromotionPhase => {
  const now = Date.now();
  const startMs = toEpochMillis(startDate) || 0;
  const endMs = toEpochMillis(endDate) || 0;
  const preBuildMs = preBuildStartDate ? (toEpochMillis(preBuildStartDate) || startMs) : startMs;
  const runDownMs = runDownEndDate ? (toEpochMillis(runDownEndDate) || endMs) : endMs;

  if (now >= startMs && now <= endMs) {
    return 'ACTIVE';
  } else if (now >= preBuildMs && now < startMs) {
    return 'PRE_BUILD';
  } else if (now > endMs && now <= runDownMs) {
    return 'RUN_DOWN';
  } else {
    return 'INACTIVE';
  }
};

export const withPhase = (promotion: Promotion): PromotionWithPhase => {
  return {
    ...promotion,
    phase: calculatePromotionPhase(
      promotion.startDate,
      promotion.endDate,
      promotion.preBuildStartDate,
      promotion.runDownEndDate
    )
  };
};

export const validatePromotion = (data: Partial<Promotion>): string | null => {
  if (!data.promotionCode) return 'Promotion code is required';
  if (!data.promotionName) return 'Promotion name is required';
  if (!data.startDate) return 'Start date is required';
  if (!data.endDate) return 'End date is required';

  const start = (data.startDate as any).toDate ? (data.startDate as any).toDate() : new Date(data.startDate as any);
  const end = (data.endDate as any).toDate ? (data.endDate as any).toDate() : new Date(data.endDate as any);

  if (end <= start) {
    return 'End date must be after start date';
  }

  if (data.preBuildStartDate) {
    const pre = (data.preBuildStartDate as any).toDate ? (data.preBuildStartDate as any).toDate() : new Date(data.preBuildStartDate as any);
    if (pre >= start) return 'Pre-build start date must be before start date';
  }

  if (data.runDownEndDate) {
    const runDown = (data.runDownEndDate as any).toDate ? (data.runDownEndDate as any).toDate() : new Date(data.runDownEndDate as any);
    if (runDown <= end) return 'Run-down end date must be after end date';
  }

  return null;
};

export const createPromotion = async (
  data: Omit<Promotion, 'id' | 'status' | 'createdDate' | 'modifiedDate'>
): Promise<ServiceResult<string>> => {
  const error = validatePromotion(data);
  if (error) return { success: false, error };

  try {
    const id = await createDocument<any>(PROMOTIONS_COLLECTION, {
      ...data,
      status: 'active'
    });
    return { success: true, data: id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
};

export const updatePromotion = async (
  id: string,
  data: Partial<Promotion>
): Promise<ServiceResult<void>> => {
  const error = validatePromotion(data);
  if (error) return { success: false, error };

  try {
    await updateDocument(PROMOTIONS_COLLECTION, id, data);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
};

export const subscribeToPromotions = (
  tenantId: string,
  onUpdate: (promotions: PromotionWithPhase[]) => void,
  onError: (error: Error) => void
) => {
  return subscribeToCollection<Promotion>(
    PROMOTIONS_COLLECTION,
    [where('tenantId', '==', tenantId)],
    (items) => {
      onUpdate(items.map(withPhase));
    },
    onError
  );
};

export const subscribeToPromotion = (
  id: string,
  onUpdate: (promotion: PromotionWithPhase | null) => void,
  onError: (error: Error) => void
) => {
  return subscribeToDocument<Promotion>(
    PROMOTIONS_COLLECTION,
    id,
    (doc) => {
      onUpdate(doc ? withPhase(doc) : null);
    },
    onError
  );
};

// --- Product Rules ---

export const validatePromotionRule = (data: Partial<PromotionProductRule>): string | null => {
  if (!data.productId) return 'Product is required';
  
  const checkNonNegative = (val: number | null | undefined, name: string) => {
    if (val !== null && val !== undefined && val < 0) return `${name} cannot be negative`;
    return null;
  };

  let err = checkNonNegative(data.expectedVolumeUpliftQuantity, 'Expected volume uplift quantity');
  if (err) return err;
  err = checkNonNegative(data.expectedVolumeUpliftPercent, 'Expected volume uplift percent');
  if (err) return err;
  err = checkNonNegative(data.retentionUpliftQuantity, 'Retention uplift quantity');
  if (err) return err;
  err = checkNonNegative(data.promotionMinimumOverride, 'Minimum override');
  if (err) return err;
  err = checkNonNegative(data.promotionTargetOverride, 'Target override');
  if (err) return err;
  err = checkNonNegative(data.promotionMaximumOverride, 'Maximum override');
  if (err) return err;
  err = checkNonNegative(data.priorityWeightUplift, 'Priority weight uplift');
  if (err) return err;

  // At least one impact should be defined
  if (
    !data.expectedVolumeUpliftQuantity &&
    !data.expectedVolumeUpliftPercent &&
    !data.retentionUpliftQuantity &&
    (data.promotionMinimumOverride === null || data.promotionMinimumOverride === undefined) &&
    (data.promotionTargetOverride === null || data.promotionTargetOverride === undefined) &&
    (data.promotionMaximumOverride === null || data.promotionMaximumOverride === undefined) &&
    !data.destinationOverrideId &&
    !data.actionTypeOverrideId &&
    !data.priorityWeightUplift
  ) {
    return 'At least one product impact must be configured';
  }

  return null;
};

export const createPromotionRule = async (
  data: Omit<PromotionProductRule, 'id' | 'status' | 'createdDate' | 'modifiedDate'>
): Promise<ServiceResult<string>> => {
  const error = validatePromotionRule(data);
  if (error) return { success: false, error };

  try {
    const id = await createDocument<any>(RULES_COLLECTION, {
      ...data,
      status: 'active'
    });
    return { success: true, data: id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
};

export const updatePromotionRule = async (
  id: string,
  data: Partial<PromotionProductRule>
): Promise<ServiceResult<void>> => {
  const error = validatePromotionRule(data);
  if (error) return { success: false, error };

  try {
    await updateDocument(RULES_COLLECTION, id, data);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
};

export const subscribeToPromotionRules = (
  tenantId: string,
  promotionId: string,
  onUpdate: (rules: PromotionProductRule[]) => void,
  onError: (error: Error) => void
) => {
  return subscribeToCollection<PromotionProductRule>(
    RULES_COLLECTION,
    [
      where('tenantId', '==', tenantId),
      where('promotionId', '==', promotionId)
    ],
    onUpdate,
    onError
  );
};

export const subscribeToProductPromotions = (
  tenantId: string,
  siteId: string,
  productId: string,
  onUpdate: (rules: PromotionProductRule[], activePromotions: Record<string, PromotionWithPhase>) => void,
  onError: (error: Error) => void
) => {
  let rules: PromotionProductRule[] = [];
  let promotionsObj: Record<string, PromotionWithPhase> = {};
  let promosUnsub: (() => void) | null = null;

  const handleUpdate = () => {
    // Only pass along active rules for active/scheduled/draft promotions
    onUpdate(rules, promotionsObj);
  };

  const rulesUnsub = subscribeToCollection<PromotionProductRule>(
    RULES_COLLECTION,
    [
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId),
      where('productId', '==', productId),
      where('status', '==', 'active')
    ],
    (newRules) => {
      rules = newRules;
      // We need to fetch the underlying promotions for these rules to check phases/dates
      if (promosUnsub) promosUnsub();
      
      const promoIds = [...new Set(rules.map(r => r.promotionId))];
      if (promoIds.length > 0) {
        promosUnsub = subscribeToCollection<Promotion>(
          PROMOTIONS_COLLECTION,
          [
            where('tenantId', '==', tenantId),
            // Firestore 'in' query is limited to 10. If more, we'd need chunks.
            // For now assuming < 10 active promotions per product.
            where('__name__', 'in', promoIds)
          ],
          (promos) => {
            promotionsObj = {};
            promos.forEach(p => {
              promotionsObj[p.id!] = withPhase(p);
            });
            handleUpdate();
          },
          onError
        );
      } else {
        promotionsObj = {};
        handleUpdate();
      }
    },
    onError
  );

  return () => {
    rulesUnsub();
    if (promosUnsub) promosUnsub();
  };
};

export const detectOverlappingPromotions = (rules: PromotionProductRule[], promotions: Record<string, PromotionWithPhase>) => {
  // Finds if multiple rules are active for the same product at the same time
  const activePromoIds = Object.keys(promotions).filter(id => {
    const p = promotions[id];
    return p.promotionStatus !== 'CANCELLED' && p.promotionStatus !== 'COMPLETED' && p.phase !== 'INACTIVE';
  });

  return activePromoIds.length > 1;
};

import { collection, query, where, getDocs, Timestamp, writeBatch, doc } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { DecisionInputSnapshot, DecisionOutput } from '../../../types/decision';
import { Recommendation, RecommendationStatus, PlannerDecision, OverrideFlags } from '../../../types/recommendation';
import { evaluateDecision, ENGINE_VERSION } from './decisionEngine';
import { getProductInventory } from '../../inventory/services/inventoryService';
import { getProductPlanningRule } from './planningRuleService';
import { getProductProductionContext } from './productionService';
import { withPhase } from './promotionService';
import { PromotionProductRule, Promotion } from '../../../types/promotion';
import { ServiceResult } from '../../../types/common';
import { getProduct } from '../../inventory/services/productService';

import { getDecisionConfiguration } from './decisionConfigurationService';

const RECOMMENDATIONS_COLLECTION = 'recommendations';
const PROMOTIONS_COLLECTION = 'promotions';
const PROMOTION_RULES_COLLECTION = 'promotionProductRules';

// Simple hash function for fingerprinting
const generateFingerprint = (input: DecisionInputSnapshot): string => {
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

export const generateRecommendationForProduct = async (
  tenantId: string,
  siteId: string,
  productId: string
): Promise<ServiceResult<string | null>> => {
  try {
    // 1. Gather Inputs
    const product = await getProduct(productId);
    if (!product) return { success: false, error: 'Product not found' };

    const inventory = await getProductInventory(tenantId, siteId, productId);
    const planningRule = await getProductPlanningRule(tenantId, siteId, productId);
    const productionContext = await getProductProductionContext(tenantId, siteId, productId);
    
    // Fetch active promotions for product
    const promoRulesQuery = query(
      collection(db, PROMOTION_RULES_COLLECTION),
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId),
      where('productId', '==', productId),
      where('status', '==', 'active')
    );
    const promoRulesSnap = await getDocs(promoRulesQuery);
    const rules = promoRulesSnap.docs.map(d => ({ id: d.id, ...d.data() } as PromotionProductRule));
    
    const activePromotionImpacts: any[] = [];
    if (rules.length > 0) {
      const promoIds = [...new Set(rules.map(r => r.promotionId))];
      if (promoIds.length > 0) {
        // Simple chunking not needed if < 10 for now
        const promosQuery = query(
          collection(db, PROMOTIONS_COLLECTION),
          where('tenantId', '==', tenantId),
          where('__name__', 'in', promoIds)
        );
        const promosSnap = await getDocs(promosQuery);
        const promosMap = new Map();
        promosSnap.docs.forEach(d => {
          const promo = withPhase({ id: d.id, ...d.data() } as Promotion);
          if (promo.promotionStatus !== 'CANCELLED' && promo.promotionStatus !== 'COMPLETED' && promo.phase !== 'INACTIVE') {
            promosMap.set(d.id, promo);
          }
        });

        rules.forEach(rule => {
          if (promosMap.has(rule.promotionId)) {
            activePromotionImpacts.push({
              rule,
              promotion: promosMap.get(rule.promotionId)
            });
          }
        });
      }
    }

    const configuration = await getDecisionConfiguration(tenantId, siteId);

    const inputSnapshot: DecisionInputSnapshot = {
      tenantId,
      siteId,
      productId,
      productCodeSnapshot: product.productCode,
      inventoryTotal: inventory ? inventory.totalQuantity : 0,
      inventoryByLocation: inventory ? inventory.balances : [],
      inventoryUpdatedAt: inventory && inventory.balances.length > 0 ? (inventory.balances[0].modifiedDate as any)?.toDate?.() || new Date() : new Date(), // Approximation
      planningRule,
      productionContext,
      activePromotionImpacts,
      existingActivePriorities: [], // To be implemented later
      evaluationTime: new Date(),
      configuration
    };

    // 2. Evaluate Decision
    const decisionOutput = evaluateDecision(inputSnapshot);
    const fingerprint = generateFingerprint(inputSnapshot);

    // 3. Check existing AWAITING_REVIEW recommendation
    const existingQuery = query(
      collection(db, RECOMMENDATIONS_COLLECTION),
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId),
      where('productId', '==', productId),
      where('recommendationStatus', '==', 'AWAITING_REVIEW')
    );
    const existingSnap = await getDocs(existingQuery);
    
    let existingRec: any = null;
    if (!existingSnap.empty) {
      existingRec = { id: existingSnap.docs[0].id, ...existingSnap.docs[0].data() };
      
      // If fingerprint matches, no change needed
      if (existingRec.sourceFingerprint === fingerprint) {
        return { success: true, data: existingRec.id };
      }
    }

    // 4. Create new recommendation and supersede old if needed
    const batch = writeBatch(db);
    
    if (existingRec) {
      const existingRef = doc(db, RECOMMENDATIONS_COLLECTION, existingRec.id);
      batch.update(existingRef, { 
        recommendationStatus: 'SUPERSEDED',
        modifiedDate: Timestamp.now(),
        modifiedBy: 'system'
      });
    }

    const newRef = doc(collection(db, RECOMMENDATIONS_COLLECTION));
    const newRecommendation: Omit<Recommendation, 'id'> = {
      tenantId,
      siteId,
      productId,
      productCodeSnapshot: product.productCode,
      descriptionSnapshot: product.description,
      status: 'active',
      recommendationStatus: 'AWAITING_REVIEW',
      engineVersion: ENGINE_VERSION,
      decisionOutput: JSON.parse(JSON.stringify(decisionOutput)), // Serialize dates
      sourceSnapshot: JSON.parse(JSON.stringify(inputSnapshot)),
      sourceFingerprint: fingerprint,
      generatedAt: Timestamp.now(),
      reviewedAt: null,
      reviewedBy: null,
      plannerDecision: null,
      overrideFlags: null,
      overrideReason: null,
      supersededByRecommendationId: null,
      createdDate: Timestamp.now(),
      modifiedDate: Timestamp.now(),
      createdBy: 'system',
      modifiedBy: 'system'
    };

    batch.set(newRef, newRecommendation);
    await batch.commit();

    return { success: true, data: newRef.id };
  } catch (error: any) {
    console.error('Failed to generate recommendation:', error);
    return { success: false, error: error.message };
  }
};

export const updateRecommendationStatus = async (
  id: string,
  status: RecommendationStatus,
  decision?: PlannerDecision,
  flags?: OverrideFlags,
  reason?: string,
  userId = 'dev-user'
): Promise<ServiceResult<void>> => {
  try {
    const ref = doc(db, RECOMMENDATIONS_COLLECTION, id);
    const updateData: any = {
      recommendationStatus: status,
      reviewedAt: Timestamp.now(),
      reviewedBy: userId,
      modifiedDate: Timestamp.now(),
      modifiedBy: userId
    };

    if (decision) updateData.plannerDecision = decision;
    if (flags) updateData.overrideFlags = flags;
    if (reason) updateData.overrideReason = reason;

    const batch = writeBatch(db);
    batch.update(ref, updateData);
    await batch.commit();

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

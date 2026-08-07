import { collection, query, where, getDocs, Timestamp, writeBatch, doc, getDoc } from 'firebase/firestore';
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
import { buildDisplayPriorityDoc, logPriorityEvent, detectPriorityConflicts } from '../../operations/services/priorityService';
import { Priority, PriorityConflict } from '../../../types/priority';

import { getDecisionConfiguration } from './decisionConfigurationService';

const RECOMMENDATIONS_COLLECTION = 'recommendations';
const PROMOTIONS_COLLECTION = 'promotions';
const PROMOTION_RULES_COLLECTION = 'promotionProductRules';
const PRIORITIES_COLLECTION = 'priorities';
const DISPLAY_PRIORITIES_COLLECTION = 'displayPriorities';

// Simple hash function for fingerprinting
const generateFingerprint = (input: DecisionInputSnapshot): string => {
  const rule = input.planningRule;
  const prod = input.productionContext;
  const str = JSON.stringify({
    inv: input.inventoryTotal,
    invTime: input.inventoryUpdatedAt ? new Date(input.inventoryUpdatedAt).getTime() : 0,
    rule: rule ? {
      id: rule.id,
      min: rule.minimumQuantity,
      target: rule.targetQuantity,
      max: rule.maximumQuantity,
      ddxm: rule.ddxmRetentionQuantity,
      mode: rule.controllingThresholdMode,
      customControlling: rule.customControllingRetentionQuantity,
      belowTarget: rule.belowTargetBehavior,
      defaultAction: rule.defaultActionTypeId,
      prefDest: rule.preferredDestinationId,
      modified: (rule.modifiedDate as any)?.toDate?.()?.getTime() || (rule.modifiedDate as any)?.seconds * 1000 || rule.modifiedDate
    } : null,
    prodContext: prod ? {
      running: prod.isCurrentlyInProduction,
      risk: prod.productionRiskStatus,
      todayCases: prod.plannedCasesToday,
      todayPallets: prod.plannedPalletsToday,
      next7DaysCases: prod.plannedCasesNext7Days,
      scheduled: prod.isScheduled,
      line: prod.currentProductionLine,
      sourceImportId: prod.sourceImportId
    } : null,
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
  productId: string,
  forceReevaluate = false
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
      inventoryUpdatedAt: inventory && inventory.balances.length > 0 ? (inventory.balances[0].modifiedDate as any)?.toDate?.() || new Date() : new Date(),
      planningRule,
      productionContext,
      activePromotionImpacts,
      existingActivePriorities: [],
      evaluationTime: new Date(),
      configuration
    };

    // 2. Evaluate Decision
    const decisionOutput = evaluateDecision(inputSnapshot);
    const fingerprint = generateFingerprint(inputSnapshot);

    // 3. Check existing active recommendation
    const existingQuery = query(
      collection(db, RECOMMENDATIONS_COLLECTION),
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId),
      where('productId', '==', productId),
      where('recommendationStatus', 'in', ['AWAITING_REVIEW', 'AUTO_PUBLISHED', 'APPROVED'])
    );
    const existingSnap = await getDocs(existingQuery);
    
    let existingRec: any = null;
    if (!existingSnap.empty) {
      existingRec = { id: existingSnap.docs[0].id, ...existingSnap.docs[0].data() };
      
      // If fingerprint matches and forceReevaluate is false, no change needed
      if (!forceReevaluate && existingRec.sourceFingerprint === fingerprint) {
        return { success: true, data: existingRec.id };
      }
    }

    // 4. Create new recommendation and push directly to warehouse priorities
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
    const recId = newRef.id;

    // Check if an existing operational priority exists for this product
    const priorityQuery = query(
      collection(db, PRIORITIES_COLLECTION),
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId),
      where('productId', '==', productId),
      where('priorityStatus', 'in', ['SCHEDULED', 'ACTIVE', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'PARTIALLY_COMPLETE'])
    );
    const prioritySnap = await getDocs(priorityQuery);

    let targetPriorityId: string | null = null;
    const hasRecommendedAction = Boolean(decisionOutput.recommendedActionTypeId && (decisionOutput.recommendedQuantity || 0) > 0);

    const activePriorities = prioritySnap.docs.map(doc => ({
      id: doc.id,
      ref: doc.ref,
      data: doc.data() as Priority
    }));
    const existingRecPrio = activePriorities.find(p => p.data.sourceType === 'RECOMMENDATION');

    if (hasRecommendedAction) {
      const requestedQty = decisionOutput.recommendedQuantity || 0;
      const instructionText = decisionOutput.explanationLines?.[0] || `Auto-pushed action: ${decisionOutput.recommendedActionTypeId}`;

      if (existingRecPrio) {
        // Update existing active priority
        targetPriorityId = existingRecPrio.id;
        const prioData = existingRecPrio.data;

        const updatedPrioData: Partial<Priority> = {
          actionTypeId: decisionOutput.recommendedActionTypeId!,
          requestedQuantity: requestedQty,
          remainingQuantity: Math.max(0, requestedQty - (prioData.progressQuantity || 0)),
          progressPercent: requestedQty > 0 ? Math.round(((prioData.progressQuantity || 0) / requestedQty) * 100) : 0,
          destinationId: decisionOutput.recommendedDestinationId || null,
          priorityLevelId: decisionOutput.recommendedPriorityLevelId || 'NORMAL',
          instruction: instructionText,
          sourceRecommendationId: recId,
          modifiedDate: Timestamp.now(),
          modifiedBy: 'system'
        };

        batch.update(existingRecPrio.ref, updatedPrioData);
        batch.set(
          doc(db, DISPLAY_PRIORITIES_COLLECTION, targetPriorityId),
          buildDisplayPriorityDoc({ ...prioData, ...updatedPrioData }, targetPriorityId)
        );
      } else {
        // Create new operational priority pushed to warehouse
        const newPrioRef = doc(collection(db, PRIORITIES_COLLECTION));
        targetPriorityId = newPrioRef.id;

        const newPriority: Omit<Priority, 'id'> = {
          tenantId,
          siteId,
          sourceType: 'RECOMMENDATION',
          sourceRecommendationId: recId,
          productId,
          productCodeSnapshot: product.productCode,
          descriptionSnapshot: product.description,
          instruction: instructionText,
          priorityStatus: 'ACTIVE',
          priorityLevelId: decisionOutput.recommendedPriorityLevelId || 'NORMAL',
          actionTypeId: decisionOutput.recommendedActionTypeId!,
          requestedQuantity: requestedQty,
          progressQuantity: 0,
          remainingQuantity: requestedQty,
          progressPercent: 0,
          destinationId: decisionOutput.recommendedDestinationId || null,
          supportingReasons: decisionOutput.explanationLines || [],
          planningContextSnapshot: null,
          startAt: Timestamp.now(),
          expireAt: null,
          latestProgressNote: null,
          publishedAt: Timestamp.now(),
          completedAt: null,
          cancelledAt: null,
          status: 'active',
          createdBy: 'system',
          createdDate: Timestamp.now(),
          modifiedBy: 'system',
          modifiedDate: Timestamp.now()
        };

        batch.set(newPrioRef, newPriority);
        batch.set(
          doc(db, DISPLAY_PRIORITIES_COLLECTION, targetPriorityId),
          buildDisplayPriorityDoc(newPriority, targetPriorityId)
        );
      }
    } else {
      // No recommended action in latest generation. If a previous active recommendation priority exists, cancel it.
      if (existingRecPrio) {
        const prioData = existingRecPrio.data;
        batch.update(existingRecPrio.ref, {
          priorityStatus: 'CANCELLED',
          cancelledAt: Timestamp.now(),
          modifiedDate: Timestamp.now(),
          modifiedBy: 'system'
        });
        batch.delete(doc(db, DISPLAY_PRIORITIES_COLLECTION, existingRecPrio.id));

        // Log priority status change event
        await logPriorityEvent(
          batch,
          prioData.tenantId,
          prioData.siteId,
          existingRecPrio.id,
          'STATUS_CHANGED',
          prioData.priorityStatus,
          'CANCELLED',
          prioData.priorityStatus,
          'CANCELLED',
          'Cancelled because product is no longer recommended in the latest Recommendation Workspace Generation',
          'system'
        );
      }
    }

    const newRecommendation: Omit<Recommendation, 'id'> = {
      tenantId,
      siteId,
      productId,
      productCodeSnapshot: product.productCode,
      descriptionSnapshot: product.description,
      status: 'active',
      recommendationStatus: 'AUTO_PUBLISHED',
      linkedPriorityId: targetPriorityId,
      engineVersion: ENGINE_VERSION,
      decisionOutput: JSON.parse(JSON.stringify(decisionOutput)), // Serialize dates
      sourceSnapshot: JSON.parse(JSON.stringify(inputSnapshot)),
      sourceFingerprint: fingerprint,
      generatedAt: Timestamp.now(),
      reviewedAt: Timestamp.now(),
      reviewedBy: 'system',
      plannerDecision: hasRecommendedAction ? {
        actionTypeId: decisionOutput.recommendedActionTypeId!,
        quantity: decisionOutput.recommendedQuantity || 0,
        destinationId: decisionOutput.recommendedDestinationId || null,
        priorityLevelId: decisionOutput.recommendedPriorityLevelId || null,
        notes: decisionOutput.explanationLines.join(' | ') || 'System auto-generated priority'
      } : null,
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

export const refreshSiteRecommendations = async (
  tenantId: string,
  siteId: string,
  forceReevaluate = true,
  onProgress?: (progress: { current: number; total: number; productCode?: string }) => void
): Promise<ServiceResult<{ generatedCount: number; conflicts: PriorityConflict[] }>> => {
  try {
    const runStartedAtMs = Date.now() - 1000;

    const productsRef = collection(db, 'products');
    const q = query(
      productsRef,
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId),
      where('status', '==', 'active')
    );
    const snap = await getDocs(q);
    const total = snap.docs.length;

    let count = 0;
    for (let i = 0; i < total; i++) {
      const productDoc = snap.docs[i];
      const pData = productDoc.data();
      const code = pData.code || pData.productCode || productDoc.id;

      if (onProgress) {
        onProgress({ current: i + 1, total, productCode: code });
      }

      const res = await generateRecommendationForProduct(tenantId, siteId, productDoc.id, forceReevaluate);
      if (res.success) {
        count++;
      }
    }

    // Post-generation cleanup: Remove any active system-driven priorities that were NOT updated/regenerated in this run
    const activeSystemPrioQuery = query(
      collection(db, PRIORITIES_COLLECTION),
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId),
      where('sourceType', '==', 'RECOMMENDATION'),
      where('priorityStatus', 'in', ['SCHEDULED', 'ACTIVE', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'PARTIALLY_COMPLETE'])
    );
    const activeSystemSnap = await getDocs(activeSystemPrioQuery);

    if (!activeSystemSnap.empty) {
      const cleanupBatch = writeBatch(db);
      let needsCleanupBatch = false;

      activeSystemSnap.docs.forEach(pDoc => {
        const pData = pDoc.data() as Priority;
        const modTime = (pData.modifiedDate as any)?.toMillis ? (pData.modifiedDate as any).toMillis() : (pData.modifiedDate ? new Date(pData.modifiedDate as any).getTime() : 0);
        
        // If not touched during this run, cancel & remove
        if (modTime < runStartedAtMs) {
          needsCleanupBatch = true;
          cleanupBatch.update(pDoc.ref, {
            priorityStatus: 'CANCELLED',
            cancelledAt: Timestamp.now(),
            modifiedDate: Timestamp.now(),
            modifiedBy: 'system'
          });
          cleanupBatch.delete(doc(db, DISPLAY_PRIORITIES_COLLECTION, pDoc.id));
        }
      });

      if (needsCleanupBatch) {
        await cleanupBatch.commit();
      }
    }

    // Detect conflicts between newly generated system priorities and existing manual priorities
    const conflicts = await detectPriorityConflicts(tenantId, siteId);

    return { success: true, data: { generatedCount: count, conflicts } };
  } catch (e: any) {
    console.error('Failed to refresh site recommendations:', e);
    return { success: false, error: e.message };
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
    const recSnap = await getDoc(ref);
    if (!recSnap.exists()) return { success: false, error: 'Recommendation not found' };

    const recData = recSnap.data() as Recommendation;

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

    // Sync with operational priority in warehouse if linked
    const linkedPriorityId = recData.linkedPriorityId;
    if (linkedPriorityId) {
      const prioRef = doc(db, PRIORITIES_COLLECTION, linkedPriorityId);
      const displayRef = doc(db, DISPLAY_PRIORITIES_COLLECTION, linkedPriorityId);
      const prioSnap = await getDoc(prioRef);

      if (prioSnap.exists()) {
        const prioData = prioSnap.data() as Priority;

        if (status === 'OVERRIDDEN' && decision) {
          const reqQty = decision.quantity;
          const updatedPrio: Partial<Priority> = {
            actionTypeId: decision.actionTypeId,
            requestedQuantity: reqQty,
            remainingQuantity: Math.max(0, reqQty - (prioData.progressQuantity || 0)),
            progressPercent: reqQty > 0 ? Math.round(((prioData.progressQuantity || 0) / reqQty) * 100) : 0,
            destinationId: decision.destinationId || null,
            priorityLevelId: decision.priorityLevelId || prioData.priorityLevelId,
            instruction: decision.notes || 'Planner override update',
            plannerReason: reason || 'Planner override',
            modifiedDate: Timestamp.now(),
            modifiedBy: userId
          };

          batch.update(prioRef, updatedPrio);
          batch.set(displayRef, buildDisplayPriorityDoc({ ...prioData, ...updatedPrio }, linkedPriorityId));

          await logPriorityEvent(
            batch,
            prioData.tenantId,
            prioData.siteId,
            linkedPriorityId,
            'MATERIAL_AMENDMENT',
            prioData.priorityStatus,
            prioData.priorityStatus,
            null,
            null,
            `Planner override: ${reason || decision.notes || 'Updated by planner'}`,
            userId
          );
        } else if (status === 'DISMISSED') {
          batch.update(prioRef, {
            priorityStatus: 'CANCELLED',
            cancelledAt: Timestamp.now(),
            modifiedDate: Timestamp.now(),
            modifiedBy: userId
          });
          batch.delete(displayRef);

          await logPriorityEvent(
            batch,
            prioData.tenantId,
            prioData.siteId,
            linkedPriorityId,
            'STATUS_CHANGED',
            prioData.priorityStatus,
            'CANCELLED',
            prioData.priorityStatus,
            'CANCELLED',
            `Recommendation dismissed/rejected by planner`,
            userId
          );
        }
      }
    }

    await batch.commit();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};


import { collection, query, where, getDocs, Timestamp, writeBatch, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../../config/firebase';
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
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const requestedBy = options.requestedBy || 'system';
  const startTime = Timestamp.now();

  const jobDoc: RecommendationGenerationJob = {
    id: jobId,
    jobId,
    tenantId,
    siteId,
    status: 'IN_PROGRESS',
    triggerType: options.triggerType,
    triggerReferenceId: options.triggerReferenceId || null,
    requestedBy,
    requestedAt: startTime,
    startedAt: startTime,
    completedAt: null,
    productCount: 0,
    processedCount: 0,
    createdCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    supersededCount: 0,
    withdrawnCount: 0,
    failedCount: 0,
    errors: [],
    engineVersion: ENGINE_VERSION,
    createdDate: startTime,
    modifiedDate: startTime,
    createdBy: requestedBy,
    modifiedBy: requestedBy
  };

  try {
    if (db) {
      await setDoc(doc(db, JOBS_COLLECTION, jobId), jobDoc);
    }

    // 1. Gather site master data & config
    const configuration = await getDecisionConfiguration(tenantId, siteId);
    if (configuration?.configurationVersion) {
      jobDoc.decisionConfigurationVersion = configuration.configurationVersion;
    }

    let productsToEvaluate: any[] = [];
    if (options.productIds && options.productIds.length > 0) {
      for (const pid of options.productIds) {
        const p = await getProduct(pid);
        if (p) productsToEvaluate.push(p);
      }
    } else {
      productsToEvaluate = await getAllProducts(tenantId, siteId);
    }

    jobDoc.productCount = productsToEvaluate.length;

    // Pre-fetch Master Lookups for clean Priority Labels
    const actionTypesMap = new Map<string, string>();
    const destinationsMap = new Map<string, string>();
    const priorityLevelsMap = new Map<string, string>();

    try {
      const atSnap = await getDocs(query(collection(db, 'actionTypes'), where('tenantId', '==', tenantId)));
      atSnap.docs.forEach(d => actionTypesMap.set(d.id, d.data().name || d.data().label || d.id));

      const destSnap = await getDocs(query(collection(db, 'destinations'), where('tenantId', '==', tenantId)));
      destSnap.docs.forEach(d => destinationsMap.set(d.id, d.data().name || d.data().label || d.id));

      const plSnap = await getDocs(query(collection(db, 'priorityLevels'), where('tenantId', '==', tenantId)));
      plSnap.docs.forEach(d => priorityLevelsMap.set(d.id, d.data().name || d.data().label || d.id));
    } catch (e) {
      console.warn('Lookup pre-fetch warning:', e);
    }

    // Process products sequentially or in batches
    for (const product of productsToEvaluate) {
      jobDoc.processedCount++;
      const productId = product.id;

      try {
        const inventory = await getProductInventory(tenantId, siteId, productId);
        const planningRule = await getProductPlanningRule(tenantId, siteId, productId);
        const productionContext = await getProductProductionContext(tenantId, siteId, productId);

        // Active promotions
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

        const decisionOutput = evaluateDecision(inputSnapshot);
        const fingerprint = generateFingerprint(inputSnapshot);

        // Fetch current active / published recommendation for this product
        const activeRecsQuery = query(
          collection(db, RECOMMENDATIONS_COLLECTION),
          where('tenantId', '==', tenantId),
          where('siteId', '==', siteId),
          where('productId', '==', productId),
          where('recommendationStatus', 'in', ['AUTO_PUBLISHED', 'AWAITING_REVIEW', 'APPROVED', 'OVERRIDDEN', 'SUPPRESSED'])
        );
        const activeRecsSnap = await getDocs(activeRecsQuery);
        const existingRec = activeRecsSnap.empty ? null : { id: activeRecsSnap.docs[0].id, ...activeRecsSnap.docs[0].data() } as Recommendation;

        // Check Safety Gates / Data Quality Issues
        const blockingIssues = decisionOutput.dataQualityIssues.filter(i => i.blocking);
        if (blockingIssues.length > 0 || !planningRule) {
          // System cannot safely auto-publish instruction
          const batch = writeBatch(db);
          if (existingRec && existingRec.recommendationStatus === 'AUTO_PUBLISHED') {
            const oldRef = doc(db, RECOMMENDATIONS_COLLECTION, existingRec.id);
            batch.update(oldRef, { 
              recommendationStatus: 'WITHDRAWN', 
              modifiedDate: Timestamp.now(), 
              modifiedBy: 'system' 
            });
            if (existingRec.linkedPriorityId) {
              const prioRef = doc(db, PRIORITIES_COLLECTION, existingRec.linkedPriorityId);
              batch.update(prioRef, { priorityStatus: 'WITHDRAWN', modifiedDate: Timestamp.now(), modifiedBy: 'system' });
              const dispRef = doc(db, DISPLAY_PRIORITIES_COLLECTION, existingRec.linkedPriorityId);
              batch.delete(dispRef);
            }
            jobDoc.withdrawnCount++;
          }

          const failRef = doc(collection(db, RECOMMENDATIONS_COLLECTION));
          const failedRec: Omit<Recommendation, 'id'> = {
            tenantId,
            siteId,
            productId,
            productCodeSnapshot: product.productCode,
            descriptionSnapshot: product.description,
            status: 'active',
            recommendationStatus: 'FAILED_VALIDATION',
            engineVersion: ENGINE_VERSION,
            decisionOutput: JSON.parse(JSON.stringify(decisionOutput)),
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
          batch.set(failRef, failedRec);

          // Write exception log for visibility
          const excRef = doc(collection(db, EXCEPTIONS_COLLECTION));
          batch.set(excRef, {
            tenantId,
            siteId,
            productId,
            productCode: product.productCode,
            severity: 'ERROR',
            category: 'RECOMMENDATION_GENERATION_FAILED',
            message: blockingIssues.map(i => i.message).join('; ') || 'Missing or incomplete product planning rule',
            timestamp: Timestamp.now(),
            status: 'OPEN',
            createdDate: Timestamp.now(),
            modifiedDate: Timestamp.now()
          });

          await batch.commit();
          jobDoc.failedCount++;
          jobDoc.errors.push({ productId, productCode: product.productCode, error: blockingIssues.map(i => i.message).join('; ') || 'Missing planning rule' });
          continue;
        }

        // Check if Manual Override is active for this product
        if (existingRec?.overrideContext && existingRec.overrideContext.overrideStatus === 'OVERRIDE_ACTIVE') {
          // Manual Override is active! Preserve planner override and record new generated calculation as OVERRIDDEN
          const batch = writeBatch(db);
          const newRef = doc(collection(db, RECOMMENDATIONS_COLLECTION));
          const newRec: Omit<Recommendation, 'id'> = {
            tenantId,
            siteId,
            productId,
            productCodeSnapshot: product.productCode,
            descriptionSnapshot: product.description,
            status: 'active',
            recommendationStatus: 'OVERRIDDEN',
            engineVersion: ENGINE_VERSION,
            decisionOutput: JSON.parse(JSON.stringify(decisionOutput)),
            sourceSnapshot: JSON.parse(JSON.stringify(inputSnapshot)),
            sourceFingerprint: fingerprint,
            generatedAt: Timestamp.now(),
            reviewedAt: existingRec.overrideContext.overriddenAt,
            reviewedBy: existingRec.overrideContext.overriddenBy,
            plannerDecision: existingRec.plannerDecision,
            overrideFlags: existingRec.overrideFlags,
            overrideReason: existingRec.overrideContext.reason,
            overrideContext: existingRec.overrideContext,
            linkedPriorityId: existingRec.linkedPriorityId,
            supersededByRecommendationId: null,
            createdDate: Timestamp.now(),
            modifiedDate: Timestamp.now(),
            createdBy: 'system',
            modifiedBy: 'system'
          };

          if (existingRec.recommendationStatus === 'AUTO_PUBLISHED') {
            const oldRef = doc(db, RECOMMENDATIONS_COLLECTION, existingRec.id);
            batch.update(oldRef, { recommendationStatus: 'SUPERSEDED', supersededByRecommendationId: newRef.id });
            jobDoc.supersededCount++;
          }

          batch.set(newRef, newRec);
          await batch.commit();
          jobDoc.unchangedCount++;
          continue;
        }

        // Check if Suppression is active
        if (existingRec?.suppressionContext) {
          const supp = existingRec.suppressionContext;
          let activeSuppression = true;

          // Clear UNTIL_NEXT_SNAPSHOT suppression if trigger is INVENTORY_IMPORT
          if (supp.scope === 'UNTIL_NEXT_SNAPSHOT' && options.triggerType === 'INVENTORY_IMPORT') {
            activeSuppression = false;
          } else if (supp.scope === 'UNTIL_DATE' && supp.expireAt && supp.expireAt.toDate() < new Date()) {
            activeSuppression = false;
          }

          if (activeSuppression) {
            // Keep suppressed
            const batch = writeBatch(db);
            const newRef = doc(collection(db, RECOMMENDATIONS_COLLECTION));
            const newRec: Omit<Recommendation, 'id'> = {
              tenantId,
              siteId,
              productId,
              productCodeSnapshot: product.productCode,
              descriptionSnapshot: product.description,
              status: 'active',
              recommendationStatus: 'SUPPRESSED',
              engineVersion: ENGINE_VERSION,
              decisionOutput: JSON.parse(JSON.stringify(decisionOutput)),
              sourceSnapshot: JSON.parse(JSON.stringify(inputSnapshot)),
              sourceFingerprint: fingerprint,
              generatedAt: Timestamp.now(),
              reviewedAt: supp.suppressedAt,
              reviewedBy: supp.suppressedBy,
              plannerDecision: null,
              overrideFlags: null,
              overrideReason: supp.reason,
              suppressionContext: supp,
              supersededByRecommendationId: null,
              createdDate: Timestamp.now(),
              modifiedDate: Timestamp.now(),
              createdBy: 'system',
              modifiedBy: 'system'
            };
            batch.set(newRef, newRec);

            if (existingRec.linkedPriorityId) {
              const prioRef = doc(db, PRIORITIES_COLLECTION, existingRec.linkedPriorityId);
              batch.update(prioRef, { priorityStatus: 'WITHDRAWN', modifiedDate: Timestamp.now(), modifiedBy: 'system' });
              const dispRef = doc(db, DISPLAY_PRIORITIES_COLLECTION, existingRec.linkedPriorityId);
              batch.delete(dispRef);
            }

            await batch.commit();
            jobDoc.unchangedCount++;
            continue;
          }
        }

        // Check if Actionable
        const isActionable = Boolean(decisionOutput.recommendedActionTypeId) && 
                            (decisionOutput.recommendedQuantity > 0 || decisionOutput.recommendedActionTypeId === configuration?.holdActionId || decisionOutput.recommendedActionTypeId === configuration?.releaseActionId);

        if (!isActionable) {
          // No actionable recommendation required for this product (e.g. balance is optimal)
          if (existingRec && (existingRec.recommendationStatus === 'AUTO_PUBLISHED' || existingRec.recommendationStatus === 'AWAITING_REVIEW')) {
            const batch = writeBatch(db);
            const oldRef = doc(db, RECOMMENDATIONS_COLLECTION, existingRec.id);
            batch.update(oldRef, { 
              recommendationStatus: 'WITHDRAWN', 
              modifiedDate: Timestamp.now(), 
              modifiedBy: 'system' 
            });

            if (existingRec.linkedPriorityId) {
              const prioRef = doc(db, PRIORITIES_COLLECTION, existingRec.linkedPriorityId);
              batch.update(prioRef, { priorityStatus: 'WITHDRAWN', modifiedDate: Timestamp.now(), modifiedBy: 'system' });
              const dispRef = doc(db, DISPLAY_PRIORITIES_COLLECTION, existingRec.linkedPriorityId);
              batch.delete(dispRef);
            }

            await batch.commit();
            jobDoc.withdrawnCount++;
          } else {
            jobDoc.unchangedCount++;
          }
          continue;
        }

        // Actionable Recommendation exists!
        // Compare with existing published recommendation
        if (existingRec && existingRec.sourceFingerprint === fingerprint && existingRec.recommendationStatus === 'AUTO_PUBLISHED' && !options.forceRecalculate) {
          // Unchanged!
          jobDoc.unchangedCount++;
          continue;
        }

        // Material change or new recommendation -> Publish automatically
        const batch = writeBatch(db);

        const newRecRef = doc(collection(db, RECOMMENDATIONS_COLLECTION));
        const newPriorityRef = existingRec?.linkedPriorityId 
          ? doc(db, PRIORITIES_COLLECTION, existingRec.linkedPriorityId)
          : doc(collection(db, PRIORITIES_COLLECTION));
        
        const priorityId = newPriorityRef.id;

        if (existingRec && existingRec.id !== newRecRef.id) {
          const oldRef = doc(db, RECOMMENDATIONS_COLLECTION, existingRec.id);
          batch.update(oldRef, {
            recommendationStatus: 'SUPERSEDED',
            supersededByRecommendationId: newRecRef.id,
            modifiedDate: Timestamp.now(),
            modifiedBy: 'system'
          });
          jobDoc.supersededCount++;
        }

        const actionTypeId = decisionOutput.recommendedActionTypeId || configuration?.releaseActionId || 'RELEASE';
        const destinationId = decisionOutput.recommendedDestinationId || planningRule.preferredDestinationId || null;
        const priorityLevelId = decisionOutput.recommendedPriorityLevelId || configuration?.normalPriorityId || 'NORMAL';

        const actionTypeLabel = actionTypesMap.get(actionTypeId) || actionTypeId;
        const destinationLabel = destinationId ? destinationsMap.get(destinationId) || destinationId : '';
        const priorityLevelLabel = priorityLevelsMap.get(priorityLevelId) || priorityLevelId;

        const newRecommendation: Omit<Recommendation, 'id'> = {
          tenantId,
          siteId,
          productId,
          productCodeSnapshot: product.productCode,
          descriptionSnapshot: product.description,
          status: 'active',
          recommendationStatus: 'AUTO_PUBLISHED',
          engineVersion: ENGINE_VERSION,
          decisionOutput: JSON.parse(JSON.stringify(decisionOutput)),
          sourceSnapshot: JSON.parse(JSON.stringify(inputSnapshot)),
          sourceFingerprint: fingerprint,
          generatedAt: Timestamp.now(),
          reviewedAt: Timestamp.now(),
          reviewedBy: 'system_auto_publish',
          plannerDecision: null,
          overrideFlags: null,
          overrideReason: null,
          supersededByRecommendationId: null,
          linkedPriorityId: priorityId,
          sourceInventorySnapshotId: options.triggerReferenceId || null,
          createdDate: Timestamp.now(),
          modifiedDate: Timestamp.now(),
          createdBy: 'system',
          modifiedBy: 'system'
        };

        batch.set(newRecRef, newRecommendation);

        // Build Operational Priority
        const priorityDoc: Omit<Priority, 'id'> = {
          tenantId,
          siteId,
          status: 'active',
          sourceType: 'SYSTEM_RECOMMENDATION',
          sourceRecommendationId: newRecRef.id,
          sourceInventorySnapshotId: options.triggerReferenceId || null,
          engineVersion: ENGINE_VERSION,
          planningRuleVersion: planningRule.id || null,
          decisionConfigurationVersion: configuration?.configurationVersion || null,
          productId,
          productCodeSnapshot: product.productCode,
          descriptionSnapshot: product.description,
          actionTypeId,
          actionTypeLabel,
          requestedQuantity: decisionOutput.recommendedQuantity,
          destinationId,
          destinationLabel,
          priorityLevelId,
          priorityLevelLabel,
          instruction: decisionOutput.explanationLines.slice(0, 2).join(' ') || `System published ${actionTypeLabel} for ${product.productCode}`,
          supportingReasons: decisionOutput.explanationLines,
          planningContextSnapshot: {
            planningBandStatus: decisionOutput.planningBandStatus,
            shortfallQuantity: decisionOutput.shortfallQuantity,
            availableToRelease: decisionOutput.availableToRelease,
            effectiveTarget: decisionOutput.effectiveTarget.effectiveValue,
            effectiveMinimum: decisionOutput.effectiveMinimum.effectiveValue,
            effectiveMaximum: decisionOutput.effectiveMaximum.effectiveValue
          },
          startAt: Timestamp.now(),
          expireAt: null,
          untilSwitchedOff: true,
          priorityStatus: 'ACTIVE',
          progressQuantity: 0,
          remainingQuantity: decisionOutput.recommendedQuantity,
          progressPercent: 0,
          latestProgressNote: null,
          publishedAt: Timestamp.now(),
          completedAt: null,
          cancelledAt: null,
          createdBy: 'system',
          createdDate: Timestamp.now(),
          modifiedBy: 'system',
          modifiedDate: Timestamp.now()
        };

        batch.set(newPriorityRef, priorityDoc);

        // Update Display Priorities for real-time TV Dashboard / Warehouse Execution
        const displayRef = doc(db, DISPLAY_PRIORITIES_COLLECTION, priorityId);
        batch.set(displayRef, buildDisplayPriorityDoc({ ...priorityDoc, id: priorityId }));

        await batch.commit();

        if (existingRec) {
          jobDoc.updatedCount++;
        } else {
          jobDoc.createdCount++;
        }

      } catch (prodErr: any) {
        console.error(`Error evaluating product ${product.productCode}:`, prodErr);
        jobDoc.failedCount++;
        jobDoc.errors.push({ productId, productCode: product.productCode, error: prodErr.message || 'Unknown error' });
      }
    }

    jobDoc.status = jobDoc.failedCount > 0 ? 'COMPLETED_WITH_WARNINGS' : 'COMPLETED';
    jobDoc.completedAt = Timestamp.now();
    jobDoc.modifiedDate = Timestamp.now();

    if (db) {
      await updateDoc(doc(db, JOBS_COLLECTION, jobId), {
        status: jobDoc.status,
        completedAt: jobDoc.completedAt,
        processedCount: jobDoc.processedCount,
        createdCount: jobDoc.createdCount,
        updatedCount: jobDoc.updatedCount,
        unchangedCount: jobDoc.unchangedCount,
        supersededCount: jobDoc.supersededCount,
        withdrawnCount: jobDoc.withdrawnCount,
        failedCount: jobDoc.failedCount,
        errors: jobDoc.errors,
        modifiedDate: jobDoc.modifiedDate
      });
    }

    return { success: true, data: jobDoc };
  } catch (err: any) {
    console.error('Failed recommendation generation job:', err);
    jobDoc.status = 'FAILED';
    jobDoc.completedAt = Timestamp.now();
    jobDoc.modifiedDate = Timestamp.now();
    if (db) {
      await updateDoc(doc(db, JOBS_COLLECTION, jobId), {
        status: 'FAILED',
        completedAt: jobDoc.completedAt,
        errors: [{ productId: 'ALL', error: err.message || 'Job execution failed' }]
      }).catch(() => {});
    }
    return { success: false, error: err.message };
  }
};

/**
 * Single product recommendation helper (delegates to job runner)
 */
export const generateRecommendationForProduct = async (
  tenantId: string,
  siteId: string,
  productId: string
): Promise<ServiceResult<string | null>> => {
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
    const recRef = doc(db, RECOMMENDATIONS_COLLECTION, recommendationId);
    const recSnap = await getDocs(query(collection(db, RECOMMENDATIONS_COLLECTION), where('__name__', '==', recommendationId)));
    if (recSnap.empty) return { success: false, error: 'Recommendation not found' };

    const rec = recSnap.docs[0].data() as Recommendation;

    const overrideContext: OverrideContext = {
      overriddenBy: userId,
      overriddenAt: Timestamp.now(),
      reason: overrideData.reason,
      overrideStatus: 'OVERRIDE_ACTIVE',
      actionTypeId: overrideData.actionTypeId || rec.decisionOutput.recommendedActionTypeId,
      quantity: overrideData.quantity !== undefined ? overrideData.quantity : rec.decisionOutput.recommendedQuantity,
      destinationId: overrideData.destinationId || rec.decisionOutput.recommendedDestinationId,
      priorityLevelId: overrideData.priorityLevelId || rec.decisionOutput.recommendedPriorityLevelId,
      instruction: overrideData.instruction || `Planner override for ${rec.productCodeSnapshot}`
    };

    const batch = writeBatch(db);

    batch.update(recRef, {
      recommendationStatus: 'OVERRIDDEN',
      overrideContext,
      overrideReason: overrideData.reason,
      reviewedAt: Timestamp.now(),
      reviewedBy: userId,
      modifiedDate: Timestamp.now(),
      modifiedBy: userId
    });

    // Update or create linked priority as MANUAL_OVERRIDE
    let priorityId = rec.linkedPriorityId;
    let prioRef;

    if (priorityId) {
      prioRef = doc(db, PRIORITIES_COLLECTION, priorityId);
    } else {
      prioRef = doc(collection(db, PRIORITIES_COLLECTION));
      priorityId = prioRef.id;
      batch.update(recRef, { linkedPriorityId: priorityId });
    }

    const priorityDoc: Partial<Priority> = {
      tenantId: rec.tenantId,
      siteId: rec.siteId,
      status: 'active',
      sourceType: 'MANUAL_OVERRIDE',
      sourceRecommendationId: recommendationId,
      productId: rec.productId,
      productCodeSnapshot: rec.productCodeSnapshot,
      descriptionSnapshot: rec.descriptionSnapshot,
      actionTypeId: overrideContext.actionTypeId || 'RELEASE',
      requestedQuantity: overrideContext.quantity || 0,
      destinationId: overrideContext.destinationId || null,
      priorityLevelId: overrideContext.priorityLevelId || 'NORMAL',
      instruction: overrideContext.instruction,
      plannerReason: overrideData.reason,
      priorityStatus: 'ACTIVE',
      modifiedBy: userId,
      modifiedDate: Timestamp.now()
    };

    batch.set(prioRef, priorityDoc, { merge: true });

    const dispRef = doc(db, DISPLAY_PRIORITIES_COLLECTION, priorityId);
    batch.set(dispRef, buildDisplayPriorityDoc(priorityDoc, priorityId), { merge: true });

    await batch.commit();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
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
    const recRef = doc(db, RECOMMENDATIONS_COLLECTION, recommendationId);
    const recSnap = await getDocs(query(collection(db, RECOMMENDATIONS_COLLECTION), where('__name__', '==', recommendationId)));
    if (recSnap.empty) return { success: false, error: 'Recommendation not found' };

    const rec = recSnap.docs[0].data() as Recommendation;

    const suppressionContext: SuppressionContext = {
      suppressedBy: userId,
      suppressedAt: Timestamp.now(),
      reason: suppressionData.reason,
      scope: suppressionData.scope,
      expireAt: suppressionData.expireAt ? Timestamp.fromDate(suppressionData.expireAt) : null
    };

    const batch = writeBatch(db);

    batch.update(recRef, {
      recommendationStatus: 'SUPPRESSED',
      suppressionContext,
      reviewedAt: Timestamp.now(),
      reviewedBy: userId,
      modifiedDate: Timestamp.now(),
      modifiedBy: userId
    });

    if (rec.linkedPriorityId) {
      const prioRef = doc(db, PRIORITIES_COLLECTION, rec.linkedPriorityId);
      batch.update(prioRef, { priorityStatus: 'WITHDRAWN', modifiedDate: Timestamp.now(), modifiedBy: userId });
      const dispRef = doc(db, DISPLAY_PRIORITIES_COLLECTION, rec.linkedPriorityId);
      batch.delete(dispRef);
    }

    await batch.commit();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
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
    const recSnap = await getDocs(query(collection(db, RECOMMENDATIONS_COLLECTION), where('__name__', '==', recommendationId)));
    if (recSnap.empty) return { success: false, error: 'Recommendation not found' };

    const rec = recSnap.docs[0].data() as Recommendation;

    const batch = writeBatch(db);
    const recRef = doc(db, RECOMMENDATIONS_COLLECTION, recommendationId);
    batch.update(recRef, {
      recommendationStatus: 'SUPERSEDED',
      overrideContext: null,
      suppressionContext: null,
      modifiedDate: Timestamp.now(),
      modifiedBy: userId
    });
    await batch.commit();

    await runSiteRecommendationJob(rec.tenantId, rec.siteId, {
      triggerType: 'MANUAL_RECALCULATION',
      productIds: [rec.productId],
      requestedBy: userId,
      forceRecalculate: true
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
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

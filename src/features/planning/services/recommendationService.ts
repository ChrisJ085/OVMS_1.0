import { DecisionInputSnapshot, DecisionOutput } from '../../../types/decision';
import { Recommendation, RecommendationStatus, PlannerDecision, OverrideFlags, SiteRecommendationRun } from '../../../types/recommendation';
import { evaluateDecision, ENGINE_VERSION } from './decisionEngine';
import { getProductInventory } from '../../inventory/services/inventoryService';
import { getProductPlanningRule } from './planningRuleService';
import { getProductProductionContext, buildProductProductionContext } from './productionService';
import { withPhase } from './promotionService';
import { PromotionProductRule, Promotion } from '../../../types/promotion';
import { ServiceResult } from '../../../types/common';
import { getProduct } from '../../inventory/services/productService';
import { buildDisplayPriorityDoc, logPriorityEvent, detectPriorityConflicts } from '../../operations/services/priorityService';
import { Priority, PriorityConflict } from '../../../types/priority';
import { Product } from '../../../types/product';
import { InventoryBalance } from '../../../types/inventory';
import { ProductPlanningRule } from '../../../types/planning';
import { ProductionPlanEntry, ProductionLinePlanNote, ProductProductionContext } from '../../../types/production';
import { NorthfleetStoRequirement } from '../../../types/production';
import { logAuditEvent } from '../../../services/auditService';
import { RecommendationAuditSnapshot } from '../../../types/audit';

import { getDecisionConfiguration } from './decisionConfigurationService';
import { getOutstandingStoCasesForProduct } from './northfleetStoService';
import { Timestamp, collection, db, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from '../../../services/firestoreBase';

const RECOMMENDATIONS_COLLECTION = 'recommendations';
const PROMOTIONS_COLLECTION = 'promotions';
const PROMOTION_RULES_COLLECTION = 'promotionProductRules';
const PRIORITIES_COLLECTION = 'priorities';
const DISPLAY_PRIORITIES_COLLECTION = 'displayPriorities';
export const SITE_RECOMMENDATION_RUNS_COLLECTION = 'siteRecommendationRuns';

export interface RecommendationPreloadContext {
  productsMap: Map<string, Product>;
  inventoryBalancesByProductId: Map<string, InventoryBalance[]>;
  inventoryTotalsByProductId: Map<string, number>;
  planningRulesMap: Map<string, ProductPlanningRule | null>;
  productionEntriesByProductId: Map<string, ProductionPlanEntry[]>;
  productionLineNotes: ProductionLinePlanNote[];
  productionImportUploadTimes: Map<string, Date>;
  stoRequirementsByProductId: Map<string, NorthfleetStoRequirement[]>;
  outstandingStoCasesByProductId: Map<string, number>;
  promotionsMap: Map<string, Promotion>;
  promotionRulesByProductId: Map<string, PromotionProductRule[]>;
  configuration: any;
  activeRecommendationsByProductId: Map<string, any>;
  activePrioritiesByProductId: Map<string, Priority[]>;
  actionTypesMap?: Map<string, any>;
  destinationsMap?: Map<string, any>;
  priorityLevelsMap?: Map<string, any>;
  evaluationDate?: Date;
}

export interface GenerateRecommendationResponse extends ServiceResult<string | null> {
  snapshot?: RecommendationAuditSnapshot | null;
  hasAction?: boolean;
  priorityId?: string | null;
}


export const getSiteRecommendationRunRef = (tenantId: string, siteId: string) => {
  return doc(db, SITE_RECOMMENDATION_RUNS_COLLECTION, `${tenantId}_${siteId}`);
};

export const fetchSiteRecommendationRun = async (
  tenantId: string,
  siteId: string
): Promise<SiteRecommendationRun | null> => {
  try {
    const ref = getSiteRecommendationRunRef(tenantId, siteId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as SiteRecommendationRun;
  } catch (err) {
    console.error('Error fetching site recommendation run:', err);
    return null;
  }
};

/**
 * Checks if a date value represents today (calendar day comparison).
 */
const isDateToday = (dateVal: any, evalDate: Date = new Date()): boolean => {
  if (!dateVal) return false;
  const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
  if (isNaN(d.getTime())) return false;

  // Compare local calendar day
  const dLocal = new Date(d);
  dLocal.setHours(0, 0, 0, 0);
  const todayLocal = new Date(evalDate);
  todayLocal.setHours(0, 0, 0, 0);
  if (dLocal.getTime() === todayLocal.getTime()) return true;

  // Compare UTC calendar day
  const dUTC = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  const todayUTC = new Date(Date.UTC(evalDate.getUTCFullYear(), evalDate.getUTCMonth(), evalDate.getUTCDate(), 0, 0, 0, 0));
  return dUTC.getTime() === todayUTC.getTime();
};

/**
 * Checks if a production date value falls on today.
 */
const isProductionDateToday = (prodDate: any, evalDate: Date = new Date()): boolean => {
  return isDateToday(prodDate, evalDate);
};

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
    stoCases: input.outstandingStoCases || 0,
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
  forceReevaluate = false,
  preloadedContext?: RecommendationPreloadContext
): Promise<GenerateRecommendationResponse> => {
  try {
    // 1. Gather Inputs
    let product: Product | null = null;
    if (preloadedContext?.productsMap) {
      product = preloadedContext.productsMap.get(productId) || null;
    }
    if (!product) {
      product = await getProduct(productId);
    }
    if (!product) return { success: false, error: 'Product not found' };

    let inventory: { totalQuantity: number; balances: InventoryBalance[] } | null = null;
    if (preloadedContext?.inventoryBalancesByProductId) {
      const balances = preloadedContext.inventoryBalancesByProductId.get(productId) || [];
      const totalQuantity = preloadedContext.inventoryTotalsByProductId?.get(productId) ?? 
        balances.reduce((sum, b) => sum + (b.quantity || 0), 0);
      inventory = { totalQuantity, balances };
    } else {
      inventory = await getProductInventory(tenantId, siteId, productId);
    }

    let planningRule: ProductPlanningRule | null = null;
    if (preloadedContext?.planningRulesMap) {
      planningRule = preloadedContext.planningRulesMap.get(productId) || null;
    } else {
      planningRule = await getProductPlanningRule(tenantId, siteId, productId);
    }

    let productionContext: ProductProductionContext;
    if (preloadedContext?.productionEntriesByProductId) {
      const entries = preloadedContext.productionEntriesByProductId.get(productId) || [];
      productionContext = buildProductProductionContext(
        tenantId,
        siteId,
        productId,
        entries,
        preloadedContext.productionLineNotes || [],
        preloadedContext.productionImportUploadTimes || new Map(),
        preloadedContext.evaluationDate || new Date()
      );
    } else {
      productionContext = await getProductProductionContext(tenantId, siteId, productId);
    }
    
    // Fetch active promotions for product
    const activePromotionImpacts: any[] = [];
    if (preloadedContext?.promotionRulesByProductId && preloadedContext?.promotionsMap) {
      const rules = preloadedContext.promotionRulesByProductId.get(productId) || [];
      rules.forEach(rule => {
        const promo = preloadedContext.promotionsMap.get(rule.promotionId);
        if (promo && promo.promotionStatus !== 'CANCELLED' && promo.promotionStatus !== 'COMPLETED' && (promo as any).phase !== 'INACTIVE') {
          activePromotionImpacts.push({
            rule,
            promotion: promo
          });
        }
      });
    } else {
      const promoRulesQuery = query(
        collection(db, PROMOTION_RULES_COLLECTION),
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('productId', '==', productId),
        where('status', '==', 'active')
      );
      const promoRulesSnap = await getDocs(promoRulesQuery);
      const rules = promoRulesSnap.docs.map(d => ({ id: d.id, ...d.data() } as PromotionProductRule));
      
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
    }

    const configuration = preloadedContext?.configuration || await getDecisionConfiguration(tenantId, siteId);
    
    let outstandingStoCases = 0;
    if (preloadedContext?.outstandingStoCasesByProductId) {
      outstandingStoCases = preloadedContext.outstandingStoCasesByProductId.get(productId) || 0;
    } else {
      outstandingStoCases = await getOutstandingStoCasesForProduct(tenantId, siteId, productId);
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
      outstandingStoCases,
      evaluationTime: new Date(),
      configuration
    };

    // 2. Evaluate Decision
    const decisionOutput = evaluateDecision(inputSnapshot);
    const fingerprint = generateFingerprint(inputSnapshot);

    // 3. Check existing active recommendation
    let existingRec: any = null;
    if (preloadedContext?.activeRecommendationsByProductId) {
      existingRec = preloadedContext.activeRecommendationsByProductId.get(productId) || null;
    } else {
      const existingQuery = query(
        collection(db, RECOMMENDATIONS_COLLECTION),
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('productId', '==', productId),
        where('recommendationStatus', 'in', ['AWAITING_REVIEW', 'AUTO_PUBLISHED', 'APPROVED'])
      );
      const existingSnap = await getDocs(existingQuery);
      if (!existingSnap.empty) {
        existingRec = { id: existingSnap.docs[0].id, ...existingSnap.docs[0].data() };
      }
    }

    if (existingRec) {
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
    let activePriorities: { id: string; ref: any; data: Priority }[] = [];
    if (preloadedContext?.activePrioritiesByProductId) {
      const prioList = preloadedContext.activePrioritiesByProductId.get(productId) || [];
      activePriorities = prioList.map(p => ({
        id: p.id,
        ref: doc(db, PRIORITIES_COLLECTION, p.id),
        data: p
      }));
    } else {
      const priorityQuery = query(
        collection(db, PRIORITIES_COLLECTION),
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('productId', '==', productId),
        where('priorityStatus', 'in', ['SCHEDULED', 'ACTIVE', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'PARTIALLY_COMPLETE'])
      );
      const prioritySnap = await getDocs(priorityQuery);
      activePriorities = prioritySnap.docs.map(doc => ({
        id: doc.id,
        ref: doc.ref,
        data: doc.data() as Priority
      }));
    }

    let targetPriorityId: string | null = null;
    const hasRecommendedAction = Boolean(decisionOutput.recommendedActionTypeId && (decisionOutput.recommendedQuantity || 0) > 0);
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

    let snapshot: RecommendationAuditSnapshot | null = null;
    if (hasRecommendedAction && targetPriorityId) {
      const destId = decisionOutput.recommendedDestinationId || null;
      const destObj = destId && preloadedContext?.destinationsMap ? preloadedContext.destinationsMap.get(destId) : null;
      const actionId = decisionOutput.recommendedActionTypeId!;
      const actionObj = preloadedContext?.actionTypesMap ? preloadedContext.actionTypesMap.get(actionId) : null;
      const levelId = decisionOutput.recommendedPriorityLevelId || 'NORMAL';
      const levelObj = preloadedContext?.priorityLevelsMap ? preloadedContext.priorityLevelsMap.get(levelId) : null;

      const actLabel = actionObj?.name || actionObj?.code || actionId;
      const destLabel = destObj?.name || destObj?.code || destId;
      const levelLabel = levelObj?.name || levelObj?.code || levelId;
      const finalRequestedQty = decisionOutput.recommendedQuantity || 0;
      const finalInstruction = decisionOutput.explanationLines?.[0] || `Auto-pushed action: ${actionId}`;
      const explanationText = decisionOutput.explanationLines?.join(' | ') || decisionOutput.structuredExplanation?.recommendation?.join(' | ') || '';

      snapshot = {
        recommendationId: recId,
        operationalPriorityId: targetPriorityId,
        productId,
        productCode: product.productCode || (product as any).code || product.id,
        productDescription: product.description || (product as any).productName || product.productCode || '',
        action: actLabel,
        actionTypeId: actionId,
        actionTypeLabel: actLabel,
        requestedQuantity: finalRequestedQty,
        quantityUnit: (product as any).unitOfMeasure || (product as any).uom || 'pallets',
        destinationId: destId,
        destinationCode: destObj?.code || destId,
        destinationName: destLabel,
        priorityLevel: levelLabel,
        priorityLevelId: levelId,
        instruction: finalInstruction,
        reason: explanationText,
        explanation: explanationText,
        supportingReasons: decisionOutput.explanationLines || [],
        sourceType: 'RECOMMENDATION',
        createdAt: new Date().toISOString(),
        decisionContext: {
          inventoryTotal: inventory?.totalQuantity || 0,
          controllingThresholdMode: planningRule?.controllingThresholdMode || null,
          belowTargetBehavior: planningRule?.belowTargetBehavior || null,
          outstandingStoCases: inputSnapshot.outstandingStoCases || 0,
          plannedCasesNext7Days: inputSnapshot.productionContext?.plannedCasesNext7Days || 0,
          planningBand: (decisionOutput as any).planningBandStatus || (decisionOutput as any).planningBand || null
        }
      };
    }

    return {
      success: true,
      data: newRef.id,
      snapshot,
      hasAction: hasRecommendedAction,
      priorityId: targetPriorityId
    };
  } catch (error: any) {
    console.error('Failed to generate recommendation:', error);
    return { success: false, error: error.message };
  }
};

export const refreshSiteRecommendations = async (
  tenantId: string,
  siteId: string,
  forceReevaluate = true,
  onProgress?: (progress: { current: number; total: number; productCode?: string }) => void,
  initiatorInfo?: { userId?: string; userName?: string }
): Promise<ServiceResult<{ generatedCount: number; conflicts: PriorityConflict[] }>> => {
  const runDocRef = getSiteRecommendationRunRef(tenantId, siteId);
  const userName = initiatorInfo?.userName || 'Planner';
  const userId = initiatorInfo?.userId || 'system';

  try {
    const runStartedAtMs = Date.now() - 1000;
    const evalDate = new Date();

    // 1. Fetch all required data for the site in parallel single-batch queries
    const [
      productsSnap,
      balancesSnap,
      stoSnap,
      productionEntriesSnap,
      productionNotesSnap,
      planningRulesSnap,
      promoRulesSnap,
      promotionsSnap,
      configuration,
      activeRecsSnap,
      activePrioritiesSnap
    ] = await Promise.all([
      // Active products
      getDocs(query(
        collection(db, 'products'),
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('status', '==', 'active')
      )),
      // Site inventory balances
      getDocs(query(
        collection(db, 'inventoryBalances'),
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId)
      )),
      // Site STO requirements
      getDocs(query(
        collection(db, 'northfleetStoRequirements'),
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId)
      )),
      // Site production plan entries
      getDocs(query(
        collection(db, 'productionPlanEntries'),
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId)
      )),
      // Site active production line notes
      getDocs(query(
        collection(db, 'productionLinePlanNotes'),
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('active', '==', true)
      )),
      // Site active planning rules
      getDocs(query(
        collection(db, 'planningRules'),
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('status', '==', 'active')
      )),
      // Site active promotion product rules
      getDocs(query(
        collection(db, 'promotionProductRules'),
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('status', '==', 'active')
      )),
      // Site promotions
      getDocs(query(
        collection(db, 'promotions'),
        where('tenantId', '==', tenantId)
      )),
      // Decision configuration
      getDecisionConfiguration(tenantId, siteId),
      // Active recommendations
      getDocs(query(
        collection(db, RECOMMENDATIONS_COLLECTION),
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('recommendationStatus', 'in', ['AWAITING_REVIEW', 'AUTO_PUBLISHED', 'APPROVED'])
      )),
      // Active priorities
      getDocs(query(
        collection(db, PRIORITIES_COLLECTION),
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('priorityStatus', 'in', ['SCHEDULED', 'ACTIVE', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'PARTIALLY_COMPLETE'])
      ))
    ]);

    // 2. Index Products
    const activeProducts: Product[] = [];
    const productsMap = new Map<string, Product>();
    const activeProductsByCode = new Map<string, Product>();

    productsSnap.docs.forEach(d => {
      const prod = { id: d.id, ...d.data() } as Product;
      activeProducts.push(prod);
      productsMap.set(d.id, prod);
      const code = (prod as any).code || prod.productCode;
      if (code) {
        activeProductsByCode.set(code, prod);
      }
    });

    // 3. Index Inventory Balances
    const rawBalancesByProdId = new Map<string, Map<string, InventoryBalance>>();
    balancesSnap.docs.forEach(d => {
      const data = { id: d.id, ...d.data() } as InventoryBalance;
      if (data.productId) {
        if (!rawBalancesByProdId.has(data.productId)) {
          rawBalancesByProdId.set(data.productId, new Map());
        }
        rawBalancesByProdId.get(data.productId)!.set(data.id, data);
      }
      if (data.productCodeSnapshot) {
        const matchingProd = activeProductsByCode.get(data.productCodeSnapshot);
        if (matchingProd) {
          if (!rawBalancesByProdId.has(matchingProd.id)) {
            rawBalancesByProdId.set(matchingProd.id, new Map());
          }
          rawBalancesByProdId.get(matchingProd.id)!.set(data.id, data);
        }
      }
    });

    const inventoryBalancesByProductId = new Map<string, InventoryBalance[]>();
    const inventoryTotalsByProductId = new Map<string, number>();

    activeProducts.forEach(p => {
      const docMap = rawBalancesByProdId.get(p.id);
      const balances = docMap ? Array.from(docMap.values()) : [];
      const totalQuantity = balances.reduce((sum, b) => sum + (b.quantity || 0), 0);
      inventoryBalancesByProductId.set(p.id, balances);
      inventoryTotalsByProductId.set(p.id, totalQuantity);
    });

    // 4. Index STO Requirements & calculate outstanding cases
    const stoRequirementsByProductId = new Map<string, NorthfleetStoRequirement[]>();
    const outstandingStoCasesByProductId = new Map<string, number>();
    const siteStoRequirements: NorthfleetStoRequirement[] = [];

    const todayStart = new Date(evalDate);
    todayStart.setHours(0, 0, 0, 0);

    stoSnap.docs.forEach(d => {
      const sto = { id: d.id, ...d.data() } as NorthfleetStoRequirement;
      siteStoRequirements.push(sto);

      if (sto.productId) {
        if (!stoRequirementsByProductId.has(sto.productId)) {
          stoRequirementsByProductId.set(sto.productId, []);
        }
        stoRequirementsByProductId.get(sto.productId)!.push(sto);

        if (sto.status !== 'CANCELLED') {
          const collDate = (sto.barrowCollectionDate as any)?.toDate
            ? (sto.barrowCollectionDate as any).toDate()
            : new Date(sto.barrowCollectionDate as any);
          collDate.setHours(0, 0, 0, 0);

          if (collDate.getTime() >= todayStart.getTime()) {
            const prev = outstandingStoCasesByProductId.get(sto.productId) || 0;
            outstandingStoCasesByProductId.set(sto.productId, prev + (sto.cases || 0));
          }
        }
      }
    });

    // 5. Index Production Plan Entries, Notes & Imports
    const productionEntriesByProductId = new Map<string, ProductionPlanEntry[]>();
    const siteProductionEntries: ProductionPlanEntry[] = [];
    const distinctImportIds = new Set<string>();

    productionEntriesSnap.docs.forEach(d => {
      const entry = { id: d.id, ...d.data() } as any as ProductionPlanEntry;
      siteProductionEntries.push(entry);

      if (entry.productId) {
        if (!productionEntriesByProductId.has(entry.productId)) {
          productionEntriesByProductId.set(entry.productId, []);
        }
        productionEntriesByProductId.get(entry.productId)!.push(entry);
      }

      if (entry.activeImportId) {
        distinctImportIds.add(entry.activeImportId);
      }
    });

    const productionLineNotes: ProductionLinePlanNote[] = productionNotesSnap.docs.map(
      d => ({ id: d.id, ...d.data() } as any as ProductionLinePlanNote)
    );

    // Fetch import upload times for distinct activeImportIds
    const productionImportUploadTimes = new Map<string, Date>();
    if (distinctImportIds.size > 0) {
      await Promise.all(
        Array.from(distinctImportIds).map(async importId => {
          try {
            const importDocRef = doc(db, 'productionPlanImports', importId);
            const importSnap = await getDoc(importDocRef);
            if (importSnap.exists()) {
              const uploaded = (importSnap.data() as any).uploadedAt?.toDate
                ? (importSnap.data() as any).uploadedAt.toDate()
                : null;
              if (uploaded) {
                productionImportUploadTimes.set(importId, uploaded);
              }
            }
          } catch (err) {
            console.warn(`Failed to fetch upload time for import ${importId}:`, err);
          }
        })
      );
    }

    // 6. Index Planning Rules
    const rawPlanningRulesByProdId = new Map<string, ProductPlanningRule[]>();
    planningRulesSnap.docs.forEach(d => {
      const rule = { id: d.id, ...d.data() } as ProductPlanningRule;
      if (rule.productId) {
        if (!rawPlanningRulesByProdId.has(rule.productId)) {
          rawPlanningRulesByProdId.set(rule.productId, []);
        }
        rawPlanningRulesByProdId.get(rule.productId)!.push(rule);
      }
    });

    const planningRulesMap = new Map<string, ProductPlanningRule | null>();
    const now = new Date();
    for (const [prodId, rules] of rawPlanningRulesByProdId.entries()) {
      rules.sort((a, b) => {
        const timeA = (a.modifiedDate as any)?.toDate?.()?.getTime() || (a.modifiedDate as any)?.seconds * 1000 || (a.createdDate as any)?.toDate?.()?.getTime() || (a.createdDate as any)?.seconds * 1000 || 0;
        const timeB = (b.modifiedDate as any)?.toDate?.()?.getTime() || (b.modifiedDate as any)?.seconds * 1000 || (b.createdDate as any)?.toDate?.()?.getTime() || (b.createdDate as any)?.seconds * 1000 || 0;
        return timeB - timeA;
      });

      let activeRule: ProductPlanningRule | null = null;
      for (const rule of rules) {
        const from = (rule.effectiveFrom as any)?.toDate?.() || new Date(rule.effectiveFrom as any);
        const to = rule.effectiveTo ? ((rule.effectiveTo as any)?.toDate?.() || new Date(rule.effectiveTo as any)) : null;
        if (from <= now && (!to || to > now)) {
          activeRule = rule;
          break;
        }
      }
      planningRulesMap.set(prodId, activeRule || rules[0] || null);
    }

    // 7. Index Promotions & Promotion Rules
    const promotionsMap = new Map<string, Promotion>();
    promotionsSnap.docs.forEach(d => {
      const promo = withPhase({ id: d.id, ...d.data() } as Promotion);
      promotionsMap.set(d.id, promo);
    });

    const promotionRulesByProductId = new Map<string, PromotionProductRule[]>();
    promoRulesSnap.docs.forEach(d => {
      const rule = { id: d.id, ...d.data() } as PromotionProductRule;
      if (rule.productId) {
        if (!promotionRulesByProductId.has(rule.productId)) {
          promotionRulesByProductId.set(rule.productId, []);
        }
        promotionRulesByProductId.get(rule.productId)!.push(rule);
      }
    });

    // 8. Index Active Recommendations & Priorities
    const activeRecommendationsByProductId = new Map<string, any>();
    const activeSiteRecommendations: any[] = [];
    activeRecsSnap.docs.forEach(d => {
      const rec: any = { id: d.id, ...d.data() };
      activeSiteRecommendations.push(rec);
      if (rec.productId) {
        activeRecommendationsByProductId.set(rec.productId, rec);
      }
    });

    const activePrioritiesByProductId = new Map<string, Priority[]>();
    const activeSitePriorities: Priority[] = [];
    activePrioritiesSnap.docs.forEach(d => {
      const prio = { id: d.id, ...d.data() } as Priority;
      activeSitePriorities.push(prio);
      if (prio.productId) {
        if (!activePrioritiesByProductId.has(prio.productId)) {
          activePrioritiesByProductId.set(prio.productId, []);
        }
        activePrioritiesByProductId.get(prio.productId)!.push(prio);
      }
    });

    // 9. Construct Candidate Product Sets (UNION)
    const positiveInventoryCandidates = new Set<string>();
    const stoDueTodayCandidates = new Set<string>();
    const productionTodayCandidates = new Set<string>();
    const existingSystemRecCandidates = new Set<string>();

    // A. Positive Inventory
    for (const p of activeProducts) {
      const totalQty = inventoryTotalsByProductId.get(p.id) || 0;
      if (totalQty > 0) {
        positiveInventoryCandidates.add(p.id);
      }
    }

    // B. STO Due Today (Barrow Collection Date is TODAY)
    for (const sto of siteStoRequirements) {
      if (sto.status !== 'CANCELLED' && sto.productId && isDateToday(sto.barrowCollectionDate, evalDate)) {
        stoDueTodayCandidates.add(sto.productId);
      }
    }

    // C. Production Scheduled for Today
    for (const entry of siteProductionEntries) {
      if (entry.status !== 'CANCELLED' && entry.productId && isProductionDateToday(entry.productionDate, evalDate)) {
        productionTodayCandidates.add(entry.productId);
      }
    }

    // D. Existing System Recommendations / Recommendation-driven Priorities
    for (const rec of activeSiteRecommendations) {
      if (rec.productId && ['AWAITING_REVIEW', 'AUTO_PUBLISHED', 'APPROVED'].includes(rec.recommendationStatus)) {
        existingSystemRecCandidates.add(rec.productId);
      }
    }
    for (const prio of activeSitePriorities) {
      if (
        prio.productId &&
        prio.sourceType === 'RECOMMENDATION' &&
        ['SCHEDULED', 'ACTIVE', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'PARTIALLY_COMPLETE'].includes(prio.priorityStatus)
      ) {
        existingSystemRecCandidates.add(prio.productId);
      }
    }

    // Build the deduplicated Candidate Set
    const candidateProductIds = new Set<string>([
      ...positiveInventoryCandidates,
      ...stoDueTodayCandidates,
      ...productionTodayCandidates,
      ...existingSystemRecCandidates
    ]);

    // Filter to active products
    const candidateProducts = activeProducts.filter(p => candidateProductIds.has(p.id));
    const totalCandidates = candidateProducts.length;

    // Diagnostic logging
    console.log(
      `Recommendation refresh:\n` +
      `Active products: ${activeProducts.length}\n` +
      `Positive inventory: ${positiveInventoryCandidates.size}\n` +
      `STO due today: ${stoDueTodayCandidates.size}\n` +
      `Production today: ${productionTodayCandidates.size}\n` +
      `Existing system recommendations: ${existingSystemRecCandidates.size}\n` +
      `Unique candidates: ${totalCandidates}`
    );

    // Build preloaded context for evaluation
    const preloadedContext: RecommendationPreloadContext = {
      productsMap,
      inventoryBalancesByProductId,
      inventoryTotalsByProductId,
      planningRulesMap,
      productionEntriesByProductId,
      productionLineNotes,
      productionImportUploadTimes,
      stoRequirementsByProductId,
      outstandingStoCasesByProductId,
      promotionsMap,
      promotionRulesByProductId,
      configuration,
      activeRecommendationsByProductId,
      activePrioritiesByProductId,
      evaluationDate: evalDate
    };

    // Record initial run state in Firestore
    try {
      await setDoc(runDocRef, {
        tenantId,
        siteId,
        status: 'IN_PROGRESS',
        startedAt: Timestamp.now(),
        startedBy: userId,
        startedByName: userName,
        totalProducts: totalCandidates,
        currentProductIndex: 0,
        currentProductCode: totalCandidates > 0 ? 'Initializing' : 'None to evaluate',
        generatedCount: 0,
        conflictsCount: 0,
        error: null,
        lastUpdatedAt: Timestamp.now()
      }, { merge: true });
    } catch (startErr) {
      console.warn('Could not record run start in Firestore (continuing locally):', startErr);
    }

    let count = 0;
    let lastFirestoreProgressWrite = 0;

    // Evaluate ONLY candidate products
    for (let i = 0; i < totalCandidates; i++) {
      const product = candidateProducts[i];
      const code = (product as any).code || product.productCode || product.id;

      if (onProgress) {
        onProgress({ current: i + 1, total: totalCandidates, productCode: code });
      }

      // Throttle Firestore progress updates (at most every ~1.5s or on final item)
      const now = Date.now();
      if (now - lastFirestoreProgressWrite > 1500 || i === totalCandidates - 1) {
        lastFirestoreProgressWrite = now;
        try {
          await updateDoc(runDocRef, {
            currentProductIndex: i + 1,
            totalProducts: totalCandidates,
            currentProductCode: code,
            lastUpdatedAt: Timestamp.now()
          });
        } catch {
          // Non-blocking
        }
      }

      const res = await generateRecommendationForProduct(
        tenantId,
        siteId,
        product.id,
        forceReevaluate,
        preloadedContext
      );
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

    // Record completion in Firestore
    try {
      await setDoc(runDocRef, {
        tenantId,
        siteId,
        status: 'COMPLETED',
        completedAt: Timestamp.now(),
        completedBy: userId,
        completedByName: userName,
        totalProducts: totalCandidates,
        currentProductIndex: totalCandidates,
        currentProductCode: 'Complete',
        generatedCount: count,
        conflictsCount: conflicts.length,
        error: null,
        lastUpdatedAt: Timestamp.now()
      }, { merge: true });
    } catch (completeErr) {
      console.warn('Could not record run completion in Firestore:', completeErr);
    }

    return { success: true, data: { generatedCount: count, conflicts } };
  } catch (e: any) {
    console.error('Failed to refresh site recommendations:', e);

    try {
      await setDoc(runDocRef, {
        tenantId,
        siteId,
        status: 'FAILED',
        error: e?.message || 'Failed to refresh site recommendations',
        lastUpdatedAt: Timestamp.now()
      }, { merge: true });
    } catch {
      // Non-blocking
    }

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


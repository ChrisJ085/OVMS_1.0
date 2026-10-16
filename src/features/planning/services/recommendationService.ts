import { DecisionInputSnapshot, DecisionOutput } from '../../../types/decision';
import { Recommendation, RecommendationStatus, PlannerDecision, OverrideFlags, SiteRecommendationRun } from '../../../types/recommendation';
import { evaluateDecision, capPriorityAtHigh, ENGINE_VERSION } from './decisionEngine';
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
import { toSafeDate } from '../../../utils/timeFormatters';

import { getDecisionConfiguration } from './decisionConfigurationService';
import { getOutstandingStoCasesForProduct } from './northfleetStoService';
import { filterRecommendationCandidates } from './recommendationCandidateService';
import { getActiveSnp87Snapshot } from './snp87ImportService';
import { buildProductPlanningContext, getProductPlanningContext, adaptPlanningContextToLegacyProductionContext } from './snp87PlanningContextService';
import { ProductPlanningContext, Snp87PlanningImport, Snp87PlanningRow } from '../../../types/snp87';
import {
  createDocument,
  deleteDocument,
  getDocument,
  getDocuments,
  setDocument,
  updateDocument,
  where
} from '../../../services/dbService';

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
  productionEntriesByProductId?: Map<string, ProductionPlanEntry[]>;
  productionLineNotes?: ProductionLinePlanNote[];
  productionImportUploadTimes?: Map<string, Date>;
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
  planningContextsByProductId?: Map<string, ProductPlanningContext>;
  activeSnp87Snapshot?: Snp87PlanningImport | null;
  snp87Rows?: Snp87PlanningRow[];
}

export interface GenerateRecommendationResponse extends ServiceResult<string | null> {
  snapshot?: RecommendationAuditSnapshot | null;
  hasAction?: boolean;
  priorityId?: string | null;
}


export const fetchSiteRecommendationRun = async (
  tenantId: string,
  siteId: string
): Promise<SiteRecommendationRun | null> => {
  try {
    return await getDocument<SiteRecommendationRun>(SITE_RECOMMENDATION_RUNS_COLLECTION, `${tenantId}_${siteId}`);
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
    invTime: input.inventoryUpdatedAt ? toSafeDate(input.inventoryUpdatedAt).getTime() : 0,
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
    planningContext: input.planningContext ? {
      forecastToday: input.planningContext.forecastCasesToday,
      forecast7d: input.planningContext.forecastCasesNext7Days,
      productionToday: input.planningContext.confirmedProductionCasesToday,
      production7d: input.planningContext.confirmedProductionCasesNext7Days,
      freshness: input.planningContext.dataFreshnessStatus,
      importId: input.planningContext.sourceImportId
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
  preloadedContext?: RecommendationPreloadContext,
  generationMetadata?: {
    generationId?: string;
    userId?: string;
    userName?: string;
  }
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
      if (!inventory || inventory.balances.length === 0) {
        const docs = await getDocuments<InventoryBalance>('inventoryBalances', [
          where('tenantId', '==', tenantId),
          where('siteId', '==', siteId),
          where('productId', '==', productId)
        ]);
        if (docs.length > 0) {
          const totalQuantity = docs.reduce((sum, b) => sum + (b.quantity || 0), 0);
          inventory = { totalQuantity, balances: docs };
        }
      }
    }

    let planningRule: ProductPlanningRule | null = null;
    if (preloadedContext?.planningRulesMap) {
      planningRule = preloadedContext.planningRulesMap.get(productId) || null;
    } else {
      planningRule = await getProductPlanningRule(tenantId, siteId, productId);
      if (!planningRule) {
        const rules = await getDocuments<ProductPlanningRule>('planningRules', [
          where('tenantId', '==', tenantId),
          where('siteId', '==', siteId),
          where('productId', '==', productId)
        ]);
        planningRule = rules[0] || null;
      }
    }

    // Retrieve SNP87 planning context as authoritative planning input
    let planningContext: ProductPlanningContext | null = null;
    if (preloadedContext?.planningContextsByProductId) {
      planningContext = preloadedContext.planningContextsByProductId.get(productId) || null;
    } else {
      try {
        planningContext = await getProductPlanningContext(
          tenantId,
          siteId,
          productId,
          product.productCode,
          preloadedContext?.evaluationDate || new Date()
        );
      } catch (snpErr) {
        console.warn('Could not retrieve product planning context:', snpErr);
      }
    }

    // Adapt SNP87 planning context to production context without requiring MPPS7 entries
    let productionContext: ProductProductionContext;
    if (planningContext) {
      productionContext = adaptPlanningContextToLegacyProductionContext(planningContext, product);
    } else if (preloadedContext?.productionEntriesByProductId) {
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

    if (planningContext && productionContext && !productionContext.planningContext) {
      productionContext.planningContext = planningContext;
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
      const rules = await getDocuments<PromotionProductRule>(PROMOTION_RULES_COLLECTION, [
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('productId', '==', productId),
        where('status', '==', 'active')
      ]);
      
      if (rules.length > 0) {
        const promoIds = [...new Set(rules.map(r => r.promotionId))];
        if (promoIds.length > 0) {
          const allPromos = await getDocuments<Promotion>(PROMOTIONS_COLLECTION, [
            where('tenantId', '==', tenantId)
          ]);
          const promosMap = new Map();
          allPromos.filter(p => promoIds.includes(p.id)).forEach(d => {
            const promo = withPhase(d);
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
      inventoryUpdatedAt: inventory && inventory.balances.length > 0 ? (inventory.balances[0].modifiedDate as any) || new Date() : new Date(),
      planningRule,
      productionContext,
      planningContext,
      activePromotionImpacts,
      existingActivePriorities: [],
      outstandingStoCases,
      stoRequirements: preloadedContext?.stoRequirementsByProductId ? (preloadedContext.stoRequirementsByProductId.get(productId) || []) : undefined,
      evaluationTime: preloadedContext?.evaluationDate || new Date(),
      configuration,
      generationId: generationMetadata?.generationId,
      triggeredBy: generationMetadata?.userId || 'system',
      triggeredByName: generationMetadata?.userName || 'system'
    };

    // 2. Evaluate Decision
    const decisionOutput = evaluateDecision(inputSnapshot);
    const fingerprint = generateFingerprint(inputSnapshot);

    // 3. Check existing active recommendation
    let existingRec: any = null;
    if (preloadedContext?.activeRecommendationsByProductId) {
      existingRec = preloadedContext.activeRecommendationsByProductId.get(productId) || null;
    } else {
      const existingRecs = await getDocuments<any>(RECOMMENDATIONS_COLLECTION, [
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('productId', '==', productId)
      ]);
      const validStatuses = ['AWAITING_REVIEW', 'AUTO_PUBLISHED', 'APPROVED'];
      existingRec = existingRecs.find(r => validStatuses.includes(r.recommendationStatus)) || null;
    }

    if (existingRec) {
      // If fingerprint matches and forceReevaluate is false, no change needed
      if (!forceReevaluate && existingRec.sourceFingerprint === fingerprint) {
        return { success: true, data: existingRec.id };
      }
    }

    const recId = `rec_${Math.random().toString(36).substring(2, 11)}`;

    // 4. Create new recommendation and push directly to warehouse priorities
    if (existingRec) {
      await updateDocument(RECOMMENDATIONS_COLLECTION, existingRec.id, { 
        recommendationStatus: 'SUPERSEDED',
        supersededByRecommendationId: recId,
        modifiedDate: new Date().toISOString(),
        modifiedBy: 'system'
      });
    }

    // Check if an existing operational priority exists for this product
    let activePriorities: { id: string; data: Priority }[] = [];
    if (preloadedContext?.activePrioritiesByProductId) {
      const prioList = preloadedContext.activePrioritiesByProductId.get(productId) || [];
      activePriorities = prioList.map(p => ({ id: p.id, data: p }));
    } else {
      const validPrioStatuses = ['SCHEDULED', 'ACTIVE', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'PARTIALLY_COMPLETE'];
      const prioDocs = await getDocuments<Priority>(PRIORITIES_COLLECTION, [
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('productId', '==', productId)
      ]);
      activePriorities = prioDocs
        .filter(p => validPrioStatuses.includes(p.priorityStatus))
        .map(p => ({ id: p.id, data: p }));
    }

    let targetPriorityId: string | null = null;
    const hasRecommendedAction = Boolean(decisionOutput.recommendedActionTypeId && (decisionOutput.recommendedQuantity || 0) > 0);
    const existingRecPrio = activePriorities.find(p => p.data.sourceType === 'RECOMMENDATION');

    if (hasRecommendedAction) {
      const requestedQty = decisionOutput.recommendedQuantity || 0;
      const cpp = product.casesPerPallet || product.configurations?.[0]?.casesPerPallet || 45;
      const pallets = cpp > 0 ? Math.round(requestedQty / cpp) : 0;
      const destName = decisionOutput.recommendedDestinationId ? 'Chorley (CH)' : 'configured destination';
      const instructionText = `Release ${requestedQty.toLocaleString()} cases (${pallets} ${pallets === 1 ? 'Pallet' : 'Pallets'}) to ${destName}`;
      const selectionBlurb = `Physical inventory at Barrow warehouse exceeds the protected retention threshold. The system selected this product to release surplus stock (${requestedQty.toLocaleString()} cases / ${pallets} pallets) to relieve warehouse floor storage pressure while preserving 100% of Barrow protected DDXM and customer commitments.`;

      if (existingRecPrio) {
        // Update existing active priority
        targetPriorityId = existingRecPrio.id;
        const prioData = existingRecPrio.data;

        const resolvedPriorityLevelId = capPriorityAtHigh(decisionOutput.recommendedPriorityLevelId, configuration) || 'NORMAL';
        const updatedPrioData: Partial<Priority> = {
          actionTypeId: decisionOutput.recommendedActionTypeId!,
          requestedQuantity: requestedQty,
          remainingQuantity: Math.max(0, requestedQty - (prioData.progressQuantity || 0)),
          progressPercent: requestedQty > 0 ? Math.round(((prioData.progressQuantity || 0) / requestedQty) * 100) : 0,
          destinationId: decisionOutput.recommendedDestinationId || null,
          priorityLevelId: resolvedPriorityLevelId,
          instruction: instructionText,
          selectionLogicSummary: selectionBlurb,
          sourceRecommendationId: recId,
          modifiedDate: new Date().toISOString(),
          modifiedBy: 'system'
        };

        await updateDocument(PRIORITIES_COLLECTION, targetPriorityId, updatedPrioData);
        await setDocument(
          DISPLAY_PRIORITIES_COLLECTION,
          targetPriorityId,
          buildDisplayPriorityDoc({ ...prioData, ...updatedPrioData }, targetPriorityId)
        );
      } else {
        const resolvedPriorityLevelId = capPriorityAtHigh(decisionOutput.recommendedPriorityLevelId, configuration) || 'NORMAL';
        // Create new operational priority pushed to warehouse
        const priorityData: any = {
          tenantId,
          siteId,
          sourceType: 'RECOMMENDATION',
          sourceRecommendationId: recId,
          productId,
          productCodeSnapshot: product.productCode,
          descriptionSnapshot: product.description,
          instruction: instructionText,
          selectionLogicSummary: selectionBlurb,
          priorityStatus: 'ACTIVE',
          priorityLevelId: resolvedPriorityLevelId,
          actionTypeId: decisionOutput.recommendedActionTypeId!,
          requestedQuantity: requestedQty,
          progressQuantity: 0,
          remainingQuantity: requestedQty,
          progressPercent: 0,
          destinationId: decisionOutput.recommendedDestinationId || null,
          supportingReasons: decisionOutput.explanationLines || [],
          planningContextSnapshot: null,
          startAt: new Date().toISOString(),
          expireAt: null,
          latestProgressNote: null,
          publishedAt: new Date().toISOString(),
          completedAt: null,
          cancelledAt: null,
          status: 'active',
          createdBy: 'system',
          createdDate: new Date().toISOString(),
          modifiedBy: 'system',
          modifiedDate: new Date().toISOString()
        };
        targetPriorityId = await createDocument(PRIORITIES_COLLECTION, priorityData);

        await setDocument(
          DISPLAY_PRIORITIES_COLLECTION,
          targetPriorityId,
          buildDisplayPriorityDoc(priorityData, targetPriorityId)
        );
      }
    } else {
      // No recommended action in latest generation. If a previous active recommendation priority exists, cancel it.
      if (existingRecPrio) {
        const prioData = existingRecPrio.data;
        await updateDocument(PRIORITIES_COLLECTION, existingRecPrio.id, {
          priorityStatus: 'CANCELLED',
          cancelledAt: new Date().toISOString(),
          modifiedDate: new Date().toISOString(),
          modifiedBy: 'system'
        });
        await deleteDocument(DISPLAY_PRIORITIES_COLLECTION, existingRecPrio.id);

        // Log priority status change event
        await logPriorityEvent(
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
      generationId: generationMetadata?.generationId,
      engineVersion: ENGINE_VERSION,
      decisionOutput: JSON.parse(JSON.stringify(decisionOutput)), // Serialize dates
      sourceSnapshot: JSON.parse(JSON.stringify(inputSnapshot)),
      sourceFingerprint: fingerprint,
      generatedAt: new Date().toISOString(),
      reviewedAt: new Date().toISOString(),
      reviewedBy: generationMetadata?.userId || 'system',
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
      createdDate: new Date().toISOString(),
      modifiedDate: new Date().toISOString(),
      createdBy: generationMetadata?.userId || 'system',
      modifiedBy: generationMetadata?.userId || 'system'
    };

    await setDocument(RECOMMENDATIONS_COLLECTION, recId, newRecommendation);

    // Build comprehensive Stage 9 RecommendationAuditSnapshot
    const destId = decisionOutput.recommendedDestinationId || planningRule?.preferredDestinationId || null;
    const destObj = destId && preloadedContext?.destinationsMap ? preloadedContext.destinationsMap.get(destId) : null;
    const actionId = decisionOutput.recommendedActionTypeId || 'NONE';
    const actionObj = preloadedContext?.actionTypesMap ? preloadedContext.actionTypesMap.get(actionId) : null;
    const levelId = capPriorityAtHigh(decisionOutput.recommendedPriorityLevelId, configuration) || 'NORMAL';
    const levelObj = preloadedContext?.priorityLevelsMap ? preloadedContext.priorityLevelsMap.get(levelId) : null;

    const actLabel = actionObj?.name || actionObj?.code || actionId;
    const destLabel = destObj?.name || destObj?.code || destId || 'None';
    const levelLabel = levelObj?.name || levelObj?.code || levelId;
    const finalRequestedQty = decisionOutput.recommendedQuantity || 0;
    const finalInstruction = decisionOutput.explanationLines?.[0] || (hasRecommendedAction ? `Auto-pushed action: ${actionId}` : 'No operational action required');
    const explanationText = decisionOutput.explanationLines?.join(' | ') || decisionOutput.structuredExplanation?.recommendation?.join(' | ') || '';

    // 1. SNP87 Source Snapshot
    const snp87SourceSnapshot = planningContext ? {
      sourceImportId: planningContext.sourceImportId || null,
      sourceReportName: planningContext.sourceReportName || null,
      importedAt: planningContext.forecastSourceUpdatedAt 
        ? new Date(planningContext.forecastSourceUpdatedAt).toISOString() 
        : (planningContext.productionSourceUpdatedAt ? new Date(planningContext.productionSourceUpdatedAt).toISOString() : null),
      dataFreshnessStatus: planningContext.dataFreshnessStatus || 'MISSING',
      sourceStatus: planningContext.sourceStatus || 'MISSING',
      planningHorizon: planningContext.sevenDayWindow ? {
        startDate: planningContext.sevenDayWindow.startDate,
        endDate: planningContext.sevenDayWindow.endDate
      } : null,
      forecastCasesToday: planningContext.forecastCasesToday || 0,
      forecastCasesNext7Days: planningContext.forecastCasesNext7Days || 0,
      forecastByDate: planningContext.forecastByDate || {},
      forecastSourceImportId: planningContext.forecastSourceImportId || null,
      forecastSourceUpdatedAt: planningContext.forecastSourceUpdatedAt ? new Date(planningContext.forecastSourceUpdatedAt).toISOString() : null,
      confirmedProductionCasesToday: planningContext.confirmedProductionCasesToday || 0,
      confirmedProductionCasesNext7Days: planningContext.confirmedProductionCasesNext7Days || 0,
      confirmedProductionByDate: planningContext.confirmedProductionByDate || {},
      productionSourceImportId: planningContext.productionSourceImportId || null,
      productionSourceUpdatedAt: planningContext.productionSourceUpdatedAt ? new Date(planningContext.productionSourceUpdatedAt).toISOString() : null,
      hasMissingPlanningData: Boolean(planningContext.hasMissingPlanningData)
    } : {
      sourceImportId: null,
      sourceReportName: null,
      importedAt: null,
      dataFreshnessStatus: 'MISSING' as const,
      sourceStatus: 'MISSING' as const,
      planningHorizon: null,
      forecastCasesToday: 0,
      forecastCasesNext7Days: 0,
      forecastByDate: {},
      forecastSourceImportId: null,
      forecastSourceUpdatedAt: null,
      confirmedProductionCasesToday: 0,
      confirmedProductionCasesNext7Days: 0,
      confirmedProductionByDate: {},
      productionSourceImportId: null,
      productionSourceUpdatedAt: null,
      hasMissingPlanningData: true
    };

    // 2. Northfleet STO snapshot
    const stoList = preloadedContext?.stoRequirementsByProductId?.get(productId) || [];
    const northfleetProtectionSnapshot = {
      outstandingCases: inputSnapshot.outstandingStoCases || 0,
      requirementCount: stoList.length,
      requirements: stoList.slice(0, 10).map((sto: any) => ({
        id: sto.id,
        cases: sto.cases || 0,
        barrowCollectionDate: String(sto.barrowCollectionDate || ''),
        destinationLocation: sto.destinationLocation || sto.destinationCode,
        carrier: sto.carrier,
        status: sto.status
      }))
    };

    // 3. Product & Rule Configuration snapshot
    const configurationSnapshot = {
      productCode: product.productCode || (product as any).code || product.id,
      preferredDestinationId: planningRule?.preferredDestinationId || null,
      preferredDestinationCode: destObj?.code || null,
      preferredDestinationName: destLabel !== 'None' ? destLabel : null,
      minimumQuantity: planningRule?.minimumQuantity ?? null,
      targetQuantity: planningRule?.targetQuantity ?? null,
      maximumQuantity: planningRule?.maximumQuantity ?? null,
      ddxmRetentionQuantity: planningRule?.ddxmRetentionQuantity ?? null,
      controllingThresholdMode: planningRule?.controllingThresholdMode || null,
      belowTargetBehavior: planningRule?.belowTargetBehavior || null,
      engineVersion: ENGINE_VERSION
    };

    const snapshot: RecommendationAuditSnapshot = {
      recommendationId: recId,
      operationalPriorityId: targetPriorityId || '',
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
      generationId: generationMetadata?.generationId,
      fingerprint,
      sourceFingerprint: fingerprint,
      recommendationStatus: 'AUTO_PUBLISHED',
      triggeredBy: generationMetadata?.userId || 'system',
      triggeredByName: generationMetadata?.userName || 'system',

      inventorySnapshot: {
        totalCases: inventory ? inventory.totalQuantity : 0,
        balanceCount: inventory ? inventory.balances.length : 0,
        updatedAt: (inventory as any)?.lastUpdated ? new Date((inventory as any).lastUpdated).toISOString() : null
      },

      snp87SourceSnapshot,
      northfleetProtectionSnapshot,
      configurationSnapshot,

      decisionContext: {
        inventoryTotal: inventory?.totalQuantity || 0,
        controllingThresholdMode: planningRule?.controllingThresholdMode || null,
        belowTargetBehavior: planningRule?.belowTargetBehavior || null,
        outstandingStoCases: inputSnapshot.outstandingStoCases || 0,
        plannedCasesNext7Days: inputSnapshot.productionContext?.plannedCasesNext7Days || 0,
        planningBand: (decisionOutput as any).planningBandStatus || (decisionOutput as any).planningBand || null,
        preferredDestinationId: planningRule?.preferredDestinationId || null,
        preferredDestinationName: destLabel !== 'None' ? destLabel : null,
        snp87ImportId: planningContext?.sourceImportId || null,
        snp87ImportedAt: planningContext?.forecastSourceUpdatedAt ? new Date(planningContext.forecastSourceUpdatedAt).toISOString() : null,
        snp87Freshness: planningContext?.dataFreshnessStatus || 'MISSING',
        snp87ForecastCases7Days: planningContext?.forecastCasesNext7Days || 0,
        snp87ConfirmedProductionCases7Days: planningContext?.confirmedProductionCasesNext7Days || 0,
        snp87NetPosition: planningContext ? ((planningContext.confirmedProductionCasesNext7Days || 0) - (planningContext.forecastCasesNext7Days || 0)) : 0
      }
    };

    // If standalone recalculation/generation (not in bulk refresh), log audit event immediately
    if (!generationMetadata?.generationId && hasRecommendedAction) {
      try {
        await logAuditEvent({
          tenantId,
          siteId,
          eventType: 'RECOMMENDATION_EVALUATED',
          entityType: 'Recommendation',
          entityId: recId,
          summary: `Evaluated recommendation for ${product.productCode}: ${snapshot.action} (${snapshot.requestedQuantity} ${snapshot.quantityUnit})`,
          performedBy: generationMetadata?.userId || 'system',
          performedByName: generationMetadata?.userName || 'system',
          generationId: `single_${recId}`,
          generationStatus: 'COMPLETED',
          candidateProductsCount: 1,
          evaluatedProductsCount: 1,
          actionableRecommendationsCount: 1,
          operationalPrioritiesCreatedCount: targetPriorityId ? 1 : 0,
          noActionCount: 0,
          recommendationSnapshots: [snapshot],
          metadata: {
            sourceImportId: snp87SourceSnapshot.sourceImportId,
            fingerprint
          }
        });
      } catch (auditErr) {
        console.warn('Could not log standalone recommendation audit:', auditErr);
      }
    }

    return {
      success: true,
      data: recId,
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
  initiatorInfo?: { userId?: string; userName?: string; userEmail?: string }
): Promise<ServiceResult<{ generatedCount: number; conflicts: PriorityConflict[]; generationId?: string }>> => {
  const runId = `${tenantId}_${siteId}`;
  const userName = initiatorInfo?.userName || 'Planner';
  const userId = initiatorInfo?.userId || 'system';
  const userEmail = initiatorInfo?.userEmail;
  const generationId = `gen_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const runStartedAtMs = Date.now();

  try {
    const evalDate = new Date();

    // 1. Fetch all required data for the site in parallel single-batch queries
    const [
      productsDocs,
      balancesDocs,
      stoDocs,
      planningRulesDocs,
      promoRulesDocs,
      promotionsDocs,
      configuration,
      activeRecsDocs,
      activePrioritiesDocs,
      activeSnp87Snapshot
    ] = await Promise.all([
      getDocuments<Product>('products', [
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('status', '==', 'active')
      ]),
      getDocuments<InventoryBalance>('inventoryBalances', [
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId)
      ]),
      getDocuments<NorthfleetStoRequirement>('northfleetStoRequirements', [
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId)
      ]),
      getDocuments<ProductPlanningRule>('planningRules', [
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('status', '==', 'active')
      ]),
      getDocuments<PromotionProductRule>('promotionProductRules', [
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('status', '==', 'active')
      ]),
      getDocuments<Promotion>('promotions', [
        where('tenantId', '==', tenantId)
      ]),
      getDecisionConfiguration(tenantId, siteId),
      getDocuments<any>(RECOMMENDATIONS_COLLECTION, [
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId)
      ]),
      getDocuments<Priority>(PRIORITIES_COLLECTION, [
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId)
      ]),
      getActiveSnp87Snapshot(tenantId, siteId).catch(err => {
        console.warn('Failed to retrieve active SNP87 snapshot during refresh:', err);
        return { importSummary: null, rows: [] };
      })
    ]);

    const activeRecsFiltered = activeRecsDocs.filter(r => ['AWAITING_REVIEW', 'AUTO_PUBLISHED', 'APPROVED'].includes(r.recommendationStatus));
    const activePrioritiesFiltered = activePrioritiesDocs.filter(p => ['SCHEDULED', 'ACTIVE', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'PARTIALLY_COMPLETE'].includes(p.priorityStatus));

    // 2. Index Products
    const activeProducts: Product[] = [];
    const productsMap = new Map<string, Product>();
    const activeProductsByCode = new Map<string, Product>();

    productsDocs.forEach(prod => {
      activeProducts.push(prod);
      productsMap.set(prod.id, prod);
      const code = (prod as any).code || prod.productCode;
      if (code) {
        activeProductsByCode.set(code, prod);
      }
    });

    // 3. Index Inventory Balances
    const rawBalancesByProdId = new Map<string, Map<string, InventoryBalance>>();
    balancesDocs.forEach(data => {
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

    stoDocs.forEach(sto => {
      siteStoRequirements.push(sto);

      if (sto.productId) {
        if (!stoRequirementsByProductId.has(sto.productId)) {
          stoRequirementsByProductId.set(sto.productId, []);
        }
        stoRequirementsByProductId.get(sto.productId)!.push(sto);

        if (sto.status !== 'CANCELLED') {
          const collDate = new Date(sto.barrowCollectionDate as any);
          collDate.setHours(0, 0, 0, 0);

          if (collDate.getTime() >= todayStart.getTime()) {
            const prev = outstandingStoCasesByProductId.get(sto.productId) || 0;
            outstandingStoCasesByProductId.set(sto.productId, prev + (sto.cases || 0));
          }
        }
      }
    });

    // 5. Index Planning Rules
    const rawPlanningRulesByProdId = new Map<string, ProductPlanningRule[]>();
    planningRulesDocs.forEach(rule => {
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
        const timeA = new Date((a.modifiedDate || a.createdDate || 0) as any).getTime();
        const timeB = new Date((b.modifiedDate || b.createdDate || 0) as any).getTime();
        return timeB - timeA;
      });

      let activeRule: ProductPlanningRule | null = null;
      for (const rule of rules) {
        const from = new Date(rule.effectiveFrom as any);
        const to = rule.effectiveTo ? new Date(rule.effectiveTo as any) : null;
        if (from <= now && (!to || to > now)) {
          activeRule = rule;
          break;
        }
      }
      planningRulesMap.set(prodId, activeRule || rules[0] || null);
    }

    // 7. Index Promotions & Promotion Rules
    const promotionsMap = new Map<string, Promotion>();
    promotionsDocs.forEach(d => {
      const promo = withPhase(d);
      promotionsMap.set(d.id, promo);
    });

    const promotionRulesByProductId = new Map<string, PromotionProductRule[]>();
    promoRulesDocs.forEach(rule => {
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
    activeRecsFiltered.forEach(rec => {
      activeSiteRecommendations.push(rec);
      if (rec.productId) {
        activeRecommendationsByProductId.set(rec.productId, rec);
      }
    });

    const activePrioritiesByProductId = new Map<string, Priority[]>();
    const activeSitePriorities: Priority[] = [];
    activePrioritiesFiltered.forEach(prio => {
      activeSitePriorities.push(prio);
      if (prio.productId) {
        if (!activePrioritiesByProductId.has(prio.productId)) {
          activePrioritiesByProductId.set(prio.productId, []);
        }
        activePrioritiesByProductId.get(prio.productId)!.push(prio);
      }
    });

    // 9. Construct Candidate Product Sets (UNION) using SNP87 Planning
    const candidateResult = filterRecommendationCandidates({
      activeProducts,
      inventoryTotalsByProductId,
      stoRequirements: siteStoRequirements,
      snp87Rows: activeSnp87Snapshot?.rows || [],
      activeRecommendations: activeSiteRecommendations,
      activePriorities: activeSitePriorities,
      evaluationDate: evalDate
    });

    const {
      candidateProducts,
      positiveInventoryCandidates,
      stoDueTodayCandidates,
      snp87ForecastCandidates,
      snp87ProductionCandidates,
      existingSystemRecCandidates,
      totalCandidates,
      diagnosticLog
    } = candidateResult;

    // Diagnostic logging
    console.log(diagnosticLog);

    // Pre-build ProductPlanningContext for all candidates
    const planningContextsByProductId = new Map<string, ProductPlanningContext>();
    for (const prod of candidateProducts) {
      const pContext = buildProductPlanningContext({
        productId: prod.id,
        productCode: (prod as any).code || prod.productCode,
        productDescription: prod.description,
        activeSnapshot: activeSnp87Snapshot?.importSummary || null,
        snapshotRows: activeSnp87Snapshot?.rows || [],
        evaluationDate: evalDate
      });
      planningContextsByProductId.set(prod.id, pContext);
    }

    // Build preloaded context for evaluation
    const preloadedContext: RecommendationPreloadContext = {
      productsMap,
      inventoryBalancesByProductId,
      inventoryTotalsByProductId,
      planningRulesMap,
      stoRequirementsByProductId,
      outstandingStoCasesByProductId,
      promotionsMap,
      promotionRulesByProductId,
      configuration,
      activeRecommendationsByProductId,
      activePrioritiesByProductId,
      evaluationDate: evalDate,
      planningContextsByProductId,
      activeSnp87Snapshot: activeSnp87Snapshot?.importSummary || null,
      snp87Rows: activeSnp87Snapshot?.rows || []
    };

    // Track SNP87 source imports used in this generation
    const usedSnp87ImportIds = new Set<string>();
    if (activeSnp87Snapshot?.importSummary?.id) {
      usedSnp87ImportIds.add(activeSnp87Snapshot.importSummary.id);
    }

    // Record initial run state
    try {
      await setDocument(SITE_RECOMMENDATION_RUNS_COLLECTION, runId, {
        tenantId,
        siteId,
        generationId,
        status: 'IN_PROGRESS',
        startedAt: new Date().toISOString(),
        startedBy: userId,
        startedByName: userName,
        totalProducts: totalCandidates,
        candidateCount: totalCandidates,
        evaluatedCount: 0,
        currentProductIndex: 0,
        currentProductCode: totalCandidates > 0 ? 'Initializing' : 'None to evaluate',
        generatedCount: 0,
        actionableCount: 0,
        noActionCount: 0,
        conflictsCount: 0,
        failuresCount: 0,
        sourceImportIds: Array.from(usedSnp87ImportIds),
        error: null,
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (startErr) {
      console.warn('Could not record run start (continuing locally):', startErr);
    }

    let count = 0;
    let actionableCount = 0;
    let noActionCount = 0;
    let failuresCount = 0;
    let evaluatedCount = 0;
    const generatedSnapshots: RecommendationAuditSnapshot[] = [];
    let lastFirestoreProgressWrite = 0;

    // Evaluate ONLY candidate products
    for (let i = 0; i < totalCandidates; i++) {
      const product = candidateProducts[i];
      const code = (product as any).code || product.productCode || product.id;

      if (onProgress) {
        onProgress({ current: i + 1, total: totalCandidates, productCode: code });
      }

      // Throttle progress updates (at most every ~1.5s or on final item)
      const now = Date.now();
      if (now - lastFirestoreProgressWrite > 1500 || i === totalCandidates - 1) {
        lastFirestoreProgressWrite = now;
        try {
          await updateDocument(SITE_RECOMMENDATION_RUNS_COLLECTION, runId, {
            currentProductIndex: i + 1,
            totalProducts: totalCandidates,
            currentProductCode: code,
            lastUpdatedAt: new Date().toISOString()
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
        preloadedContext,
        { generationId, userId, userName }
      );
      evaluatedCount++;
      if (res.success) {
        count++;
        if (res.hasAction) {
          actionableCount++;
        } else {
          noActionCount++;
        }
        if (res.snapshot) {
          generatedSnapshots.push(res.snapshot);
          if (res.snapshot.snp87SourceSnapshot?.sourceImportId) {
            usedSnp87ImportIds.add(res.snapshot.snp87SourceSnapshot.sourceImportId);
          }
        }
      } else {
        failuresCount++;
      }
    }

    // Post-generation cleanup: Remove any active system-driven priorities that were NOT updated/regenerated in this run
    const validPrioStatuses = ['SCHEDULED', 'ACTIVE', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'PARTIALLY_COMPLETE'];
    const activeSystemPrioDocs = await getDocuments<Priority>(PRIORITIES_COLLECTION, [
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId),
      where('sourceType', '==', 'RECOMMENDATION')
    ]);

    const toCleanup = activeSystemPrioDocs.filter(p => validPrioStatuses.includes(p.priorityStatus));

    for (const pData of toCleanup) {
      const modTime = pData.modifiedDate ? new Date(pData.modifiedDate as any).getTime() : 0;
      
      // If not touched during this run, cancel & remove
      if (modTime < runStartedAtMs) {
        await updateDocument(PRIORITIES_COLLECTION, pData.id, {
          priorityStatus: 'CANCELLED',
          cancelledAt: new Date().toISOString(),
          modifiedDate: new Date().toISOString(),
          modifiedBy: 'system'
        });
        await deleteDocument(DISPLAY_PRIORITIES_COLLECTION, pData.id);
      }
    }

    // Detect conflicts between newly generated system priorities and existing manual priorities
    const conflicts = await detectPriorityConflicts(tenantId, siteId);

    // Record completion in SiteRecommendationRuns
    try {
      await setDocument(SITE_RECOMMENDATION_RUNS_COLLECTION, runId, {
        tenantId,
        siteId,
        generationId,
        status: 'COMPLETED',
        completedAt: new Date().toISOString(),
        completedBy: userId,
        completedByName: userName,
        totalProducts: totalCandidates,
        candidateCount: totalCandidates,
        evaluatedCount,
        currentProductIndex: totalCandidates,
        currentProductCode: 'Complete',
        generatedCount: count,
        actionableCount,
        noActionCount,
        conflictsCount: conflicts.length,
        failuresCount,
        sourceImportIds: Array.from(usedSnp87ImportIds),
        error: null,
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (completeErr) {
      console.warn('Could not record run completion:', completeErr);
    }

    // Log the comprehensive RECOMMENDATIONS_GENERATED audit event
    try {
      await logAuditEvent({
        tenantId,
        siteId,
        eventType: 'RECOMMENDATIONS_GENERATED',
        entityType: 'RecommendationEngine',
        entityId: generationId,
        summary: `Generated ${actionableCount} recommendations across ${totalCandidates} candidates (${conflicts.length} priority conflicts detected)`,
        performedBy: userId,
        performedByName: userName,
        performedByEmail: userEmail,
        generationId,
        generationStatus: 'COMPLETED',
        generationDurationMs: Date.now() - runStartedAtMs,
        candidateProductsCount: totalCandidates,
        actionableRecommendationsCount: actionableCount,
        operationalPrioritiesCreatedCount: actionableCount,
        noActionCount,
        recommendationSnapshots: generatedSnapshots,
        metadata: {
          sourceImportIds: Array.from(usedSnp87ImportIds),
          evaluationDate: evalDate.toISOString()
        }
      });
    } catch (auditErr) {
      console.warn('Could not log recommendation generation audit event:', auditErr);
    }

    return { success: true, data: { generatedCount: count, conflicts, generationId } };
  } catch (e: any) {
    console.error('Failed to refresh site recommendations:', e);

    try {
      await setDocument(SITE_RECOMMENDATION_RUNS_COLLECTION, runId, {
        tenantId,
        siteId,
        generationId,
        status: 'FAILED',
        error: e?.message || 'Failed to refresh site recommendations',
        lastUpdatedAt: new Date().toISOString()
      });
    } catch {
      // Non-blocking
    }

    try {
      await logAuditEvent({
        tenantId,
        siteId,
        eventType: 'RECOMMENDATIONS_GENERATED',
        entityType: 'RecommendationEngine',
        entityId: generationId,
        summary: `Failed recommendation generation run: ${e?.message || 'Unknown error'}`,
        performedBy: userId,
        performedByName: userName,
        performedByEmail: userEmail,
        generationId,
        generationStatus: 'FAILED',
        generationDurationMs: Date.now() - runStartedAtMs,
        candidateProductsCount: 0,
        actionableRecommendationsCount: 0,
        operationalPrioritiesCreatedCount: 0,
        noActionCount: 0,
        errorMessage: e?.message || 'Unknown error'
      });
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
  userId = 'system'
): Promise<ServiceResult<void>> => {
  try {
    const recData = await getDocument<Recommendation>(RECOMMENDATIONS_COLLECTION, id);
    if (!recData) return { success: false, error: 'Recommendation not found' };

    const updateData: any = {
      recommendationStatus: status,
      reviewedAt: new Date().toISOString(),
      reviewedBy: userId,
      modifiedDate: new Date().toISOString(),
      modifiedBy: userId
    };

    if (decision) updateData.plannerDecision = decision;
    if (flags) updateData.overrideFlags = flags;
    if (reason) updateData.overrideReason = reason;

    await updateDocument(RECOMMENDATIONS_COLLECTION, id, updateData);

    // Sync with operational priority in warehouse if linked
    const linkedPriorityId = recData.linkedPriorityId;
    if (linkedPriorityId) {
      const prioData = await getDocument<Priority>(PRIORITIES_COLLECTION, linkedPriorityId);

      if (prioData) {
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
            modifiedDate: new Date().toISOString(),
            modifiedBy: userId
          };

          await updateDocument(PRIORITIES_COLLECTION, linkedPriorityId, updatedPrio);
          await setDocument(DISPLAY_PRIORITIES_COLLECTION, linkedPriorityId, buildDisplayPriorityDoc({ ...prioData, ...updatedPrio }, linkedPriorityId));

          await logPriorityEvent(
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
          await updateDocument(PRIORITIES_COLLECTION, linkedPriorityId, {
            priorityStatus: 'CANCELLED',
            cancelledAt: new Date().toISOString(),
            modifiedDate: new Date().toISOString(),
            modifiedBy: userId
          });
          await deleteDocument(DISPLAY_PRIORITIES_COLLECTION, linkedPriorityId);

          await logPriorityEvent(
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

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};


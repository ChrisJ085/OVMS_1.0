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

    // 4. Create new recommendation and push directly to warehouse priorities
    if (existingRec) {
      await updateDocument(RECOMMENDATIONS_COLLECTION, existingRec.id, { 
        recommendationStatus: 'SUPERSEDED',
        modifiedDate: new Date().toISOString(),
        modifiedBy: 'system'
      });
    }

    const recId = `rec_${Math.random().toString(36).substring(2, 11)}`;

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
      engineVersion: ENGINE_VERSION,
      decisionOutput: JSON.parse(JSON.stringify(decisionOutput)), // Serialize dates
      sourceSnapshot: JSON.parse(JSON.stringify(inputSnapshot)),
      sourceFingerprint: fingerprint,
      generatedAt: new Date().toISOString(),
      reviewedAt: new Date().toISOString(),
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
      createdDate: new Date().toISOString(),
      modifiedDate: new Date().toISOString(),
      createdBy: 'system',
      modifiedBy: 'system'
    };

    await setDocument(RECOMMENDATIONS_COLLECTION, recId, newRecommendation);

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
  initiatorInfo?: { userId?: string; userName?: string }
): Promise<ServiceResult<{ generatedCount: number; conflicts: PriorityConflict[] }>> => {
  const runId = `${tenantId}_${siteId}`;
  const userName = initiatorInfo?.userName || 'Planner';
  const userId = initiatorInfo?.userId || 'system';

  try {
    const runStartedAtMs = Date.now() - 1000;
    const evalDate = new Date();

    // 1. Fetch all required data for the site in parallel single-batch queries
    const [
      productsDocs,
      balancesDocs,
      stoDocs,
      productionEntriesDocs,
      productionNotesDocs,
      planningRulesDocs,
      promoRulesDocs,
      promotionsDocs,
      configuration,
      activeRecsDocs,
      activePrioritiesDocs
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
      getDocuments<ProductionPlanEntry>('productionPlanEntries', [
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId)
      ]),
      getDocuments<ProductionLinePlanNote>('productionLinePlanNotes', [
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('active', '==', true)
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
      ])
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

    // 5. Index Production Plan Entries, Notes & Imports
    const productionEntriesByProductId = new Map<string, ProductionPlanEntry[]>();
    const siteProductionEntries: ProductionPlanEntry[] = [];
    const distinctImportIds = new Set<string>();

    productionEntriesDocs.forEach(entry => {
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

    const productionLineNotes: ProductionLinePlanNote[] = [...productionNotesDocs];

    // Fetch import upload times for distinct activeImportIds
    const productionImportUploadTimes = new Map<string, Date>();
    if (distinctImportIds.size > 0) {
      await Promise.all(
        Array.from(distinctImportIds).map(async importId => {
          try {
            const importDoc = await getDocument<any>('productionPlanImports', importId);
            if (importDoc) {
              const uploaded = importDoc.uploadedAt
                ? new Date(importDoc.uploadedAt)
                : importDoc.createdDate
                ? new Date(importDoc.createdDate)
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

    // Record initial run state
    try {
      await setDocument(SITE_RECOMMENDATION_RUNS_COLLECTION, runId, {
        tenantId,
        siteId,
        status: 'IN_PROGRESS',
        startedAt: new Date().toISOString(),
        startedBy: userId,
        startedByName: userName,
        totalProducts: totalCandidates,
        currentProductIndex: 0,
        currentProductCode: totalCandidates > 0 ? 'Initializing' : 'None to evaluate',
        generatedCount: 0,
        conflictsCount: 0,
        error: null,
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (startErr) {
      console.warn('Could not record run start (continuing locally):', startErr);
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
        preloadedContext
      );
      if (res.success) {
        count++;
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

    // Record completion
    try {
      await setDocument(SITE_RECOMMENDATION_RUNS_COLLECTION, runId, {
        tenantId,
        siteId,
        status: 'COMPLETED',
        completedAt: new Date().toISOString(),
        completedBy: userId,
        completedByName: userName,
        totalProducts: totalCandidates,
        currentProductIndex: totalCandidates,
        currentProductCode: 'Complete',
        generatedCount: count,
        conflictsCount: conflicts.length,
        error: null,
        lastUpdatedAt: new Date().toISOString()
      });
    } catch (completeErr) {
      console.warn('Could not record run completion:', completeErr);
    }

    return { success: true, data: { generatedCount: count, conflicts } };
  } catch (e: any) {
    console.error('Failed to refresh site recommendations:', e);

    try {
      await setDocument(SITE_RECOMMENDATION_RUNS_COLLECTION, runId, {
        tenantId,
        siteId,
        status: 'FAILED',
        error: e?.message || 'Failed to refresh site recommendations',
        lastUpdatedAt: new Date().toISOString()
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


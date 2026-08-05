import { adminDb } from '../config/firebaseAdmin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { evaluateDecision, ENGINE_VERSION } from '../features/planning/services/decisionEngine';
import { DecisionInputSnapshot, DecisionOutput, DecisionConfiguration } from '../types/decision';
import { ProductPlanningRule } from '../types/planning';
import { Promotion, PromotionProductRule, PromotionWithPhase } from '../types/promotion';

const JOBS_COLLECTION = 'recommendationGenerationJobs';
const RECOMMENDATIONS_COLLECTION = 'recommendations';
const CURRENT_RECOMMENDATIONS_COLLECTION = 'currentRecommendations';
const PRIORITIES_COLLECTION = 'priorities';
const DISPLAY_PRIORITIES_COLLECTION = 'displayPriorities';
const EXCEPTIONS_COLLECTION = 'exceptions';
const PRODUCTS_COLLECTION = 'products';
const INVENTORY_BALANCES_COLLECTION = 'inventoryBalances';
const PLANNING_RULES_COLLECTION = 'planningRules';
const PROMOTIONS_COLLECTION = 'promotions';
const PROMOTION_RULES_COLLECTION = 'promotionProductRules';
const PRODUCTION_ENTRIES_COLLECTION = 'productionPlanEntries';
const DECISION_CONFIGS_COLLECTION = 'decisionConfigurations';

// --- Canonical Fingerprinting (Requirement 9) ---
export function canonicalSerialize(obj: any): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalSerialize).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(k => `${JSON.stringify(k)}:${canonicalSerialize(obj[k])}`);
  return '{' + pairs.join(',') + '}';
}

export function generateCanonicalFingerprint(input: {
  tenantId: string;
  siteId: string;
  productId: string;
  sourceInventorySnapshotId?: string | null;
  inventoryTotal: number | null;
  inventoryLocationBreakdown?: Array<{ locationId: string; quantity: number }>;
  inventoryUpdatedAtISO?: string | null;
  sourceProductionPlanImportId?: string | null;
  productionContext?: {
    isScheduled: boolean;
    isCurrentlyInProduction: boolean;
    plannedCasesNext7Days: number;
    plannedPalletsNext7Days: number;
    daysUntilNextProduction: number | null;
    productionLineId?: string | null;
  } | null;
  productPlanningRuleId?: string | null;
  productPlanningRuleVersion?: string | null;
  productPlanningRuleModifiedDateISO?: string | null;
  thresholds?: {
    minimumQuantity: number;
    targetQuantity: number;
    maximumQuantity: number;
    ddxmRetentionQuantity: number;
    controllingThresholdMode: string;
  } | null;
  preferredDestinationId?: string | null;
  decisionConfigurationVersion?: string | null;
  actionMappings?: Record<string, string>;
  destinationMappings?: Record<string, string>;
  priorityMappings?: Record<string, string>;
  activePromotionIds?: string[];
  promotionRuleValues?: Array<{
    promotionId: string;
    retentionUpliftQuantity?: number | null;
    promotionMinimumOverride?: number | null;
    promotionTargetOverride?: number | null;
    promotionMaximumOverride?: number | null;
    destinationOverrideId?: string | null;
    actionTypeOverrideId?: string | null;
  }>;
  promotionPhaseMap?: Record<string, string>;
  effectiveOverrideState?: {
    hasActiveOverride: boolean;
    overrideActionTypeId?: string | null;
    overrideQuantity?: number | null;
    overrideDestinationId?: string | null;
    overridePriorityLevelId?: string | null;
  } | null;
}): string {
  const serialized = canonicalSerialize(input);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

// --- Worker & Job Processor ---

export class RecommendationBackendService {
  private static workerId = `worker_${process.pid}_${Math.random().toString(36).slice(2, 7)}`;

  /**
   * Claim and execute a queued job transactionally (Requirement 3)
   */
  public static async claimAndProcessNextJob(): Promise<boolean> {
    const now = Date.now();
    const leaseDurationMs = 5 * 60 * 1000; // 5 minutes
    const leaseExpiresAt = Timestamp.fromMillis(now + leaseDurationMs);

    let claimedJobId: string | null = null;

    try {
      await adminDb.runTransaction(async (tx) => {
        // Query for QUEUED jobs or expired lease IN_PROGRESS jobs
        const queuedQuery = adminDb
          .collection(JOBS_COLLECTION)
          .where('status', '==', 'QUEUED')
          .limit(1);

        const queuedSnap = await tx.get(queuedQuery);

        let jobDocRef: FirebaseFirestore.DocumentReference | null = null;
        let jobData: any = null;

        if (!queuedSnap.empty) {
          jobDocRef = queuedSnap.docs[0].ref;
          jobData = queuedSnap.docs[0].data();
        } else {
          // Check for stalled IN_PROGRESS jobs with expired lease
          const expiredQuery = adminDb
            .collection(JOBS_COLLECTION)
            .where('status', '==', 'IN_PROGRESS')
            .where('leaseExpiresAt', '<', Timestamp.fromMillis(now))
            .limit(1);

          const expiredSnap = await tx.get(expiredQuery);
          if (!expiredSnap.empty) {
            const data = expiredSnap.docs[0].data();
            const attempts = data.attemptCount || 1;
            const maxAttempts = data.maxAttempts || 3;
            if (attempts < maxAttempts) {
              jobDocRef = expiredSnap.docs[0].ref;
              jobData = data;
            }
          }
        }

        if (!jobDocRef || !jobData) {
          return; // No job to claim
        }

        claimedJobId = jobDocRef.id;

        tx.update(jobDocRef, {
          status: 'IN_PROGRESS',
          workerId: this.workerId,
          startedAt: FieldValue.serverTimestamp(),
          leaseExpiresAt,
          attemptCount: FieldValue.increment(1),
          modifiedBy: 'system',
          modifiedDate: FieldValue.serverTimestamp()
        });
      });

      if (claimedJobId) {
        await this.processJob(claimedJobId);
        return true;
      }
    } catch (err) {
      console.error('[RecommendationBackendService] Error claiming job:', err);
    }

    return false;
  }

  /**
   * Execute recommendation generation for a specific job ID
   */
  public static async processJob(jobId: string): Promise<void> {
    const jobRef = adminDb.collection(JOBS_COLLECTION).doc(jobId);
    const jobSnap = await jobRef.get();

    if (!jobSnap.exists) {
      console.error(`[RecommendationBackendService] Job ${jobId} not found`);
      return;
    }

    const job = jobSnap.data()!;
    const {
      tenantId,
      siteId,
      triggerType,
      triggerReferenceId,
      sourceInventorySnapshotId,
      sourceProductionPlanImportId,
      requestedBy,
      productIds
    } = job;

    console.log(`[RecommendationBackendService] Processing job ${jobId} for tenant ${tenantId}, site ${siteId}, trigger ${triggerType}`);

    let processedCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;
    let supersededCount = 0;
    let withdrawnCount = 0;
    let failedCount = 0;
    const errors: Array<{ productId?: string; productCode?: string; message: string; timestamp: string }> = [];

    try {
      // 1. Fetch Decision Configuration
      const configSnap = await adminDb
        .collection(DECISION_CONFIGS_COLLECTION)
        .where('tenantId', '==', tenantId)
        .where('siteId', '==', siteId)
        .limit(1)
        .get();

      let configuration: DecisionConfiguration | null = null;
      if (!configSnap.empty) {
        configuration = configSnap.docs[0].data() as DecisionConfiguration;
      }

      // 2. Fetch Master Lookups
      const actionTypesMap = new Map<string, string>();
      const destinationsMap = new Map<string, string>();
      const priorityLevelsMap = new Map<string, string>();

      const atSnap = await adminDb.collection('actionTypes').where('tenantId', '==', tenantId).get();
      atSnap.forEach(d => actionTypesMap.set(d.id, d.data().name || d.data().label || d.id));

      const destSnap = await adminDb.collection('destinations').where('tenantId', '==', tenantId).get();
      destSnap.forEach(d => destinationsMap.set(d.id, d.data().name || d.data().label || d.id));

      const plSnap = await adminDb.collection('priorityLevels').where('tenantId', '==', tenantId).get();
      plSnap.forEach(d => priorityLevelsMap.set(d.id, d.data().name || d.data().label || d.id));

      // 3. Resolve Products to evaluate
      let productsToEvaluate: Array<any> = [];
      if (productIds && Array.isArray(productIds) && productIds.length > 0) {
        for (const pid of productIds) {
          const pDoc = await adminDb.collection(PRODUCTS_COLLECTION).doc(pid).get();
          if (pDoc.exists) {
            productsToEvaluate.push({ id: pDoc.id, ...pDoc.data() });
          }
        }
      } else {
        const pSnap = await adminDb
          .collection(PRODUCTS_COLLECTION)
          .where('tenantId', '==', tenantId)
          .where('status', '==', 'active')
          .get();
        pSnap.forEach(d => productsToEvaluate.push({ id: d.id, ...d.data() }));
      }

      // Update total product count
      await jobRef.update({
        productCount: productsToEvaluate.length,
        modifiedDate: FieldValue.serverTimestamp()
      });

      // 4. Evaluate each product in bounded batches
      const batchSize = 20;
      for (let i = 0; i < productsToEvaluate.length; i += batchSize) {
        const batchProducts = productsToEvaluate.slice(i, i + batchSize);

        for (const product of batchProducts) {
          processedCount++;
          const productId = product.id;
          const productCode = product.productCode || product.code || productId;
          const description = product.description || product.name || '';

          try {
            // A. Fetch Inventory Balances
            const invSnap = await adminDb
              .collection(INVENTORY_BALANCES_COLLECTION)
              .where('tenantId', '==', tenantId)
              .where('siteId', '==', siteId)
              .where('productId', '==', productId)
              .get();

            let inventoryTotal: number | null = null;
            let inventoryUpdatedAt: Date | null = null;
            const inventoryLocationBreakdown: Array<{ locationId: string; quantity: number }> = [];

            if (!invSnap.empty) {
              let total = 0;
              let maxUpdatedMs = 0;
              invSnap.forEach(d => {
                const data = d.data();
                const qoh = typeof data.quantityOnHand === 'number' ? data.quantityOnHand : 0;
                total += qoh;
                inventoryLocationBreakdown.push({ locationId: data.locationId || d.id, quantity: qoh });

                const updated = data.modifiedDate || data.updatedAt || data.sourceUpdatedAt;
                if (updated && typeof updated.toDate === 'function') {
                  const ms = updated.toDate().getTime();
                  if (ms > maxUpdatedMs) maxUpdatedMs = ms;
                }
              });
              inventoryTotal = total;
              if (maxUpdatedMs > 0) inventoryUpdatedAt = new Date(maxUpdatedMs);
            }

            // B. Fetch Active Planning Rule
            const rulesSnap = await adminDb
              .collection(PLANNING_RULES_COLLECTION)
              .where('tenantId', '==', tenantId)
              .where('siteId', '==', siteId)
              .where('productId', '==', productId)
              .where('status', '==', 'active')
              .get();

            let planningRule: ProductPlanningRule | null = null;
            if (!rulesSnap.empty) {
              const rDoc = rulesSnap.docs[0];
              planningRule = { id: rDoc.id, ...rDoc.data() } as ProductPlanningRule;
            }

            // C. Fetch Production Context (MPPS)
            const prodSnap = await adminDb
              .collection(PRODUCTION_ENTRIES_COLLECTION)
              .where('tenantId', '==', tenantId)
              .where('siteId', '==', siteId)
              .where('productId', '==', productId)
              .get();

            let productionContext: any = null;
            if (!prodSnap.empty) {
              let plannedCases = 0;
              let isScheduled = false;
              let isCurrentlyInProduction = false;
              let daysUntil: number | null = null;

              const nowMs = Date.now();
              const sevenDaysMs = nowMs + 7 * 24 * 60 * 60 * 1000;

              prodSnap.forEach(d => {
                const data = d.data();
                if (data.status === 'PLANNED' || data.status === 'RUNNING') {
                  isScheduled = true;
                  if (data.status === 'RUNNING') isCurrentlyInProduction = true;

                  const plannedQty = data.plannedCases || data.quantityCases || 0;
                  plannedCases += plannedQty;

                  const start = data.plannedStartDate || data.startDate;
                  if (start && typeof start.toDate === 'function') {
                    const startMs = start.toDate().getTime();
                    if (startMs >= nowMs && startMs <= sevenDaysMs) {
                      const diffDays = Math.ceil((startMs - nowMs) / (1000 * 60 * 60 * 24));
                      if (daysUntil === null || diffDays < daysUntil) daysUntil = diffDays;
                    }
                  }
                }
              });

              productionContext = {
                isScheduled,
                isCurrentlyInProduction,
                plannedCasesNext7Days: plannedCases,
                plannedPalletsNext7Days: Math.ceil(plannedCases / (product.casesPerPallet || 100)),
                daysUntilNextProduction: daysUntil,
                dataFreshnessStatus: 'FRESH',
                productionRiskStatus: 'LOW_RISK',
                sourceImportId: sourceProductionPlanImportId || null
              };
            }

            // D. Fetch Active Promotions
            const promoRulesSnap = await adminDb
              .collection(PROMOTION_RULES_COLLECTION)
              .where('tenantId', '==', tenantId)
              .where('siteId', '==', siteId)
              .where('productId', '==', productId)
              .where('status', '==', 'active')
              .get();

            const activePromotionImpacts: Array<{ promotion: PromotionWithPhase; rule: PromotionProductRule }> = [];
            const activePromotionIds: string[] = [];

            if (!promoRulesSnap.empty) {
              for (const rDoc of promoRulesSnap.docs) {
                const pRule = { id: rDoc.id, ...rDoc.data() } as PromotionProductRule;
                if (pRule.promotionId) {
                  const pDoc = await adminDb.collection(PROMOTIONS_COLLECTION).doc(pRule.promotionId).get();
                  if (pDoc.exists) {
                    const promoData = pDoc.data() as Promotion;
                    if (promoData.status === 'active' && promoData.promotionStatus !== 'CANCELLED' && promoData.promotionStatus !== 'COMPLETED') {
                      const promoWithPhase: PromotionWithPhase = {
                        ...promoData,
                        id: pDoc.id,
                        phase: 'ACTIVE' // Simplified phase resolution for backend evaluation
                      };
                      activePromotionImpacts.push({ promotion: promoWithPhase, rule: pRule });
                      activePromotionIds.push(pDoc.id);
                    }
                  }
                }
              }
            }

            // E. Fetch Existing Current Recommendation Doc
            const currentDocId = `${tenantId}_${siteId}_${productId}`;
            const currentDocRef = adminDb.collection(CURRENT_RECOMMENDATIONS_COLLECTION).doc(currentDocId);
            const currentDocSnap = await currentDocRef.get();
            const existingCurrentDoc = currentDocSnap.exists ? currentDocSnap.data() : null;

            const existingActiveOverride = existingCurrentDoc?.activeOverride || null;
            const hasActiveOverride = Boolean(existingActiveOverride && existingActiveOverride.status === 'ACTIVE');

            // F. Build Input Snapshot & Strengthened Canonical Fingerprint (Requirement 8 & 9)
            const evaluationTime = new Date();

            const inputSnapshot: DecisionInputSnapshot = {
              tenantId,
              siteId,
              productId,
              productCodeSnapshot: productCode,
              descriptionSnapshot: description,
              inventoryTotal: inventoryTotal !== null ? inventoryTotal : 0,
              inventoryByLocation: [],
              planningRule: planningRule || null,
              productionContext,
              activePromotionImpacts,
              existingActivePriorities: [],
              inventoryUpdatedAt: inventoryUpdatedAt || null,
              evaluationTime,
              configuration: configuration || null
            };

            const ruleVersion = planningRule ? (
              planningRule.modifiedDate && typeof (planningRule.modifiedDate as any).toDate === 'function'
                ? (planningRule.modifiedDate as any).toDate().toISOString()
                : (planningRule.createdDate && typeof (planningRule.createdDate as any).toDate === 'function'
                    ? (planningRule.createdDate as any).toDate().toISOString()
                    : planningRule.id)
            ) : null;

            const canonicalFingerprint = generateCanonicalFingerprint({
              tenantId,
              siteId,
              productId,
              sourceInventorySnapshotId: sourceInventorySnapshotId || null,
              inventoryTotal,
              inventoryLocationBreakdown,
              inventoryUpdatedAtISO: inventoryUpdatedAt ? inventoryUpdatedAt.toISOString() : null,
              sourceProductionPlanImportId: sourceProductionPlanImportId || null,
              productionContext,
              productPlanningRuleId: planningRule?.id || null,
              productPlanningRuleVersion: ruleVersion,
              productPlanningRuleModifiedDateISO: ruleVersion,
              thresholds: planningRule ? {
                minimumQuantity: planningRule.minimumQuantity,
                targetQuantity: planningRule.targetQuantity,
                maximumQuantity: planningRule.maximumQuantity,
                ddxmRetentionQuantity: planningRule.ddxmRetentionQuantity,
                controllingThresholdMode: planningRule.controllingThresholdMode
              } : null,
              preferredDestinationId: planningRule?.preferredDestinationId || null,
              decisionConfigurationVersion: configuration?.configurationVersion || null,
              activePromotionIds,
              effectiveOverrideState: hasActiveOverride ? {
                hasActiveOverride: true,
                overrideActionTypeId: existingActiveOverride.recommendedActionTypeId,
                overrideQuantity: existingActiveOverride.recommendedQuantity,
                overrideDestinationId: existingActiveOverride.recommendedDestinationId,
                overridePriorityLevelId: existingActiveOverride.recommendedPriorityLevelId
              } : null
            });

            // G. Evaluate Decision Engine
            const decisionOutput = evaluateDecision(inputSnapshot, configuration || undefined);

            // Requirement 8: Handle Missing Inventory Cleanly
            const isMissingInventory = inventoryTotal === null;
            if (isMissingInventory) {
              decisionOutput.planningBandStatus = 'UNKNOWN';
              decisionOutput.dataQualityStatus = 'MISSING_INVENTORY';
              if (!decisionOutput.dataQualityIssues.some(i => i.code === 'MISSING_INVENTORY')) {
                decisionOutput.dataQualityIssues.push({
                  code: 'MISSING_INVENTORY',
                  severity: 'BLOCKING',
                  blocking: true,
                  message: `Inventory balance missing/unknown for product ${productCode}.`,
                  sourceArea: 'INVENTORY'
                });
              }
            }

            // H. Deduplicate Exceptions (Requirement 12)
            const hasBlockingIssues = decisionOutput.dataQualityIssues.some(i => i.blocking) || isMissingInventory;

            if (hasBlockingIssues) {
              const primaryCode = isMissingInventory ? 'MISSING_INVENTORY' : (decisionOutput.dataQualityStatus || 'VALIDATION_FAILURE');
              const excId = `exc_${tenantId}_${siteId}_${productId}_${primaryCode}`;

              const excRef = adminDb.collection(EXCEPTIONS_COLLECTION).doc(excId);
              const excSnap = await excRef.get();
              const existingExc = excSnap.exists ? excSnap.data() : null;

              const issueMsg = decisionOutput.dataQualityIssues.find(i => i.blocking)?.message || 'Engine validation failed.';

              await excRef.set({
                id: excId,
                tenantId,
                siteId,
                productId,
                productCodeSnapshot: productCode,
                descriptionSnapshot: description,
                category: primaryCode,
                status: 'OPEN',
                severity: 'BLOCKING',
                message: issueMsg,
                sourceFingerprint: canonicalFingerprint,
                firstDetectedAt: existingExc?.firstDetectedAt || FieldValue.serverTimestamp(),
                lastDetectedAt: FieldValue.serverTimestamp(),
                occurrenceCount: (existingExc?.occurrenceCount || 0) + 1,
                modifiedDate: FieldValue.serverTimestamp(),
                createdBy: 'system',
                modifiedBy: 'system'
              }, { merge: true });
            } else {
              // Generation succeeded! Resolve open exceptions for this product (Requirement 12)
              const openExcSnap = await adminDb
                .collection(EXCEPTIONS_COLLECTION)
                .where('tenantId', '==', tenantId)
                .where('siteId', '==', siteId)
                .where('productId', '==', productId)
                .where('status', '==', 'OPEN')
                .get();

              for (const excDoc of openExcSnap.docs) {
                await excDoc.ref.update({
                  status: 'RESOLVED',
                  resolvedAt: FieldValue.serverTimestamp(),
                  resolutionNotes: 'Automatically resolved by successful backend engine execution.',
                  modifiedBy: 'system',
                  modifiedDate: FieldValue.serverTimestamp()
                });
              }
            }

            // I. Determine Auto-Publish Eligibility
            let recStatus: string = 'AUTO_PUBLISHED';
            if (hasBlockingIssues) {
              recStatus = 'FAILED_VALIDATION';
            } else if (hasActiveOverride) {
              recStatus = 'OVERRIDDEN';
            }

            const isAutoPublishable = recStatus === 'AUTO_PUBLISHED';

            // J. Handle Separated System Recommendation vs. Override (Requirement 11)
            const systemRecommendationRecord = {
              tenantId,
              siteId,
              productId,
              productCodeSnapshot: productCode,
              descriptionSnapshot: description,
              fingerprint: canonicalFingerprint,
              recommendedActionTypeId: decisionOutput.recommendedActionTypeId,
              actionTypeLabel: decisionOutput.recommendedActionTypeId ? (actionTypesMap.get(decisionOutput.recommendedActionTypeId) || decisionOutput.recommendedActionTypeId) : null,
              recommendedQuantity: decisionOutput.recommendedQuantity,
              recommendedDestinationId: decisionOutput.recommendedDestinationId,
              destinationLabel: decisionOutput.recommendedDestinationId ? (destinationsMap.get(decisionOutput.recommendedDestinationId) || decisionOutput.recommendedDestinationId) : null,
              recommendedPriorityLevelId: decisionOutput.recommendedPriorityLevelId,
              priorityLevelLabel: decisionOutput.recommendedPriorityLevelId ? (priorityLevelsMap.get(decisionOutput.recommendedPriorityLevelId) || decisionOutput.recommendedPriorityLevelId) : null,
              planningBandStatus: decisionOutput.planningBandStatus,
              dataQualityStatus: decisionOutput.dataQualityStatus,
              reasonCodes: decisionOutput.reasonCodes,
              explanation: decisionOutput.explanationLines,
              engineVersion: ENGINE_VERSION,
              evaluatedAt: FieldValue.serverTimestamp()
            };

            const systemDiffersFromOverride = hasActiveOverride && (
              existingActiveOverride.recommendedActionTypeId !== decisionOutput.recommendedActionTypeId ||
              existingActiveOverride.recommendedQuantity !== decisionOutput.recommendedQuantity ||
              existingActiveOverride.recommendedDestinationId !== decisionOutput.recommendedDestinationId ||
              existingActiveOverride.recommendedPriorityLevelId !== decisionOutput.recommendedPriorityLevelId
            );

            const effectiveInstruction = hasActiveOverride ? {
              actionTypeId: existingActiveOverride.recommendedActionTypeId,
              quantity: existingActiveOverride.recommendedQuantity,
              destinationId: existingActiveOverride.recommendedDestinationId,
              priorityLevelId: existingActiveOverride.recommendedPriorityLevelId,
              isOverride: true,
              overrideReason: existingActiveOverride.plannerReason || 'Planner override'
            } : {
              actionTypeId: decisionOutput.recommendedActionTypeId,
              quantity: decisionOutput.recommendedQuantity,
              destinationId: decisionOutput.recommendedDestinationId,
              priorityLevelId: decisionOutput.recommendedPriorityLevelId,
              isOverride: false
            };

            // K. Source Metadata (Requirement 13)
            const sourceMetadata = {
              triggerType,
              triggerReferenceId: triggerReferenceId || null,
              sourceInventorySnapshotId: sourceInventorySnapshotId || null,
              sourceProductionPlanImportId: sourceProductionPlanImportId || null,
              productPlanningRuleId: planningRule?.id || null,
              productPlanningRuleVersion: ruleVersion,
              productPlanningRuleModifiedDate: ruleVersion,
              decisionConfigurationVersion: configuration?.configurationVersion || 'v1.0.0',
              promotionIds: activePromotionIds,
              engineVersion: ENGINE_VERSION
            };

            // L. Update Current Recommendation Document (Requirement 10)
            const currentDocData = {
              id: currentDocId,
              tenantId,
              siteId,
              productId,
              productCodeSnapshot: productCode,
              descriptionSnapshot: description,
              recommendationStatus: recStatus,
              currentSystemRecommendation: systemRecommendationRecord,
              effectiveInstruction,
              activeOverride: existingActiveOverride || null,
              hasActiveOverride,
              systemDiffersFromOverride,
              fingerprint: canonicalFingerprint,
              sourceMetadata,
              // Requirement 8: Do not set inventoryUpdatedAt if inventory is missing
              inventoryUpdatedAt: isMissingInventory ? null : (inventoryUpdatedAt ? Timestamp.fromDate(inventoryUpdatedAt) : null),
              inventoryTotal: isMissingInventory ? null : inventoryTotal,
              createdDate: existingCurrentDoc?.createdDate || FieldValue.serverTimestamp(),
              modifiedDate: FieldValue.serverTimestamp(),
              createdBy: existingCurrentDoc?.createdBy || 'system',
              modifiedBy: 'system'
            };

            await currentDocRef.set(currentDocData, { merge: true });

            // M. Write Recommendation History Record
            const historyId = `rec_${Date.now()}_${productId}_${canonicalFingerprint.slice(0, 8)}`;
            await adminDb.collection(RECOMMENDATIONS_COLLECTION).doc(historyId).set({
              ...currentDocData,
              id: historyId,
              recommendationJobId: jobId,
              historyTimestamp: FieldValue.serverTimestamp()
            });

            if (!existingCurrentDoc) {
              createdCount++;
            } else if (existingCurrentDoc.fingerprint !== canonicalFingerprint) {
              updatedCount++;
            } else {
              unchangedCount++;
            }

            // N. Publish Priority & Display Priority if AUTO_PUBLISHED (Requirement 1, 2)
            if (isAutoPublishable && decisionOutput.recommendedActionTypeId && decisionOutput.recommendedQuantity > 0) {
              const priorityId = `prio_auto_${tenantId}_${siteId}_${productId}`;
              const priorityRef = adminDb.collection(PRIORITIES_COLLECTION).doc(priorityId);

              const priorityData = {
                id: priorityId,
                tenantId,
                siteId,
                sourceType: 'SYSTEM_RECOMMENDATION',
                sourceRecommendationId: historyId,
                productId,
                productCodeSnapshot: productCode,
                descriptionSnapshot: description,
                title: `${actionTypesMap.get(decisionOutput.recommendedActionTypeId) || 'Action'} - ${productCode}`,
                instruction: `Auto-published System Recommendation for ${productCode}: ${decisionOutput.recommendedQuantity} units to ${destinationsMap.get(decisionOutput.recommendedDestinationId || '') || 'Destination'}`,
                actionTypeId: decisionOutput.recommendedActionTypeId,
                actionTypeLabel: actionTypesMap.get(decisionOutput.recommendedActionTypeId) || decisionOutput.recommendedActionTypeId,
                requestedQuantity: decisionOutput.recommendedQuantity,
                plannedQuantity: decisionOutput.recommendedQuantity,
                destinationId: decisionOutput.recommendedDestinationId,
                destinationLabel: destinationsMap.get(decisionOutput.recommendedDestinationId || '') || decisionOutput.recommendedDestinationId,
                priorityLevelId: decisionOutput.recommendedPriorityLevelId,
                priorityLevelLabel: priorityLevelsMap.get(decisionOutput.recommendedPriorityLevelId || '') || decisionOutput.recommendedPriorityLevelId,
                priorityStatus: 'ACTIVE',
                publishedAt: FieldValue.serverTimestamp(),
                createdBy: 'system',
                createdDate: FieldValue.serverTimestamp(),
                modifiedBy: 'system',
                modifiedDate: FieldValue.serverTimestamp()
              };

              await priorityRef.set(priorityData, { merge: true });

              // Display Priority Projection (Requirement 1, 2)
              const displayPriorityId = `disp_${priorityId}`;
              await adminDb.collection(DISPLAY_PRIORITIES_COLLECTION).doc(displayPriorityId).set({
                id: displayPriorityId,
                sourcePriorityId: priorityId,
                tenantId,
                siteId,
                priorityCode: priorityId.slice(0, 12),
                productCodeSnapshot: productCode,
                descriptionSnapshot: description,
                title: priorityData.title,
                instruction: priorityData.instruction,
                priorityStatus: 'ACTIVE',
                priorityLevelId: priorityData.priorityLevelId,
                priorityLevelLabel: priorityData.priorityLevelLabel,
                actionTypeId: priorityData.actionTypeId,
                actionTypeLabel: priorityData.actionTypeLabel,
                requestedQuantity: priorityData.requestedQuantity,
                progressQuantity: 0,
                progressPercent: 0,
                destinationId: priorityData.destinationId,
                destinationLabel: priorityData.destinationLabel,
                createdDate: FieldValue.serverTimestamp(),
                modifiedDate: FieldValue.serverTimestamp()
              }, { merge: true });
            }

          } catch (productErr: any) {
            failedCount++;
            errors.push({
              productId,
              productCode: product.productCode || productId,
              message: productErr.message || 'Error processing product recommendation',
              timestamp: new Date().toISOString()
            });
            console.error(`[RecommendationBackendService] Error processing product ${productId}:`, productErr);
          }
        }
      }

      // 5. Finalize Job Status
      const finalStatus = failedCount === 0 ? 'COMPLETED' : (processedCount > failedCount ? 'COMPLETED_WITH_WARNINGS' : 'FAILED');

      await jobRef.update({
        status: finalStatus,
        completedAt: FieldValue.serverTimestamp(),
        leaseExpiresAt: null,
        processedCount,
        createdCount,
        updatedCount,
        unchangedCount,
        supersededCount,
        withdrawnCount,
        failedCount,
        errors,
        modifiedDate: FieldValue.serverTimestamp()
      });

      console.log(`[RecommendationBackendService] Job ${jobId} finished with status ${finalStatus}. Processed ${processedCount} products.`);

    } catch (jobErr: any) {
      console.error(`[RecommendationBackendService] Job ${jobId} fatal error:`, jobErr);
      await jobRef.update({
        status: 'FAILED',
        completedAt: FieldValue.serverTimestamp(),
        leaseExpiresAt: null,
        failedCount: processedCount || 1,
        errors: [{ message: jobErr.message || 'Fatal job failure', timestamp: new Date().toISOString() }],
        modifiedDate: FieldValue.serverTimestamp()
      });
    }
  }
}

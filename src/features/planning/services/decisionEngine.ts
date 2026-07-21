import { DecisionInputSnapshot, DecisionOutput, DataQualityStatus, ReasonCode, DecisionException, ThresholdBreakdown } from '../../../types/decision';
import { PlanningBandStatus } from '../../../types/planning';

// We need a baseline action lookup or hardcoded fallback.
// In a real app we'd fetch ActionType IDs from configuration.
// For now, we'll use placeholder IDs and assume the UI resolves them or we use generic codes.
const FALLBACK_ACTIONS = {
  HOLD: 'ACTION_HOLD',
  REVIEW: 'ACTION_REVIEW',
  RELEASE: 'ACTION_RELEASE',
};

const FALLBACK_PRIORITIES = {
  URGENT: 'PRIORITY_URGENT',
  NORMAL: 'PRIORITY_NORMAL',
  LOW: 'PRIORITY_LOW',
};

export const evaluateDecision = (input: DecisionInputSnapshot): DecisionOutput => {
  const {
    productId,
    inventoryTotal,
    planningRule,
    productionContext,
    activePromotionImpacts,
    inventoryUpdatedAt,
    evaluationTime
  } = input;

  const reasonCodes: ReasonCode[] = [];
  const explanationLines: string[] = [];
  const exceptions: DecisionException[] = [];
  
  // 1. Data Quality Checks
  let dataQualityStatus: DataQualityStatus = 'COMPLETE';
  
  if (!planningRule) {
    dataQualityStatus = 'PLANNING_RULE_MISSING';
    explanationLines.push('Missing base planning rule for this product.');
  } else if (inventoryUpdatedAt && (evaluationTime.getTime() - inventoryUpdatedAt.getTime()) > 24 * 60 * 60 * 1000) {
    dataQualityStatus = 'INVENTORY_STALE';
    reasonCodes.push('STALE_INVENTORY');
    exceptions.push({ message: 'Inventory data is older than 24 hours.', severity: 'WARNING' });
  } else if (!productionContext) {
    dataQualityStatus = 'PRODUCTION_DATA_MISSING';
  } else if (activePromotionImpacts.length > 1) {
    dataQualityStatus = 'PROMOTION_CONFLICT';
    exceptions.push({ message: 'Multiple overlapping promotions active. Impacts have been combined, which may yield unexpected results.', severity: 'WARNING' });
  }

  // Handle critical missing data
  if (dataQualityStatus === 'PLANNING_RULE_MISSING' || dataQualityStatus === 'PRODUCTION_DATA_MISSING') {
    return {
      productId,
      planningBandStatus: 'UNKNOWN',
      effectiveMinimum: { baseValue: 0, promotionAdjustment: 0, effectiveValue: 0 },
      effectiveTarget: { baseValue: 0, promotionAdjustment: 0, effectiveValue: 0 },
      effectiveMaximum: { baseValue: 0, promotionAdjustment: 0, effectiveValue: 0 },
      effectiveDDXM: { baseValue: 0, promotionAdjustment: 0, effectiveValue: 0 },
      controllingRetention: 0,
      availableToRelease: 0,
      shortfallQuantity: 0,
      headroomToMaximum: 0,
      recommendedActionTypeId: FALLBACK_ACTIONS.REVIEW,
      recommendedQuantity: 0,
      recommendedDestinationId: null,
      recommendedPriorityLevelId: FALLBACK_PRIORITIES.URGENT,
      reasonCodes: ['REVIEW_REQUIRED'],
      explanationLines,
      exceptions,
      dataQualityStatus,
      sourceSnapshot: input,
      evaluatedAt: evaluationTime
    };
  }

  // 2. Extract production context fields safely
  const {
    isScheduled = false,
    isCurrentlyInProduction = false,
    currentProductionLine = null,
    currentProductionDate = null,
    plannedCasesToday = 0,
    plannedPalletsToday = 0,
    plannedCasesNext7Days = 0,
    plannedPalletsNext7Days = 0,
    nextProductionDate = null,
    daysUntilNextProduction = null,
    lastProductionDate = null,
    plannerProductionStatus = null,
    activeProductionNotes = [],
    hasDelay = false,
    hasShutdown = false,
    hasMaintenance = false,
    hasTrial = false,
    sourceImportId = null,
    sourceUpdatedAt = null,
    dataFreshnessStatus = 'MISSING',
    productionRiskStatus = 'SOURCE_MISSING'
  } = productionContext || {};

  // Add Production Reason Codes
  if (isCurrentlyInProduction) {
    reasonCodes.push('PRODUCTION_RUNNING');
  }
  if (plannedPalletsToday > 0) {
    reasonCodes.push('PRODUCTION_SCHEDULED_TODAY');
  }
  if (daysUntilNextProduction !== null && daysUntilNextProduction <= 7) {
    reasonCodes.push('PRODUCTION_DUE_WITHIN_WINDOW');
  }
  if (!isScheduled) {
    reasonCodes.push('NO_FUTURE_PRODUCTION');
  }
  if (productionRiskStatus === 'DELAYED' || hasDelay) {
    reasonCodes.push('PRODUCTION_DELAYED');
    exceptions.push({ message: 'Production plan has active delay.', severity: 'WARNING' });
  }
  if (productionRiskStatus === 'STOPPED') {
    reasonCodes.push('PRODUCTION_STOPPED');
    exceptions.push({ message: 'Production is STOPPED on the line.', severity: 'ERROR' });
  }
  if (hasMaintenance) {
    reasonCodes.push('PRODUCTION_MAINTENANCE');
    exceptions.push({ message: 'Line is scheduled for MAINTENANCE across planned dates.', severity: 'WARNING' });
  }
  if (hasTrial) {
    reasonCodes.push('PRODUCTION_TRIAL');
  }
  if (dataFreshnessStatus === 'STALE') {
    reasonCodes.push('PRODUCTION_SOURCE_STALE');
    exceptions.push({ message: 'SAP production import is STALE (older than 24 hours).', severity: 'WARNING' });
  }
  if (dataFreshnessStatus === 'MISSING') {
    reasonCodes.push('PRODUCTION_SOURCE_MISSING');
  }

  // 3. Calculate Effective Thresholds
  const baseMin = planningRule!.minimumQuantity;
  const baseTarget = planningRule!.targetQuantity;
  const baseMax = planningRule!.maximumQuantity;
  const baseDDXM = planningRule!.ddxmRetentionQuantity;

  let minOverride: number | null = null;
  let targetOverride: number | null = null;
  let maxOverride: number | null = null;
  let retentionUplift = 0;
  let destOverride: string | null = null;
  let actionOverride: string | null = null;
  let prioUplift = 0;

  const isPromoActive = activePromotionImpacts.length > 0;
  activePromotionImpacts.forEach(impact => {
    const r = impact.rule;
    const p = impact.promotion;
    
    if (r.promotionMinimumOverride !== null) minOverride = Math.max(minOverride ?? 0, r.promotionMinimumOverride);
    if (r.promotionTargetOverride !== null) targetOverride = Math.max(targetOverride ?? 0, r.promotionTargetOverride);
    if (r.promotionMaximumOverride !== null) maxOverride = Math.max(maxOverride ?? 0, r.promotionMaximumOverride);
    if (r.retentionUpliftQuantity !== null) retentionUplift += r.retentionUpliftQuantity;
    if (r.destinationOverrideId) destOverride = r.destinationOverrideId;
    if (r.actionTypeOverrideId) actionOverride = r.actionTypeOverrideId;
    if (r.priorityWeightUplift > 0) prioUplift += r.priorityWeightUplift;

    if (p.phase === 'ACTIVE') reasonCodes.push('PROMOTION_ACTIVE');
    if (p.phase === 'PRE_BUILD') reasonCodes.push('PROMOTION_PRE_BUILD');
  });

  const effMin = (minOverride !== null ? minOverride : baseMin) + retentionUplift;
  const effTarget = Math.max(effMin, (targetOverride !== null ? targetOverride : baseTarget) + retentionUplift);
  const effMax = Math.max(effTarget, (maxOverride !== null ? maxOverride : baseMax) + retentionUplift);
  const effDDXM = baseDDXM; 

  const minBreakdown: ThresholdBreakdown = { baseValue: baseMin, promotionAdjustment: effMin - baseMin, effectiveValue: effMin };
  const targetBreakdown: ThresholdBreakdown = { baseValue: baseTarget, promotionAdjustment: effTarget - baseTarget, effectiveValue: effTarget };
  const maxBreakdown: ThresholdBreakdown = { baseValue: baseMax, promotionAdjustment: effMax - baseMax, effectiveValue: effMax };
  const ddxmBreakdown: ThresholdBreakdown = { baseValue: baseDDXM, promotionAdjustment: 0, effectiveValue: effDDXM };

  // Determine Controlling Retention
  let controllingRetention = 0;
  switch (planningRule!.controllingThresholdMode) {
    case 'HIGHEST_MANDATORY':
      controllingRetention = Math.max(effMin, effDDXM);
      break;
    case 'MINIMUM_ONLY':
      controllingRetention = effMin;
      break;
    case 'DDXM_ONLY':
      controllingRetention = effDDXM;
      break;
    case 'CUSTOM':
      controllingRetention = (planningRule!.customControllingRetentionQuantity || 0) + retentionUplift;
      break;
  }

  // 4. Calculate Inventory Metrics
  const qoh = inventoryTotal;
  const availableToRelease = Math.max(0, qoh - controllingRetention);
  const shortfallQuantity = Math.max(0, controllingRetention - qoh);
  const headroomToMaximum = Math.max(0, effMax - qoh);
  
  let bandStatus: PlanningBandStatus;
  if (qoh < controllingRetention) bandStatus = 'BELOW_CONTROL';
  else if (qoh === controllingRetention) bandStatus = 'AT_CONTROL';
  else if (qoh < effTarget) bandStatus = 'BELOW_TARGET';
  else if (qoh === effTarget) bandStatus = 'AT_TARGET';
  else if (qoh <= effMax) bandStatus = 'ABOVE_TARGET';
  else bandStatus = 'ABOVE_MAXIMUM';

  // 5. Action and Priority Determination
  let recAction = planningRule!.defaultActionTypeId || FALLBACK_ACTIONS.HOLD;
  let recDest = planningRule!.preferredDestinationId;
  let recQty = 0;
  let recPrio = planningRule!.defaultPriorityLevelId || FALLBACK_PRIORITIES.NORMAL;

  // Let's check for existing priorities
  if (input.existingActivePriorities && input.existingActivePriorities.length > 0) {
    reasonCodes.push('EXISTING_PRIORITY');
  }

  // Section-based Recommendation Text Synthesis
  let recommendationSummary = "";

  // 1. BELOW CONTROLLING RETENTION
  if (bandStatus === 'BELOW_CONTROL' || bandStatus === 'AT_CONTROL') {
    reasonCodes.push(bandStatus === 'BELOW_CONTROL' ? 'BELOW_CONTROLLING_RETENTION' : 'AT_CONTROLLING_RETENTION');
    recAction = actionOverride || FALLBACK_ACTIONS.HOLD;
    recQty = 0;
    
    // Escalate priority based on shortfall
    if (shortfallQuantity > effTarget * 0.5) {
      recPrio = FALLBACK_PRIORITIES.URGENT;
    }
    
    recommendationSummary = `Current stock is ${qoh} pallets and the controlling retention requirement is ${controllingRetention} pallets. This leaves ${availableToRelease} pallets available to release from current inventory.`;
    if (plannedPalletsNext7Days > 0) {
      recommendationSummary += ` A further ${plannedPalletsNext7Days} pallets are planned on Line ${currentProductionLine || 'N/A'} over the next ${daysUntilNextProduction !== null ? daysUntilNextProduction : 'few'} days.`;
    }
    if (recDest) {
      recommendationSummary += ` ${recDest} is the preferred destination.`;
    }
    recommendationSummary += ` Recommend holding stock as inventory is below controlling retention.`;

    if (hasDelay || hasShutdown || !isScheduled || productionRiskStatus === 'STOPPED') {
      recommendationSummary += ` Production risks are elevated (${productionRiskStatus}). Review scheduled run immediately.`;
    }
  }
  // 2. BETWEEN CONTROL AND TARGET
  else if (bandStatus === 'BELOW_TARGET') {
    reasonCodes.push('BELOW_TARGET');
    recAction = actionOverride || planningRule!.defaultActionTypeId || FALLBACK_ACTIONS.HOLD;
    recQty = availableToRelease;

    recommendationSummary = `Current stock is ${qoh} pallets and the controlling retention requirement is ${controllingRetention} pallets. This leaves ${availableToRelease} pallets available to release from current inventory.`;
    if (plannedPalletsNext7Days > 0) {
      recommendationSummary += ` A further ${plannedPalletsNext7Days} pallets are planned on Line ${currentProductionLine || 'N/A'} over the next seven days.`;
    }
    if (recDest) {
      recommendationSummary += ` ${recDest} is the preferred destination.`;
    }
    
    // If promotion is active and production is not due soon, increase retention concern
    if (isPromoActive && (!isScheduled || (daysUntilNextProduction !== null && daysUntilNextProduction > 4))) {
      reasonCodes.push('PROMOTION_AND_PRODUCTION_RISK');
      exceptions.push({ message: 'Active promotion with no near production run scheduled.', severity: 'WARNING' });
      recAction = FALLBACK_ACTIONS.HOLD;
      recommendationSummary += ` Active promotion with no near-term scheduled production increases retention concern. Recommended action set to HOLD.`;
    } else {
      recommendationSummary += ` Recommend holding or shipping as per rule configuration.`;
    }
  }
  // 3. AT OR ABOVE TARGET
  else if (bandStatus === 'AT_TARGET' || bandStatus === 'ABOVE_TARGET') {
    reasonCodes.push(bandStatus === 'AT_TARGET' ? 'AT_TARGET' : 'ABOVE_TARGET');
    recAction = actionOverride || FALLBACK_ACTIONS.RELEASE;
    recQty = availableToRelease;

    recommendationSummary = `Current stock is ${qoh} pallets and the controlling retention requirement is ${controllingRetention} pallets. This leaves ${availableToRelease} pallets available to release from current inventory.`;
    if (plannedPalletsNext7Days > 0) {
      recommendationSummary += ` A further ${plannedPalletsNext7Days} pallets are planned on Line ${currentProductionLine || 'N/A'} over the next seven days.`;
    }
    if (recDest) {
      recommendationSummary += ` ${recDest} is the preferred destination.`;
    }
    recommendationSummary += ` Recommend sending ${recQty} pallets to ${recDest || 'preferred destination'}.`;

    // Raise overflow/capacity warning if additional production is expected while near maximum
    if (plannedPalletsNext7Days > 0 && (qoh + plannedPalletsNext7Days > effMax)) {
      reasonCodes.push('UPCOMING_PRODUCTION_CAPACITY_RISK');
      exceptions.push({ message: 'Upcoming production poses warehouse capacity overflow risk.', severity: 'WARNING' });
      recommendationSummary += ` Upcoming production of ${plannedPalletsNext7Days} pallets poses a capacity risk as it exceeds the maximum warehouse limit of ${effMax} pallets.`;
    }
  }
  // 4. ABOVE MAXIMUM
  else if (bandStatus === 'ABOVE_MAXIMUM') {
    reasonCodes.push('ABOVE_MAXIMUM');
    recAction = actionOverride || FALLBACK_ACTIONS.RELEASE;
    recQty = availableToRelease;
    recPrio = FALLBACK_PRIORITIES.URGENT;

    recommendationSummary = `Current stock is ${qoh} pallets and the controlling retention requirement is ${controllingRetention} pallets. This leaves ${availableToRelease} pallets available to release from current inventory. The warehouse is ABOVE configured maximum of ${effMax} pallets.`;
    if (plannedPalletsNext7Days > 0) {
      reasonCodes.push('UPCOMING_PRODUCTION_CAPACITY_RISK');
      recommendationSummary += ` A further ${plannedPalletsNext7Days} pallets are planned on Line ${currentProductionLine || 'N/A'} in the next seven days, representing an additional capacity risk.`;
    }
    if (recDest) {
      recommendationSummary += ` ${recDest} is the preferred destination.`;
    }
    recommendationSummary += ` Recommend urgent release of ${recQty} pallets to ${recDest || 'configured destination'} to alleviate capacity pressure.`;
  }

  // Destination overrides
  if (destOverride) {
    reasonCodes.push('DESTINATION_PROMOTION_OVERRIDE');
    recDest = destOverride;
  } else {
    reasonCodes.push('PREFERRED_DESTINATION');
  }

  // Combined Promo + Production Risk checks
  if (isPromoActive) {
    if (hasDelay || productionRiskStatus === 'STOPPED' || !isScheduled) {
      reasonCodes.push('PROMOTION_AND_PRODUCTION_RISK');
    }
  }

  // Separate sections for Recommendation Explanation as required:
  explanationLines.push("Current facts:");
  explanationLines.push(`- Current QOH: ${qoh}`);
  explanationLines.push(`- Minimum: ${baseMin}`);
  explanationLines.push(`- Target: ${baseTarget}`);
  explanationLines.push(`- Maximum: ${baseMax}`);
  explanationLines.push(`- DDXM: ${baseDDXM}`);
  explanationLines.push(`- Controlling retention: ${controllingRetention}`);
  explanationLines.push(`- Available to release: ${availableToRelease}`);
  explanationLines.push("");

  explanationLines.push("Forward production:");
  explanationLines.push(`- Today’s planned cases/pallets: ${plannedCasesToday} cases / ${plannedPalletsToday} pallets`);
  explanationLines.push(`- Next seven days’ planned cases/pallets: ${plannedCasesNext7Days} cases / ${plannedPalletsNext7Days} pallets`);
  explanationLines.push(`- Next production date: ${nextProductionDate ? nextProductionDate.toLocaleDateString() : 'None scheduled'}`);
  explanationLines.push(`- Line: ${currentProductionLine || 'None'}`);
  explanationLines.push(`- Production notes or risks: ${productionRiskStatus}${activeProductionNotes.length > 0 ? ` (${activeProductionNotes.length} notes)` : ""}`);
  explanationLines.push(`- Source age: ${sourceUpdatedAt ? Math.round((evaluationTime.getTime() - sourceUpdatedAt.getTime()) / (60 * 60 * 1000)) + 'h' : 'Unknown'}`);
  explanationLines.push("");

  explanationLines.push("Promotion:");
  if (isPromoActive) {
    activePromotionImpacts.forEach(impact => {
      explanationLines.push(`- Promotion: ${impact.promotion.promotionName}`);
      explanationLines.push(`- Phase: ${impact.promotion.phase}`);
      explanationLines.push(`- Effects: Target Override = ${impact.rule.promotionTargetOverride || 'None'}, Destination Override = ${impact.rule.destinationOverrideId || 'None'}`);
    });
  } else {
    explanationLines.push("- No active promotion");
  }
  explanationLines.push("");

  explanationLines.push("Recommendation:");
  explanationLines.push(`- Action: ${recAction === FALLBACK_ACTIONS.RELEASE ? 'RELEASE' : recAction === FALLBACK_ACTIONS.HOLD ? 'HOLD' : 'REVIEW'}`);
  explanationLines.push(`- Quantity: ${recQty}`);
  explanationLines.push(`- Destination: ${recDest || 'None'}`);
  explanationLines.push(`- Priority: ${recPrio === FALLBACK_PRIORITIES.URGENT ? 'URGENT' : recPrio === FALLBACK_PRIORITIES.LOW ? 'LOW' : 'NORMAL'}`);
  explanationLines.push(`- Reason: ${recommendationSummary}`);

  const uniqueReasons = Array.from(new Set(reasonCodes));

  return {
    productId,
    planningBandStatus: bandStatus,
    effectiveMinimum: minBreakdown,
    effectiveTarget: targetBreakdown,
    effectiveMaximum: maxBreakdown,
    effectiveDDXM: ddxmBreakdown,
    controllingRetention,
    availableToRelease,
    shortfallQuantity,
    headroomToMaximum,
    recommendedActionTypeId: recAction,
    recommendedQuantity: recQty,
    recommendedDestinationId: recDest,
    recommendedPriorityLevelId: recPrio,
    reasonCodes: uniqueReasons,
    explanationLines,
    exceptions,
    dataQualityStatus,
    sourceSnapshot: input,
    evaluatedAt: evaluationTime
  };
};

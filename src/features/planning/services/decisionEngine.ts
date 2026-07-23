import {
  DecisionInputSnapshot,
  DecisionOutput,
  DecisionConfiguration,
  DataQualityStatus,
  DataQualityIssue,
  ReasonCode,
  DecisionException,
  ThresholdBreakdown,
  StructuredExplanation,
  DecisionVersionInfo
} from '../../../types/decision';
import { PlanningBandStatus, BelowTargetBehavior } from '../../../types/planning';

export const ENGINE_VERSION = '2.0.0';

export const DEFAULT_DECISION_CONFIG: DecisionConfiguration = {
  configurationVersion: 'v1.0.0',
  holdActionId: 'ACTION_HOLD',
  reviewActionId: 'ACTION_REVIEW',
  releaseActionId: 'ACTION_RELEASE',
  asPerScheduleActionId: 'ACTION_AS_PER_SCHEDULE',
  urgentPriorityId: 'PRIORITY_URGENT',
  normalPriorityId: 'PRIORITY_NORMAL',
  lowPriorityId: 'PRIORITY_LOW',
  defaultDestinationRules: {
    defaultDestinationId: 'DEST_DEFAULT',
    allowFallbackDestination: true
  },
  inventoryStalenessHoursThreshold: 24,
  productionStalenessHoursThreshold: 24,
  nearProductionDaysWindow: 7,
  capacityWarningThresholdPercentage: 100
};

export const generateDeterministicHash = (input: DecisionInputSnapshot): string => {
  const payload = {
    tenantId: input.tenantId,
    siteId: input.siteId,
    productId: input.productId,
    inventoryTotal: input.inventoryTotal,
    inventoryUpdatedAt: input.inventoryUpdatedAt ? input.inventoryUpdatedAt.toISOString() : null,
    planningRule: input.planningRule ? {
      id: input.planningRule.id,
      minimumQuantity: input.planningRule.minimumQuantity,
      targetQuantity: input.planningRule.targetQuantity,
      maximumQuantity: input.planningRule.maximumQuantity,
      ddxmRetentionQuantity: input.planningRule.ddxmRetentionQuantity,
      controllingThresholdMode: input.planningRule.controllingThresholdMode,
      belowTargetBehavior: input.planningRule.belowTargetBehavior,
      preferredDestinationId: input.planningRule.preferredDestinationId,
      defaultActionTypeId: input.planningRule.defaultActionTypeId,
      defaultPriorityLevelId: input.planningRule.defaultPriorityLevelId
    } : null,
    productionContext: input.productionContext ? {
      isScheduled: input.productionContext.isScheduled,
      isCurrentlyInProduction: input.productionContext.isCurrentlyInProduction,
      plannedCasesNext7Days: input.productionContext.plannedCasesNext7Days,
      plannedPalletsNext7Days: input.productionContext.plannedPalletsNext7Days,
      daysUntilNextProduction: input.productionContext.daysUntilNextProduction,
      dataFreshnessStatus: input.productionContext.dataFreshnessStatus,
      productionRiskStatus: input.productionContext.productionRiskStatus,
      sourceImportId: input.productionContext.sourceImportId
    } : null,
    activePromotionImpacts: input.activePromotionImpacts.map(p => ({
      promoId: p.promotion.id || p.promotion.promotionName,
      phase: p.promotion.phase,
      rule: {
        retentionUpliftQuantity: p.rule.retentionUpliftQuantity,
        destinationOverrideId: p.rule.destinationOverrideId,
        actionTypeOverrideId: p.rule.actionTypeOverrideId,
        promotionMinimumOverride: p.rule.promotionMinimumOverride,
        promotionTargetOverride: p.rule.promotionTargetOverride,
        promotionMaximumOverride: p.rule.promotionMaximumOverride
      }
    })),
    configVersion: input.configuration?.configurationVersion || 'none'
  };

  const str = JSON.stringify(payload);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'hash_' + Math.abs(hash).toString(36);
};

export const validateDecisionOutput = (
  output: Partial<DecisionOutput>,
  input: DecisionInputSnapshot,
  config: DecisionConfiguration
): DataQualityIssue[] => {
  const issues: DataQualityIssue[] = [];

  const action = output.recommendedActionTypeId;
  const quantity = output.recommendedQuantity ?? 0;
  const destination = output.recommendedDestinationId;
  const available = output.availableToRelease ?? 0;

  // Negative quantity check
  if (quantity < 0) {
    issues.push({
      code: 'ACTION_QUANTITY_CONTRADICTION',
      severity: 'BLOCKING',
      blocking: true,
      message: 'Recommended quantity cannot be negative.',
      sourceArea: 'CONFIGURATION'
    });
  }

  // HOLD action consistency
  if (action && action === config.holdActionId) {
    if (quantity > 0) {
      issues.push({
        code: 'ACTION_QUANTITY_CONTRADICTION',
        severity: 'BLOCKING',
        blocking: true,
        message: 'Action HOLD must have a recommended quantity of 0.',
        sourceArea: 'CONFIGURATION'
      });
    }
  }

  // REVIEW action consistency
  if (action && action === config.reviewActionId) {
    if (quantity > 0) {
      issues.push({
        code: 'ACTION_QUANTITY_CONTRADICTION',
        severity: 'WARNING',
        blocking: false,
        message: 'Action REVIEW typically requires 0 recommended quantity.',
        sourceArea: 'CONFIGURATION'
      });
    }
  }

  // RELEASE action consistency
  if (action && action === config.releaseActionId) {
    if (quantity <= 0) {
      issues.push({
        code: 'ACTION_QUANTITY_CONTRADICTION',
        severity: 'BLOCKING',
        blocking: true,
        message: 'Action RELEASE requires a recommended quantity greater than 0.',
        sourceArea: 'CONFIGURATION'
      });
    }
    if (quantity > available) {
      issues.push({
        code: 'ACTION_QUANTITY_CONTRADICTION',
        severity: 'BLOCKING',
        blocking: true,
        message: `Recommended release quantity (${quantity}) exceeds available stock (${available}). Future production cannot be released before inventory is on hand.`,
        sourceArea: 'INVENTORY'
      });
    }
    if (!destination) {
      issues.push({
        code: 'ACTION_QUANTITY_CONTRADICTION',
        severity: 'WARNING',
        blocking: false,
        message: 'Action RELEASE specified without a configured destination.',
        sourceArea: 'CONFIGURATION'
      });
    }
  }

  return issues;
};

export const evaluateDecision = (
  input: DecisionInputSnapshot,
  configOverride?: DecisionConfiguration
): DecisionOutput => {
  const {
    tenantId,
    siteId,
    productId,
    inventoryTotal,
    planningRule,
    productionContext,
    activePromotionImpacts = [],
    inventoryUpdatedAt,
    evaluationTime
  } = input;

  const dataQualityIssues: DataQualityIssue[] = [];
  const reasonCodes: ReasonCode[] = [];
  const exceptions: DecisionException[] = [];

  const currentFactsLines: string[] = [];
  const thresholdLines: string[] = [];
  const productionLines: string[] = [];
  const promotionLines: string[] = [];
  const riskLines: string[] = [];
  const recommendationLines: string[] = [];
  const traceLines: string[] = [];

  // 1. Configuration Resolution & Validation
  const config: DecisionConfiguration | null = input.configuration || configOverride || DEFAULT_DECISION_CONFIG;

  const isConfigIncomplete = !config || 
    !config.holdActionId || 
    !config.reviewActionId || 
    !config.releaseActionId || 
    !config.urgentPriorityId || 
    !config.normalPriorityId || 
    !config.lowPriorityId;

  if (isConfigIncomplete) {
    dataQualityIssues.push({
      code: 'CONFIGURATION_MISSING',
      severity: 'BLOCKING',
      blocking: true,
      message: 'Decision engine configuration is missing or incomplete (required action or priority IDs not resolved).',
      sourceArea: 'CONFIGURATION'
    });
    reasonCodes.push('CONFIGURATION_MISSING', 'REVIEW_REQUIRED');
  }

  // 2. Planning Rule Data Quality Check
  if (!planningRule) {
    dataQualityIssues.push({
      code: 'PLANNING_RULE_MISSING',
      severity: 'BLOCKING',
      blocking: true,
      message: 'Missing base product planning rule for this product.',
      sourceArea: 'PLANNING_RULE'
    });
  } else {
    if (planningRule.minimumQuantity > planningRule.targetQuantity || planningRule.targetQuantity > planningRule.maximumQuantity) {
      dataQualityIssues.push({
        code: 'INVALID_THRESHOLD',
        severity: 'BLOCKING',
        blocking: true,
        message: `Invalid threshold hierarchy in planning rule: Min (${planningRule.minimumQuantity}) > Target (${planningRule.targetQuantity}) or Target > Max (${planningRule.maximumQuantity}).`,
        sourceArea: 'PLANNING_RULE'
      });
    }
  }

  // 3. Inventory Staleness Check
  const invStalenessHours = config?.inventoryStalenessHoursThreshold || 24;
  if (inventoryUpdatedAt) {
    const invAgeHours = (evaluationTime.getTime() - inventoryUpdatedAt.getTime()) / (60 * 60 * 1000);
    if (invAgeHours > invStalenessHours) {
      dataQualityIssues.push({
        code: 'INVENTORY_STALE',
        severity: 'WARNING',
        blocking: false,
        message: `Inventory data is ${Math.round(invAgeHours)} hours old (threshold is ${invStalenessHours} hours).`,
        sourceArea: 'INVENTORY'
      });
      reasonCodes.push('STALE_INVENTORY');
      exceptions.push({ message: `Inventory data is older than ${invStalenessHours} hours.`, severity: 'WARNING' });
    }
  }

  // 4. Production Context & Data Quality Check
  const prodStalenessHours = config?.productionStalenessHoursThreshold || 24;
  if (!productionContext || productionContext.dataFreshnessStatus === 'MISSING') {
    dataQualityIssues.push({
      code: 'PRODUCTION_SOURCE_MISSING',
      severity: 'WARNING',
      blocking: false,
      message: 'Production data source is missing or unavailable.',
      sourceArea: 'PRODUCTION'
    });
    reasonCodes.push('PRODUCTION_SOURCE_MISSING');
  } else if (productionContext.dataFreshnessStatus === 'STALE') {
    dataQualityIssues.push({
      code: 'PRODUCTION_SOURCE_STALE',
      severity: 'WARNING',
      blocking: false,
      message: 'SAP production import source is STALE (older than threshold).',
      sourceArea: 'PRODUCTION'
    });
    reasonCodes.push('PRODUCTION_SOURCE_STALE');
    exceptions.push({ message: `SAP production import is STALE (older than ${prodStalenessHours} hours).`, severity: 'WARNING' });
  }

  // 5. Promotion Conflicts Check
  let promotionDestinationConflict = false;
  let promotionActionConflict = false;

  if (activePromotionImpacts.length > 1) {
    const destOverrides = activePromotionImpacts
      .map(p => p.rule.destinationOverrideId)
      .filter((d): d is string => Boolean(d));
    const uniqueDestOverrides = [...new Set(destOverrides)];
    if (uniqueDestOverrides.length > 1) {
      promotionDestinationConflict = true;
      dataQualityIssues.push({
        code: 'PROMOTION_CONFLICT',
        severity: 'ERROR',
        blocking: true,
        message: `Conflicting destination overrides in active promotions: ${uniqueDestOverrides.join(', ')}.`,
        sourceArea: 'PROMOTION'
      });
      reasonCodes.push('PROMOTION_CONFLICT');
    }

    const actionOverrides = activePromotionImpacts
      .map(p => p.rule.actionTypeOverrideId)
      .filter((a): a is string => Boolean(a));
    const uniqueActionOverrides = [...new Set(actionOverrides)];
    if (uniqueActionOverrides.length > 1) {
      promotionActionConflict = true;
      dataQualityIssues.push({
        code: 'PROMOTION_CONFLICT',
        severity: 'ERROR',
        blocking: true,
        message: `Conflicting action overrides in active promotions: ${uniqueActionOverrides.join(', ')}.`,
        sourceArea: 'PROMOTION'
      });
      reasonCodes.push('PROMOTION_CONFLICT');
    }

    if (!promotionDestinationConflict && !promotionActionConflict) {
      dataQualityIssues.push({
        code: 'PROMOTION_CONFLICT',
        severity: 'INFO',
        blocking: false,
        message: 'Multiple overlapping promotions active. Combined parameters applied.',
        sourceArea: 'PROMOTION'
      });
    }
  }

  // Determine overall DataQualityStatus
  let overallQualityStatus: DataQualityStatus = 'COMPLETE';
  const blockingIssue = dataQualityIssues.find(i => i.blocking);
  if (blockingIssue) {
    overallQualityStatus = blockingIssue.code as DataQualityStatus;
  } else if (dataQualityIssues.length > 0) {
    overallQualityStatus = dataQualityIssues[0].code as DataQualityStatus;
  }

  // Handle blocking issues where decision cannot be computed safely
  if (blockingIssue && (blockingIssue.code === 'PLANNING_RULE_MISSING' || blockingIssue.code === 'CONFIGURATION_MISSING' || blockingIssue.code === 'INVALID_THRESHOLD')) {
    const effectiveZero: ThresholdBreakdown = { baseValue: 0, promotionAdjustment: 0, effectiveValue: 0 };
    const sourceHash = generateDeterministicHash(input);

    const recActionId = config?.reviewActionId || null;
    const recPrioId = config?.urgentPriorityId || config?.normalPriorityId || null;

    const structuredExp: StructuredExplanation = {
      currentFacts: [`Current QOH: ${inventoryTotal}`],
      thresholds: ['Planning thresholds unavailable due to blocking data quality issue.'],
      productionContext: ['Production context evaluation suspended.'],
      promotionContext: ['Promotion context evaluation suspended.'],
      risks: [blockingIssue.message],
      recommendation: [`Action: ${recActionId || 'UNCONFIGURED'}`, 'Quantity: 0', 'Planner review required to resolve configuration/rule issue.'],
      calculationTrace: [`Blocking Issue Detected: ${blockingIssue.code} - ${blockingIssue.message}`]
    };

    const explanationLines = [
      ...structuredExp.risks.map(r => `[RISK] ${r}`),
      ...structuredExp.recommendation.map(r => `[RECOMMENDATION] ${r}`)
    ];

    return {
      productId,
      planningBandStatus: 'UNKNOWN',
      effectiveMinimum: effectiveZero,
      effectiveTarget: effectiveZero,
      effectiveMaximum: effectiveZero,
      effectiveDDXM: effectiveZero,
      controllingRetention: 0,
      availableToRelease: 0,
      shortfallQuantity: 0,
      headroomToMaximum: 0,
      recommendedActionTypeId: recActionId,
      recommendedQuantity: 0,
      recommendedDestinationId: null,
      recommendedPriorityLevelId: recPrioId,
      reasonCodes: Array.from(new Set(reasonCodes)),
      explanationLines,
      structuredExplanation: structuredExp,
      exceptions: [{ message: blockingIssue.message, severity: 'ERROR' }],
      dataQualityStatus: overallQualityStatus,
      dataQualityIssues,
      versionInfo: {
        engineVersion: ENGINE_VERSION,
        configurationVersion: config?.configurationVersion || 'unconfigured',
        planningRuleVersion: planningRule ? String(planningRule.modifiedDate || 'v1') : null,
        inventorySnapshotTime: inventoryUpdatedAt,
        productionImportId: productionContext?.sourceImportId || null,
        promotionSnapshotIds: activePromotionImpacts.map(p => p.promotion.id || p.promotion.promotionName),
        evaluatedAt: evaluationTime,
        sourceHash
      },
      sourceSnapshot: input,
      evaluatedAt: evaluationTime
    };
  }

  // Safe defaults for config values
  const holdAction = config!.holdActionId;
  const reviewAction = config!.reviewActionId;
  const releaseAction = config!.releaseActionId;
  const urgentPriority = config!.urgentPriorityId;
  const normalPriority = config!.normalPriorityId;
  const lowPriority = config!.lowPriorityId;

  // 6. Safe Production Fields Extraction
  const {
    isScheduled = false,
    isCurrentlyInProduction = false,
    currentProductionLine = null,
    plannedCasesToday = 0,
    plannedPalletsToday = 0,
    plannedCasesNext7Days = 0,
    plannedPalletsNext7Days = 0,
    nextProductionDate = null,
    daysUntilNextProduction = null,
    hasDelay = false,
    hasShutdown = false,
    hasMaintenance = false,
    hasTrial = false,
    productionRiskStatus = 'NORMAL',
    activeProductionNotes = []
  } = productionContext || {};

  // Log Production Reasons
  if (isCurrentlyInProduction) reasonCodes.push('PRODUCTION_RUNNING');
  if (plannedPalletsToday > 0) reasonCodes.push('PRODUCTION_SCHEDULED_TODAY');
  if (daysUntilNextProduction !== null && daysUntilNextProduction <= (config?.nearProductionDaysWindow || 7)) {
    reasonCodes.push('PRODUCTION_DUE_WITHIN_WINDOW');
  }
  if (!isScheduled) {
    reasonCodes.push('NO_FUTURE_PRODUCTION');
  }
  if (hasDelay || productionRiskStatus === 'DELAYED') {
    reasonCodes.push('PRODUCTION_DELAYED');
    exceptions.push({ message: 'Production plan has active delay.', severity: 'WARNING' });
  }
  if (productionRiskStatus === 'STOPPED' || hasShutdown) {
    reasonCodes.push('PRODUCTION_STOPPED');
    exceptions.push({ message: 'Production is STOPPED on the line.', severity: 'ERROR' });
  }
  if (hasMaintenance) {
    reasonCodes.push('PRODUCTION_MAINTENANCE');
    exceptions.push({ message: 'Line is scheduled for MAINTENANCE across planned dates.', severity: 'WARNING' });
  }
  if (hasTrial) reasonCodes.push('PRODUCTION_TRIAL');

  // 7. Threshold Calculation & Promotion Impact
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
    if (r.destinationOverrideId && !promotionDestinationConflict) destOverride = r.destinationOverrideId;
    if (r.actionTypeOverrideId && !promotionActionConflict) actionOverride = r.actionTypeOverrideId;
    if (r.priorityWeightUplift > 0) prioUplift += r.priorityWeightUplift;

    if (p.phase === 'ACTIVE') reasonCodes.push('PROMOTION_ACTIVE');
    if (p.phase === 'PRE_BUILD') reasonCodes.push('PROMOTION_PRE_BUILD');

    promotionLines.push(`- Promotion: ${p.promotionName} (${p.phase}) - Retention Uplift: +${r.retentionUpliftQuantity || 0}, Dest Override: ${r.destinationOverrideId || 'None'}`);
  });

  if (!isPromoActive) {
    promotionLines.push('- No active promotions.');
  }

  const effMin = (minOverride !== null ? minOverride : baseMin) + retentionUplift;
  const effTarget = Math.max(effMin, (targetOverride !== null ? targetOverride : baseTarget) + retentionUplift);
  const effMax = Math.max(effTarget, (maxOverride !== null ? maxOverride : baseMax) + retentionUplift);
  const effDDXM = baseDDXM;

  const minBreakdown: ThresholdBreakdown = { baseValue: baseMin, promotionAdjustment: effMin - baseMin, effectiveValue: effMin };
  const targetBreakdown: ThresholdBreakdown = { baseValue: baseTarget, promotionAdjustment: effTarget - baseTarget, effectiveValue: effTarget };
  const maxBreakdown: ThresholdBreakdown = { baseValue: baseMax, promotionAdjustment: effMax - baseMax, effectiveValue: effMax };
  const ddxmBreakdown: ThresholdBreakdown = { baseValue: baseDDXM, promotionAdjustment: 0, effectiveValue: effDDXM };

  // 8. Determine Controlling Retention
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

  // 9. Calculate Stock Metrics
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

  // 10. Action & Priority Logic
  let recAction: string | null = planningRule!.defaultActionTypeId || holdAction;
  let recQty = 0;
  let recDest: string | null = destOverride || planningRule!.preferredDestinationId || config?.defaultDestinationRules?.defaultDestinationId || null;
  let recPrio: string | null = planningRule!.defaultPriorityLevelId || normalPriority;

  if (prioUplift > 0) {
    recPrio = urgentPriority || normalPriority;
  }

  if (input.existingActivePriorities && input.existingActivePriorities.length > 0) {
    reasonCodes.push('EXISTING_PRIORITY');
  }

  // Apply BelowTargetBehavior and Band Status Rules
  const belowTargetBehavior: BelowTargetBehavior = planningRule!.belowTargetBehavior || 
    (planningRule!.defaultActionTypeId === releaseAction ? 'RELEASE_ABOVE_CONTROL' : 'HOLD_UNTIL_TARGET');

  if (bandStatus === 'BELOW_CONTROL' || bandStatus === 'AT_CONTROL') {
    reasonCodes.push(bandStatus === 'BELOW_CONTROL' ? 'BELOW_CONTROLLING_RETENTION' : 'AT_CONTROLLING_RETENTION');
    recAction = (actionOverride && actionOverride !== releaseAction) ? actionOverride : holdAction;
    recQty = 0;

    if (shortfallQuantity > effTarget * 0.5) {
      recPrio = urgentPriority || normalPriority;
    }

    if (hasDelay || hasShutdown || !isScheduled || productionRiskStatus === 'STOPPED') {
      riskLines.push(`Production risks elevated (${productionRiskStatus}). Review scheduled run immediately.`);
    }
  } else if (bandStatus === 'BELOW_TARGET') {
    reasonCodes.push('BELOW_TARGET');

    if (belowTargetBehavior === 'HOLD_UNTIL_TARGET') {
      recAction = actionOverride || holdAction;
      recQty = 0;
    } else if (belowTargetBehavior === 'RELEASE_ABOVE_CONTROL') {
      recAction = actionOverride || releaseAction;
      recQty = availableToRelease;
    } else if (belowTargetBehavior === 'AS_PER_SCHEDULE') {
      recAction = config?.asPerScheduleActionId || holdAction;
      recQty = 0;
      reasonCodes.push('AS_PER_SCHEDULE');
    } else if (belowTargetBehavior === 'PLANNER_REVIEW') {
      recAction = reviewAction;
      recQty = 0;
      reasonCodes.push('REVIEW_REQUIRED');
    }

    if (isPromoActive && (!isScheduled || (daysUntilNextProduction !== null && daysUntilNextProduction > 4))) {
      reasonCodes.push('PROMOTION_AND_PRODUCTION_RISK');
      exceptions.push({ message: 'Active promotion with no near production run scheduled.', severity: 'WARNING' });
      riskLines.push('Active promotion with no near-term scheduled production increases retention concern.');
      if (belowTargetBehavior === 'RELEASE_ABOVE_CONTROL') {
        recAction = holdAction;
        recQty = 0;
      }
    }
  } else if (bandStatus === 'AT_TARGET' || bandStatus === 'ABOVE_TARGET') {
    reasonCodes.push(bandStatus === 'AT_TARGET' ? 'AT_TARGET' : 'ABOVE_TARGET');
    recAction = actionOverride || releaseAction;
    recQty = availableToRelease;

    if (plannedPalletsNext7Days > 0 && (qoh + plannedPalletsNext7Days > effMax)) {
      reasonCodes.push('UPCOMING_PRODUCTION_CAPACITY_RISK');
      exceptions.push({ message: 'Upcoming production poses warehouse capacity overflow risk.', severity: 'WARNING' });
      riskLines.push(`Upcoming production of ${plannedPalletsNext7Days} pallets exceeds max capacity headroom.`);
    }
  } else if (bandStatus === 'ABOVE_MAXIMUM') {
    reasonCodes.push('ABOVE_MAXIMUM');
    recAction = actionOverride || releaseAction;
    recQty = availableToRelease;
    recPrio = urgentPriority || normalPriority;

    if (plannedPalletsNext7Days > 0) {
      reasonCodes.push('UPCOMING_PRODUCTION_CAPACITY_RISK');
      riskLines.push(`Warehouse is ABOVE maximum capacity by ${qoh - effMax} pallets. Further production of ${plannedPalletsNext7Days} pallets scheduled.`);
    }
  }

  // Handle Promotion Conflict Override to Review Action
  if (promotionDestinationConflict || promotionActionConflict) {
    recAction = reviewAction;
    recQty = 0;
    reasonCodes.push('REVIEW_REQUIRED');
  }

  if (destOverride && !promotionDestinationConflict) {
    reasonCodes.push('DESTINATION_PROMOTION_OVERRIDE');
    recDest = destOverride;
  } else if (recDest) {
    reasonCodes.push('PREFERRED_DESTINATION');
  }

  // 11. Run Output Validation
  const tempOutput = {
    recommendedActionTypeId: recAction,
    recommendedQuantity: recQty,
    recommendedDestinationId: recDest,
    recommendedPriorityLevelId: recPrio,
    availableToRelease
  };

  const validationIssues = validateDecisionOutput(tempOutput, input, config!);
  dataQualityIssues.push(...validationIssues);

  const hasBlockingValidationIssue = validationIssues.some(i => i.blocking);
  if (hasBlockingValidationIssue) {
    recAction = reviewAction;
    recQty = 0;
    reasonCodes.push('REVIEW_REQUIRED');
    overallQualityStatus = validationIssues.find(i => i.blocking)?.code as DataQualityStatus || overallQualityStatus;
  }

  // 12. Build Structured Explanation
  currentFactsLines.push(`- Current Stock on Hand (QOH): ${qoh} pallets`);
  currentFactsLines.push(`- Product Code: ${input.productCodeSnapshot}`);
  if (inventoryUpdatedAt) {
    currentFactsLines.push(`- Inventory Last Updated: ${inventoryUpdatedAt.toLocaleString()}`);
  }

  thresholdLines.push(`- Minimum Retention: ${effMin} (Base: ${baseMin}, Promo Adjust: +${effMin - baseMin})`);
  thresholdLines.push(`- Target Inventory: ${effTarget} (Base: ${baseTarget}, Promo Adjust: +${effTarget - baseTarget})`);
  thresholdLines.push(`- Maximum Inventory: ${effMax} (Base: ${baseMax}, Promo Adjust: +${effMax - baseMax})`);
  thresholdLines.push(`- Controlling Retention Requirement: ${controllingRetention} pallets (${planningRule!.controllingThresholdMode})`);
  thresholdLines.push(`- Available to Release: ${availableToRelease} pallets`);
  thresholdLines.push(`- Shortfall Quantity: ${shortfallQuantity} pallets`);
  thresholdLines.push(`- Headroom to Maximum: ${headroomToMaximum} pallets`);

  productionLines.push(`- Scheduled Status: ${isScheduled ? 'Scheduled' : 'Not Scheduled'}`);
  productionLines.push(`- Currently Running: ${isCurrentlyInProduction ? `Yes (Line: ${currentProductionLine || 'N/A'})` : 'No'}`);
  productionLines.push(`- Planned Today: ${plannedCasesToday} cases / ${plannedPalletsToday} pallets`);
  productionLines.push(`- Planned Next 7 Days: ${plannedCasesNext7Days} cases / ${plannedPalletsNext7Days} pallets`);
  productionLines.push(`- Next Production Run: ${nextProductionDate ? nextProductionDate.toLocaleDateString() : 'None scheduled'}`);
  productionLines.push(`- Source Import ID: ${productionContext?.sourceImportId || 'N/A'}`);

  recommendationLines.push(`- Recommended Action: ${recAction || 'NONE'}`);
  recommendationLines.push(`- Recommended Quantity: ${recQty} pallets`);
  recommendationLines.push(`- Recommended Destination: ${recDest || 'None'}`);
  recommendationLines.push(`- Priority Level: ${recPrio || 'Normal'}`);
  recommendationLines.push(`- Planning Band Status: ${bandStatus}`);

  traceLines.push(`1. Evaluated QOH (${qoh}) vs Controlling Retention (${controllingRetention}). Available = ${availableToRelease}.`);
  traceLines.push(`2. Band Status resolved to ${bandStatus} under mode ${planningRule!.controllingThresholdMode}.`);
  traceLines.push(`3. Below target behavior: ${belowTargetBehavior}. Recommended action: ${recAction}, qty: ${recQty}.`);

  const structuredExplanation: StructuredExplanation = {
    currentFacts: currentFactsLines,
    thresholds: thresholdLines,
    productionContext: productionLines,
    promotionContext: promotionLines,
    risks: riskLines,
    recommendation: recommendationLines,
    calculationTrace: traceLines
  };

  const explanationLines = [
    "--- CURRENT FACTS ---",
    ...currentFactsLines,
    "--- THRESHOLDS ---",
    ...thresholdLines,
    "--- FORWARD PRODUCTION ---",
    ...productionLines,
    "--- PROMOTION IMPACT ---",
    ...promotionLines,
    ...(riskLines.length > 0 ? ["--- RISKS ---", ...riskLines] : []),
    "--- RECOMMENDATION ---",
    ...recommendationLines
  ];

  const sourceHash = generateDeterministicHash(input);

  const versionInfo: DecisionVersionInfo = {
    engineVersion: ENGINE_VERSION,
    configurationVersion: config!.configurationVersion,
    planningRuleVersion: planningRule ? String(planningRule.modifiedDate || 'v1') : null,
    inventorySnapshotTime: inventoryUpdatedAt,
    productionImportId: productionContext?.sourceImportId || null,
    promotionSnapshotIds: activePromotionImpacts.map(p => p.promotion.id || p.promotion.promotionName),
    evaluatedAt: evaluationTime,
    sourceHash
  };

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
    reasonCodes: Array.from(new Set(reasonCodes)),
    explanationLines,
    structuredExplanation,
    exceptions,
    dataQualityStatus: overallQualityStatus,
    dataQualityIssues,
    versionInfo,
    sourceSnapshot: input,
    evaluatedAt: evaluationTime
  };
};

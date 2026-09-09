import { describe, it, expect } from 'vitest';
import {
  evaluateDecision,
  validateDecisionOutput,
  DEFAULT_DECISION_CONFIG,
  generateDeterministicHash,
  ENGINE_VERSION
} from './decisionEngine';
import { DecisionInputSnapshot, DecisionConfiguration } from '../../../types/decision';
import { ProductPlanningRule } from '../../../types/planning';
import { ProductProductionContext } from '../../../types/production';
import { Timestamp } from '../../../services/supabaseBase';

describe('Decision Engine Refactored Test Suite (14 Scenarios)', () => {
  const basePlanningRule: ProductPlanningRule = {
    id: 'rule-test-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    productId: 'prod-1',
    productCodeSnapshot: 'TEST-SKU-100',
    descriptionSnapshot: 'Test SKU Item',
    minimumQuantity: 100,
    targetQuantity: 200,
    maximumQuantity: 500,
    ddxmRetentionQuantity: 50,
    controllingThresholdMode: 'HIGHEST_MANDATORY',
    customControllingRetentionQuantity: null,
    belowTargetBehavior: 'HOLD_UNTIL_TARGET',
    preferredDestinationId: 'DEST_DC1',
    secondaryDestinationId: null,
    defaultActionTypeId: 'ACT_HOLD',
    defaultPriorityLevelId: 'PRIO_NORMAL',
    allowQuantityOverride: true,
    allowDestinationOverride: true,
    overrideRequiresReason: true,
    effectiveFrom: Timestamp.now(),
    effectiveTo: null,
    notes: 'Test rule notes',
    status: 'active',
    createdDate: Timestamp.now(),
    modifiedDate: Timestamp.now(),
    createdBy: 'test-user',
    modifiedBy: 'test-user'
  };

  const createMockProductionContext = (partial: Partial<ProductProductionContext> = {}): ProductProductionContext => {
    return {
      productId: 'prod-1',
      isScheduled: true,
      isCurrentlyInProduction: false,
      currentProductionLine: 'Line 1',
      currentProductionDate: new Date(),
      plannedCasesToday: 1000,
      plannedPalletsToday: 50,
      plannedCasesNext7Days: 5000,
      plannedPalletsNext7Days: 250,
      nextProductionDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      daysUntilNextProduction: 3,
      lastProductionDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      plannerProductionStatus: null,
      activeProductionNotes: [],
      hasDelay: false,
      hasShutdown: false,
      hasMaintenance: false,
      hasTrial: false,
      sourceImportId: 'import-sap-999',
      sourceUpdatedAt: new Date(),
      dataFreshnessStatus: 'FRESH',
      productionRiskStatus: 'NORMAL',
      currentProductionEvent: null,
      currentLine: 'Line 1',
      currentExpectedFinish: null,
      nextProductionEvent: null,
      nextProductionStart: null,
      hoursUntilNextProduction: 72,
      ...partial
    };
  };

  const createBaseInput = (partial: Partial<DecisionInputSnapshot> = {}): DecisionInputSnapshot => {
    return {
      tenantId: 'tenant-1',
      siteId: 'site-1',
      productId: 'prod-1',
      productCodeSnapshot: 'TEST-SKU-100',
      inventoryTotal: 250,
      inventoryByLocation: [],
      inventoryUpdatedAt: new Date(),
      planningRule: basePlanningRule,
      productionContext: createMockProductionContext(),
      activePromotionImpacts: [],
      existingActivePriorities: [],
      evaluationTime: new Date(),
      configuration: DEFAULT_DECISION_CONFIG,
      ...partial
    };
  };

  // Scenario 1: Below DDXM with future production
  it('Scenario 1: Below DDXM with future production gives HOLD action with quantity 0 and logs future production', () => {
    const input = createBaseInput({
      inventoryTotal: 40, // Below DDXM (50) and Min (100). Controlling = 100
      productionContext: createMockProductionContext({ isScheduled: true, daysUntilNextProduction: 2, plannedPalletsNext7Days: 100 })
    });

    const output = evaluateDecision(input);

    expect(output.planningBandStatus).toBe('BELOW_CONTROL');
    expect(output.recommendedActionTypeId).toBe(DEFAULT_DECISION_CONFIG.holdActionId);
    expect(output.recommendedQuantity).toBe(0);
    expect(output.reasonCodes).toContain('BELOW_CONTROLLING_RETENTION');
    expect(output.reasonCodes).toContain('PRODUCTION_DUE_WITHIN_WINDOW');
    expect(output.structuredExplanation.productionContext.some(line => line.includes('100 pallets'))).toBe(true);
  });

  // Scenario 2: Below DDXM with no scheduled production
  it('Scenario 2: Below DDXM with no scheduled production flags NO_FUTURE_PRODUCTION', () => {
    const input = createBaseInput({
      inventoryTotal: 40,
      productionContext: createMockProductionContext({ isScheduled: false, daysUntilNextProduction: null, plannedPalletsNext7Days: 0 })
    });

    const output = evaluateDecision(input);

    expect(output.planningBandStatus).toBe('BELOW_CONTROL');
    expect(output.recommendedActionTypeId).toBe(DEFAULT_DECISION_CONFIG.holdActionId);
    expect(output.recommendedQuantity).toBe(0);
    expect(output.reasonCodes).toContain('BELOW_CONTROLLING_RETENTION');
    expect(output.reasonCodes).toContain('NO_FUTURE_PRODUCTION');
  });

  // Scenario 3: Missing production source
  it('Scenario 3: Missing production source records PRODUCTION_SOURCE_MISSING issue', () => {
    const input = createBaseInput({
      inventoryTotal: 250,
      productionContext: null
    });

    const output = evaluateDecision(input);

    expect(output.recommendedActionTypeId).toBe(DEFAULT_DECISION_CONFIG.releaseActionId);
    expect(output.recommendedQuantity).toBe(150); // 250 - 100
    expect(output.dataQualityIssues.some(i => i.code === 'PRODUCTION_SOURCE_MISSING')).toBe(true);
    expect(output.reasonCodes).toContain('PRODUCTION_SOURCE_MISSING');
  });

  // Scenario 4: Stale production source
  it('Scenario 4: Stale production source records PRODUCTION_SOURCE_STALE issue', () => {
    const input = createBaseInput({
      inventoryTotal: 250,
      productionContext: createMockProductionContext({ dataFreshnessStatus: 'STALE' })
    });

    const output = evaluateDecision(input);

    expect(output.dataQualityIssues.some(i => i.code === 'PRODUCTION_SOURCE_STALE')).toBe(true);
    expect(output.reasonCodes).toContain('PRODUCTION_SOURCE_STALE');
    expect(output.exceptions.some(e => e.message.includes('STALE'))).toBe(true);
  });

  // Scenario 5: Below target with HOLD_UNTIL_TARGET
  it('Scenario 5: Below target with HOLD_UNTIL_TARGET behavior yields HOLD action and 0 quantity', () => {
    const input = createBaseInput({
      inventoryTotal: 150, // Between Min (100) and Target (200)
      planningRule: {
        ...basePlanningRule,
        belowTargetBehavior: 'HOLD_UNTIL_TARGET'
      }
    });

    const output = evaluateDecision(input);

    expect(output.planningBandStatus).toBe('BELOW_TARGET');
    expect(output.recommendedActionTypeId).toBe(DEFAULT_DECISION_CONFIG.holdActionId);
    expect(output.recommendedQuantity).toBe(0);
    expect(output.reasonCodes).toContain('BELOW_TARGET');
  });

  // Scenario 6: Below target with RELEASE_ABOVE_CONTROL
  it('Scenario 6: Below target with RELEASE_ABOVE_CONTROL behavior yields RELEASE action with available quantity', () => {
    const input = createBaseInput({
      inventoryTotal: 150, // Retention = 100. Available = 50
      planningRule: {
        ...basePlanningRule,
        belowTargetBehavior: 'RELEASE_ABOVE_CONTROL'
      }
    });

    const output = evaluateDecision(input);

    expect(output.planningBandStatus).toBe('BELOW_TARGET');
    expect(output.recommendedActionTypeId).toBe(DEFAULT_DECISION_CONFIG.releaseActionId);
    expect(output.recommendedQuantity).toBe(50);
    expect(output.recommendedDestinationId).toBe('DEST_DC1');
  });

  // Scenario 7: Hold action with positive quantity rejected
  it('Scenario 7: Validate output rejects HOLD action with positive quantity and converts to REVIEW', () => {
    const input = createBaseInput({ inventoryTotal: 150 });
    const invalidOutput = {
      recommendedActionTypeId: DEFAULT_DECISION_CONFIG.holdActionId,
      recommendedQuantity: 50,
      availableToRelease: 50
    };

    const issues = validateDecisionOutput(invalidOutput, input, DEFAULT_DECISION_CONFIG);

    expect(issues.some(i => i.code === 'ACTION_QUANTITY_CONTRADICTION' && i.blocking)).toBe(true);
  });

  // Scenario 8: Release above available quantity rejected
  it('Scenario 8: Validate output rejects RELEASE quantity exceeding available inventory', () => {
    const input = createBaseInput({ inventoryTotal: 150 }); // Retention = 100, available = 50
    const invalidOutput = {
      recommendedActionTypeId: DEFAULT_DECISION_CONFIG.releaseActionId,
      recommendedQuantity: 100, // Available is only 50
      availableToRelease: 50,
      recommendedDestinationId: 'DEST_DC1'
    };

    const issues = validateDecisionOutput(invalidOutput, input, DEFAULT_DECISION_CONFIG);

    expect(issues.some(i => i.code === 'ACTION_QUANTITY_CONTRADICTION' && i.blocking)).toBe(true);
  });

  // Scenario 9: Promotion destination conflict
  it('Scenario 9: Conflicting destination overrides in promotions trigger PROMOTION_CONFLICT and REVIEW', () => {
    const input = createBaseInput({
      inventoryTotal: 300,
      activePromotionImpacts: [
        {
          rule: { destinationOverrideId: 'DC_NORTH', retentionUpliftQuantity: null, expectedVolumeUpliftQuantity: null, expectedVolumeUpliftPercent: null, promotionMinimumOverride: null, promotionTargetOverride: null, promotionMaximumOverride: null, priorityWeightUplift: 0, actionTypeOverrideId: null } as any,
          promotion: { id: 'promo-1', promotionName: 'Promo North', phase: 'ACTIVE' } as any
        },
        {
          rule: { destinationOverrideId: 'DC_SOUTH', retentionUpliftQuantity: null, expectedVolumeUpliftQuantity: null, expectedVolumeUpliftPercent: null, promotionMinimumOverride: null, promotionTargetOverride: null, promotionMaximumOverride: null, priorityWeightUplift: 0, actionTypeOverrideId: null } as any,
          promotion: { id: 'promo-2', promotionName: 'Promo South', phase: 'ACTIVE' } as any
        }
      ]
    });

    const output = evaluateDecision(input);

    expect(output.dataQualityIssues.some(i => i.code === 'PROMOTION_CONFLICT' && i.severity === 'ERROR')).toBe(true);
    expect(output.recommendedActionTypeId).toBe(DEFAULT_DECISION_CONFIG.reviewActionId);
    expect(output.recommendedQuantity).toBe(0);
    expect(output.reasonCodes).toContain('PROMOTION_CONFLICT');
  });

  // Scenario 10: Missing action configuration
  it('Scenario 10: Missing action configuration returns CONFIGURATION_MISSING issue and does not invent string IDs', () => {
    const incompleteConfig: DecisionConfiguration = {
      configurationVersion: 'v1.0.0',
      holdActionId: null, // Missing!
      reviewActionId: 'ACT_REV_VALID',
      releaseActionId: null, // Missing!
      asPerScheduleActionId: null,
      urgentPriorityId: 'PRIO_URGENT',
      normalPriorityId: 'PRIO_NORMAL',
      lowPriorityId: 'PRIO_LOW'
    };

    const input = createBaseInput({
      configuration: incompleteConfig
    });

    const output = evaluateDecision(input);

    expect(output.dataQualityStatus).toBe('CONFIGURATION_MISSING');
    expect(output.dataQualityIssues.some(i => i.code === 'CONFIGURATION_MISSING')).toBe(true);
    expect(output.recommendedActionTypeId).toBe('ACT_REV_VALID');
    expect(output.recommendedQuantity).toBe(0);
    expect(output.recommendedActionTypeId).not.toBe('ACTION_HOLD');
  });

  // Scenario 11: Above maximum with production planned
  it('Scenario 11: Stock above maximum with planned production escalates priority to URGENT and warns capacity risk', () => {
    const input = createBaseInput({
      inventoryTotal: 600, // Max is 500
      productionContext: createMockProductionContext({ plannedPalletsNext7Days: 200 })
    });

    const output = evaluateDecision(input);

    expect(output.planningBandStatus).toBe('ABOVE_MAXIMUM');
    expect(output.recommendedActionTypeId).toBe(DEFAULT_DECISION_CONFIG.releaseActionId);
    expect(output.recommendedQuantity).toBe(500); // 600 - 100
    expect(output.recommendedPriorityLevelId).toBe(DEFAULT_DECISION_CONFIG.urgentPriorityId);
    expect(output.reasonCodes).toContain('ABOVE_MAXIMUM');
    expect(output.reasonCodes).toContain('UPCOMING_PRODUCTION_CAPACITY_RISK');
  });

  // Scenario 12: Approved recommendation followed by changed source data
  it('Scenario 12: Deterministic sourceHash changes when input snapshot source data changes', () => {
    const input1 = createBaseInput({ inventoryTotal: 250 });
    const input2 = createBaseInput({ inventoryTotal: 350 });

    const hash1 = generateDeterministicHash(input1);
    const hash2 = generateDeterministicHash(input2);

    expect(hash1).not.toBe(hash2);
  });

  // Scenario 13: No future production but valid recommendation
  it('Scenario 13: Unscheduled production does not prevent a valid release recommendation when inventory is healthy', () => {
    const input = createBaseInput({
      inventoryTotal: 300,
      productionContext: createMockProductionContext({ isScheduled: false })
    });

    const output = evaluateDecision(input);

    expect(output.planningBandStatus).toBe('ABOVE_TARGET');
    expect(output.recommendedActionTypeId).toBe(DEFAULT_DECISION_CONFIG.releaseActionId);
    expect(output.recommendedQuantity).toBe(200); // 300 - 100
    expect(output.reasonCodes).toContain('NO_FUTURE_PRODUCTION');
  });

  // Scenario 14: Multiple simultaneous data-quality warnings
  it('Scenario 14: Multiple data-quality warnings (stale inventory + stale production + promo conflict) are all accumulated', () => {
    const staleInvDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const input = createBaseInput({
      inventoryTotal: 300,
      inventoryUpdatedAt: staleInvDate,
      productionContext: createMockProductionContext({ dataFreshnessStatus: 'STALE' }),
      activePromotionImpacts: [
        {
          rule: { destinationOverrideId: 'DC_1', retentionUpliftQuantity: null, expectedVolumeUpliftQuantity: null, expectedVolumeUpliftPercent: null, promotionMinimumOverride: null, promotionTargetOverride: null, promotionMaximumOverride: null, priorityWeightUplift: 0, actionTypeOverrideId: null } as any,
          promotion: { id: 'p1', promotionName: 'Promo 1', phase: 'ACTIVE' } as any
        },
        {
          rule: { destinationOverrideId: 'DC_2', retentionUpliftQuantity: null, expectedVolumeUpliftQuantity: null, expectedVolumeUpliftPercent: null, promotionMinimumOverride: null, promotionTargetOverride: null, promotionMaximumOverride: null, priorityWeightUplift: 0, actionTypeOverrideId: null } as any,
          promotion: { id: 'p2', promotionName: 'Promo 2', phase: 'ACTIVE' } as any
        }
      ]
    });

    const output = evaluateDecision(input);

    expect(output.dataQualityIssues.some(i => i.code === 'INVENTORY_STALE')).toBe(true);
    expect(output.dataQualityIssues.some(i => i.code === 'PRODUCTION_SOURCE_STALE')).toBe(true);
    expect(output.dataQualityIssues.some(i => i.code === 'PROMOTION_CONFLICT')).toBe(true);
    expect(output.dataQualityIssues.length).toBeGreaterThanOrEqual(3);
  });

  // Scenario 15: Valid configuration resolution and production output integrity
  it('Scenario 15: Valid configuration resolution and production output integrity returns custom version and correct IDs', () => {
    const customConfig: DecisionConfiguration = {
      configurationVersion: 'v2.1.4',
      holdActionId: 'ACT_HOLD_CUSTOM',
      reviewActionId: 'ACT_REVIEW_CUSTOM',
      releaseActionId: 'ACT_RELEASE_CUSTOM',
      asPerScheduleActionId: 'ACT_SCHED_CUSTOM',
      urgentPriorityId: 'PRIO_URGENT_CUSTOM',
      normalPriorityId: 'PRIO_NORMAL_CUSTOM',
      lowPriorityId: 'PRIO_LOW_CUSTOM',
      validActionIds: ['ACT_HOLD_CUSTOM', 'ACT_REVIEW_CUSTOM', 'ACT_RELEASE_CUSTOM', 'ACT_SCHED_CUSTOM'],
      validPriorityIds: ['PRIO_URGENT_CUSTOM', 'PRIO_NORMAL_CUSTOM', 'PRIO_LOW_CUSTOM'],
      validDestinationIds: ['DEST_DC1']
    };

    const input = createBaseInput({
      inventoryTotal: 250, // Available = 150
      planningRule: {
        ...basePlanningRule,
        defaultActionTypeId: 'ACT_RELEASE_CUSTOM',
        defaultPriorityLevelId: 'PRIO_NORMAL_CUSTOM'
      },
      configuration: customConfig
    });

    const output = evaluateDecision(input);

    expect(output.versionInfo.configurationVersion).toBe('v2.1.4');
    expect(output.recommendedActionTypeId).toBe('ACT_RELEASE_CUSTOM');
    expect(output.recommendedPriorityLevelId).toBe('PRIO_NORMAL_CUSTOM');
    expect(output.dataQualityIssues.some(i => i.code === 'CONFIGURATION_MISSING')).toBe(false);
  });

  // Scenario 16: Missing configuration fallback in production evaluation
  it('Scenario 16: Missing configuration in production evaluation returns CONFIGURATION_MISSING', () => {
    const input = createBaseInput({
      configuration: null // No configuration supplied
    });

    // We do not pass a configOverride, representing production evaluation
    const output = evaluateDecision(input, undefined);

    expect(output.dataQualityStatus).toBe('CONFIGURATION_MISSING');
    expect(output.dataQualityIssues.some(i => i.code === 'CONFIGURATION_MISSING' && i.blocking)).toBe(true);
    expect(output.recommendedActionTypeId).toBeNull();
  });

  // Scenario 17: Incomplete configuration triggers CONFIGURATION_MISSING
  it('Scenario 17: Incomplete configuration missing required releaseActionId triggers blocking CONFIGURATION_MISSING', () => {
    const incompleteConfig: DecisionConfiguration = {
      configurationVersion: 'v1.0.0',
      holdActionId: 'ACT_HOLD',
      reviewActionId: 'ACT_REVIEW',
      releaseActionId: null, // Missing!
      urgentPriorityId: 'PRIO_URGENT',
      normalPriorityId: 'PRIO_NORMAL',
      lowPriorityId: 'PRIO_LOW'
    };

    const input = createBaseInput({
      configuration: incompleteConfig
    });

    const output = evaluateDecision(input);

    expect(output.dataQualityIssues.some(i => i.code === 'CONFIGURATION_MISSING' && i.blocking)).toBe(true);
    expect(output.reasonCodes).toContain('CONFIGURATION_MISSING');
  });

  // Scenario 18: Inactive action reference detection
  it('Scenario 18: Inactive action reference detection flags blocking CONFIGURATION_MISSING', () => {
    const config: DecisionConfiguration = {
      ...DEFAULT_DECISION_CONFIG,
      holdActionId: 'ACT_HOLD_INACTIVE',
      validActionIds: ['ACT_REVIEW', 'ACT_RELEASE'],
      inactiveActionIds: ['ACT_HOLD_INACTIVE']
    };

    const input = createBaseInput({ configuration: config });
    const issues = validateDecisionOutput({ recommendedActionTypeId: 'ACT_RELEASE' }, input, config);

    expect(issues.some(i => i.code === 'CONFIGURATION_MISSING' && i.blocking && i.message.includes('inactive'))).toBe(true);
  });

  // Scenario 19: Unknown priority reference detection
  it('Scenario 19: Unknown priority reference detection flags blocking CONFIGURATION_MISSING', () => {
    const config: DecisionConfiguration = {
      ...DEFAULT_DECISION_CONFIG,
      urgentPriorityId: 'PRIO_UNKNOWN',
      validPriorityIds: ['PRIO_NORMAL', 'PRIO_LOW']
    };

    const input = createBaseInput({ configuration: config });
    const issues = validateDecisionOutput({ recommendedActionTypeId: 'ACT_RELEASE' }, input, config);

    expect(issues.some(i => i.code === 'CONFIGURATION_MISSING' && i.blocking && i.message.includes('unknown'))).toBe(true);
  });

  // Scenario 20: Inactive destination reference detection
  it('Scenario 20: Inactive destination reference detection flags non-blocking warning CONFIGURATION_MISSING', () => {
    const config: DecisionConfiguration = {
      ...DEFAULT_DECISION_CONFIG,
      defaultDestinationRules: {
        defaultDestinationId: 'DEST_INACTIVE'
      },
      validDestinationIds: ['DEST_ACTIVE'],
      inactiveDestinationIds: ['DEST_INACTIVE']
    };

    const input = createBaseInput({ configuration: config });
    const issues = validateDecisionOutput({ recommendedActionTypeId: 'ACT_RELEASE' }, input, config);

    expect(issues.some(i => i.code === 'CONFIGURATION_MISSING' && !i.blocking && i.severity === 'WARNING' && i.message.includes('inactive'))).toBe(true);
  });

  // Scenario 21: Output validation blocks unknown recommended action ID
  it('Scenario 21: Output validation blocks unknown recommended action ID', () => {
    const config: DecisionConfiguration = {
      ...DEFAULT_DECISION_CONFIG,
      validActionIds: ['ACT_HOLD', 'ACT_REVIEW', 'ACT_RELEASE']
    };

    const input = createBaseInput({ configuration: config });
    const invalidOutput = {
      recommendedActionTypeId: 'ACT_UNKNOWN_999'
    };

    const issues = validateDecisionOutput(invalidOutput, input, config);

    expect(issues.some(i => i.code === 'CONFIGURATION_MISSING' && i.blocking && i.message.includes('unknown'))).toBe(true);
  });

  // Scenario 22: Output validation blocks inactive recommended priority ID
  it('Scenario 22: Output validation blocks inactive recommended priority ID', () => {
    const config: DecisionConfiguration = {
      ...DEFAULT_DECISION_CONFIG,
      validPriorityIds: ['PRIO_NORMAL', 'PRIO_LOW'],
      inactivePriorityIds: ['PRIO_URGENT']
    };

    const input = createBaseInput({ configuration: config });
    const invalidOutput = {
      recommendedActionTypeId: 'ACT_RELEASE',
      recommendedPriorityLevelId: 'PRIO_URGENT'
    };

    const issues = validateDecisionOutput(invalidOutput, input, config);

    expect(issues.some(i => i.code === 'CONFIGURATION_MISSING' && i.blocking && i.message.includes('inactive'))).toBe(true);
  });

  // Scenario 23: Missing configuration version detection
  it('Scenario 23: Missing configuration version detection flags blocking CONFIGURATION_MISSING', () => {
    const config: DecisionConfiguration = {
      ...DEFAULT_DECISION_CONFIG,
      configurationVersion: '' // Missing version
    };

    const input = createBaseInput({ configuration: config });
    const issues = validateDecisionOutput({ recommendedActionTypeId: 'ACT_RELEASE' }, input, config);

    expect(issues.some(i => i.code === 'CONFIGURATION_MISSING' && i.blocking && i.message.includes('version'))).toBe(true);
  });

  // Scenario 24: Unresolved action/priority IDs do not return placeholders
  it('Scenario 24: Unresolved action/priority IDs do not return placeholder strings', () => {
    const input = createBaseInput({
      configuration: null // Missing configuration
    });

    const output = evaluateDecision(input);

    expect(output.recommendedActionTypeId).toBeNull();
    expect(output.recommendedPriorityLevelId).toBeNull();
  });
});

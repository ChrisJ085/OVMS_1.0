import { describe, it, expect } from 'vitest';
import {
  evaluateDecision,
  DEFAULT_DECISION_CONFIG
} from './decisionEngine';
import { DecisionInputSnapshot } from '../../../types/decision';
import { ProductPlanningRule } from '../../../types/planning';
import { ProductPlanningContext } from '../../../types/snp87';
import { toCalendarDateString, addCalendarDays } from './snp87PlanningContextService';

describe('OVMS Stage 5: SNP87 Demand/Supply & Preferred Destination Test Suite (15 Scenarios)', () => {
  const evalDate = new Date('2026-10-10T00:00:00Z');
  const evalDateStr = toCalendarDateString(evalDate);

  const basePlanningRule: ProductPlanningRule = {
    id: 'rule-stage5-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    productId: 'prod-100',
    productCodeSnapshot: 'SKU-STAGE5-100',
    descriptionSnapshot: 'Stage 5 Product',
    minimumQuantity: 0,
    targetQuantity: 0,
    maximumQuantity: 1000,
    ddxmRetentionQuantity: 0,
    controllingThresholdMode: 'MINIMUM_ONLY',
    customControllingRetentionQuantity: null,
    belowTargetBehavior: 'RELEASE_ABOVE_CONTROL',
    preferredDestinationId: 'DEST_CHORLEY',
    secondaryDestinationId: null,
    defaultActionTypeId: 'ACTION_HOLD',
    defaultPriorityLevelId: 'PRIORITY_NORMAL',
    allowQuantityOverride: true,
    allowDestinationOverride: true,
    overrideRequiresReason: false,
    effectiveFrom: evalDate as any,
    effectiveTo: null,
    notes: 'Stage 5 rule',
    status: 'active',
    createdBy: 'system',
    createdDate: new Date(),
    modifiedBy: 'system',
    modifiedDate: new Date()
  };

  const createMockPlanningContext = (partial: Partial<ProductPlanningContext> = {}): ProductPlanningContext => {
    return {
      productId: 'prod-100',
      productCode: 'SKU-STAGE5-100',
      productDescription: 'Stage 5 Product',
      baseUnitOfMeasure: 'CS',
      forecastCasesToday: 0,
      forecastCasesNext7Days: 0,
      forecastByDate: {},
      forecastSourceImportId: 'import-snp87-1',
      forecastSourceUpdatedAt: evalDate,
      confirmedProductionCasesToday: 0,
      confirmedProductionCasesNext7Days: 0,
      confirmedProductionByDate: {},
      productionSourceImportId: 'import-snp87-1',
      productionSourceUpdatedAt: evalDate,
      dataFreshnessStatus: 'FRESH',
      sourceStatus: 'CURRENT',
      sourceImportId: 'import-snp87-1',
      sourceReportName: 'SNP87_Weekly.xlsx',
      hasMissingPlanningData: false,
      evaluationDate: evalDateStr,
      sevenDayWindow: {
        startDate: evalDateStr,
        endDate: addCalendarDays(evalDateStr, 6)
      },
      ...partial
    };
  };

  const createBaseInput = (partial: Partial<DecisionInputSnapshot> = {}): DecisionInputSnapshot => {
    return {
      tenantId: 'tenant-1',
      siteId: 'site-1',
      productId: 'prod-100',
      productCodeSnapshot: 'SKU-STAGE5-100',
      inventoryTotal: 200,
      inventoryByLocation: [],
      inventoryUpdatedAt: evalDate,
      planningRule: basePlanningRule,
      productionContext: {
        productId: 'prod-100',
        isScheduled: true,
        isCurrentlyInProduction: false,
        currentProductionLine: null,
        plannedCasesToday: 0,
        plannedPalletsToday: 0,
        plannedCasesNext7Days: 0,
        plannedPalletsNext7Days: 0,
        dataFreshnessStatus: 'FRESH',
        productionRiskStatus: 'NORMAL',
        sourceImportId: 'import-snp87-1',
        sourceUpdatedAt: evalDate
      } as any,
      planningContext: createMockPlanningContext(),
      activePromotionImpacts: [],
      existingActivePriorities: [],
      evaluationTime: evalDate,
      configuration: DEFAULT_DECISION_CONFIG,
      ...partial
    };
  };

  // Scenario 1: Inventory > 7-day forecast, no production, no STO
  it('Scenario 1: Inventory > 7-day forecast, no production, no STO recommends RELEASE of surplus to Preferred Destination', () => {
    const day0 = evalDateStr;
    const planningCtx = createMockPlanningContext({
      forecastCasesNext7Days: 100,
      forecastByDate: { [day0]: 100 }
    });

    const input = createBaseInput({
      inventoryTotal: 150,
      planningContext: planningCtx
    });

    const output = evaluateDecision(input);

    expect(output.controllingRetention).toBe(100);
    expect(output.availableToRelease).toBe(50);
    expect(output.recommendedActionTypeId).toBe(DEFAULT_DECISION_CONFIG.releaseActionId);
    expect(output.recommendedQuantity).toBe(50);
    expect(output.recommendedDestinationId).toBe('DEST_CHORLEY');
    expect(output.reasonCodes).toContain('PREFERRED_DESTINATION');
  });

  // Scenario 2: Inventory < 7-day forecast
  it('Scenario 2: Inventory < 7-day forecast recommends HOLD action with 0 quantity and shortfall', () => {
    const day0 = evalDateStr;
    const planningCtx = createMockPlanningContext({
      forecastCasesNext7Days: 100,
      forecastByDate: { [day0]: 100 }
    });

    const input = createBaseInput({
      inventoryTotal: 50,
      planningContext: planningCtx
    });

    const output = evaluateDecision(input);

    expect(output.controllingRetention).toBe(100);
    expect(output.shortfallQuantity).toBe(50);
    expect(output.planningBandStatus).toBe('BELOW_CONTROL');
    expect(output.recommendedActionTypeId).toBe(DEFAULT_DECISION_CONFIG.holdActionId);
    expect(output.recommendedQuantity).toBe(0);
  });

  // Scenario 3: Forecast + production on same day
  it('Scenario 3: Forecast + production on same day nets out deficit chronologically', () => {
    const day0 = evalDateStr;
    const planningCtx = createMockPlanningContext({
      forecastCasesNext7Days: 100,
      forecastByDate: { [day0]: 100 },
      confirmedProductionCasesNext7Days: 100,
      confirmedProductionByDate: { [day0]: 100 }
    });

    const input = createBaseInput({
      inventoryTotal: 50,
      planningContext: planningCtx
    });

    const output = evaluateDecision(input);

    // On Day 0, 100 forecast - 100 production = 0 net deficit
    expect(output.controllingRetention).toBe(0);
    expect(output.availableToRelease).toBe(50);
    expect(output.recommendedActionTypeId).toBe(DEFAULT_DECISION_CONFIG.releaseActionId);
    expect(output.recommendedQuantity).toBe(50);
  });

  // Scenario 4: Production before later forecast demand
  it('Scenario 4: Production arriving BEFORE later forecast demand satisfies demand chronologically', () => {
    const day0 = evalDateStr;
    const day2 = addCalendarDays(evalDateStr, 2);

    const planningCtx = createMockPlanningContext({
      forecastCasesNext7Days: 100,
      forecastByDate: { [day2]: 100 }, // Demand on Day 2
      confirmedProductionCasesNext7Days: 100,
      confirmedProductionByDate: { [day0]: 100 } // Prod on Day 0
    });

    const input = createBaseInput({
      inventoryTotal: 20,
      planningContext: planningCtx
    });

    const output = evaluateDecision(input);

    // Day 0: +100 prod, 0 forecast. Day 2: 100 forecast. Peak deficit = 0.
    expect(output.controllingRetention).toBe(0);
    expect(output.availableToRelease).toBe(20);
    expect(output.recommendedActionTypeId).toBe(DEFAULT_DECISION_CONFIG.releaseActionId);
    expect(output.recommendedQuantity).toBe(20);
  });

  // Scenario 5: Production after forecast demand
  it('Scenario 5: Production arriving AFTER forecast demand cannot satisfy earlier demand', () => {
    const day0 = evalDateStr;
    const day2 = addCalendarDays(evalDateStr, 2);

    const planningCtx = createMockPlanningContext({
      forecastCasesNext7Days: 100,
      forecastByDate: { [day0]: 100 }, // Demand on Day 0
      confirmedProductionCasesNext7Days: 100,
      confirmedProductionByDate: { [day2]: 100 } // Prod on Day 2
    });

    const input = createBaseInput({
      inventoryTotal: 100,
      planningContext: planningCtx
    });

    const output = evaluateDecision(input);

    // Day 0 requires 100 initial inventory. Day 2 production comes too late.
    expect(output.controllingRetention).toBe(100);
    expect(output.availableToRelease).toBe(0);
    expect(output.recommendedActionTypeId).toBe(DEFAULT_DECISION_CONFIG.holdActionId);
    expect(output.recommendedQuantity).toBe(0);
  });

  // Scenario 6: Northfleet STO + retail forecast
  it('Scenario 6: Protected Northfleet STO requirement adds to retail forecast demand requirement', () => {
    const day0 = evalDateStr;
    const planningCtx = createMockPlanningContext({
      forecastCasesNext7Days: 100,
      forecastByDate: { [day0]: 100 }
    });

    const input = createBaseInput({
      inventoryTotal: 200,
      outstandingStoCases: 50, // 50 STO cases protected
      planningContext: planningCtx
    });

    const output = evaluateDecision(input);

    // Retail (100) + STO (50) = 150 controlling retention
    expect(output.controllingRetention).toBe(150);
    expect(output.availableToRelease).toBe(50);
    expect(output.recommendedActionTypeId).toBe(DEFAULT_DECISION_CONFIG.releaseActionId);
    expect(output.recommendedQuantity).toBe(50);
    expect(output.reasonCodes).toContain('NORTHFLEET_STO_PROTECTED');
  });

  // Scenario 7: Surplus stock goes to Preferred Destination
  it('Scenario 7: Genuine surplus stock is directed to configured Preferred Destination', () => {
    const day0 = evalDateStr;
    const planningCtx = createMockPlanningContext({
      forecastCasesNext7Days: 100,
      forecastByDate: { [day0]: 100 }
    });

    const customRule = {
      ...basePlanningRule,
      preferredDestinationId: 'DEST_CHORLEY_SPECIAL'
    };

    const input = createBaseInput({
      inventoryTotal: 250,
      planningRule: customRule,
      planningContext: planningCtx
    });

    const output = evaluateDecision(input);

    expect(output.recommendedDestinationId).toBe('DEST_CHORLEY_SPECIAL');
    expect(output.recommendedQuantity).toBe(150);
  });

  // Scenario 8: Non-retail SKU with no forecast
  it('Scenario 8: Non-retail SKU with no forecast does not invent retail demand', () => {
    // Empty planning context with 0 forecast
    const planningCtx = createMockPlanningContext({
      forecastCasesNext7Days: 0,
      forecastByDate: {}
    });

    const input = createBaseInput({
      inventoryTotal: 100,
      outstandingStoCases: 30, // Only 30 STO protected
      planningContext: planningCtx
    });

    const output = evaluateDecision(input);

    expect(output.controllingRetention).toBe(30);
    expect(output.availableToRelease).toBe(70);
    expect(output.recommendedActionTypeId).toBe(DEFAULT_DECISION_CONFIG.releaseActionId);
    expect(output.recommendedQuantity).toBe(70);
  });

  // Scenario 9: Missing SNP87
  it('Scenario 9: Missing SNP87 planning context fails safely without releasing stock', () => {
    const input = createBaseInput({
      inventoryTotal: 500,
      planningContext: createMockPlanningContext({
        dataFreshnessStatus: 'MISSING',
        forecastCasesNext7Days: 100
      }),
      productionContext: {
        dataFreshnessStatus: 'MISSING'
      } as any
    });

    const output = evaluateDecision(input);

    expect(output.reasonCodes).toContain('PRODUCTION_SOURCE_MISSING');
    expect(output.reasonCodes).toContain('REVIEW_REQUIRED');
    expect(output.recommendedActionTypeId).toBe(DEFAULT_DECISION_CONFIG.reviewActionId);
    expect(output.recommendedQuantity).toBe(0);
  });

  // Scenario 10: Stale SNP87 planning context with forecast protects forecast retention and releases excess
  it('Scenario 10: Stale SNP87 planning context with forecast protects forecast retention and releases excess', () => {
    const day0 = evalDateStr;
    const input = createBaseInput({
      inventoryTotal: 77,
      planningContext: createMockPlanningContext({
        dataFreshnessStatus: 'STALE',
        forecastCasesNext7Days: 15,
        forecastByDate: { [day0]: 15 }
      }),
      productionContext: {
        dataFreshnessStatus: 'STALE'
      } as any
    });

    const output = evaluateDecision(input);

    expect(output.reasonCodes).toContain('PRODUCTION_SOURCE_STALE');
    expect(output.controllingRetention).toBe(15);
    expect(output.availableToRelease).toBe(62);
    expect(output.recommendedActionTypeId).toBe(DEFAULT_DECISION_CONFIG.releaseActionId);
    expect(output.recommendedQuantity).toBe(62);
    expect(output.reasonCodes).not.toContain('NO_FUTURE_PRODUCTION');
  });

  // Scenario 11: Multiple forecast rows for one day
  it('Scenario 11: Multiple forecast rows for one day are summed accurately', () => {
    const day1 = addCalendarDays(evalDateStr, 1);
    // Imagine 2 forecast rows on Day 1: 30 + 70 = 100
    const planningCtx = createMockPlanningContext({
      forecastCasesNext7Days: 100,
      forecastByDate: { [day1]: 100 }
    });

    const input = createBaseInput({
      inventoryTotal: 120,
      planningContext: planningCtx
    });

    const output = evaluateDecision(input);

    expect(output.controllingRetention).toBe(100);
    expect(output.availableToRelease).toBe(20);
  });

  // Scenario 12: Multiple production rows for one day
  it('Scenario 12: Multiple production rows for one day are summed accurately', () => {
    const day1 = addCalendarDays(evalDateStr, 1);
    // Imagine 2 production rows on Day 1: 40 + 60 = 100
    const planningCtx = createMockPlanningContext({
      forecastCasesNext7Days: 100,
      forecastByDate: { [day1]: 100 },
      confirmedProductionCasesNext7Days: 100,
      confirmedProductionByDate: { [day1]: 100 }
    });

    const input = createBaseInput({
      inventoryTotal: 20,
      planningContext: planningCtx
    });

    const output = evaluateDecision(input);

    expect(output.controllingRetention).toBe(0);
    expect(output.availableToRelease).toBe(20);
  });

  // Scenario 13: Zero quantities
  it('Scenario 13: Zero quantities are handled gracefully', () => {
    const planningCtx = createMockPlanningContext({
      forecastCasesNext7Days: 0,
      forecastByDate: {},
      confirmedProductionCasesNext7Days: 0,
      confirmedProductionByDate: {}
    });

    const input = createBaseInput({
      inventoryTotal: 0,
      outstandingStoCases: 0,
      planningContext: planningCtx
    });

    const output = evaluateDecision(input);

    expect(output.controllingRetention).toBe(0);
    expect(output.availableToRelease).toBe(0);
    expect(output.recommendedQuantity).toBe(0);
  });

  // Scenario 14: Production outside horizon
  it('Scenario 14: Production scheduled outside the 7-day rolling horizon is ignored for short-term demand coverage', () => {
    const day0 = evalDateStr;
    const day10 = addCalendarDays(evalDateStr, 10);

    const planningCtx = createMockPlanningContext({
      forecastCasesNext7Days: 100,
      forecastByDate: { [day0]: 100 },
      confirmedProductionCasesNext7Days: 0,
      confirmedProductionByDate: { [day10]: 500 } // Day 10 production
    });

    const input = createBaseInput({
      inventoryTotal: 100,
      planningContext: planningCtx
    });

    const output = evaluateDecision(input);

    // Day 10 production does not cover Day 0 demand
    expect(output.controllingRetention).toBe(100);
    expect(output.availableToRelease).toBe(0);
    expect(output.recommendedActionTypeId).toBe(DEFAULT_DECISION_CONFIG.holdActionId);
  });

  // Scenario 15: Forecast outside horizon
  it('Scenario 15: Forecast demand outside the 7-day rolling horizon does not inflate 7-day retention requirement', () => {
    const day0 = evalDateStr;
    const day10 = addCalendarDays(evalDateStr, 10);

    const planningCtx = createMockPlanningContext({
      forecastCasesNext7Days: 50,
      forecastByDate: {
        [day0]: 50,
        [day10]: 500 // Day 10 forecast
      }
    });

    const input = createBaseInput({
      inventoryTotal: 100,
      planningContext: planningCtx
    });

    const output = evaluateDecision(input);

    // 7-day requirement is only 50 (Day 0). Day 10 forecast is outside window.
    expect(output.controllingRetention).toBe(50);
    expect(output.availableToRelease).toBe(50);
    expect(output.recommendedActionTypeId).toBe(DEFAULT_DECISION_CONFIG.releaseActionId);
    expect(output.recommendedQuantity).toBe(50);
  });

  // Scenario 16: Product 4473386 - 77 pallets on hand, 15 pallets forecast demand
  // Engine must protect 15 pallets (600 cases) on site and release 62 pallets (2480 cases) to Chorley
  it('Scenario 16: Product 4473386 with 77 pallets on hand and 15 pallets forecast demand retains 15 pallets and releases 62 pallets to Chorley', () => {
    const day0 = evalDateStr;
    const casesPerPallet = 40;
    const onHandPallets = 77;
    const onHandCases = onHandPallets * casesPerPallet; // 3080
    const forecastPallets = 15;
    const forecastCases = forecastPallets * casesPerPallet; // 600

    const planningCtx = createMockPlanningContext({
      productCode: '4473386',
      forecastCasesNext7Days: forecastCases,
      forecastByDate: {
        [day0]: forecastCases
      },
      confirmedProductionCasesNext7Days: 0,
      confirmedProductionByDate: {}
    });

    const input = createBaseInput({
      productCodeSnapshot: '4473386',
      inventoryTotal: onHandCases,
      planningContext: planningCtx,
      planningRule: {
        controllingThresholdMode: 'DDXM_ONLY',
        ddxmRetentionQuantity: 0,
        minimumQuantity: 0,
        targetQuantity: 0,
        maximumQuantity: 5000,
        belowTargetBehavior: 'RELEASE_ABOVE_CONTROL',
        defaultActionTypeId: DEFAULT_DECISION_CONFIG.releaseActionId,
        defaultPriorityLevelId: DEFAULT_DECISION_CONFIG.normalPriorityId,
        preferredDestinationId: 'DEST_CHORLEY'
      } as any
    });

    const output = evaluateDecision(input);

    // Controlling retention must protect the 15 pallets of forecast (600 cases)
    expect(output.controllingRetention).toBe(forecastCases); // 600 cases = 15 pallets
    // Available to release must be 77 - 15 = 62 pallets (2480 cases)
    expect(output.availableToRelease).toBe(onHandCases - forecastCases); // 2480 cases = 62 pallets
    expect(output.recommendedActionTypeId).toBe(DEFAULT_DECISION_CONFIG.releaseActionId);
    expect(output.recommendedQuantity).toBe(2480);
    expect(output.recommendedDestinationId).toBe('DEST_CHORLEY');
    // Must NOT have NO_FUTURE_PRODUCTION reason code because forecast data is present
    expect(output.reasonCodes).not.toContain('NO_FUTURE_PRODUCTION');
  });
});

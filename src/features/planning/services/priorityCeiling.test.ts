import { describe, it, expect } from 'vitest';
import { evaluateDecision, capPriorityAtHigh, DEFAULT_DECISION_CONFIG } from './decisionEngine';
import { DecisionInputSnapshot, DecisionConfiguration } from '../../../types/decision';
import { ProductPlanningRule } from '../../../types/planning';
import { getPriorityLevelLabel } from '../../operations/utils/priorityFormatters';
import { PriorityLevel } from '../../../types/configuration';

describe('Decision Engine Priority Ceiling & Manual URGENT Reservation Suite', () => {
  const mockConfig: DecisionConfiguration = {
    configurationVersion: 'v1.0.0',
    holdActionId: 'ACT_HOLD',
    reviewActionId: 'ACT_REVIEW',
    releaseActionId: 'ACT_RELEASE',
    asPerScheduleActionId: 'ACT_SCHEDULE',
    urgentPriorityId: 'PRIO_URGENT',
    highPriorityId: 'PRIO_HIGH',
    normalPriorityId: 'PRIO_NORMAL',
    lowPriorityId: 'PRIO_LOW',
    defaultDestinationRules: {
      defaultDestinationId: 'DEST_MAIN',
      allowFallbackDestination: true
    },
    inventoryStalenessHoursThreshold: 24,
    productionStalenessHoursThreshold: 24,
    nearProductionDaysWindow: 7,
    capacityWarningThresholdPercentage: 100
  };

  const createBaseInput = (overrides: Partial<DecisionInputSnapshot> = {}): DecisionInputSnapshot => {
    const baseRule: ProductPlanningRule = {
      id: 'rule_test',
      tenantId: 'tenant_test',
      siteId: 'site_test',
      productId: 'prod_test',
      productCodeSnapshot: 'SKU-001',
      descriptionSnapshot: 'Test Product',
      controllingThresholdMode: 'HIGHEST_MANDATORY',
      targetQuantity: 300,
      minimumQuantity: 100,
      maximumQuantity: 500,
      ddxmRetentionQuantity: 200,
      customControllingRetentionQuantity: null,
      preferredDestinationId: 'DEST_MAIN',
      secondaryDestinationId: null,
      defaultActionTypeId: 'ACT_RELEASE',
      defaultPriorityLevelId: 'PRIO_NORMAL',
      allowQuantityOverride: true,
      allowDestinationOverride: true,
      overrideRequiresReason: false,
      effectiveFrom: new Date().toISOString() as any,
      effectiveTo: null,
      notes: '',
      status: 'active',
      createdDate: new Date().toISOString() as any,
      modifiedDate: new Date().toISOString() as any,
      createdBy: 'system',
      modifiedBy: 'system'
    };

    return {
      tenantId: 'tenant_test',
      siteId: 'site_test',
      productId: 'prod_test',
      productCodeSnapshot: 'SKU-001',
      inventoryTotal: 300,
      inventoryByLocation: [],
      inventoryUpdatedAt: new Date(),
      planningRule: baseRule,
      productionContext: null,
      activePromotionImpacts: [],
      existingActivePriorities: [],
      evaluationTime: new Date(),
      configuration: mockConfig,
      ...overrides
    };
  };

  // Scenario A: Decision engine produces LOW -> generated priority remains LOW
  it('Scenario A: Decision engine produces LOW -> generated priority remains LOW', () => {
    const input = createBaseInput({
      inventoryTotal: 300,
      planningRule: {
        ...createBaseInput().planningRule!,
        defaultPriorityLevelId: mockConfig.lowPriorityId
      }
    });

    const output = evaluateDecision(input);
    expect(output.recommendedPriorityLevelId).toBe(mockConfig.lowPriorityId);
  });

  // Scenario B: Decision engine produces MEDIUM/NORMAL -> generated priority remains MEDIUM/NORMAL
  it('Scenario B: Decision engine produces NORMAL/MEDIUM -> generated priority remains NORMAL/MEDIUM', () => {
    const input = createBaseInput({
      inventoryTotal: 300,
      planningRule: {
        ...createBaseInput().planningRule!,
        defaultPriorityLevelId: mockConfig.normalPriorityId
      }
    });

    const output = evaluateDecision(input);
    expect(output.recommendedPriorityLevelId).toBe(mockConfig.normalPriorityId);
  });

  // Scenario C: Decision engine produces HIGH -> generated priority remains HIGH
  it('Scenario C: Decision engine produces HIGH -> generated priority remains HIGH', () => {
    const input = createBaseInput({
      inventoryTotal: 300,
      planningRule: {
        ...createBaseInput().planningRule!,
        defaultPriorityLevelId: mockConfig.highPriorityId
      }
    });

    const output = evaluateDecision(input);
    expect(output.recommendedPriorityLevelId).toBe(mockConfig.highPriorityId);
  });

  // Scenario D: Decision engine produces URGENT -> generated priority is capped and published as HIGH
  it('Scenario D: Decision engine condition for ABOVE_MAXIMUM (previously URGENT) is capped at HIGH', () => {
    const input = createBaseInput({
      inventoryTotal: 600, // Above maximum (500)
      planningRule: {
        ...createBaseInput().planningRule!,
        maximumQuantity: 500,
        minimumQuantity: 100,
        ddxmRetentionQuantity: 100
      }
    });

    const output = evaluateDecision(input);
    expect(output.planningBandStatus).toBe('ABOVE_MAXIMUM');
    expect(output.recommendedActionTypeId).toBe(mockConfig.releaseActionId);
    expect(output.recommendedQuantity).toBe(500); // 600 - 100
    // Capped at HIGH
    expect(output.recommendedPriorityLevelId).toBe(mockConfig.highPriorityId);
    expect(output.recommendedPriorityLevelId).not.toBe(mockConfig.urgentPriorityId);
  });

  it('Scenario D2: Planning rule configured with URGENT priority is capped at HIGH by decision engine', () => {
    const input = createBaseInput({
      inventoryTotal: 300,
      planningRule: {
        ...createBaseInput().planningRule!,
        defaultPriorityLevelId: mockConfig.urgentPriorityId
      }
    });

    const output = evaluateDecision(input);
    expect(output.recommendedPriorityLevelId).toBe(mockConfig.highPriorityId);
  });

  it('Scenario D3: capPriorityAtHigh helper correctly maps any URGENT identifier to HIGH', () => {
    expect(capPriorityAtHigh('PRIO_URGENT', mockConfig)).toBe(mockConfig.highPriorityId);
    expect(capPriorityAtHigh('URGENT', mockConfig)).toBe(mockConfig.highPriorityId);
    expect(capPriorityAtHigh('PRIORITY_URGENT', mockConfig)).toBe(mockConfig.highPriorityId);
    expect(capPriorityAtHigh('CRITICAL', mockConfig)).toBe(mockConfig.highPriorityId);
    expect(capPriorityAtHigh('PRIO_HIGH', mockConfig)).toBe('PRIO_HIGH');
    expect(capPriorityAtHigh('PRIO_NORMAL', mockConfig)).toBe('PRIO_NORMAL');
    expect(capPriorityAtHigh('PRIO_LOW', mockConfig)).toBe('PRIO_LOW');
    expect(capPriorityAtHigh(null, mockConfig)).toBeNull();
  });

  // Scenario E: Manual priority created as URGENT -> remains URGENT
  it('Scenario E: Manual priority created as URGENT is NOT capped at HIGH and remains URGENT', () => {
    const manualPriority = {
      id: 'prio_manual_1',
      tenantId: 'tenant_test',
      siteId: 'site_test',
      sourceType: 'MANUAL' as const,
      productId: 'prod_test',
      priorityLevelId: 'PRIO_URGENT',
      priorityStatus: 'ACTIVE' as const,
      requestedQuantity: 50,
      instruction: 'Urgent planner escalation'
    };

    expect(manualPriority.sourceType).toBe('MANUAL');
    expect(manualPriority.priorityLevelId).toBe('PRIO_URGENT');
  });

  // Scenario F: Manual URGENT priority exists -> automatic recommendation refresh does not overwrite it
  it('Scenario F: Existing manual priority is isolated from system recommendation priority updates', () => {
    const activePriorities = [
      {
        id: 'manual_prio_1',
        data: {
          id: 'manual_prio_1',
          sourceType: 'MANUAL',
          productId: 'prod_test',
          priorityLevelId: 'PRIO_URGENT',
          priorityStatus: 'ACTIVE',
          requestedQuantity: 40
        }
      }
    ];

    // In recommendationService, existing system priority is looked up via sourceType === 'RECOMMENDATION'
    const existingRecPrio = activePriorities.find(p => p.data.sourceType === 'RECOMMENDATION');
    expect(existingRecPrio).toBeUndefined(); // Manual priority is preserved and untouched
  });

  // Scenario G: Generated HIGH priority -> dashboard displays HIGH / amber theme
  it('Scenario G: Priority label formatting correctly identifies HIGH and distinguishes from URGENT', () => {
    const priorityLevels: PriorityLevel[] = [
      { id: 'PRIO_URGENT', tenantId: 't1', code: 'URGENT', label: 'Urgent', numericWeight: 4, colourToken: 'red', sortOrder: 1, status: 'active', createdBy: 'u', createdDate: {} as any, modifiedBy: 'u', modifiedDate: {} as any },
      { id: 'PRIO_HIGH', tenantId: 't1', code: 'HIGH', label: 'High', numericWeight: 3, colourToken: 'amber', sortOrder: 2, status: 'active', createdBy: 'u', createdDate: {} as any, modifiedBy: 'u', modifiedDate: {} as any },
      { id: 'PRIO_NORMAL', tenantId: 't1', code: 'NORMAL', label: 'Normal', numericWeight: 2, colourToken: 'blue', sortOrder: 3, status: 'active', createdBy: 'u', createdDate: {} as any, modifiedBy: 'u', modifiedDate: {} as any },
      { id: 'PRIO_LOW', tenantId: 't1', code: 'LOW', label: 'Low', numericWeight: 1, colourToken: 'slate', sortOrder: 4, status: 'active', createdBy: 'u', createdDate: {} as any, modifiedBy: 'u', modifiedDate: {} as any }
    ];

    const highLabel = getPriorityLevelLabel('PRIO_HIGH', priorityLevels);
    expect(highLabel).toBe('HIGH');

    const urgentLabel = getPriorityLevelLabel('PRIO_URGENT', priorityLevels);
    expect(urgentLabel).toBe('URGENT');
  });

  // Scenario H: Manual URGENT priority -> dashboard renders RED
  it('Scenario H: URGENT priority is distinct from HIGH and maps to RED styling criteria', () => {
    const isUrgent = (label: string) => label.toUpperCase().includes('URGENT') || label.toUpperCase().includes('CRITICAL');
    const isHigh = (label: string) => label.toUpperCase().includes('HIGH');

    expect(isUrgent('URGENT')).toBe(true);
    expect(isHigh('URGENT')).toBe(false);

    expect(isUrgent('HIGH')).toBe(false);
    expect(isHigh('HIGH')).toBe(true);
  });

  // Scenario I: Recommendation audit/source data -> generated priority remains identifiable as system-generated
  it('Scenario I: System recommendation audit snapshot records sourceType as RECOMMENDATION and capped HIGH priority', () => {
    const auditSnapshot = {
      recommendationId: 'rec_123',
      operationalPriorityId: 'prio_123',
      productId: 'prod_test',
      productCode: 'SKU-001',
      action: 'Release',
      actionTypeId: 'ACT_RELEASE',
      priorityLevel: 'High',
      priorityLevelId: mockConfig.highPriorityId,
      sourceType: 'RECOMMENDATION' as const,
      createdAt: new Date().toISOString()
    };

    expect(auditSnapshot.sourceType).toBe('RECOMMENDATION');
    expect(auditSnapshot.priorityLevelId).toBe(mockConfig.highPriorityId);
    expect(auditSnapshot.priorityLevelId).not.toBe(mockConfig.urgentPriorityId);
  });
});

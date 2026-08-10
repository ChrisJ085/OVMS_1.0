import { describe, it, expect, vi } from 'vitest';
import { 
  parseNorthfleetStoPaste, 
  parseDeliveryDate, 
  deriveStoStatus 
} from './northfleetStoService';
import { evaluateDecision, DEFAULT_DECISION_CONFIG } from './decisionEngine';
import { DecisionInputSnapshot } from '../../../types/decision';
import { ProductPlanningRule } from '../../../types/planning';

describe('Northfleet STO Service & Decision Logic Suite', () => {
  const basePlanningRule: ProductPlanningRule = {
    id: 'rule-test-sto',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    productId: 'prod-100',
    productCodeSnapshot: '3414254',
    descriptionSnapshot: 'Andrex Classic Clean 4RL',
    minimumQuantity: 1000,
    targetQuantity: 2000,
    maximumQuantity: 5000,
    ddxmRetentionQuantity: 500,
    controllingThresholdMode: 'HIGHEST_MANDATORY',
    customControllingRetentionQuantity: null,
    belowTargetBehavior: 'RELEASE_ABOVE_CONTROL',
    preferredDestinationId: 'DEST_CHORLEY',
    secondaryDestinationId: null,
    defaultActionTypeId: 'ACT_RELEASE',
    defaultPriorityLevelId: 'PRIO_NORMAL',
    allowQuantityOverride: true,
    allowDestinationOverride: true,
    overrideRequiresReason: true,
    effectiveFrom: {} as any,
    effectiveTo: null,
    notes: 'Test rule',
    status: 'active',
    createdDate: {} as any,
    modifiedDate: {} as any,
    createdBy: 'test-user',
    modifiedBy: 'test-user'
  };

  const createBaseInput = (partial: Partial<DecisionInputSnapshot> = {}): DecisionInputSnapshot => ({
    tenantId: 'tenant-1',
    siteId: 'site-1',
    productId: 'prod-100',
    productCodeSnapshot: '3414254',
    inventoryTotal: 5000,
    inventoryByLocation: [],
    inventoryUpdatedAt: new Date(),
    planningRule: basePlanningRule,
    productionContext: null,
    activePromotionImpacts: [],
    existingActivePriorities: [],
    outstandingStoCases: 0,
    evaluationTime: new Date(),
    configuration: DEFAULT_DECISION_CONFIG,
    ...partial
  });

  describe('1. Paste Parsing & Date Logic', () => {
    it('Scenario 1: Standard 6-column tab paste is parsed correctly', () => {
      const pasteData = `14-Aug-2026\t4505115590\t3414254\t52\t3900\t75`;
      const rows = parseNorthfleetStoPaste(pasteData, 2026);

      expect(rows.length).toBe(1);
      expect(rows[0].parsedSuccessfully).toBe(true);
      expect(rows[0].stoNumber).toBe('4505115590');
      expect(rows[0].productCode).toBe('3414254');
      expect(rows[0].pallets).toBe(52);
      expect(rows[0].cases).toBe(3900);
      expect(rows[0].casesPerPallet).toBe(75);
    });

    it('Scenario 2: Header line is automatically stripped', () => {
      const pasteData = `Delivery Date\tSTO Number\tProduct Code\tPallets\tCases\tCases/Pallet\n14-Aug-2026\t4505115590\t3414254\t52\t3900\t75`;
      const rows = parseNorthfleetStoPaste(pasteData, 2026);

      expect(rows.length).toBe(1);
      expect(rows[0].stoNumber).toBe('4505115590');
    });

    it('Scenario 3: Barrow Collection Date is exactly 1 calendar day before Northfleet Delivery Date', () => {
      const deliveryDateStr = '14-Aug-2026';
      const parsedDelivery = parseDeliveryDate(deliveryDateStr, 2026)!;
      expect(parsedDelivery).not.toBeNull();

      const collectionDate = new Date(parsedDelivery.getTime() - 24 * 60 * 60 * 1000);

      expect(parsedDelivery.getDate()).toBe(14);
      expect(parsedDelivery.getMonth()).toBe(7); // August = index 7
      expect(collectionDate.getDate()).toBe(13);
      expect(collectionDate.getMonth()).toBe(7);
    });

    it('Scenario 4: Short dates like "10-Aug" correctly resolve using active planning year', () => {
      const parsed = parseDeliveryDate('10-Aug', 2026)!;
      expect(parsed.getFullYear()).toBe(2026);
      expect(parsed.getMonth()).toBe(7);
      expect(parsed.getDate()).toBe(10);
    });

    it('Scenario 5: Derive STO Status based on Barrow Collection Date relative to today', () => {
      const today = new Date();
      const futureDate = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);
      const pastDate = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);

      expect(deriveStoStatus(futureDate)).toBe('UPCOMING');
      expect(deriveStoStatus(today)).toBe('DUE_FOR_COLLECTION');
      expect(deriveStoStatus(pastDate)).toBe('ASSUMED_DISPATCHED');
    });
  });

  describe('2. Recommendation Logic with STO Protection', () => {
    it('Scenario 6: Inventory > Total Protected Stock recommends releasing difference to Preferred Destination (Chorley), NOT Northfleet', () => {
      // Base Min = 1000. STO Protection = 3900 cases. Total Protected = 4900 cases.
      // Inventory = 5000 cases.
      // Available to Overflow = 5000 - 4900 = 100 cases.
      const input = createBaseInput({
        inventoryTotal: 5000,
        outstandingStoCases: 3900
      });

      const output = evaluateDecision(input);

      expect(output.recommendedActionTypeId).toBe(DEFAULT_DECISION_CONFIG.releaseActionId);
      expect(output.recommendedQuantity).toBe(100);
      expect(output.recommendedDestinationId).toBe('DEST_CHORLEY'); // NOT Northfleet!
      expect(output.reasonCodes).toContain('NORTHFLEET_STO_PROTECTED' as any);
      expect(output.structuredExplanation.thresholds.some(l => l.includes('3900'))).toBe(true);
    });

    it('Scenario 7: Inventory <= Total Protected Stock returns HOLD action with quantity 0', () => {
      // Base Min = 1000. STO Protection = 3900. Total Protected = 4900.
      // Inventory = 4500 (Less than 4900 protected stock).
      const input = createBaseInput({
        inventoryTotal: 4500,
        outstandingStoCases: 3900
      });

      const output = evaluateDecision(input);

      expect(output.recommendedActionTypeId).toBe(DEFAULT_DECISION_CONFIG.holdActionId);
      expect(output.recommendedQuantity).toBe(0);
      expect(output.reasonCodes).toContain('BELOW_CONTROLLING_RETENTION');
    });

    it('Scenario 8: Zero STO Protection evaluates purely based on Base Retention Rules', () => {
      // Base Min = 1000. STO Protection = 0.
      // Inventory = 5000. Available = 4000.
      const input = createBaseInput({
        inventoryTotal: 5000,
        outstandingStoCases: 0
      });

      const output = evaluateDecision(input);

      expect(output.recommendedActionTypeId).toBe(DEFAULT_DECISION_CONFIG.releaseActionId);
      expect(output.recommendedQuantity).toBe(4000);
      expect(output.reasonCodes).not.toContain('NORTHFLEET_STO_PROTECTED' as any);
    });

    it('Scenario 9: STO Protection accumulates on top of Promotion Uplift', () => {
      // Base Min = 1000. Promo Uplift = 500. STO Protection = 2000.
      // Total Protected = 1000 + 500 + 2000 = 3500.
      // Inventory = 5000. Available = 1500.
      const input = createBaseInput({
        inventoryTotal: 5000,
        outstandingStoCases: 2000,
        activePromotionImpacts: [
          {
            rule: { retentionUpliftQuantity: 500 } as any,
            promotion: { id: 'promo-1', phase: 'ACTIVE' } as any
          }
        ]
      });

      const output = evaluateDecision(input);

      expect(output.recommendedActionTypeId).toBe(DEFAULT_DECISION_CONFIG.releaseActionId);
      expect(output.recommendedQuantity).toBe(1500);
    });
  });
});

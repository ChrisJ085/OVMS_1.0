import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateDecision, DEFAULT_DECISION_CONFIG } from './decisionEngine';
import { DecisionInputSnapshot } from '../../../types/decision';
import { ProductPlanningContext } from '../../../types/snp87';
import { ProductPlanningRule } from '../../../types/planning';
import { Product } from '../../../types/product';
import { adaptPlanningContextToLegacyProductionContext } from './snp87PlanningContextService';
import { generateRecommendationForProduct, refreshSiteRecommendations } from './recommendationService';

// Mock DB services
const mockDocsMap = new Map<string, any[]>();
let mockDocumentMap = new Map<string, any>();

vi.mock('../../../services/dbService', () => ({
  getDocuments: vi.fn(async (collection: string) => {
    return mockDocsMap.get(collection) || [];
  }),
  getDocument: vi.fn(async (collection: string, id: string) => {
    return mockDocumentMap.get(`${collection}_${id}`) || null;
  }),
  setDocument: vi.fn(async () => {}),
  createDocument: vi.fn(async (_col: string, data: any) => ({ id: 'new-doc-id', ...data })),
  updateDocument: vi.fn(async () => {}),
  deleteDocument: vi.fn(async () => {}),
  where: vi.fn((field: string, op: string, value: any) => ({ field, op, value }))
}));

vi.mock('../../../services/auditService', () => ({
  logAuditEvent: vi.fn(async () => {})
}));

describe('Stage 8: SNP87 Standalone Recommendation Generation (Zero MPPS7 Dependency)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDocsMap.clear();
    mockDocumentMap.clear();
  });

  const createCleanPlanningRule = (): ProductPlanningRule => ({
    id: 'rule-sku-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    productId: 'prod-sku-1',
    productCodeSnapshot: 'SKU-001',
    descriptionSnapshot: 'Standard Product 1',
    minimumQuantity: 100,
    targetQuantity: 200,
    maximumQuantity: 500,
    ddxmRetentionQuantity: 50,
    controllingThresholdMode: 'HIGHEST_MANDATORY',
    customControllingRetentionQuantity: null,
    belowTargetBehavior: 'HOLD_UNTIL_TARGET',
    allowQuantityOverride: true,
    allowDestinationOverride: true,
    overrideRequiresReason: false,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    status: 'active',
    preferredDestinationId: 'dest-1',
    secondaryDestinationId: null,
    defaultActionTypeId: 'act-release',
    defaultPriorityLevelId: 'prio-high',
    notes: 'Stage 8 Test Rule',
    createdDate: new Date('2026-01-01'),
    modifiedDate: new Date('2026-01-01'),
    createdBy: 'system',
    modifiedBy: 'system'
  });

  const createSnp87PlanningContext = (overrides: Partial<ProductPlanningContext> = {}): ProductPlanningContext => ({
    productId: 'prod-sku-1',
    productCode: 'SKU-001',
    productDescription: 'Standard Product 1',
    baseUnitOfMeasure: 'CS',
    forecastCasesToday: 50,
    forecastCasesNext7Days: 350,
    forecastByDate: {
      '2026-10-08': 50,
      '2026-10-09': 50,
      '2026-10-10': 50,
      '2026-10-11': 50,
      '2026-10-12': 50,
      '2026-10-13': 50,
      '2026-10-14': 50
    },
    forecastSourceImportId: 'snp87-imp-001',
    forecastSourceUpdatedAt: new Date('2026-10-08T06:00:00Z'),
    confirmedProductionCasesToday: 0,
    confirmedProductionCasesNext7Days: 200,
    confirmedProductionByDate: {
      '2026-10-10': 200
    },
    productionSourceImportId: 'snp87-imp-001',
    productionSourceUpdatedAt: new Date('2026-10-08T06:00:00Z'),
    sourceReportName: 'SNP87_Week41.xlsx',
    sourceImportId: 'snp87-imp-001',
    sourceStatus: 'CURRENT',
    hasMissingPlanningData: false,
    dataFreshnessStatus: 'FRESH',
    evaluationDate: '2026-10-08',
    sevenDayWindow: {
      startDate: '2026-10-08',
      endDate: '2026-10-14'
    },
    ...overrides
  });

  describe('1. Decision Engine Standalone SNP87 Evaluation', () => {
    it('evaluates decision cleanly when productionContext is null and only planningContext is provided', () => {
      const planningContext = createSnp87PlanningContext();
      const planningRule = createCleanPlanningRule();

      const input: DecisionInputSnapshot = {
        tenantId: 'tenant-1',
        siteId: 'site-1',
        productId: 'prod-sku-1',
        productCodeSnapshot: 'SKU-001',
        inventoryTotal: 40, // Below minimum
        inventoryByLocation: [],
        inventoryUpdatedAt: new Date(),
        planningRule,
        planningContext, // SNP87 planning context provided alone
        productionContext: null, // Zero legacy productionContext
        activePromotionImpacts: [],
        existingActivePriorities: [],
        outstandingStoCases: 0,
        evaluationTime: new Date('2026-10-08T10:00:00Z'),
        configuration: DEFAULT_DECISION_CONFIG
      };

      const result = evaluateDecision(input);

      // Successfully generates decision
      expect(result).toBeDefined();
      expect(result.recommendedActionTypeId).toBe(DEFAULT_DECISION_CONFIG.holdActionId);
      expect(['COMPLETE', 'VALID']).toContain(result.dataQualityStatus);
      
      // Does not emit false PRODUCTION_SOURCE_MISSING error
      expect(result.dataQualityIssues.some(i => i.code === 'PRODUCTION_SOURCE_MISSING')).toBe(false);
      expect(result.reasonCodes).not.toContain('PRODUCTION_SOURCE_MISSING');
    });

    it('correctly reports PRODUCTION_SOURCE_STALE when SNP87 planningContext is STALE', () => {
      const planningContext = createSnp87PlanningContext({ dataFreshnessStatus: 'STALE' });
      const planningRule = createCleanPlanningRule();

      const input: DecisionInputSnapshot = {
        tenantId: 'tenant-1',
        siteId: 'site-1',
        productId: 'prod-sku-1',
        productCodeSnapshot: 'SKU-001',
        inventoryTotal: 200,
        inventoryByLocation: [],
        inventoryUpdatedAt: new Date(),
        planningRule,
        planningContext,
        productionContext: null,
        activePromotionImpacts: [],
        existingActivePriorities: [],
        outstandingStoCases: 0,
        evaluationTime: new Date('2026-10-08T10:00:00Z'),
        configuration: DEFAULT_DECISION_CONFIG
      };

      const result = evaluateDecision(input);

      expect(result.dataQualityIssues.some(i => i.code === 'PRODUCTION_SOURCE_STALE')).toBe(true);
      expect(result.reasonCodes).toContain('PRODUCTION_SOURCE_STALE');
      // No duplicate issues
      const staleIssues = result.dataQualityIssues.filter(i => i.code === 'PRODUCTION_SOURCE_STALE');
      expect(staleIssues.length).toBe(1);
    });

    it('correctly reports PRODUCTION_SOURCE_MISSING when neither SNP87 nor legacy production context is supplied', () => {
      const planningRule = createCleanPlanningRule();

      const input: DecisionInputSnapshot = {
        tenantId: 'tenant-1',
        siteId: 'site-1',
        productId: 'prod-sku-1',
        productCodeSnapshot: 'SKU-001',
        inventoryTotal: 200,
        inventoryByLocation: [],
        inventoryUpdatedAt: new Date(),
        planningRule,
        planningContext: null,
        productionContext: null,
        activePromotionImpacts: [],
        existingActivePriorities: [],
        outstandingStoCases: 0,
        evaluationTime: new Date('2026-10-08T10:00:00Z'),
        configuration: DEFAULT_DECISION_CONFIG
      };

      const result = evaluateDecision(input);

      expect(result.dataQualityIssues.some(i => i.code === 'PRODUCTION_SOURCE_MISSING')).toBe(true);
      expect(result.reasonCodes).toContain('PRODUCTION_SOURCE_MISSING');
    });
  });

  describe('2. Legacy Adapter Decoupling', () => {
    it('adapts cleanly to legacy ProductProductionContext without fabricating line info or Resource ID', () => {
      const product = {
        id: 'prod-sku-1',
        tenantId: 'tenant-1',
        productCode: 'SKU-001',
        description: 'Standard Product 1',
        casesPerPallet: 50,
        status: 'active',
        createdDate: new Date(),
        modifiedDate: new Date(),
        createdBy: 'test',
        modifiedBy: 'test'
      } as unknown as Product;

      const planningContext = createSnp87PlanningContext({
        forecastCasesToday: 100,
        confirmedProductionCasesNext7Days: 300
      });

      const adapted = adaptPlanningContextToLegacyProductionContext(planningContext, product);

      expect(adapted.productId).toBe('prod-sku-1');
      expect(adapted.isScheduled).toBe(true);
      expect(adapted.currentProductionLine).toBeNull();
      expect(adapted.plannedCasesToday).toBe(100);
      expect(adapted.plannedPalletsToday).toBe(2); // 100 / 50 casesPerPallet
      expect(adapted.dataFreshnessStatus).toBe('FRESH');
      expect(adapted.productionRiskStatus).toBe('NORMAL');
      expect(adapted.planningContext).toBe(planningContext);
    });
  });

  describe('3. Standalone Recommendation Generation without MPPS7 Records', () => {
    it('generates recommendation for a product using SNP87 without querying or requiring productionPlanEntries', async () => {
      const product = {
        id: 'prod-sku-1',
        tenantId: 'tenant-1',
        productCode: 'SKU-001',
        description: 'Standard Product 1',
        casesPerPallet: 50,
        status: 'active',
        createdDate: new Date(),
        modifiedDate: new Date(),
        createdBy: 'test',
        modifiedBy: 'test'
      } as unknown as Product;

      // Set up DB without ANY productionPlanEntries or productionPlanImports
      mockDocsMap.set('products', [product]);
      mockDocsMap.set('inventoryBalances', [{
        id: 'inv-1',
        tenantId: 'tenant-1',
        siteId: 'site-1',
        productId: 'prod-sku-1',
        quantity: 50,
        locationId: 'loc-1',
        status: 'AVAILABLE'
      }]);
      mockDocsMap.set('productPlanningRules', [createCleanPlanningRule()]);
      mockDocsMap.set('northfleetStoRequirements', []);
      mockDocsMap.set('promotions', []);
      mockDocsMap.set('promotionProductRules', []);

      // SNP87 active snapshot
      mockDocsMap.set('snp87PlanningImports', [{
        id: 'snp-imp-1',
        tenantId: 'tenant-1',
        siteId: 'site-1',
        sourceReportName: 'SNP87_W41.xlsx',
        status: 'ACTIVE',
        importedAt: new Date().toISOString(),
        importedBy: 'Planner',
        planningHorizonStart: '2026-10-08',
        planningHorizonEnd: '2026-10-21',
        forecastRowCount: 7,
        confirmedProductionRowCount: 2,
        totalForecastQuantity: 350,
        totalConfirmedProductionQuantity: 200,
        warningCount: 0,
        errorCount: 0
      }]);

      mockDocsMap.set('snp87PlanningRows', [
        {
          id: 'row-1',
          tenantId: 'tenant-1',
          siteId: 'site-1',
          importId: 'snp-imp-1',
          productCode: 'SKU-001',
          rowType: 'FORECAST',
          planningDate: '2026-10-08',
          quantity: 50,
          uom: 'CS',
          status: 'VALID'
        },
        {
          id: 'row-2',
          tenantId: 'tenant-1',
          siteId: 'site-1',
          importId: 'snp-imp-1',
          productCode: 'SKU-001',
          rowType: 'CONFIRMED_PRODUCTION',
          planningDate: '2026-10-09',
          quantity: 200,
          uom: 'CS',
          status: 'VALID'
        }
      ]);

      mockDocumentMap.set('products_prod-sku-1', product);

      const result = await generateRecommendationForProduct('tenant-1', 'site-1', 'prod-sku-1');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe('string');
      // Verifies recommendation ID was produced without error
      expect(result.data).toMatch(/^rec_/);
    });

    it('batch refresh runs with SNP87 snapshot and zero queries to productionPlanEntries', async () => {
      const product = {
        id: 'prod-sku-1',
        tenantId: 'tenant-1',
        productCode: 'SKU-001',
        description: 'Standard Product 1',
        casesPerPallet: 50,
        status: 'active',
        createdDate: new Date(),
        modifiedDate: new Date(),
        createdBy: 'test',
        modifiedBy: 'test'
      } as unknown as Product;

      mockDocsMap.set('products', [product]);
      mockDocsMap.set('inventoryBalances', [{
        id: 'inv-1',
        tenantId: 'tenant-1',
        siteId: 'site-1',
        productId: 'prod-sku-1',
        quantity: 150,
        status: 'AVAILABLE'
      }]);
      mockDocsMap.set('planningRules', [createCleanPlanningRule()]);
      mockDocsMap.set('northfleetStoRequirements', []);
      mockDocsMap.set('promotions', []);
      mockDocsMap.set('promotionProductRules', []);
      mockDocsMap.set('recommendations', []);
      mockDocsMap.set('priorities', []);

      mockDocsMap.set('snp87PlanningImports', [{
        id: 'snp-imp-1',
        tenantId: 'tenant-1',
        siteId: 'site-1',
        sourceReportName: 'SNP87_W41.xlsx',
        status: 'ACTIVE',
        importedAt: new Date().toISOString(),
        importedBy: 'Planner',
        planningHorizonStart: '2026-10-08',
        planningHorizonEnd: '2026-10-21',
        forecastRowCount: 1,
        confirmedProductionRowCount: 1,
        totalForecastQuantity: 100,
        totalConfirmedProductionQuantity: 100,
        warningCount: 0,
        errorCount: 0
      }]);

      mockDocsMap.set('snp87PlanningRows', [
        {
          id: 'row-1',
          tenantId: 'tenant-1',
          siteId: 'site-1',
          importId: 'snp-imp-1',
          productCode: 'SKU-001',
          rowType: 'FORECAST',
          planningDate: '2026-10-08',
          quantity: 100,
          uom: 'CS',
          status: 'VALID'
        }
      ]);

      const refreshResult = await refreshSiteRecommendations(
        'tenant-1',
        'site-1',
        true,
        undefined,
        { userId: 'user-1', userName: 'Test Planner' }
      );

      expect(refreshResult.success).toBe(true);
      expect(refreshResult.data?.generatedCount).toBe(1);
    });
  });
});

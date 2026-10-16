import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateRecommendationForProduct, refreshSiteRecommendations } from './recommendationService';
import { ProductPlanningContext } from '../../../types/snp87';
import { ProductPlanningRule } from '../../../types/planning';
import { Product } from '../../../types/product';
import { RecommendationAuditSnapshot, AuditEvent } from '../../../types/audit';

// In-memory mock databases
const mockDocsMap = new Map<string, any[]>();
const mockDocumentMap = new Map<string, any>();
const loggedAuditEvents: any[] = [];

vi.mock('../../../services/dbService', () => ({
  getDocuments: vi.fn(async (collection: string) => {
    return mockDocsMap.get(collection) || [];
  }),
  getDocument: vi.fn(async (collection: string, id: string) => {
    return mockDocumentMap.get(`${collection}_${id}`) || null;
  }),
  setDocument: vi.fn(async (collection: string, id: string, data: any) => {
    mockDocumentMap.set(`${collection}_${id}`, { id, ...data });
    const list = mockDocsMap.get(collection) || [];
    const existingIdx = list.findIndex(d => d.id === id);
    if (existingIdx >= 0) {
      list[existingIdx] = { id, ...data };
    } else {
      list.push({ id, ...data });
    }
    mockDocsMap.set(collection, list);
  }),
  createDocument: vi.fn(async (collection: string, data: any) => {
    const id = `doc_${Math.random().toString(36).substring(2, 9)}`;
    const doc = { id, ...data };
    mockDocumentMap.set(`${collection}_${id}`, doc);
    const list = mockDocsMap.get(collection) || [];
    list.push(doc);
    mockDocsMap.set(collection, list);
    return doc;
  }),
  updateDocument: vi.fn(async (collection: string, id: string, updates: any) => {
    const existing = mockDocumentMap.get(`${collection}_${id}`) || {};
    const updated = { ...existing, ...updates };
    mockDocumentMap.set(`${collection}_${id}`, updated);
    const list = mockDocsMap.get(collection) || [];
    const idx = list.findIndex(d => d.id === id);
    if (idx >= 0) {
      list[idx] = updated;
    }
  }),
  deleteDocument: vi.fn(async (collection: string, id: string) => {
    mockDocumentMap.delete(`${collection}_${id}`);
    const list = mockDocsMap.get(collection) || [];
    mockDocsMap.set(collection, list.filter(d => d.id !== id));
  }),
  where: vi.fn((field: string, op: string, value: any) => ({ field, op, value }))
}));

vi.mock('../../../services/auditService', () => ({
  logAuditEvent: vi.fn(async (event: any) => {
    loggedAuditEvents.push(event);
    return 'audit-log-id-123';
  })
}));

describe('Stage 9: SNP87 Source Freshness & Recommendation Audit Trail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDocsMap.clear();
    mockDocumentMap.clear();
    loggedAuditEvents.length = 0;
  });

  const createTestProduct = (id = 'prod-sku-1', code = 'SKU-001'): Product => ({
    id,
    tenantId: 'tenant-1',
    productCode: code,
    description: 'Standard Test Product 1',
    casesPerPallet: 50,
    status: 'active',
    createdDate: new Date(),
    modifiedDate: new Date(),
    createdBy: 'system',
    modifiedBy: 'system'
  } as unknown as Product);

  const createPlanningRule = (productId = 'prod-sku-1', preferredDestinationId = 'dest-northfleet'): ProductPlanningRule => ({
    id: `rule-${productId}`,
    tenantId: 'tenant-1',
    siteId: 'site-mk',
    productId,
    productCodeSnapshot: 'SKU-001',
    descriptionSnapshot: 'Standard Test Product 1',
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
    preferredDestinationId,
    secondaryDestinationId: null,
    defaultActionTypeId: 'act-release',
    defaultPriorityLevelId: 'prio-high',
    notes: 'Stage 9 Rule',
    createdDate: new Date('2026-01-01'),
    modifiedDate: new Date('2026-01-01'),
    createdBy: 'system',
    modifiedBy: 'system'
  });

  const setupBaseEnvironment = (options?: {
    inventoryQty?: number;
    forecast7d?: number;
    confirmedProd7d?: number;
    stoCases?: number;
    snpFreshness?: 'FRESH' | 'STALE' | 'MISSING';
    importId?: string;
    reportName?: string;
    importedAt?: string;
  }) => {
    const product = createTestProduct();
    const invQty = options?.inventoryQty ?? 300;
    const forecast7d = options?.forecast7d ?? 150;
    const confirmedProd7d = options?.confirmedProd7d ?? 100;
    const stoCases = options?.stoCases ?? 40;
    const freshness = options?.snpFreshness ?? 'FRESH';
    const importId = options?.importId ?? 'snp87-imp-901';
    const reportName = options?.reportName ?? 'SNP87_W41_Planning.xlsx';
    const importedAt = options?.importedAt ?? new Date().toISOString();

    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const inTwoDaysStr = new Date(Date.now() + 172800000).toISOString().split('T')[0];

    mockDocsMap.set('products', [product]);
    mockDocumentMap.set('products_prod-sku-1', product);

    mockDocsMap.set('inventoryBalances', [{
      id: 'inv-1',
      tenantId: 'tenant-1',
      siteId: 'site-mk',
      productId: 'prod-sku-1',
      quantity: invQty,
      locationId: 'loc-barrow-01',
      status: 'AVAILABLE',
      modifiedDate: new Date().toISOString()
    }]);

    mockDocsMap.set('planningRules', [createPlanningRule('prod-sku-1', 'dest-northfleet')]);

    mockDocsMap.set('northfleetStoRequirements', [{
      id: 'sto-101',
      tenantId: 'tenant-1',
      siteId: 'site-mk',
      productId: 'prod-sku-1',
      cases: stoCases,
      barrowCollectionDate: todayStr,
      destinationLocation: 'Northfleet CDC',
      carrier: 'Carrier A',
      status: 'SCHEDULED'
    }]);

    mockDocsMap.set('promotions', []);
    mockDocsMap.set('promotionProductRules', []);
    mockDocsMap.set('recommendations', []);
    mockDocsMap.set('priorities', []);

    if (freshness !== 'MISSING') {
      const importDoc = {
        id: importId,
        tenantId: 'tenant-1',
        siteId: 'site-mk',
        sourceReportName: reportName,
        importStatus: 'COMMITTED',
        status: 'ACTIVE',
        importedAt,
        importedBy: 'Senior Planner',
        planningHorizonStart: todayStr,
        planningHorizonEnd: inTwoDaysStr,
        forecastRowCount: 7,
        confirmedProductionRowCount: 2,
        totalForecastQuantity: forecast7d,
        totalConfirmedProductionQuantity: confirmedProd7d,
        warningCount: 0,
        errorCount: 0
      };
      mockDocsMap.set('snp87Imports', [importDoc]);
      mockDocumentMap.set(`snp87Imports_${importId}`, importDoc);

      mockDocsMap.set('snp87PlanningRows', [
        {
          id: 'row-f1',
          tenantId: 'tenant-1',
          siteId: 'site-mk',
          importId,
          productId: 'prod-sku-1',
          productCode: 'SKU-001',
          productNumber: 'SKU-001',
          rowType: 'FORECAST',
          planningType: 'FORECAST',
          planningDate: todayStr,
          quantity: 50,
          forecastQuantity: 50,
          uom: 'CS',
          status: 'VALID'
        },
        {
          id: 'row-f2',
          tenantId: 'tenant-1',
          siteId: 'site-mk',
          importId,
          productId: 'prod-sku-1',
          productCode: 'SKU-001',
          productNumber: 'SKU-001',
          rowType: 'FORECAST',
          planningType: 'FORECAST',
          planningDate: tomorrowStr,
          quantity: 100,
          forecastQuantity: 100,
          uom: 'CS',
          status: 'VALID'
        },
        {
          id: 'row-p1',
          tenantId: 'tenant-1',
          siteId: 'site-mk',
          importId,
          productId: 'prod-sku-1',
          productCode: 'SKU-001',
          productNumber: 'SKU-001',
          rowType: 'CONFIRMED_PRODUCTION',
          planningType: 'CONFIRMED_PRODUCTION',
          planningDate: inTwoDaysStr,
          quantity: confirmedProd7d,
          confirmedProductionQuantity: confirmedProd7d,
          uom: 'CS',
          status: 'VALID'
        }
      ]);
    } else {
      mockDocsMap.set('snp87Imports', []);
      mockDocsMap.set('snp87PlanningRows', []);
    }
  };

  it('1 & 2. Recommendation audit contains SNP87 forecast and confirmed production context', async () => {
    setupBaseEnvironment({ forecast7d: 150, confirmedProd7d: 220 });

    const result = await generateRecommendationForProduct(
      'tenant-1',
      'site-mk',
      'prod-sku-1',
      true
    );

    expect(result.success).toBe(true);
    const snapshot = result.snapshot;
    expect(snapshot).toBeDefined();

    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const inTwoDaysStr = new Date(Date.now() + 172800000).toISOString().split('T')[0];

    // 1. Forecast context
    expect(snapshot?.snp87SourceSnapshot).toBeDefined();
    expect(snapshot?.snp87SourceSnapshot?.forecastCasesToday).toBe(50);
    expect(snapshot?.snp87SourceSnapshot?.forecastCasesNext7Days).toBe(150);
    expect(snapshot?.snp87SourceSnapshot?.forecastByDate[todayStr]).toBe(50);
    expect(snapshot?.snp87SourceSnapshot?.forecastByDate[tomorrowStr]).toBe(100);

    // 2. Confirmed production context
    expect(snapshot?.snp87SourceSnapshot?.confirmedProductionCasesNext7Days).toBe(220);
    expect(snapshot?.snp87SourceSnapshot?.confirmedProductionByDate[inTwoDaysStr]).toBe(220);
  });

  it('3 & 4. Audit contains source import ID and source timestamp', async () => {
    const importId = 'snp87-w41-xyz';
    const importedAt = '2026-10-08T06:30:00.000Z';
    setupBaseEnvironment({ importId, importedAt });

    const result = await generateRecommendationForProduct(
      'tenant-1',
      'site-mk',
      'prod-sku-1',
      true
    );

    const snapshot = result.snapshot;
    expect(snapshot?.snp87SourceSnapshot?.sourceImportId).toBe(importId);
    expect(snapshot?.snp87SourceSnapshot?.importedAt).toBe(importedAt);
  });

  it('5. Audit contains inventory snapshot seen at decision time without mutating inventory', async () => {
    setupBaseEnvironment({ inventoryQty: 450 });

    const result = await generateRecommendationForProduct(
      'tenant-1',
      'site-mk',
      'prod-sku-1',
      true
    );

    const snapshot = result.snapshot;
    expect(snapshot?.inventorySnapshot).toBeDefined();
    expect(snapshot?.inventorySnapshot?.totalCases).toBe(450);
    expect(snapshot?.inventorySnapshot?.balanceCount).toBe(1);

    // Verify inventory balances in DB are completely unmutated
    const balances = mockDocsMap.get('inventoryBalances') || [];
    expect(balances[0].quantity).toBe(450);
  });

  it('6. Audit contains Northfleet STO protection context', async () => {
    setupBaseEnvironment({ stoCases: 85 });

    const result = await generateRecommendationForProduct(
      'tenant-1',
      'site-mk',
      'prod-sku-1',
      true
    );

    const snapshot = result.snapshot;
    expect(snapshot?.northfleetProtectionSnapshot).toBeDefined();
    expect(snapshot?.northfleetProtectionSnapshot?.outstandingCases).toBe(85);
    expect(snapshot?.decisionContext?.outstandingStoCases).toBe(85);
  });

  it('7. Audit contains Preferred Destination configured at evaluation time', async () => {
    setupBaseEnvironment();

    const result = await generateRecommendationForProduct(
      'tenant-1',
      'site-mk',
      'prod-sku-1',
      true
    );

    const snapshot = result.snapshot;
    expect(snapshot?.destinationId).toBe('dest-northfleet');
    expect(snapshot?.configurationSnapshot?.preferredDestinationId).toBe('dest-northfleet');
  });

  it('8. Audit contains decision explanation and supporting reasons', async () => {
    setupBaseEnvironment();

    const result = await generateRecommendationForProduct(
      'tenant-1',
      'site-mk',
      'prod-sku-1',
      true
    );

    const snapshot = result.snapshot;
    expect(snapshot?.explanation).toBeDefined();
    expect(typeof snapshot?.explanation).toBe('string');
    expect(snapshot?.supportingReasons).toBeDefined();
    expect(Array.isArray(snapshot?.supportingReasons)).toBe(true);
    expect(snapshot?.supportingReasons!.length).toBeGreaterThan(0);
  });

  it('9. Audit retains recommendation fingerprint', async () => {
    setupBaseEnvironment();

    const result = await generateRecommendationForProduct(
      'tenant-1',
      'site-mk',
      'prod-sku-1',
      true
    );

    const snapshot = result.snapshot;
    expect(snapshot?.fingerprint).toBeDefined();
    expect(typeof snapshot?.fingerprint).toBe('string');
    expect(snapshot?.fingerprint!.length).toBeGreaterThan(0);
    expect(snapshot?.sourceFingerprint).toBe(snapshot?.fingerprint);
  });

  it('10 & 11. Immutability & Regeneration: Historical audit remains unchanged when SNP87 changes', async () => {
    // 1. Initial run with SNP87 Import #1
    setupBaseEnvironment({
      inventoryQty: 350,
      forecast7d: 100,
      importId: 'import-v1',
      reportName: 'SNP87_V1.xlsx',
      importedAt: '2026-10-08T06:00:00Z'
    });

    const run1 = await generateRecommendationForProduct('tenant-1', 'site-mk', 'prod-sku-1', true);
    expect(run1.success).toBe(true);
    const rec1Id = run1.data!;
    const snap1 = run1.snapshot!;
    expect(snap1.snp87SourceSnapshot?.sourceImportId).toBe('import-v1');

    const rec1Doc = mockDocumentMap.get(`recommendations_${rec1Id}`);
    expect(rec1Doc.sourceSnapshot.planningContext.sourceImportId).toBe('import-v1');
    const originalRec1Fingerprint = rec1Doc.sourceFingerprint;

    // 2. Later, a new SNP87 Import #2 arrives with different forecast
    setupBaseEnvironment({
      inventoryQty: 350,
      forecast7d: 250, // Higher forecast
      importId: 'import-v2',
      reportName: 'SNP87_V2.xlsx',
      importedAt: '2026-10-08T12:00:00Z'
    });
    // Retain existing active rec in DB
    mockDocsMap.set('recommendations', [rec1Doc]);

    const run2 = await generateRecommendationForProduct('tenant-1', 'site-mk', 'prod-sku-1', true);
    expect(run2.success).toBe(true);
    const rec2Id = run2.data!;
    const snap2 = run2.snapshot!;

    // Historical immutability verification:
    // Old recommendation document was marked SUPERSEDED with supersededByRecommendationId
    const rec1DocAfter = mockDocumentMap.get(`recommendations_${rec1Id}`);
    expect(rec1DocAfter.recommendationStatus).toBe('SUPERSEDED');
    expect(rec1DocAfter.supersededByRecommendationId).toBe(rec2Id);
    // Old source snapshot did NOT change! It still points to import-v1
    expect(rec1DocAfter.sourceSnapshot.planningContext.sourceImportId).toBe('import-v1');
    expect(rec1DocAfter.sourceFingerprint).toBe(originalRec1Fingerprint);

    // New recommendation is linked to import-v2
    expect(rec2Id).not.toBe(rec1Id);
    expect(snap2.snp87SourceSnapshot?.sourceImportId).toBe('import-v2');
    expect(snap2.snp87SourceSnapshot?.sourceReportName).toBe('SNP87_V2.xlsx');
  });

  it('12. Stale SNP87 source is clearly marked in audit snapshot', async () => {
    // When import is older than freshness threshold (168h)
    const oldImportTime = new Date(Date.now() - 240 * 3600 * 1000).toISOString();
    setupBaseEnvironment({
      snpFreshness: 'STALE',
      importedAt: oldImportTime
    });

    const result = await generateRecommendationForProduct(
      'tenant-1',
      'site-mk',
      'prod-sku-1',
      true
    );

    const snapshot = result.snapshot;
    expect(snapshot?.snp87SourceSnapshot?.dataFreshnessStatus).toBe('STALE');
    expect(snapshot?.decisionContext?.snp87Freshness).toBe('STALE');
  });

  it('13. Missing SNP87 source fails safely with explicit status in audit', async () => {
    setupBaseEnvironment({ snpFreshness: 'MISSING' });

    const result = await generateRecommendationForProduct(
      'tenant-1',
      'site-mk',
      'prod-sku-1',
      true
    );

    expect(result.success).toBe(true);
    const snapshot = result.snapshot;
    expect(snapshot?.snp87SourceSnapshot?.dataFreshnessStatus).toBe('MISSING');
    expect(snapshot?.snp87SourceSnapshot?.hasMissingPlanningData).toBe(true);
  });

  it('14. Generation ID links all recommendations generated during a bulk refresh', async () => {
    setupBaseEnvironment();

    const refreshResult = await refreshSiteRecommendations(
      'tenant-1',
      'site-mk',
      true,
      undefined,
      { userId: 'planner-42', userName: 'Alice Planner', userEmail: 'alice@ovms.com' }
    );

    expect(refreshResult.success).toBe(true);
    expect(refreshResult.data?.generationId).toBeDefined();
    const generationId = refreshResult.data!.generationId!;
    expect(generationId).toMatch(/^gen_/);

    // Verify SiteRecommendationRun document has generationId
    const runDoc = mockDocumentMap.get(`siteRecommendationRuns_tenant-1_site-mk`);
    expect(runDoc).toBeDefined();
    expect(runDoc.generationId).toBe(generationId);
    expect(runDoc.candidateCount).toBe(1);
    expect(runDoc.sourceImportIds).toContain('snp87-imp-901');

    // Verify AuditEvent was logged with generationId and snapshots
    const auditLog = loggedAuditEvents.find(e => e.eventType === 'RECOMMENDATIONS_GENERATED');
    expect(auditLog).toBeDefined();
    expect(auditLog.generationId).toBe(generationId);
    expect(auditLog.performedBy).toBe('planner-42');
    expect(auditLog.recommendationSnapshots.length).toBe(1);
    expect(auditLog.recommendationSnapshots[0].generationId).toBe(generationId);
    expect(auditLog.recommendationSnapshots[0].snp87SourceSnapshot?.sourceImportId).toBe('snp87-imp-901');
  });

  it('15 & 16. Manual priorities are NOT recorded as recommendations and audit source semantics remain correct', async () => {
    setupBaseEnvironment();

    // Add an existing manual priority
    mockDocsMap.set('priorities', [{
      id: 'prio-manual-99',
      tenantId: 'tenant-1',
      siteId: 'site-mk',
      productId: 'prod-sku-1',
      sourceType: 'MANUAL',
      priorityStatus: 'ACTIVE',
      instruction: 'Manual operator instruction'
    }]);

    const result = await generateRecommendationForProduct(
      'tenant-1',
      'site-mk',
      'prod-sku-1',
      true
    );

    const snapshot = result.snapshot;
    // 16. Audit source semantics remain strictly RECOMMENDATION and AUTO_PUBLISHED
    expect(snapshot?.sourceType).toBe('RECOMMENDATION');
    expect(snapshot?.recommendationStatus).toBe('AUTO_PUBLISHED');

    // 15. The manual priority is still in DB uncorrupted
    const priorities = mockDocsMap.get('priorities') || [];
    const manualPrio = priorities.find(p => p.id === 'prio-manual-99');
    expect(manualPrio).toBeDefined();
    expect(manualPrio.sourceType).toBe('MANUAL');
  });
});

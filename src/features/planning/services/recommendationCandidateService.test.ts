import { describe, it, expect } from 'vitest';
import { filterRecommendationCandidates } from './recommendationCandidateService';
import { Product } from '../../../types/product';
import { NorthfleetStoRequirement } from '../../../types/production';
import { Snp87PlanningRow } from '../../../types/snp87';
import { Priority } from '../../../types/priority';

describe('Stage 6: Recommendation Candidate Filtering for SNP87', () => {
  const baseEvalDate = new Date('2026-10-10T08:00:00Z');

  const createActiveProduct = (id: string, code: string): Product => ({
    id,
    tenantId: 'tenant-1',
    siteId: 'site-barrow',
    productCode: code,
    description: `Product ${code}`,
    casesPerPallet: 100,
    status: 'active',
    categoryId: 'cat-1',
    unitOfMeasureId: 'uom-cs',
    unitsPerCase: 24,
    configurations: {},
    createdBy: 'system',
    createdDate: new Date(),
    modifiedBy: 'system',
    modifiedDate: new Date()
  } as Product);

  const createInactiveProduct = (id: string, code: string): Product => ({
    ...createActiveProduct(id, code),
    status: 'inactive'
  } as Product);

  it('includes a zero-inventory product with SNP87 forecast in the active planning horizon', () => {
    const p1 = createActiveProduct('p1', 'SKU-001');
    const p2 = createActiveProduct('p2', 'SKU-002'); // zero inventory, no forecast, no production

    const inventoryMap = new Map<string, number>([
      ['p1', 0],
      ['p2', 0]
    ]);

    const snp87Rows: Snp87PlanningRow[] = [
      {
        id: 'row-1',
        importId: 'imp-1',
        tenantId: 'tenant-1',
        siteId: 'site-barrow',
        rowIndex: 1,
        orderSku: 'SKU-001',
        productNumber: 'SKU-001',
        productDescription: 'Product SKU-001',
        location: 'BARROW',
        sort: 1,
        infoObject: 'FORECAST',
        rowText: 'Forecast',
        planningType: 'FORECAST',
        startDateRaw: '2026-10-12',
        endDateRaw: '2026-10-12',
        planningDate: '2026-10-12', // Day 2 (within 7-day horizon)
        startDate: '2026-10-12',
        endDate: '2026-10-12',
        quantity: 500,
        forecastQuantity: 500,
        confirmedProductionQuantity: null,
        baseUnitOfMeasure: 'CS',
        productId: 'p1',
        productCodeSnapshot: 'SKU-001',
        descriptionSnapshot: 'Product SKU-001',
        productMatched: true,
        validationStatus: 'VALID',
        validationErrors: [],
        validationWarnings: [],
        rawSourceRow: {},
        createdAt: '2026-10-10'
      }
    ];

    const result = filterRecommendationCandidates({
      activeProducts: [p1, p2],
      inventoryTotalsByProductId: inventoryMap,
      stoRequirements: [],
      snp87Rows,
      activeRecommendations: [],
      activePriorities: [],
      evaluationDate: baseEvalDate
    });

    expect(result.snp87ForecastCandidates.has('p1')).toBe(true);
    expect(result.candidateProductIds.has('p1')).toBe(true);
    expect(result.candidateProducts.map(p => p.id)).toEqual(['p1']);
    expect(result.totalCandidates).toBe(1);
  });

  it('includes a zero-inventory product with confirmed production in the active planning horizon', () => {
    const p1 = createActiveProduct('p1', 'SKU-001');
    const p2 = createActiveProduct('p2', 'SKU-002');

    const inventoryMap = new Map<string, number>([
      ['p1', 0],
      ['p2', 0]
    ]);

    const snp87Rows: Snp87PlanningRow[] = [
      {
        id: 'row-2',
        importId: 'imp-1',
        tenantId: 'tenant-1',
        siteId: 'site-barrow',
        rowIndex: 2,
        orderSku: 'SKU-002',
        productNumber: 'SKU-002',
        productDescription: 'Product SKU-002',
        location: 'BARROW',
        sort: 2,
        infoObject: 'CONFIRMED_PRODUCTION',
        rowText: 'Confirmed Production',
        planningType: 'CONFIRMED_PRODUCTION',
        startDateRaw: '2026-10-14',
        endDateRaw: '2026-10-14',
        planningDate: '2026-10-14', // Day 4 (within 7-day horizon)
        startDate: '2026-10-14',
        endDate: '2026-10-14',
        quantity: 800,
        forecastQuantity: null,
        confirmedProductionQuantity: 800,
        baseUnitOfMeasure: 'CS',
        productId: 'p2',
        productCodeSnapshot: 'SKU-002',
        descriptionSnapshot: 'Product SKU-002',
        productMatched: true,
        validationStatus: 'VALID',
        validationErrors: [],
        validationWarnings: [],
        rawSourceRow: {},
        createdAt: '2026-10-10'
      }
    ];

    const result = filterRecommendationCandidates({
      activeProducts: [p1, p2],
      inventoryTotalsByProductId: inventoryMap,
      stoRequirements: [],
      snp87Rows,
      activeRecommendations: [],
      activePriorities: [],
      evaluationDate: baseEvalDate
    });

    expect(result.snp87ProductionCandidates.has('p2')).toBe(true);
    expect(result.candidateProductIds.has('p2')).toBe(true);
    expect(result.candidateProductIds.has('p1')).toBe(false);
    expect(result.candidateProducts.map(p => p.id)).toEqual(['p2']);
  });

  it('excludes a zero-inventory product with neither forecast nor production unless another candidate rule applies', () => {
    const p1 = createActiveProduct('p1', 'SKU-001'); // zero inv, no forecast, no production, no STO, no rec
    const p2 = createActiveProduct('p2', 'SKU-002'); // has positive inventory

    const inventoryMap = new Map<string, number>([
      ['p1', 0],
      ['p2', 150]
    ]);

    const result = filterRecommendationCandidates({
      activeProducts: [p1, p2],
      inventoryTotalsByProductId: inventoryMap,
      stoRequirements: [],
      snp87Rows: [],
      activeRecommendations: [],
      activePriorities: [],
      evaluationDate: baseEvalDate
    });

    expect(result.candidateProductIds.has('p1')).toBe(false);
    expect(result.candidateProductIds.has('p2')).toBe(true);
    expect(result.candidateProducts.map(p => p.id)).toEqual(['p2']);
  });

  it('removes duplicates across candidate sources', () => {
    const p1 = createActiveProduct('p1', 'SKU-001');

    // p1 has positive inventory AND forecast AND confirmed production AND existing rec
    const inventoryMap = new Map<string, number>([['p1', 500]]);

    const snp87Rows: Snp87PlanningRow[] = [
      {
        id: 'r1',
        importId: 'imp-1',
        tenantId: 'tenant-1',
        siteId: 'site-barrow',
        rowIndex: 1,
        orderSku: 'SKU-001',
        productNumber: 'SKU-001',
        productDescription: 'Product SKU-001',
        location: 'BARROW',
        sort: 1,
        infoObject: 'FORECAST',
        rowText: 'Forecast',
        planningType: 'FORECAST',
        startDateRaw: '2026-10-11',
        endDateRaw: '2026-10-11',
        planningDate: '2026-10-11',
        startDate: '2026-10-11',
        endDate: '2026-10-11',
        quantity: 200,
        forecastQuantity: 200,
        confirmedProductionQuantity: null,
        baseUnitOfMeasure: 'CS',
        productId: 'p1',
        productCodeSnapshot: 'SKU-001',
        descriptionSnapshot: 'Product SKU-001',
        productMatched: true,
        validationStatus: 'VALID',
        validationErrors: [],
        validationWarnings: [],
        rawSourceRow: {},
        createdAt: '2026-10-10'
      },
      {
        id: 'r2',
        importId: 'imp-1',
        tenantId: 'tenant-1',
        siteId: 'site-barrow',
        rowIndex: 2,
        orderSku: 'SKU-001',
        productNumber: 'SKU-001',
        productDescription: 'Product SKU-001',
        location: 'BARROW',
        sort: 2,
        infoObject: 'CONFIRMED_PRODUCTION',
        rowText: 'Production',
        planningType: 'CONFIRMED_PRODUCTION',
        startDateRaw: '2026-10-12',
        endDateRaw: '2026-10-12',
        planningDate: '2026-10-12',
        startDate: '2026-10-12',
        endDate: '2026-10-12',
        quantity: 300,
        forecastQuantity: null,
        confirmedProductionQuantity: 300,
        baseUnitOfMeasure: 'CS',
        productId: 'p1',
        productCodeSnapshot: 'SKU-001',
        descriptionSnapshot: 'Product SKU-001',
        productMatched: true,
        validationStatus: 'VALID',
        validationErrors: [],
        validationWarnings: [],
        rawSourceRow: {},
        createdAt: '2026-10-10'
      }
    ];

    const activeRecs = [
      { id: 'rec-1', productId: 'p1', recommendationStatus: 'AWAITING_REVIEW' }
    ];

    const result = filterRecommendationCandidates({
      activeProducts: [p1],
      inventoryTotalsByProductId: inventoryMap,
      stoRequirements: [],
      snp87Rows,
      activeRecommendations: activeRecs,
      activePriorities: [],
      evaluationDate: baseEvalDate
    });

    expect(result.positiveInventoryCandidates.has('p1')).toBe(true);
    expect(result.snp87ForecastCandidates.has('p1')).toBe(true);
    expect(result.snp87ProductionCandidates.has('p1')).toBe(true);
    expect(result.existingSystemRecCandidates.has('p1')).toBe(true);
    // Deduplicated count must be exactly 1
    expect(result.candidateProductIds.size).toBe(1);
    expect(result.candidateProducts.length).toBe(1);
    expect(result.totalCandidates).toBe(1);
  });

  it('keeps existing system recommendations and recommendation-driven priorities as candidates', () => {
    const p1 = createActiveProduct('p1', 'SKU-001'); // zero inv, has active recommendation
    const p2 = createActiveProduct('p2', 'SKU-002'); // zero inv, has recommendation-driven priority
    const p3 = createActiveProduct('p3', 'SKU-003'); // zero inv, no rec, no priority

    const inventoryMap = new Map<string, number>([
      ['p1', 0],
      ['p2', 0],
      ['p3', 0]
    ]);

    const activeRecs = [
      { id: 'rec-1', productId: 'p1', recommendationStatus: 'APPROVED' },
      { id: 'rec-old', productId: 'p3', recommendationStatus: 'SUPERSEDED' } // Stale/superseded rec should not include p3
    ];

    const activePriorities: Priority[] = [
      {
        id: 'prio-1',
        tenantId: 'tenant-1',
        siteId: 'site-barrow',
        sourceType: 'RECOMMENDATION',
        productId: 'p2',
        productCodeSnapshot: 'SKU-002',
        descriptionSnapshot: 'Product SKU-002',
        instruction: 'Move surplus',
        priorityStatus: 'ACTIVE',
        priorityLevelId: 'NORMAL',
        actionTypeId: 'RELEASE',
        requestedQuantity: 100,
        progressQuantity: 0,
        remainingQuantity: 100,
        progressPercent: 0,
        destinationId: null,
        supportingReasons: [],
        startAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
        status: 'active',
        createdBy: 'system',
        createdDate: new Date(),
        modifiedBy: 'system',
        modifiedDate: new Date()
      } as unknown as Priority
    ];

    const result = filterRecommendationCandidates({
      activeProducts: [p1, p2, p3],
      inventoryTotalsByProductId: inventoryMap,
      stoRequirements: [],
      snp87Rows: [],
      activeRecommendations: activeRecs,
      activePriorities,
      evaluationDate: baseEvalDate
    });

    expect(result.existingSystemRecCandidates.has('p1')).toBe(true);
    expect(result.existingSystemRecCandidates.has('p2')).toBe(true);
    expect(result.existingSystemRecCandidates.has('p3')).toBe(false);
    expect(result.candidateProducts.map(p => p.id).sort()).toEqual(['p1', 'p2'].sort());
  });

  it('includes Northfleet STO due for collection today', () => {
    const p1 = createActiveProduct('p1', 'SKU-001');
    const p2 = createActiveProduct('p2', 'SKU-002');

    const stoRequirements: NorthfleetStoRequirement[] = [
      {
        id: 'sto-1',
        tenantId: 'tenant-1',
        siteId: 'site-barrow',
        productId: 'p1',
        stoNumber: 'STO-100',
        productCode: 'SKU-001',
        destinationId: 'dest-1',
        destinationCode: 'NORTHFLEET',
        cases: 400,
        pallets: 4,
        casesPerPalletSnapshot: 100,
        importId: 'imp-sto-1',
        barrowCollectionDate: '2026-10-10' as any, // TODAY relative to baseEvalDate
        northfleetDeliveryDate: '2026-10-11' as any,
        status: 'DUE_FOR_COLLECTION',
        createdBy: 'planner',
        createdDate: new Date(),
        modifiedBy: 'planner',
        modifiedDate: new Date()
      },
      {
        id: 'sto-2',
        tenantId: 'tenant-1',
        siteId: 'site-barrow',
        productId: 'p2',
        stoNumber: 'STO-200',
        productCode: 'SKU-002',
        destinationId: 'dest-1',
        destinationCode: 'NORTHFLEET',
        cases: 200,
        pallets: 2,
        casesPerPalletSnapshot: 100,
        importId: 'imp-sto-1',
        barrowCollectionDate: '2026-10-15' as any, // FUTURE date, not today
        northfleetDeliveryDate: '2026-10-16' as any,
        status: 'UPCOMING',
        createdBy: 'planner',
        createdDate: new Date(),
        modifiedBy: 'planner',
        modifiedDate: new Date()
      }
    ];

    const result = filterRecommendationCandidates({
      activeProducts: [p1, p2],
      inventoryTotalsByProductId: new Map([['p1', 0], ['p2', 0]]),
      stoRequirements,
      snp87Rows: [],
      activeRecommendations: [],
      activePriorities: [],
      evaluationDate: baseEvalDate
    });

    expect(result.stoDueTodayCandidates.has('p1')).toBe(true);
    expect(result.stoDueTodayCandidates.has('p2')).toBe(false);
    expect(result.candidateProducts.map(p => p.id)).toEqual(['p1']);
  });

  it('excludes rows outside the 7-day planning horizon', () => {
    const p1 = createActiveProduct('p1', 'SKU-001');

    // Planning row 10 days in the future (outside Day 0 to Day 6 horizon)
    const snp87Rows: Snp87PlanningRow[] = [
      {
        id: 'r-far-future',
        importId: 'imp-1',
        tenantId: 'tenant-1',
        siteId: 'site-barrow',
        rowIndex: 1,
        orderSku: 'SKU-001',
        productNumber: 'SKU-001',
        productDescription: 'Product SKU-001',
        location: 'BARROW',
        sort: 1,
        infoObject: 'FORECAST',
        rowText: 'Forecast',
        planningType: 'FORECAST',
        startDateRaw: '2026-10-25',
        endDateRaw: '2026-10-25',
        planningDate: '2026-10-25', // Beyond 7-day horizon
        startDate: '2026-10-25',
        endDate: '2026-10-25',
        quantity: 1000,
        forecastQuantity: 1000,
        confirmedProductionQuantity: null,
        baseUnitOfMeasure: 'CS',
        productId: 'p1',
        productCodeSnapshot: 'SKU-001',
        descriptionSnapshot: 'Product SKU-001',
        productMatched: true,
        validationStatus: 'VALID',
        validationErrors: [],
        validationWarnings: [],
        rawSourceRow: {},
        createdAt: '2026-10-10'
      }
    ];

    const result = filterRecommendationCandidates({
      activeProducts: [p1],
      inventoryTotalsByProductId: new Map([['p1', 0]]),
      stoRequirements: [],
      snp87Rows,
      activeRecommendations: [],
      activePriorities: [],
      evaluationDate: baseEvalDate
    });

    expect(result.snp87ForecastCandidates.size).toBe(0);
    expect(result.candidateProductIds.has('p1')).toBe(false);
    expect(result.totalCandidates).toBe(0);
  });

  it('only evaluates active products and strictly excludes inactive products', () => {
    const activeP = createActiveProduct('p-active', 'ACTIVE-SKU');
    const inactiveP = createInactiveProduct('p-inactive', 'INACTIVE-SKU');

    // Both have positive inventory and forecast
    const inventoryMap = new Map<string, number>([
      ['p-active', 100],
      ['p-inactive', 500]
    ]);

    const snp87Rows: Snp87PlanningRow[] = [
      {
        id: 'r-inactive',
        importId: 'imp-1',
        tenantId: 'tenant-1',
        siteId: 'site-barrow',
        rowIndex: 1,
        orderSku: 'INACTIVE-SKU',
        productNumber: 'INACTIVE-SKU',
        productDescription: 'Inactive SKU',
        location: 'BARROW',
        sort: 1,
        infoObject: 'FORECAST',
        rowText: 'Forecast',
        planningType: 'FORECAST',
        startDateRaw: '2026-10-11',
        endDateRaw: '2026-10-11',
        planningDate: '2026-10-11',
        startDate: '2026-10-11',
        endDate: '2026-10-11',
        quantity: 500,
        forecastQuantity: 500,
        confirmedProductionQuantity: null,
        baseUnitOfMeasure: 'CS',
        productId: 'p-inactive',
        productCodeSnapshot: 'INACTIVE-SKU',
        descriptionSnapshot: 'Inactive SKU',
        productMatched: true,
        validationStatus: 'VALID',
        validationErrors: [],
        validationWarnings: [],
        rawSourceRow: {},
        createdAt: '2026-10-10'
      }
    ];

    const result = filterRecommendationCandidates({
      activeProducts: [activeP, inactiveP],
      inventoryTotalsByProductId: inventoryMap,
      stoRequirements: [],
      snp87Rows,
      activeRecommendations: [],
      activePriorities: [],
      evaluationDate: baseEvalDate
    });

    expect(result.candidateProductIds.has('p-inactive')).toBe(false);
    expect(result.candidateProducts.find(p => p.id === 'p-inactive')).toBeUndefined();
    expect(result.candidateProducts.map(p => p.id)).toEqual(['p-active']);
  });

  it('formats diagnostic logging correctly', () => {
    const p1 = createActiveProduct('p1', 'SKU-001');
    const p2 = createActiveProduct('p2', 'SKU-002');

    const result = filterRecommendationCandidates({
      activeProducts: [p1, p2],
      inventoryTotalsByProductId: new Map([['p1', 100], ['p2', 0]]),
      stoRequirements: [],
      snp87Rows: [],
      activeRecommendations: [],
      activePriorities: [],
      evaluationDate: baseEvalDate
    });

    expect(result.diagnosticLog).toContain('Recommendation refresh:');
    expect(result.diagnosticLog).toContain('Active products: 2');
    expect(result.diagnosticLog).toContain('Positive inventory: 1');
    expect(result.diagnosticLog).toContain('STO due today: 0');
    expect(result.diagnosticLog).toContain('SNP87 forecast candidates: 0');
    expect(result.diagnosticLog).toContain('SNP87 production candidates: 0');
    expect(result.diagnosticLog).toContain('Existing system recommendations: 0');
    expect(result.diagnosticLog).toContain('Unique candidates: 1');
  });
});

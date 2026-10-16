import { describe, it, expect } from 'vitest';
import { 
  buildProductPlanningContext, 
  buildAllProductPlanningContexts,
  adaptPlanningContextToLegacyProductionContext,
  toCalendarDateString,
  addCalendarDays
} from './snp87PlanningContextService';
import { Snp87PlanningImport, Snp87PlanningRow } from '../../../types/snp87';
import { Product } from '../../../types/product';

const createMockSnapshot = (overrides: Partial<Snp87PlanningImport> = {}): Snp87PlanningImport => ({
  id: 'imp_active_1',
  tenantId: 'tenant-1',
  siteId: 'site-1',
  sourceReportName: 'SNP87_Week41.xlsx',
  sourceReportType: 'SNP87',
  fileHash: 'hash-abc',
  importedBy: 'planner@example.com',
  importedAt: new Date('2026-10-05T08:00:00Z').toISOString(),
  importStatus: 'COMMITTED',
  sourceRowCount: 20,
  recognisedRowCount: 18,
  ignoredRowCount: 2,
  forecastRowCount: 10,
  confirmedProductionRowCount: 8,
  totalForecastQuantity: 2500,
  totalConfirmedProductionQuantity: 8000,
  warningCount: 0,
  errorCount: 0,
  unknownProductCount: 0,
  importPeriod: {
    startDate: '2026-10-05',
    endDate: '2026-10-18'
  },
  diagnostics: {
    errors: [],
    warnings: [],
    unknownProducts: [],
    ignoredInfoObjects: []
  },
  version: 1,
  status: 'active',
  createdBy: 'planner@example.com',
  createdDate: '2026-10-05T08:00:00Z',
  modifiedBy: 'planner@example.com',
  modifiedDate: '2026-10-05T08:00:00Z',
  ...overrides
});

const createMockRow = (overrides: Partial<Snp87PlanningRow> = {}): Snp87PlanningRow => ({
  id: `row_${Math.random()}`,
  importId: 'imp_active_1',
  tenantId: 'tenant-1',
  siteId: 'site-1',
  rowIndex: 1,
  orderSku: '1721199',
  productNumber: '4473386',
  productDescription: 'F1 Andrex UQuilts 155sc 4rx6 £2.99 PMP',
  location: '3200',
  sort: 1,
  infoObject: '9ADFCST',
  rowText: 'Forecast',
  planningType: 'FORECAST',
  startDateRaw: '20261005',
  endDateRaw: '20261005',
  planningDate: '2026-10-05',
  startDate: '2026-10-05',
  endDate: '2026-10-05',
  quantity: 100,
  forecastQuantity: 100,
  confirmedProductionQuantity: null,
  baseUnitOfMeasure: 'CS',
  productId: 'prod-4473386',
  productCodeSnapshot: '4473386',
  descriptionSnapshot: 'F1 Andrex UQuilts 155sc 4rx6 £2.99 PMP',
  productMatched: true,
  validationStatus: 'VALID',
  validationErrors: [],
  validationWarnings: [],
  rawSourceRow: {},
  createdAt: '2026-10-05T08:00:00Z',
  ...overrides
});

describe('SNP87 Planning Context Service', () => {
  const evalDate = '2026-10-05'; // Day 0
  const activeSnapshot = createMockSnapshot();

  describe('Calendar Date Calculations', () => {
    it('formats calendar dates consistently without timezone drift', () => {
      expect(toCalendarDateString('2026-10-05')).toBe('2026-10-05');
      expect(toCalendarDateString('20261005')).toBe('2026-10-05');
      expect(toCalendarDateString(new Date('2026-10-05T00:00:00Z'))).toBe('2026-10-05');
    });

    it('correctly adds calendar days across months and leap years', () => {
      expect(addCalendarDays('2026-10-05', 6)).toBe('2026-10-11');
      expect(addCalendarDays('2026-10-28', 5)).toBe('2026-11-02');
      expect(addCalendarDays('2028-02-27', 3)).toBe('2028-03-01'); // 2028 is leap year (Feb has 29 days)
    });
  });

  describe('Forecast Calculations', () => {
    it('calculates today\'s forecast (Day 0)', () => {
      const rows = [
        createMockRow({
          planningDate: '2026-10-05',
          quantity: 150,
          forecastQuantity: 150,
          planningType: 'FORECAST'
        })
      ];

      const context = buildProductPlanningContext({
        productId: 'prod-4473386',
        activeSnapshot,
        snapshotRows: rows,
        evaluationDate: evalDate
      });

      expect(context.forecastCasesToday).toBe(150);
      expect(context.forecastByDate['2026-10-05']).toBe(150);
    });

    it('calculates the 7-day forecast across Day 0 through Day 6', () => {
      const rows = [
        createMockRow({ planningDate: '2026-10-05', quantity: 10, forecastQuantity: 10, planningType: 'FORECAST' }), // D0
        createMockRow({ planningDate: '2026-10-06', quantity: 20, forecastQuantity: 20, planningType: 'FORECAST' }), // D1
        createMockRow({ planningDate: '2026-10-07', quantity: 30, forecastQuantity: 30, planningType: 'FORECAST' }), // D2
        createMockRow({ planningDate: '2026-10-08', quantity: 40, forecastQuantity: 40, planningType: 'FORECAST' }), // D3
        createMockRow({ planningDate: '2026-10-09', quantity: 50, forecastQuantity: 50, planningType: 'FORECAST' }), // D4
        createMockRow({ planningDate: '2026-10-10', quantity: 60, forecastQuantity: 60, planningType: 'FORECAST' }), // D5
        createMockRow({ planningDate: '2026-10-11', quantity: 70, forecastQuantity: 70, planningType: 'FORECAST' })  // D6
      ];

      const context = buildProductPlanningContext({
        productId: 'prod-4473386',
        activeSnapshot,
        snapshotRows: rows,
        evaluationDate: evalDate
      });

      // Sum: 10+20+30+40+50+60+70 = 280
      expect(context.forecastCasesNext7Days).toBe(280);
      expect(context.sevenDayWindow.startDate).toBe('2026-10-05');
      expect(context.sevenDayWindow.endDate).toBe('2026-10-11');
    });

    it('excludes forecast outside the 7-day window from forecastCasesNext7Days', () => {
      const rows = [
        createMockRow({ planningDate: '2026-10-04', quantity: 999, forecastQuantity: 999, planningType: 'FORECAST' }), // Past (Day -1)
        createMockRow({ planningDate: '2026-10-05', quantity: 100, forecastQuantity: 100, planningType: 'FORECAST' }), // Day 0 (in window)
        createMockRow({ planningDate: '2026-10-11', quantity: 200, forecastQuantity: 200, planningType: 'FORECAST' }), // Day 6 (in window)
        createMockRow({ planningDate: '2026-10-12', quantity: 800, forecastQuantity: 800, planningType: 'FORECAST' }), // Day 7 (outside window)
        createMockRow({ planningDate: '2026-10-19', quantity: 500, forecastQuantity: 500, planningType: 'FORECAST' })  // Day 14 (outside window)
      ];

      const context = buildProductPlanningContext({
        productId: 'prod-4473386',
        activeSnapshot,
        snapshotRows: rows,
        evaluationDate: evalDate
      });

      // Only Day 0 (100) + Day 6 (200) should be included = 300
      expect(context.forecastCasesNext7Days).toBe(300);
      // All dates remain auditable in forecastByDate
      expect(context.forecastByDate['2026-10-12']).toBe(800);
      expect(context.forecastByDate['2026-10-19']).toBe(500);
      expect(context.forecastByDate['2026-10-04']).toBe(999);
    });
  });

  describe('Confirmed Production Calculations', () => {
    it('calculates confirmed production today (Day 0)', () => {
      const rows = [
        createMockRow({
          planningDate: '2026-10-05',
          quantity: 4500,
          confirmedProductionQuantity: 4500,
          forecastQuantity: null,
          planningType: 'CONFIRMED_PRODUCTION'
        })
      ];

      const context = buildProductPlanningContext({
        productId: 'prod-4473386',
        activeSnapshot,
        snapshotRows: rows,
        evaluationDate: evalDate
      });

      expect(context.confirmedProductionCasesToday).toBe(4500);
      expect(context.confirmedProductionCasesNext7Days).toBe(4500);
      expect(context.forecastCasesToday).toBe(0); // Distinct from forecast
    });

    it('calculates confirmed production within seven days', () => {
      const rows = [
        createMockRow({
          planningDate: '2026-10-06',
          quantity: 2000,
          confirmedProductionQuantity: 2000,
          planningType: 'CONFIRMED_PRODUCTION'
        }),
        createMockRow({
          planningDate: '2026-10-09',
          quantity: 3500.5,
          confirmedProductionQuantity: 3500.5,
          planningType: 'CONFIRMED_PRODUCTION'
        })
      ];

      const context = buildProductPlanningContext({
        productId: 'prod-4473386',
        activeSnapshot,
        snapshotRows: rows,
        evaluationDate: evalDate
      });

      expect(context.confirmedProductionCasesToday).toBe(0);
      expect(context.confirmedProductionCasesNext7Days).toBe(5500.5);
    });

    it('excludes confirmed production outside seven days from confirmedProductionCasesNext7Days', () => {
      const rows = [
        createMockRow({
          planningDate: '2026-10-07',
          quantity: 1200,
          confirmedProductionQuantity: 1200,
          planningType: 'CONFIRMED_PRODUCTION'
        }),
        createMockRow({
          planningDate: '2026-10-15',
          quantity: 7000,
          confirmedProductionQuantity: 7000,
          planningType: 'CONFIRMED_PRODUCTION'
        })
      ];

      const context = buildProductPlanningContext({
        productId: 'prod-4473386',
        activeSnapshot,
        snapshotRows: rows,
        evaluationDate: evalDate
      });

      expect(context.confirmedProductionCasesNext7Days).toBe(1200);
      expect(context.confirmedProductionByDate['2026-10-15']).toBe(7000);
    });
  });

  describe('Multiple Rows & Disambiguation', () => {
    it('aggregates multiple rows for the same product and date correctly', () => {
      const rows = [
        createMockRow({
          planningDate: '2026-10-05',
          quantity: 50,
          forecastQuantity: 50,
          planningType: 'FORECAST'
        }),
        createMockRow({
          planningDate: '2026-10-05',
          quantity: 75,
          forecastQuantity: 75,
          planningType: 'FORECAST'
        }),
        createMockRow({
          planningDate: '2026-10-05',
          quantity: 1000,
          confirmedProductionQuantity: 1000,
          planningType: 'CONFIRMED_PRODUCTION'
        }),
        createMockRow({
          planningDate: '2026-10-05',
          quantity: 2500,
          confirmedProductionQuantity: 2500,
          planningType: 'CONFIRMED_PRODUCTION'
        })
      ];

      const context = buildProductPlanningContext({
        productId: 'prod-4473386',
        activeSnapshot,
        snapshotRows: rows,
        evaluationDate: evalDate
      });

      expect(context.forecastCasesToday).toBe(125);
      expect(context.confirmedProductionCasesToday).toBe(3500);
    });

    it('filters only rows for the target product without leaking from other products', () => {
      const rows = [
        createMockRow({
          productId: 'prod-4473386',
          productNumber: '4473386',
          quantity: 100,
          forecastQuantity: 100,
          planningType: 'FORECAST'
        }),
        createMockRow({
          productId: 'prod-9999999',
          productNumber: '9999999',
          quantity: 500,
          forecastQuantity: 500,
          planningType: 'FORECAST'
        })
      ];

      const context = buildProductPlanningContext({
        productId: 'prod-4473386',
        productCode: '4473386',
        activeSnapshot,
        snapshotRows: rows,
        evaluationDate: evalDate
      });

      expect(context.forecastCasesToday).toBe(100);
    });
  });

  describe('Source Freshness & Quality Handling', () => {
    it('flags MISSING when active snapshot is null or absent', () => {
      const context = buildProductPlanningContext({
        productId: 'prod-4473386',
        activeSnapshot: null,
        snapshotRows: [],
        evaluationDate: evalDate
      });

      expect(context.dataFreshnessStatus).toBe('MISSING');
      expect(context.sourceStatus).toBe('MISSING');
      expect(context.sourceImportId).toBeNull();
      expect(context.hasMissingPlanningData).toBe(true);
      // Ensures quantities are 0 but caller is warned via hasMissingPlanningData
      expect(context.forecastCasesNext7Days).toBe(0);
      expect(context.confirmedProductionCasesNext7Days).toBe(0);
    });

    it('flags CURRENT & FRESH when active snapshot is committed and within freshness threshold', () => {
      const freshSnapshot = createMockSnapshot({
        importedAt: new Date('2026-10-05T00:00:00Z').toISOString(),
        importStatus: 'COMMITTED'
      });

      const context = buildProductPlanningContext({
        productId: 'prod-4473386',
        activeSnapshot: freshSnapshot,
        snapshotRows: [],
        evaluationDate: new Date('2026-10-06T12:00:00Z') // 36 hours later (< 168h threshold)
      });

      expect(context.dataFreshnessStatus).toBe('FRESH');
      expect(context.sourceStatus).toBe('CURRENT');
      expect(context.hasMissingPlanningData).toBe(false);
    });

    it('flags STALE when active snapshot is older than freshness threshold', () => {
      const staleSnapshot = createMockSnapshot({
        importedAt: new Date('2026-09-20T00:00:00Z').toISOString(), // 15 days ago
        importStatus: 'COMMITTED'
      });

      const context = buildProductPlanningContext({
        productId: 'prod-4473386',
        activeSnapshot: staleSnapshot,
        snapshotRows: [],
        evaluationDate: new Date('2026-10-05T00:00:00Z'),
        freshnessThresholdHours: 168 // 7 days
      });

      expect(context.dataFreshnessStatus).toBe('STALE');
      expect(context.sourceStatus).toBe('STALE');
      expect(context.hasMissingPlanningData).toBe(false);
    });

    it('flags SUPERSEDED when import has been superseded by a newer run', () => {
      const supersededSnapshot = createMockSnapshot({
        importStatus: 'SUPERSEDED'
      });

      const context = buildProductPlanningContext({
        productId: 'prod-4473386',
        activeSnapshot: supersededSnapshot,
        snapshotRows: [],
        evaluationDate: evalDate
      });

      expect(context.sourceStatus).toBe('SUPERSEDED');
      expect(context.dataFreshnessStatus).toBe('STALE');
    });
  });

  describe('UOM Preservation', () => {
    it('preserves the actual UOM specified in SNP87 rows (e.g. EA, PAL, BOX, CS)', () => {
      const rows = [
        createMockRow({
          baseUnitOfMeasure: 'PAL',
          planningType: 'FORECAST',
          quantity: 50
        })
      ];

      const context = buildProductPlanningContext({
        productId: 'prod-4473386',
        activeSnapshot,
        snapshotRows: rows,
        evaluationDate: evalDate
      });

      expect(context.baseUnitOfMeasure).toBe('PAL');
    });
  });

  describe('Adapter to Legacy ProductProductionContext', () => {
    it('adapts cleanly to legacy ProductProductionContext without fabricating line info', () => {
      const rows = [
        createMockRow({
          planningDate: '2026-10-05',
          quantity: 360,
          forecastQuantity: 360,
          planningType: 'FORECAST'
        }),
        createMockRow({
          planningDate: '2026-10-05',
          quantity: 720,
          confirmedProductionQuantity: 720,
          planningType: 'CONFIRMED_PRODUCTION'
        })
      ];

      const planningContext = buildProductPlanningContext({
        productId: 'prod-4473386',
        activeSnapshot,
        snapshotRows: rows,
        evaluationDate: evalDate
      });

      const mockProduct: Product = {
        id: 'prod-4473386',
        tenantId: 'tenant-1',
        siteId: 'site-1',
        productCode: '4473386',
        description: 'Andrex',
        categoryId: 'cat-1',
        unitOfMeasureId: 'uom-cs',
        casesPerPallet: 36,
        unitsPerCase: 24,
        configurations: [],
        defaultDestinationId: null,
        operationallyRelevant: true,
        notes: '',
        status: 'active',
        createdBy: 'system',
        createdDate: '2026-01-01',
        modifiedBy: 'system',
        modifiedDate: '2026-01-01'
      };

      const legacyContext = adaptPlanningContextToLegacyProductionContext(planningContext, mockProduct);

      // Confirms NO production line information is fabricated
      expect(legacyContext.currentProductionLine).toBeNull();
      expect(legacyContext.isCurrentlyInProduction).toBe(false);

      // Planned cases today uses confirmed production
      expect(legacyContext.plannedCasesToday).toBe(720);
      expect(legacyContext.plannedPalletsToday).toBe(20); // 720 / 36 = 20 pallets

      // Planned cases next 7 days uses forecast
      expect(legacyContext.plannedCasesNext7Days).toBe(360);
      expect(legacyContext.plannedPalletsNext7Days).toBe(10); // 360 / 36 = 10 pallets

      expect(legacyContext.dataFreshnessStatus).toBe('FRESH');
      expect(legacyContext.planningContext).toBe(planningContext);
    });
  });

  describe('Batch Context Building', () => {
    it('builds contexts for multiple products in batch', () => {
      const products: Product[] = [
        {
          id: 'prod-1',
          tenantId: 'tenant-1',
          siteId: 'site-1',
          productCode: '4473386',
          description: 'Product 1',
          categoryId: 'cat-1',
          unitOfMeasureId: 'CS',
          casesPerPallet: 36,
          unitsPerCase: null,
          configurations: [],
          defaultDestinationId: null,
          operationallyRelevant: true,
          notes: '',
          status: 'active',
          createdBy: 'system',
          createdDate: '2026-01-01',
          modifiedBy: 'system',
          modifiedDate: '2026-01-01'
        },
        {
          id: 'prod-2',
          tenantId: 'tenant-1',
          siteId: 'site-1',
          productCode: '4474132',
          description: 'Product 2',
          categoryId: 'cat-1',
          unitOfMeasureId: 'CS',
          casesPerPallet: 28,
          unitsPerCase: null,
          configurations: [],
          defaultDestinationId: null,
          operationallyRelevant: true,
          notes: '',
          status: 'active',
          createdBy: 'system',
          createdDate: '2026-01-01',
          modifiedBy: 'system',
          modifiedDate: '2026-01-01'
        }
      ];

      const rows = [
        createMockRow({ productId: 'prod-1', productNumber: '4473386', quantity: 100, forecastQuantity: 100 }),
        createMockRow({ productId: 'prod-2', productNumber: '4474132', quantity: 200, forecastQuantity: 200 })
      ];

      const batchMap = buildAllProductPlanningContexts(products, activeSnapshot, rows, evalDate);

      expect(batchMap.size).toBe(2);
      expect(batchMap.get('prod-1')?.forecastCasesToday).toBe(100);
      expect(batchMap.get('prod-2')?.forecastCasesToday).toBe(200);
    });
  });
});

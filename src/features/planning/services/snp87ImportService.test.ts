import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseSnp87Date,
  identifySnp87PlanningType,
  isSupportedSnp87Uom,
  validateSnp87Headers,
  validateAndMapSnp87Row,
  parseSnp87Workbook,
  calculateFileHash,
  saveSnp87Import,
  computeWeeklyForecastPlan,
  isOutOfOrdinaryDate
} from './snp87ImportService';
import { Product } from '../../../types/product';
import * as dbService from '../../../services/dbService';
import * as auditService from '../../../services/auditService';

const defaultTestOptions = {
  importId: 'import-123',
  tenantId: 'tenant-1',
  siteId: 'site-1'
};

// Mock DB and Audit services
vi.mock('../../../services/dbService', () => ({
  createDocument: vi.fn().mockResolvedValue('mock-doc-id'),
  createDocuments: vi.fn().mockResolvedValue(['mock-doc-id']),
  getDocuments: vi.fn().mockResolvedValue([]),
  getDocument: vi.fn().mockResolvedValue(null),
  updateDocument: vi.fn().mockResolvedValue(undefined),
  where: vi.fn((field, op, val) => ({ field, op, val })),
  subscribeToCollection: vi.fn(() => () => {})
}));

vi.mock('../../../services/auditService', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined)
}));

const mockProducts: Product[] = [
  {
    id: 'prod-4473386',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    productCode: '4473386',
    description: 'F1 Andrex UQuilts 155sc 4rx6 £2.99 PMP',
    categoryId: 'cat-1',
    unitOfMeasureId: 'uom-cs',
    casesPerPallet: 36,
    unitsPerCase: 24,
    configurations: [{ unitOfMeasureId: 'uom-cs', casesPerPallet: 36, unitsPerCase: 24 }],
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
    id: 'prod-4474132',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    productCode: '4474132',
    description: 'F1 Andrex UQuilts 155sc 9rx4',
    categoryId: 'cat-1',
    unitOfMeasureId: 'uom-cs',
    casesPerPallet: 28,
    unitsPerCase: 36,
    configurations: [{ unitOfMeasureId: 'uom-cs', casesPerPallet: 28, unitsPerCase: 36 }],
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
    id: 'prod-1721199',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    productCode: '1721199',
    description: 'Order SKU Match Test Product',
    categoryId: 'cat-1',
    unitOfMeasureId: 'uom-cs',
    casesPerPallet: 40,
    unitsPerCase: 24,
    configurations: [{ unitOfMeasureId: 'uom-cs', casesPerPallet: 40, unitsPerCase: 24 }],
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

describe('SNP87 Planning Data Model & Import Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Date Parsing (YYYYMMDD)', () => {
    it('correctly parses 20261005 as 5 October 2026 without timezone shifts', () => {
      const parsed = parseSnp87Date('20261005');
      expect(parsed).not.toBeNull();
      expect(parsed?.formattedDate).toBe('2026-10-05');
      expect(parsed?.year).toBe(2026);
      expect(parsed?.month).toBe(10);
      expect(parsed?.day).toBe(5);
    });

    it('correctly parses numeric 20261005', () => {
      const parsed = parseSnp87Date(20261005);
      expect(parsed).not.toBeNull();
      expect(parsed?.formattedDate).toBe('2026-10-05');
    });

    it('correctly parses leap year and month-end dates (e.g. 20260228, 20280229)', () => {
      const feb2026 = parseSnp87Date('20260228');
      expect(feb2026?.formattedDate).toBe('2026-02-28');

      const leapFeb2028 = parseSnp87Date('20280229');
      expect(leapFeb2028?.formattedDate).toBe('2028-02-29');

      const invalidLeapFeb2026 = parseSnp87Date('20260229');
      expect(invalidLeapFeb2026).toBeNull();
    });

    it('returns null for invalid dates or out-of-range months/days', () => {
      expect(parseSnp87Date('20261301')).toBeNull(); // Month 13
      expect(parseSnp87Date('20260431')).toBeNull(); // April has 30 days
      expect(parseSnp87Date('invalid')).toBeNull();
      expect(parseSnp87Date('')).toBeNull();
      expect(parseSnp87Date(null)).toBeNull();
    });
  });

  describe('Planning Type Identification', () => {
    it('identifies 9ADFCST / Forecast as FORECAST', () => {
      const result = identifySnp87PlanningType('9ADFCST', 'Forecast');
      expect(result.planningType).toBe('FORECAST');
      expect(result.ignoredReason).toBeUndefined();
    });

    it('identifies 9AFPROD / Production (Confirmed) as CONFIRMED_PRODUCTION', () => {
      const result = identifySnp87PlanningType('9AFPROD', 'Production (Confirmed)');
      expect(result.planningType).toBe('CONFIRMED_PRODUCTION');
      expect(result.ignoredReason).toBeUndefined();
    });

    it('classifies unrelated/unrecognised rows as IGNORED with descriptive reason', () => {
      const result = identifySnp87PlanningType('9APLAN', 'Production (Planned)');
      expect(result.planningType).toBe('IGNORED');
      expect(result.ignoredReason).toContain('Unrecognised InfoObject');
      expect(result.ignoredReason).toContain('9APLAN');
    });

    it('classifies custom header/total rows as IGNORED', () => {
      const result = identifySnp87PlanningType('', 'Total Demand');
      expect(result.planningType).toBe('IGNORED');
      expect(result.ignoredReason).toBeDefined();
    });
  });

  describe('UOM Validation', () => {
    it('recognises supported units of measure (CS, CASE, EA, PAL, etc.)', () => {
      expect(isSupportedSnp87Uom('CS')).toBe(true);
      expect(isSupportedSnp87Uom('cs')).toBe(true);
      expect(isSupportedSnp87Uom('CASE')).toBe(true);
      expect(isSupportedSnp87Uom('EA')).toBe(true);
      expect(isSupportedSnp87Uom('PAL')).toBe(true);
    });

    it('returns false for unsupported or empty UOM', () => {
      expect(isSupportedSnp87Uom('UNKNOWN_UOM')).toBe(false);
      expect(isSupportedSnp87Uom('')).toBe(false);
      expect(isSupportedSnp87Uom(null)).toBe(false);
    });
  });

  describe('Header Validation', () => {
    it('validates matching standard SNP87 columns', () => {
      const headers = [
        'Order SKU',
        'Product Number',
        'Product Description',
        'Location',
        'Sort',
        'InfoObject',
        'Row text',
        'Start Date',
        'End Date',
        'Quantity',
        'Base Unit of Measure'
      ];
      const result = validateSnp87Headers(headers);
      expect(result.isValid).toBe(true);
      expect(result.headerMap.productNumber).toBe('Product Number');
      expect(result.headerMap.infoObject).toBe('InfoObject');
      expect(result.headerMap.quantity).toBe('Quantity');
    });

    it('detects missing critical columns', () => {
      const headers = ['Order SKU', 'Product Description', 'Location'];
      const result = validateSnp87Headers(headers);
      expect(result.isValid).toBe(false);
      expect(result.missingHeaders).toContain('productNumber');
      expect(result.missingHeaders).toContain('infoObject');
      expect(result.missingHeaders).toContain('quantity');
    });
  });

  describe('Row Validation and Mapping', () => {
    const defaultOptions = {
      importId: 'import-123',
      tenantId: 'tenant-1',
      siteId: 'site-1'
    };

    it('validates a valid Forecast row', () => {
      const rawRow = {
        'Order SKU': '1675599',
        'Product Number': '4474132',
        'Product Description': 'F1 Andrex UQuilts 155sc 9rx4',
        'Location': '3200',
        'Sort': 1,
        'InfoObject': '9ADFCST',
        'Row text': 'Forecast',
        'Start Date': '20261005',
        'End Date': '20261005',
        'Quantity': 13,
        'Base Unit of Measure': 'CS'
      };

      const row = validateAndMapSnp87Row(rawRow, 1, mockProducts, defaultOptions);

      expect(row.planningType).toBe('FORECAST');
      expect(row.productNumber).toBe('4474132');
      expect(row.productId).toBe('prod-4474132');
      expect(row.productMatched).toBe(true);
      expect(row.planningDate).toBe('2026-10-05');
      expect(row.startDate).toBe('2026-10-05');
      expect(row.endDate).toBe('2026-10-05');
      expect(row.quantity).toBe(13);
      expect(row.forecastQuantity).toBe(13);
      expect(row.confirmedProductionQuantity).toBeNull();
      expect(row.baseUnitOfMeasure).toBe('CS');
      expect(row.validationStatus).toBe('VALID');
      expect(row.validationErrors).toHaveLength(0);
      expect(row.rawSourceRow).toEqual(rawRow);
    });

    it('validates a valid Confirmed Production row with decimal quantity', () => {
      const rawRow = {
        'Order SKU': '1721199',
        'Product Number': '4473386',
        'Product Description': 'F1 Andrex UQuilts 155sc 4rx6 £2.99 PMP',
        'Location': '3200',
        'Sort': 14,
        'InfoObject': '9AFPROD',
        'Row text': 'Production (Confirmed)',
        'Start Date': '20261005',
        'End Date': '20261005',
        'Quantity': 6193.824,
        'Base Unit of Measure': 'CS'
      };

      const row = validateAndMapSnp87Row(rawRow, 2, mockProducts, defaultOptions);

      expect(row.planningType).toBe('CONFIRMED_PRODUCTION');
      expect(row.productNumber).toBe('4473386');
      expect(row.productId).toBe('prod-4473386');
      expect(row.productMatched).toBe(true);
      expect(row.quantity).toBe(6193.824);
      expect(row.confirmedProductionQuantity).toBe(6193.824);
      expect(row.forecastQuantity).toBeNull();
      expect(row.validationStatus).toBe('VALID');
      expect(row.validationErrors).toHaveLength(0);
    });

    it('classifies an ignored unrelated row without failing the validation pipeline', () => {
      const rawRow = {
        'Order SKU': '1675599',
        'Product Number': '4474132',
        'Product Description': 'F1 Andrex UQuilts 155sc 9rx4',
        'Location': '3200',
        'Sort': 99,
        'InfoObject': '9AUNREL',
        'Row text': 'Safety Stock Target',
        'Start Date': '20261005',
        'End Date': '20261005',
        'Quantity': 100,
        'Base Unit of Measure': 'CS'
      };

      const row = validateAndMapSnp87Row(rawRow, 3, mockProducts, defaultOptions);

      expect(row.planningType).toBe('IGNORED');
      expect(row.validationStatus).toBe('IGNORED');
      expect(row.ignoredReason).toContain('Unrecognised InfoObject');
    });

    it('flags unknown product with validation error and productMatched=false', () => {
      const rawRow = {
        'Order SKU': '9999999',
        'Product Number': '8888888',
        'Product Description': 'Unregistered New Product',
        'Location': '3200',
        'Sort': 1,
        'InfoObject': '9ADFCST',
        'Row text': 'Forecast',
        'Start Date': '20261005',
        'End Date': '20261005',
        'Quantity': 50,
        'Base Unit of Measure': 'CS'
      };

      const row = validateAndMapSnp87Row(rawRow, 4, mockProducts, defaultOptions);

      expect(row.productMatched).toBe(false);
      expect(row.productId).toBeNull();
      expect(row.validationStatus).toBe('ERROR');
      expect(row.validationErrors).toContain(
        'Unknown Product: Product Number "8888888" was not found in Product Master.'
      );
    });

    it('flags invalid date with validation error', () => {
      const rawRow = {
        'Order SKU': '1721199',
        'Product Number': '4473386',
        'Product Description': 'F1 Andrex UQuilts',
        'Location': '3200',
        'Sort': 14,
        'InfoObject': '9AFPROD',
        'Row text': 'Production (Confirmed)',
        'Start Date': 'INVALID_DATE',
        'End Date': '20261005',
        'Quantity': 100,
        'Base Unit of Measure': 'CS'
      };

      const row = validateAndMapSnp87Row(rawRow, 5, mockProducts, defaultOptions);

      expect(row.validationStatus).toBe('ERROR');
      expect(row.validationErrors.some(e => e.includes('Invalid Start Date'))).toBe(true);
    });

    it('flags invalid quantity (negative or non-numeric) with validation error', () => {
      const rawRow = {
        'Order SKU': '1721199',
        'Product Number': '4473386',
        'Product Description': 'F1 Andrex UQuilts',
        'Location': '3200',
        'Sort': 14,
        'InfoObject': '9AFPROD',
        'Row text': 'Production (Confirmed)',
        'Start Date': '20261005',
        'End Date': '20261005',
        'Quantity': -25,
        'Base Unit of Measure': 'CS'
      };

      const row = validateAndMapSnp87Row(rawRow, 6, mockProducts, defaultOptions);

      expect(row.validationStatus).toBe('ERROR');
      expect(row.validationErrors.some(e => e.includes('Invalid Quantity'))).toBe(true);
    });

    it('flags uncommon UOM with warning while keeping row valid', () => {
      const rawRow = {
        'Order SKU': '1721199',
        'Product Number': '4473386',
        'Product Description': 'F1 Andrex UQuilts',
        'Location': '3200',
        'Sort': 14,
        'InfoObject': '9AFPROD',
        'Row text': 'Production (Confirmed)',
        'Start Date': '20261005',
        'End Date': '20261005',
        'Quantity': 100,
        'Base Unit of Measure': 'CUSTOM_BAG'
      };

      const row = validateAndMapSnp87Row(rawRow, 7, mockProducts, defaultOptions);

      expect(row.validationStatus).toBe('WARNING');
      expect(row.validationWarnings.some(w => w.includes('Uncommon Base Unit of Measure'))).toBe(true);
    });
  });

  describe('Workbook Parsing & Batch Processing', () => {
    it('parses multiple rows for same product across multiple dates', async () => {
      const rawRows = [
        {
          'Order SKU': '1675599',
          'Product Number': '4474132',
          'Product Description': 'F1 Andrex UQuilts 155sc 9rx4',
          'Location': '3200',
          'Sort': 1,
          'InfoObject': '9ADFCST',
          'Row text': 'Forecast',
          'Start Date': '20261005',
          'End Date': '20261005',
          'Quantity': 13,
          'Base Unit of Measure': 'CS'
        },
        {
          'Order SKU': '1675599',
          'Product Number': '4474132',
          'Product Description': 'F1 Andrex UQuilts 155sc 9rx4',
          'Location': '3200',
          'Sort': 1,
          'InfoObject': '9ADFCST',
          'Row text': 'Forecast',
          'Start Date': '20261006',
          'End Date': '20261006',
          'Quantity': 9,
          'Base Unit of Measure': 'CS'
        },
        {
          'Order SKU': '1675599',
          'Product Number': '4474132',
          'Product Description': 'F1 Andrex UQuilts 155sc 9rx4',
          'Location': '3200',
          'Sort': 1,
          'InfoObject': '9ADFCST',
          'Row text': 'Forecast',
          'Start Date': '20261007',
          'End Date': '20261007',
          'Quantity': 10,
          'Base Unit of Measure': 'CS'
        }
      ];

      const result = await parseSnp87Workbook(rawRows, mockProducts, {
        tenantId: 'tenant-1',
        siteId: 'site-1',
        sourceReportName: 'SNP87_Weekly_Week41.xlsx',
        importedBy: 'planner@example.com'
      });

      expect(result.rows).toHaveLength(3);
      expect(result.importSummary.sourceRowCount).toBe(3);
      expect(result.importSummary.recognisedRowCount).toBe(3);
      expect(result.importSummary.forecastRowCount).toBe(3);
      expect(result.importSummary.totalForecastQuantity).toBe(32);
      expect(result.importSummary.importPeriod).toEqual({
        startDate: '2026-10-05',
        endDate: '2026-10-07'
      });
      expect(result.importSummary.importStatus).toBe('VALIDATED');
    });

    it('detects duplicate rows and marks them with a warning', async () => {
      const rawRows = [
        {
          'Order SKU': '1675599',
          'Product Number': '4474132',
          'Product Description': 'F1 Andrex UQuilts 155sc 9rx4',
          'Location': '3200',
          'Sort': 1,
          'InfoObject': '9ADFCST',
          'Row text': 'Forecast',
          'Start Date': '20261005',
          'End Date': '20261005',
          'Quantity': 13,
          'Base Unit of Measure': 'CS'
        },
        // Duplicate row
        {
          'Order SKU': '1675599',
          'Product Number': '4474132',
          'Product Description': 'F1 Andrex UQuilts 155sc 9rx4',
          'Location': '3200',
          'Sort': 1,
          'InfoObject': '9ADFCST',
          'Row text': 'Forecast',
          'Start Date': '20261005',
          'End Date': '20261005',
          'Quantity': 13,
          'Base Unit of Measure': 'CS'
        }
      ];

      const result = await parseSnp87Workbook(rawRows, mockProducts, {
        tenantId: 'tenant-1',
        siteId: 'site-1',
        sourceReportName: 'SNP87_With_Duplicates.xlsx',
        importedBy: 'planner@example.com'
      });

      expect(result.rows[1].isDuplicate).toBe(true);
      expect(result.rows[1].validationStatus).toBe('WARNING');
      expect(result.rows[1].validationWarnings).toContain('Duplicate row detected in this import file.');
      expect(result.importSummary.warningCount).toBe(1);
    });

    it('aggregates audit and diagnostic metadata correctly when unknown products or errors exist', async () => {
      const rawRows = [
        // Valid Forecast
        {
          'Order SKU': '1675599',
          'Product Number': '4474132',
          'Product Description': 'F1 Andrex UQuilts',
          'Location': '3200',
          'Sort': 1,
          'InfoObject': '9ADFCST',
          'Row text': 'Forecast',
          'Start Date': '20261005',
          'End Date': '20261005',
          'Quantity': 100,
          'Base Unit of Measure': 'CS'
        },
        // Valid Confirmed Production
        {
          'Order SKU': '1721199',
          'Product Number': '4473386',
          'Product Description': 'F1 Andrex UQuilts PMP',
          'Location': '3200',
          'Sort': 14,
          'InfoObject': '9AFPROD',
          'Row text': 'Production (Confirmed)',
          'Start Date': '20261005',
          'End Date': '20261005',
          'Quantity': 500,
          'Base Unit of Measure': 'CS'
        },
        // Ignored Row
        {
          'Order SKU': '1721199',
          'Product Number': '4473386',
          'Product Description': 'F1 Andrex UQuilts PMP',
          'Location': '3200',
          'Sort': 99,
          'InfoObject': '9ATOTAL',
          'Row text': 'Total Stock',
          'Start Date': '20261005',
          'End Date': '20261005',
          'Quantity': 600,
          'Base Unit of Measure': 'CS'
        },
        // Unknown Product Row
        {
          'Order SKU': '9999999',
          'Product Number': '8888888',
          'Product Description': 'Unmapped Product',
          'Location': '3200',
          'Sort': 1,
          'InfoObject': '9ADFCST',
          'Row text': 'Forecast',
          'Start Date': '20261005',
          'End Date': '20261005',
          'Quantity': 200,
          'Base Unit of Measure': 'CS'
        }
      ];

      const result = await parseSnp87Workbook(rawRows, mockProducts, {
        tenantId: 'tenant-1',
        siteId: 'site-1',
        sourceReportName: 'SNP87_Mixed.xlsx',
        importedBy: 'planner@example.com'
      });

      const { importSummary } = result;

      expect(importSummary.sourceReportType).toBe('SNP87');
      expect(importSummary.sourceReportName).toBe('SNP87_Mixed.xlsx');
      expect(importSummary.importedBy).toBe('planner@example.com');
      expect(importSummary.sourceRowCount).toBe(4);
      expect(importSummary.recognisedRowCount).toBe(3); // 2 valid + 1 unknown forecast
      expect(importSummary.ignoredRowCount).toBe(1);
      expect(importSummary.forecastRowCount).toBe(2);
      expect(importSummary.confirmedProductionRowCount).toBe(1);
      expect(importSummary.totalForecastQuantity).toBe(300);
      expect(importSummary.totalConfirmedProductionQuantity).toBe(500);
      expect(importSummary.unknownProductCount).toBe(1);
      expect(importSummary.errorCount).toBe(1);
      expect(importSummary.importStatus).toBe('REQUIRES_REVIEW');

      expect(importSummary.diagnostics.unknownProducts).toHaveLength(1);
      expect(importSummary.diagnostics.unknownProducts[0].productNumber).toBe('8888888');

      expect(importSummary.diagnostics.ignoredInfoObjects).toHaveLength(1);
      expect(importSummary.diagnostics.ignoredInfoObjects[0].infoObject).toBe('9ATOTAL');
    });
  });

  describe('Database Persistence & Audit Logging', () => {
    it('persists import summary, rows, and logs audit event', async () => {
      const rawRows = [
        {
          'Order SKU': '1675599',
          'Product Number': '4474132',
          'Product Description': 'F1 Andrex UQuilts 155sc 9rx4',
          'Location': '3200',
          'Sort': 1,
          'InfoObject': '9ADFCST',
          'Row text': 'Forecast',
          'Start Date': '20261005',
          'End Date': '20261005',
          'Quantity': 13,
          'Base Unit of Measure': 'CS'
        }
      ];

      const { importSummary, rows } = await parseSnp87Workbook(rawRows, mockProducts, {
        tenantId: 'tenant-1',
        siteId: 'site-1',
        sourceReportName: 'SNP87_Weekly.xlsx',
        importedBy: 'planner@example.com'
      });

      const saveResult = await saveSnp87Import(importSummary, rows);

      expect(saveResult.success).toBe(true);
      expect(dbService.createDocument).toHaveBeenCalledWith('snp87Imports', expect.objectContaining({
        sourceReportType: 'SNP87',
        sourceReportName: 'SNP87_Weekly.xlsx'
      }));
      expect(dbService.createDocuments).toHaveBeenCalledWith('snp87PlanningRows', expect.any(Array));
      expect(auditService.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
        eventType: 'SNP87_PLANNING_IMPORT_UPLOADED',
        entityType: 'Snp87PlanningImport',
        entityId: importSummary.id,
        performedBy: 'planner@example.com'
      }));
    });

    it('commitSnp87Import marks previous active snapshot as SUPERSEDED and logs audit event', async () => {
      const { commitSnp87Import, getActiveSnp87Snapshot } = await import('./snp87ImportService');

      // Mock previous active import returned by getDocuments
      const prevActiveImport = {
        id: 'imp_week_40',
        tenantId: 'tenant-1',
        siteId: 'site-1',
        sourceReportName: 'SNP87_Week40.xlsx',
        sourceReportType: 'SNP87',
        importStatus: 'COMMITTED',
        importedAt: '2026-09-28T08:00:00Z',
        forecastRowCount: 10,
        confirmedProductionRowCount: 20
      };

      vi.mocked(dbService.getDocuments).mockResolvedValueOnce([prevActiveImport as any]);

      const rawRows = [
        {
          'Order SKU': '1675599',
          'Product Number': '4474132',
          'Product Description': 'F1 Andrex UQuilts 155sc 9rx4',
          'Location': '3200',
          'Sort': 1,
          'InfoObject': '9ADFCST',
          'Row text': 'Forecast',
          'Start Date': '20261005',
          'End Date': '20261005',
          'Quantity': 25,
          'Base Unit of Measure': 'CS'
        }
      ];

      const { importSummary, rows } = await parseSnp87Workbook(rawRows, mockProducts, {
        tenantId: 'tenant-1',
        siteId: 'site-1',
        sourceReportName: 'SNP87_Week41.xlsx',
        importedBy: 'planner@example.com'
      });

      const commitResult = await commitSnp87Import(importSummary, rows, 'planner@example.com', 'Weekly run');

      expect(commitResult.success).toBe(true);
      // Confirmed that previous import was updated to SUPERSEDED
      expect(dbService.updateDocument).toHaveBeenCalledWith(
        'snp87Imports',
        'imp_week_40',
        expect.objectContaining({
          importStatus: 'SUPERSEDED'
        })
      );

      // Confirmed audit event for committed snapshot
      expect(auditService.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
        eventType: 'SNP87_PLANNING_SNAPSHOT_COMMITTED',
        entityId: importSummary.id,
        performedBy: 'planner@example.com'
      }));
    });
  });

  describe('Out of Ordinary Date Handling (e.g. 19700101) & Adjacent Cell Fallback', () => {
    it('replaces an out-of-the-ordinary Start Date like 19700101 with the adjacent End Date', () => {
      const rawRow = {
        'Order SKU': '1675599',
        'Product Number': '4474132',
        'Product Description': 'F1 Andrex UQuilts',
        'Location': '3200',
        'Sort': 1,
        'InfoObject': '9ADFCST',
        'Row text': 'Forecast',
        'Start Date': '19700101',
        'End Date': '20261012',
        'Quantity': 150,
        'Base Unit of Measure': 'CS'
      };

      const row = validateAndMapSnp87Row(rawRow, 1, mockProducts, defaultTestOptions);

      expect(row.validationStatus).toBe('WARNING');
      expect(row.startDate).toBe('2026-10-12');
      expect(row.endDate).toBe('2026-10-12');
      expect(row.validationWarnings.some(w => w.includes('19700101'))).toBe(true);
    });

    it('replaces an out-of-the-ordinary End Date like 19700101 with the adjacent Start Date', () => {
      const rawRow = {
        'Order SKU': '1675599',
        'Product Number': '4474132',
        'Product Description': 'F1 Andrex UQuilts',
        'Location': '3200',
        'Sort': 2,
        'InfoObject': '9AFPROD',
        'Row text': 'Production (Confirmed)',
        'Start Date': '20261014',
        'End Date': '19700101',
        'Quantity': 300,
        'Base Unit of Measure': 'CS'
      };

      const row = validateAndMapSnp87Row(rawRow, 2, mockProducts, defaultTestOptions);

      expect(row.validationStatus).toBe('WARNING');
      expect(row.startDate).toBe('2026-10-14');
      expect(row.endDate).toBe('2026-10-14');
      expect(row.planningDate).toBe('2026-10-14');
    });

    it('replaces 1970-01-01 or 19000101 or 00000000 with adjacent cell date', () => {
      const rawRow = {
        'Order SKU': '1675599',
        'Product Number': '4474132',
        'Product Description': 'F1 Andrex UQuilts',
        'Location': '3200',
        'Sort': 3,
        'InfoObject': '9ADFCST',
        'Row text': 'Forecast',
        'Start Date': '1970-01-01',
        'End Date': '20261019',
        'Quantity': 75,
        'Base Unit of Measure': 'CS'
      };

      const row = validateAndMapSnp87Row(rawRow, 3, mockProducts, defaultTestOptions);

      expect(row.startDate).toBe('2026-10-19');
      expect(row.endDate).toBe('2026-10-19');
    });
  });

  describe('Forecast Weekly Plan & SumProduct by Product', () => {
    it('uses the horizon date rather than the date within End or Start date for Forecast rows', () => {
      const rawRow = {
        'Order SKU': '1675599',
        'Product Number': '4474132',
        'Product Description': 'F1 Andrex UQuilts',
        'Location': '3200',
        'Sort': 1,
        'InfoObject': '9ADFCST',
        'Row text': 'Forecast',
        'Start Date': '20261015',
        'End Date': '20261018',
        'Horizon Date': '20261012',
        'Quantity': 500,
        'Base Unit of Measure': 'CS'
      };

      const row = validateAndMapSnp87Row(rawRow, 1, mockProducts, defaultTestOptions);

      // Forecast row should use the horizon date for planningDate as the weekly plan target
      expect(row.planningDate).toBe('2026-10-12');
      expect(row.horizonDate).toBe('2026-10-12');
    });

    it('computes sumproduct of forecast cases and pallet equivalents for each Product towards horizon date', () => {
      const rows: any[] = [
        {
          productNumber: '4474132',
          productCodeSnapshot: '4474132',
          productDescription: 'F1 Andrex UQuilts',
          planningType: 'FORECAST',
          horizonDate: '2026-10-12',
          planningDate: '2026-10-12',
          startDate: '2026-10-13',
          endDate: '2026-10-13',
          quantity: 200,
          forecastQuantity: 200,
          baseUnitOfMeasure: 'CS'
        },
        {
          productNumber: '4474132',
          productCodeSnapshot: '4474132',
          productDescription: 'F1 Andrex UQuilts',
          planningType: 'FORECAST',
          horizonDate: '2026-10-12',
          planningDate: '2026-10-12',
          startDate: '2026-10-15',
          endDate: '2026-10-15',
          quantity: 300,
          forecastQuantity: 300,
          baseUnitOfMeasure: 'CS'
        },
        {
          productNumber: '4473386',
          productCodeSnapshot: '4473386',
          productDescription: 'F2 Andrex Quilts Pure',
          planningType: 'FORECAST',
          horizonDate: '2026-10-12',
          planningDate: '2026-10-12',
          startDate: '2026-10-14',
          endDate: '2026-10-14',
          quantity: 120,
          forecastQuantity: 120,
          baseUnitOfMeasure: 'CS'
        },
        {
          productNumber: '4474132',
          productCodeSnapshot: '4474132',
          productDescription: 'F1 Andrex UQuilts',
          planningType: 'CONFIRMED_PRODUCTION',
          planningDate: '2026-10-13',
          quantity: 400,
          confirmedProductionQuantity: 400,
          baseUnitOfMeasure: 'CS'
        }
      ];

      // mockProducts has 4474132 with casesPerPallet=40, 4473386 with casesPerPallet=40
      const weeklyPlan = computeWeeklyForecastPlan(rows, mockProducts);

      expect(weeklyPlan).toHaveLength(2); // Only FORECAST rows for the 2 distinct products
      
      const p1 = weeklyPlan.find(p => p.productCode === '4474132')!;
      expect(p1).toBeDefined();
      expect(p1.totalForecastCases).toBe(500); // 200 + 300
      expect(p1.horizonDate).toBe('2026-10-12');
      expect(p1.rowCount).toBe(2);
      expect(p1.palletEquivalent).toBe(17.86); // 500 / 28 casesPerPallet = 17.86 pallets

      const p2 = weeklyPlan.find(p => p.productCode === '4473386')!;
      expect(p2).toBeDefined();
      expect(p2.totalForecastCases).toBe(120);
      expect(p2.palletEquivalent).toBe(3.33); // 120 / 36 casesPerPallet = 3.33 pallets
    });
  });
});



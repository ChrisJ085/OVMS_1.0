import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import {
  calculatePlannedPallets,
  inspectMpps7Workbook,
  createImportPreview,
  verifyDuplicateImport,
  evaluatePlanComparison
} from './mpps7ImportService';
import { Product } from '../../../types/product';
import { ProductionLine } from '../../../types/configuration';
import { Timestamp, getDocs } from '../../../services/firestoreBase';

// Mock Firebase functions to allow isolated unit testing without live Firestore connection
vi.mock('../../../services/firestoreBase', async () => {
  const actual = await vi.importActual('../../../services/firestoreBase');
  return {
    ...actual,
    getDocs: vi.fn().mockImplementation(async () => ({
      empty: false,
      docs: [
        {
          id: 'p1',
          data: () => ({
            productCode: 'PRD-100',
            productName: 'Standard Beverage 500ml',
            unitsPerCase: 12,
            casesPerPallet: 100,
            status: 'active'
          })
        },
        {
          id: 'p2',
          data: () => ({
            productCode: 'PRD-200',
            productName: 'Zero Pallet Config SKU',
            unitsPerCase: 24,
            casesPerPallet: 0,
            status: 'active'
          })
        },
        {
          id: 'p3',
          data: () => ({
            productCode: '04310500',
            productName: 'F1 Andrex Skin Protect 155sc',
            description: 'F1 Andrex Skin Protect 155sc',
            unitsPerCase: 16,
            casesPerPallet: 54,
            unitOfMeasureId: 'Qt7lJJw9bHQrBBe9iDLG',
            configurations: [
              { unitOfMeasureId: 'Qt7lJJw9bHQrBBe9iDLG', casesPerPallet: 54, unitsPerCase: 16 }
            ],
            status: 'active'
          })
        },
        {
          id: 'l1',
          data: () => ({
            lineCode: 'LINE-01',
            name: 'Main Canning Line 1',
            status: 'active'
          })
        }
      ],
      forEach(cb: any) {
        this.docs.forEach(cb);
      }
    })),
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    doc: vi.fn(),
    setDoc: vi.fn().mockResolvedValue(undefined),
    updateDoc: vi.fn().mockResolvedValue(undefined)
  };
});

describe('MPPS7 Import Service Test Suite (12 Scenarios)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper to build Excel workbooks in memory
  function createWorkbook(sheetName: string, rows: any[][]): XLSX.WorkBook {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return wb;
  }

  // 1. Standard MPPS7 File
  it('Scenario 1: Standard MPPS7 file parses cleanly with valid products and lines', async () => {
    const rows = [
      ['Resource', 'Product Number', 'Product Short Description', 'Base Unit of Measure', '01.01.2026', '02.01.2026', 'Total'],
      ['LINE-01', 'PRD-100', 'Standard Beverage 500ml', 'CS', 200, 300, 500]
    ];
    const wb = createWorkbook('MPPS7_Plan', rows);
    const preview = await createImportPreview(wb, 'Standard_MPPS7.xlsx', 1024, 'hash-1', 'tenant-1', 'site-1', 'Planner');

    expect(preview.summary.totalSourceRows).toBe(1);
    expect(preview.summary.errorCount).toBe(0);
    expect(preview.diagnostics.reconciliation.status).toBe('MATCH');
    expect(preview.rows[0].calculatedPallets).toBe(2); // 200 cases / 100 casesPerPallet
  });

  // 2. Title Rows Before Headings
  it('Scenario 2: Title rows before headings - inspectMpps7Workbook locates header at row index 2', () => {
    const rows = [
      ['SAP Production Schedule Export'],
      ['Generated on 2026-01-01'],
      ['Resource', 'Product Number', 'Product Short Description', 'Base Unit of Measure', '01.01', 'Total'],
      ['LINE-01', 'PRD-100', 'Standard Beverage 500ml', 'CS', 100, 100]
    ];
    const wb = createWorkbook('MPPS7_Title', rows);
    const inspection = inspectMpps7Workbook(wb);

    expect(inspection.selectedSheetName).toBe('MPPS7_Title');
    expect(inspection.headerRowIndex).toBe(2);
  });

  // 3. Multiple Worksheets
  it('Scenario 3: Multiple worksheets selects MPPS7 sheet over cover pages', () => {
    const wb = XLSX.utils.book_new();
    const coverWs = XLSX.utils.aoa_to_sheet([['Cover Sheet Info']]);
    const mpps7Ws = XLSX.utils.aoa_to_sheet([
      ['Resource', 'Product Number', 'Product Short Description', 'Base Unit of Measure', '01.01', 'Total'],
      ['LINE-01', 'PRD-100', 'Standard Beverage', 'CS', 50, 50]
    ]);
    XLSX.utils.book_append_sheet(wb, coverWs, 'Instructions');
    XLSX.utils.book_append_sheet(wb, mpps7Ws, 'MPPS7_Schedule');

    const inspection = inspectMpps7Workbook(wb);

    expect(inspection.selectedSheetName).toBe('MPPS7_Schedule');
    expect(inspection.detectedWorksheetNames).toContain('Instructions');
    expect(inspection.detectedWorksheetNames).toContain('MPPS7_Schedule');
  });

  // 4. December-to-January Plan Year Rollover
  it('Scenario 4: December-to-January plan rollover detects cross-year rollover', async () => {
    const rows = [
      ['Resource', 'Product Number', 'Product Short Description', 'Base Unit of Measure', '28.12', '29.12', '30.12', '31.12', '01.01', '02.01', 'Total'],
      ['LINE-01', 'PRD-100', 'Standard Beverage 500ml', 'CS', 10, 10, 10, 10, 10, 10, 60]
    ];
    const wb = createWorkbook('MPPS7_Rollover', rows);
    const preview = await createImportPreview(wb, 'Plan_Dec_Jan.xlsx', 2048, 'hash-rollover', 'tenant-1', 'site-1', 'Planner', 2026);

    expect(preview.diagnostics.yearResolution.hasYearRollover).toBe(true);
    expect(preview.diagnostics.dateSequence.startDate).toContain('2026-12-28');
    expect(preview.diagnostics.dateSequence.endDate).toContain('2027-01-02');
  });

  // 5. Missing Cases Per Pallet
  it('Scenario 5: Missing casesPerPallet sets calculatedPallets to null and flags CASES_PER_PALLET_MISSING', async () => {
    const palletCalc = calculatePlannedPallets(100, 0);
    expect(palletCalc).toBeNull();

    const rows = [
      ['Resource', 'Product Number', 'Product Short Description', 'Base Unit of Measure', '01.01.2026', 'Total'],
      ['LINE-01', 'PRD-200', 'Zero Pallet Config SKU', 'CS', 100, 100]
    ];
    const wb = createWorkbook('MPPS7_NoPallet', rows);
    const preview = await createImportPreview(wb, 'No_Pallet.xlsx', 1024, 'hash-no-pal', 'tenant-1', 'site-1', 'Planner');

    expect(preview.rows[0].calculatedPallets).toBeNull();
    expect(preview.rows[0].validationCodes).toContain('CASES_PER_PALLET_MISSING');
    expect(preview.rows[0].rowStatus).toBe('ERROR');
  });

  // 6. Unsupported Unit
  it('Scenario 6: Unsupported unit flags UNSUPPORTED_UNIT and blocks row', async () => {
    const rows = [
      ['Resource', 'Product Number', 'Product Short Description', 'Base Unit of Measure', '01.01.2026', 'Total'],
      ['LINE-01', 'PRD-100', 'Standard Beverage 500ml', 'LBS', 100, 100]
    ];
    const wb = createWorkbook('MPPS7_BadUnit', rows);
    const preview = await createImportPreview(wb, 'Bad_Unit.xlsx', 1024, 'hash-bad-unit', 'tenant-1', 'site-1', 'Planner');

    expect(preview.diagnostics.unitValidation.hasUnsupportedUnits).toBe(true);
    expect(preview.diagnostics.unitValidation.unsupportedUnitsFound).toContain('LBS');
    expect(preview.rows[0].rowStatus).toBe('ERROR');
  });

  // 7. Duplicate Date Column
  it('Scenario 7: Duplicate date column creates error in date sequence diagnostics', async () => {
    const rows = [
      ['Resource', 'Product Number', 'Product Short Description', 'Base Unit of Measure', '01.01.2026', '01.01.2026', 'Total'],
      ['LINE-01', 'PRD-100', 'Standard Beverage 500ml', 'CS', 100, 100, 200]
    ];
    const wb = createWorkbook('MPPS7_DupDate', rows);
    const preview = await createImportPreview(wb, 'Dup_Date.xlsx', 1024, 'hash-dup-date', 'tenant-1', 'site-1', 'Planner');

    expect(preview.diagnostics.dateSequence.isValidSequence).toBe(false);
    expect(preview.diagnostics.dateSequence.issues.some(s => s.includes('Duplicate date column'))).toBe(true);
  });

  // 8. Total Mismatch
  it('Scenario 8: Total mismatch triggers MISMATCH reconciliation status', async () => {
    const rows = [
      ['Resource', 'Product Number', 'Product Short Description', 'Base Unit of Measure', '01.01.2026', '02.01.2026', 'Total'],
      ['LINE-01', 'PRD-100', 'Standard Beverage 500ml', 'CS', 100, 100, 500]
    ];
    const wb = createWorkbook('MPPS7_TotalMismatch', rows);
    const preview = await createImportPreview(wb, 'Mismatch.xlsx', 1024, 'hash-mismatch', 'tenant-1', 'site-1', 'Planner');

    expect(preview.diagnostics.reconciliation.status).toBe('MISMATCH');
    expect(preview.diagnostics.reconciliation.difference).toBe(-300);
    expect(preview.reconciliation.hasMaterialMismatch).toBe(true);
  });

  // 9. Duplicate Committed File
  it('Scenario 9: Duplicate committed file hash returns DUPLICATE_FOUND status', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({
      empty: false,
      docs: [
        {
          id: 'import-prev-123',
          data: () => ({
            originalFilename: 'Standard_MPPS7.xlsx',
            fileHash: 'hash-committed',
            status: 'COMMITTED'
          })
        }
      ],
      forEach: (cb: any) => []
    } as any);

    const duplicateCheck = await verifyDuplicateImport('tenant-1', 'site-1', 'hash-committed');

    expect(duplicateCheck.status).toBe('DUPLICATE_FOUND');
    expect(duplicateCheck.message).toContain('committed previously');
  });

  // 10. Duplicate Check Failure
  it('Scenario 10: Duplicate check handles unexpected database check failures gracefully', async () => {
    vi.mocked(getDocs).mockRejectedValueOnce(new Error('Network error simulated'));

    const duplicateCheck = await verifyDuplicateImport('tenant-1', 'site-1', 'hash-err');

    expect(duplicateCheck.status).toBe('CHECK_FAILED');
    expect(duplicateCheck.message).toContain('failed');
  });

  // 11. Older Overlapping Plan
  it('Scenario 11: Active plan comparison detects overlapping / older plans', async () => {
    const activePeriodStart = Timestamp.fromDate(new Date('2026-01-15T00:00:00Z'));
    const activePeriodEnd = Timestamp.fromDate(new Date('2026-01-25T00:00:00Z'));

    vi.mocked(getDocs).mockResolvedValueOnce({
      empty: false,
      docs: [
        {
          id: 'active-import-1',
          data: () => ({
            periodStart: activePeriodStart,
            periodEnd: activePeriodEnd,
            status: 'COMMITTED'
          })
        }
      ],
      forEach: (cb: any) => []
    } as any);

    const currentStart = new Date('2026-01-10T00:00:00Z');
    const currentEnd = new Date('2026-01-20T00:00:00Z');

    const comparison = await evaluatePlanComparison('tenant-1', 'site-1', currentStart, currentEnd);

    expect(comparison.status).toBe('OVERLAPS_ACTIVE');
    expect(comparison.message).toContain('overlaps current active plan');
  });

  // 12. Empty Workbook
  it('Scenario 12: Empty workbook throws clean structural error', async () => {
    const wb = createWorkbook('EmptySheet', []);

    await expect(
      createImportPreview(wb, 'Empty.xlsx', 512, 'hash-empty', 'tenant-1', 'site-1', 'Planner')
    ).rejects.toThrow(/No sheet matching MPPS7 structure/i);
  });

  // 13. Unknown Product & Unknown Line
  it('Scenario 13: Unknown product SKU and unknown production line resource flag respective error validation codes', async () => {
    const rows = [
      ['Resource', 'Product Number', 'Product Short Description', 'Base Unit of Measure', '01.01.2026', 'Total'],
      ['UNKNOWN-LINE', 'UNKNOWN-SKU', 'Unknown Item', 'CS', 100, 100]
    ];
    const wb = createWorkbook('MPPS7_Unknown', rows);
    const preview = await createImportPreview(wb, 'Unknown_Master.xlsx', 1024, 'hash-unknown', 'tenant-1', 'site-1', 'Planner');

    expect(preview.missingProducts.length).toBe(1);
    expect(preview.missingLines.length).toBe(1);
    expect(preview.rows[0].validationCodes).toContain('PRODUCT_NOT_FOUND');
    expect(preview.rows[0].validationCodes).toContain('PRODUCTION_LINE_NOT_CONFIGURED');
    expect(preview.rows[0].rowStatus).toBe('ERROR');
  });

  // 14. Extra Decorative Formatting & Blank Rows
  it('Scenario 14: Extra decorative formatting and blank rows are successfully skipped or handled', async () => {
    const rows = [
      ['Decorative Title Banner'],
      [],
      ['Resource', 'Product Number', 'Product Short Description', 'Base Unit of Measure', '01.01.2026', 'Total'],
      ['LINE-01', 'PRD-100', 'Standard Beverage 500ml', 'CS', 150, 150],
      [],
      ['']
    ];
    const wb = createWorkbook('MPPS7_Decorative', rows);
    const preview = await createImportPreview(wb, 'Decorative.xlsx', 1024, 'hash-decor', 'tenant-1', 'site-1', 'Planner');

    expect(preview.summary.totalSourceRows).toBe(2); // Non-empty row count parsed from header row
    expect(preview.summary.errorCount).toBe(0);
    expect(preview.rows.length).toBe(1);
  });

  // 15. Corrupt Workbook Structure
  it('Scenario 15: Corrupt workbook structure throws invalid inspection error', async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([['Invalid', 'Structure', 'Columns']]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const inspection = inspectMpps7Workbook(wb);
    expect(inspection.isValidMpps7).toBe(false);
  });

  // 16. Custom Unit of Measure ID & Math.ceil Pallet Rounding
  it('Scenario 16: Custom UoM database ID is accepted and pallet calculation rounds up using Math.ceil', async () => {
    const rows = [
      ['Resource', 'Product Number', 'Product Short Description', 'Base Unit of Measure', '22.07.2026', 'Total'],
      ['LINE-01', '04310500', 'F1 Andrex Skin Protect 155sc', 'QT7LJJW9BHQRBBE9IDLG', 1500, 1500]
    ];
    const wb = createWorkbook('MPPS7_CustomUoM', rows);
    const preview = await createImportPreview(wb, 'CustomUoM.xlsx', 1024, 'hash-custom-uom', 'tenant-1', 'site-1', 'Planner');

    expect(preview.diagnostics.unitValidation.hasUnsupportedUnits).toBe(false);
    expect(preview.rows[0].rowStatus).toBe('VALID');
    expect(preview.rows[0].casesPerPallet).toBe(54);
    // 1500 / 54 = 27.777... -> rounds up to 28
    expect(preview.rows[0].calculatedPallets).toBe(28);
  });
});

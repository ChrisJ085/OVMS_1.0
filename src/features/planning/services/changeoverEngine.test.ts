import { describe, it, expect } from 'vitest';
import {
  calculateDayEventSummary,
  getEventHeaderBackground,
  PRODUCTION_EVENT_COLOURS,
} from './changeoverEngine';
import { ProductionLine } from '../../../types/configuration';
import { Product } from '../../../types/product';
import { ProductCategory } from '../../../types/configuration';
import { ProductionPlanEntry } from '../../../types/production';
import { Timestamp } from 'firebase/firestore';

const sampleLine: ProductionLine = {
  id: 'line-f1',
  tenantId: 'tenant-1',
  siteId: 'site-1',
  lineCode: 'F1',
  lineName: 'Converting Line F1',
  scheduledCleanDay: 'None',
  status: 'active',
  createdBy: 'test',
  createdDate: Timestamp.now(),
  modifiedBy: 'test',
  modifiedDate: Timestamp.now(),
};

const sampleCategories: ProductCategory[] = [
  { id: 'cat-tissue', tenantId: 'tenant-1', code: 'TISSUE', name: 'Toilet Tissue', status: 'active', createdBy: 'test', createdDate: Timestamp.now(), modifiedBy: 'test', modifiedDate: Timestamp.now() },
  { id: 'cat-towel', tenantId: 'tenant-1', code: 'TOWEL', name: 'Facial Tissue', status: 'active', createdBy: 'test', createdDate: Timestamp.now(), modifiedBy: 'test', modifiedDate: Timestamp.now() },
];

const sampleProducts: Product[] = [
  {
    id: 'prod-a',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    productCode: 'PROD_A',
    description: 'Toilet Tissue 24pk A',
    categoryId: 'cat-tissue',
    unitOfMeasureId: 'CS',
    casesPerPallet: 40,
    unitsPerCase: 24,
    configurations: [],
    defaultDestinationId: null,
    operationallyRelevant: true,
    notes: '',
    status: 'active',
    createdBy: 'test',
    createdDate: Timestamp.now(),
    modifiedBy: 'test',
    modifiedDate: Timestamp.now(),
  },
  {
    id: 'prod-b',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    productCode: 'PROD_B',
    description: 'Toilet Tissue 12pk B',
    categoryId: 'cat-tissue',
    unitOfMeasureId: 'CS',
    casesPerPallet: 40,
    unitsPerCase: 12,
    configurations: [],
    defaultDestinationId: null,
    operationallyRelevant: true,
    notes: '',
    status: 'active',
    createdBy: 'test',
    createdDate: Timestamp.now(),
    modifiedBy: 'test',
    modifiedDate: Timestamp.now(),
  },
  {
    id: 'prod-c',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    productCode: 'PROD_C',
    description: 'Facial Tissue 200s C',
    categoryId: 'cat-towel',
    unitOfMeasureId: 'CS',
    casesPerPallet: 50,
    unitsPerCase: 24,
    configurations: [],
    defaultDestinationId: null,
    operationallyRelevant: true,
    notes: '',
    status: 'active',
    createdBy: 'test',
    createdDate: Timestamp.now(),
    modifiedBy: 'test',
    modifiedDate: Timestamp.now(),
  },
  {
    id: 'prod-nocat',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    productCode: 'PROD_NOCAT',
    description: 'Uncategorized SKU',
    categoryId: '', // missing category
    unitOfMeasureId: 'CS',
    casesPerPallet: 40,
    unitsPerCase: 12,
    configurations: [],
    defaultDestinationId: null,
    operationallyRelevant: true,
    notes: '',
    status: 'active',
    createdBy: 'test',
    createdDate: Timestamp.now(),
    modifiedBy: 'test',
    modifiedDate: Timestamp.now(),
  },
];

function makeEntry(id: string, productCode: string, productId: string, date: Date, sourceRowNumber: number): ProductionPlanEntry {
  return {
    tenantId: 'tenant-1',
    siteId: 'site-1',
    activeImportId: 'imp-1',
    productId,
    productCodeSnapshot: productCode,
    descriptionSnapshot: productCode,
    productionLineId: 'line-f1',
    productionLineCodeSnapshot: 'F1',
    productionDate: Timestamp.fromDate(date),
    plannedCases: 1000,
    casesPerPallet: 40,
    plannedPallets: 25,
    sourceType: 'SAP_MPPS7',
    sourceSheetName: 'F1',
    sourceRowNumber,
    sourceUpdatedAt: Timestamp.now(),
    planVersion: '1',
    status: 'PLANNED',
    createdDate: Timestamp.now(),
    modifiedDate: Timestamp.now(),
  };
}

describe('changeoverEngine', () => {
  // Fixed Monday date: 2026-08-10 (UTC)
  const mondayDate = new Date(Date.UTC(2026, 7, 10, 0, 0, 0));
  // Fixed Wednesday date: 2026-08-12 (UTC)
  const wednesdayDate = new Date(Date.UTC(2026, 7, 12, 0, 0, 0));

  it('1. Same product consecutively -> no change', () => {
    const entries = [
      makeEntry('e1', 'PROD_A', 'prod-a', mondayDate, 1),
      makeEntry('e2', 'PROD_A', 'prod-a', mondayDate, 2),
    ];

    const result = calculateDayEventSummary(sampleLine, mondayDate, entries, sampleProducts, sampleCategories);
    expect(result.events).toEqual([]);
    expect(result.summaryNoteText).toBe('Normal Production');
  });

  it('2. Product A Category X, Product B Category X -> FORMAT_CHANGE', () => {
    const entries = [
      makeEntry('e1', 'PROD_A', 'prod-a', mondayDate, 1),
      makeEntry('e2', 'PROD_B', 'prod-b', mondayDate, 2),
    ];

    const result = calculateDayEventSummary(sampleLine, mondayDate, entries, sampleProducts, sampleCategories);
    expect(result.events).toEqual(['FORMAT_CHANGE']);
    expect(result.formatChanges.length).toBe(1);
    expect(result.summaryNoteText).toBe('Format Change');
  });

  it('3. Product A Category X, Product B Category Y -> GRADE_CHANGE', () => {
    const entries = [
      makeEntry('e1', 'PROD_A', 'prod-a', mondayDate, 1),
      makeEntry('e2', 'PROD_C', 'prod-c', mondayDate, 2),
    ];

    const result = calculateDayEventSummary(sampleLine, mondayDate, entries, sampleProducts, sampleCategories);
    expect(result.events).toEqual(['GRADE_CHANGE']);
    expect(result.gradeChanges.length).toBe(1);
    expect(result.summaryNoteText).toBe('Grade Change');
  });

  it('4. A -> B same category, B -> C different category -> FORMAT_CHANGE + GRADE_CHANGE', () => {
    const entries = [
      makeEntry('e1', 'PROD_A', 'prod-a', mondayDate, 1),
      makeEntry('e2', 'PROD_B', 'prod-b', mondayDate, 2),
      makeEntry('e3', 'PROD_C', 'prod-c', mondayDate, 3),
    ];

    const result = calculateDayEventSummary(sampleLine, mondayDate, entries, sampleProducts, sampleCategories);
    expect(result.events).toEqual(['FORMAT_CHANGE', 'GRADE_CHANGE']);
    expect(result.formatChanges.length).toBe(1);
    expect(result.gradeChanges.length).toBe(1);
    expect(result.summaryNoteText).toBe('Format Change • Grade Change');
  });

  it('5. Clean day with no product change -> CLEAN', () => {
    const lineWithClean: ProductionLine = { ...sampleLine, scheduledCleanDay: 'Wednesday' };
    const entries = [
      makeEntry('e1', 'PROD_A', 'prod-a', wednesdayDate, 1),
    ];

    const result = calculateDayEventSummary(lineWithClean, wednesdayDate, entries, sampleProducts, sampleCategories);
    expect(result.events).toEqual(['CLEAN']);
    expect(result.scheduledClean).toBe(true);
    expect(result.summaryNoteText).toBe('Scheduled Clean');
  });

  it('6. Format Change on Clean Day -> FORMAT_CHANGE + CLEAN', () => {
    const lineWithClean: ProductionLine = { ...sampleLine, scheduledCleanDay: 'Wednesday' };
    const entries = [
      makeEntry('e1', 'PROD_A', 'prod-a', wednesdayDate, 1),
      makeEntry('e2', 'PROD_B', 'prod-b', wednesdayDate, 2),
    ];

    const result = calculateDayEventSummary(lineWithClean, wednesdayDate, entries, sampleProducts, sampleCategories);
    expect(result.events).toEqual(['FORMAT_CHANGE', 'CLEAN']);
    expect(result.summaryNoteText).toBe('Format Change • Scheduled Clean');
  });

  it('7. Grade Change on Clean Day -> GRADE_CHANGE + CLEAN', () => {
    const lineWithClean: ProductionLine = { ...sampleLine, scheduledCleanDay: 'Wednesday' };
    const entries = [
      makeEntry('e1', 'PROD_A', 'prod-a', wednesdayDate, 1),
      makeEntry('e2', 'PROD_C', 'prod-c', wednesdayDate, 2),
    ];

    const result = calculateDayEventSummary(lineWithClean, wednesdayDate, entries, sampleProducts, sampleCategories);
    expect(result.events).toEqual(['GRADE_CHANGE', 'CLEAN']);
    expect(result.summaryNoteText).toBe('Grade Change • Scheduled Clean');
  });

  it('8. Format + Grade on Clean Day -> FORMAT_CHANGE + GRADE_CHANGE + CLEAN', () => {
    const lineWithClean: ProductionLine = { ...sampleLine, scheduledCleanDay: 'Wednesday' };
    const entries = [
      makeEntry('e1', 'PROD_A', 'prod-a', wednesdayDate, 1),
      makeEntry('e2', 'PROD_B', 'prod-b', wednesdayDate, 2),
      makeEntry('e3', 'PROD_C', 'prod-c', wednesdayDate, 3),
    ];

    const result = calculateDayEventSummary(lineWithClean, wednesdayDate, entries, sampleProducts, sampleCategories);
    expect(result.events).toEqual(['FORMAT_CHANGE', 'GRADE_CHANGE', 'CLEAN']);
    expect(result.summaryNoteText).toBe('Format Change • Grade Change • Scheduled Clean');
  });

  it('9. Different production lines on same date -> evaluated independently', () => {
    const lineF2: ProductionLine = { ...sampleLine, id: 'line-f2', lineCode: 'F2', scheduledCleanDay: 'None' };

    const entriesF1 = [makeEntry('e1', 'PROD_A', 'prod-a', mondayDate, 1)];
    const entriesF2 = [
      makeEntry('e2', 'PROD_A', 'prod-a', mondayDate, 1),
      makeEntry('e3', 'PROD_B', 'prod-b', mondayDate, 2),
    ];

    const resF1 = calculateDayEventSummary(sampleLine, mondayDate, entriesF1, sampleProducts, sampleCategories);
    const resF2 = calculateDayEventSummary(lineF2, mondayDate, entriesF2, sampleProducts, sampleCategories);

    expect(resF1.events).toEqual([]);
    expect(resF2.events).toEqual(['FORMAT_CHANGE']);
  });

  it('10. Missing Product Category -> warning, no guessed change classification', () => {
    const entries = [
      makeEntry('e1', 'PROD_A', 'prod-a', mondayDate, 1),
      makeEntry('e2', 'PROD_NOCAT', 'prod-nocat', mondayDate, 2),
    ];

    const result = calculateDayEventSummary(sampleLine, mondayDate, entries, sampleProducts, sampleCategories);
    expect(result.missingCategoryWarning).toBe(true);
    expect(result.events).toEqual([]); // no guessed format/grade change
  });

  it('11. Changing configured Clean Day -> event moves to correct weekday', () => {
    const entries = [makeEntry('e1', 'PROD_A', 'prod-a', mondayDate, 1)];

    const lineMonClean: ProductionLine = { ...sampleLine, scheduledCleanDay: 'Monday' };
    const lineWedClean: ProductionLine = { ...sampleLine, scheduledCleanDay: 'Wednesday' };

    const resMon = calculateDayEventSummary(lineMonClean, mondayDate, entries, sampleProducts, sampleCategories);
    const resWed = calculateDayEventSummary(lineWedClean, mondayDate, entries, sampleProducts, sampleCategories);

    expect(resMon.events).toEqual(['CLEAN']);
    expect(resWed.events).toEqual([]);
  });

  it('12. Cross-day weekend transition Product A (Friday) -> Product C (Monday, diff category) -> GRADE_CHANGE', () => {
    const fridayDate = new Date(Date.UTC(2026, 7, 14, 0, 0, 0)); // Fri Aug 14
    const saturdayDate = new Date(Date.UTC(2026, 7, 15, 0, 0, 0)); // Sat Aug 15
    const mondayNextDate = new Date(Date.UTC(2026, 7, 17, 0, 0, 0)); // Mon Aug 17

    const entries = [
      makeEntry('e1', 'PROD_A', 'prod-a', fridayDate, 1),
      makeEntry('e2', 'PROD_C', 'prod-c', mondayNextDate, 1),
    ];

    const resSat = calculateDayEventSummary(sampleLine, saturdayDate, entries, sampleProducts, sampleCategories);
    const resMon = calculateDayEventSummary(sampleLine, mondayNextDate, entries, sampleProducts, sampleCategories);

    expect(resSat.events).toEqual(['GRADE_CHANGE']);
    expect(resMon.events).toEqual(['GRADE_CHANGE']);
    expect(resMon.gradeChanges.length).toBe(1);
  });

  it('13. Maintenance shutdown and RSR trial events supported independently', () => {
    const lineEvents = {
      maintenanceEvents: [
        {
          productionLineId: 'line-f1',
          startDate: '2026-08-10',
          endDate: '2026-08-10',
          reason: 'Scheduled overhaul',
        },
      ],
      trialEvents: [
        {
          productionLineId: 'line-f1',
          startDate: '2026-08-10',
          endDate: '2026-08-10',
          description: 'RSR paper trial',
        },
      ],
    };

    const result = calculateDayEventSummary(sampleLine, mondayDate, [], sampleProducts, sampleCategories, lineEvents);
    expect(result.events).toEqual(['MAINT_SHUT', 'RSR_TRIAL']);
    expect(result.summaryNoteText).toBe('Maintenance Shutdown • RSR Trial');
  });

  it('Multi-color background gradient generation', () => {
    expect(getEventHeaderBackground([])).toBeUndefined();
    expect(getEventHeaderBackground(['FORMAT_CHANGE'])).toBe(PRODUCTION_EVENT_COLOURS.FORMAT_CHANGE);
    expect(getEventHeaderBackground(['FORMAT_CHANGE', 'CLEAN'])).toContain('linear-gradient');
    expect(getEventHeaderBackground(['FORMAT_CHANGE', 'GRADE_CHANGE', 'CLEAN'])).toContain('33.33%');
  });
});

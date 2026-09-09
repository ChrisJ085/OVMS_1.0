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

const nowIso = new Date().toISOString() as any;
const fromDateIso = (d: Date) => d.toISOString() as any;

const sampleLine: ProductionLine = {
  id: 'line-f1',
  tenantId: 'tenant-1',
  siteId: 'site-1',
  lineCode: 'F1',
  lineName: 'Converting Line F1',
  scheduledCleanDay: 'None',
  status: 'active',
  createdBy: 'test',
  createdDate: nowIso,
  modifiedBy: 'test',
  modifiedDate: nowIso,
};

const sampleCategories: ProductCategory[] = [
  { id: 'cat-tissue', tenantId: 'tenant-1', code: 'TISSUE', name: 'Toilet Tissue', status: 'active', createdBy: 'test', createdDate: nowIso, modifiedBy: 'test', modifiedDate: nowIso },
  { id: 'cat-towel', tenantId: 'tenant-1', code: 'TOWEL', name: 'Facial Tissue', status: 'active', createdBy: 'test', createdDate: nowIso, modifiedBy: 'test', modifiedDate: nowIso },
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
    createdDate: nowIso,
    modifiedBy: 'test',
    modifiedDate: nowIso,
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
    createdDate: nowIso,
    modifiedBy: 'test',
    modifiedDate: nowIso,
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
    createdDate: nowIso,
    modifiedBy: 'test',
    modifiedDate: nowIso,
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
    createdDate: nowIso,
    modifiedBy: 'test',
    modifiedDate: nowIso,
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
    productionDate: fromDateIso(date),
    plannedCases: 1000,
    casesPerPallet: 40,
    plannedPallets: 25,
    sourceType: 'SAP_MPPS7',
    sourceSheetName: 'F1',
    sourceRowNumber,
    sourceUpdatedAt: nowIso,
    planVersion: '1',
    status: 'PLANNED',
    createdDate: nowIso,
    modifiedDate: nowIso,
  };
}

describe('changeoverEngine', () => {
  const mondayDate = new Date(Date.UTC(2026, 7, 10, 0, 0, 0));
  const wednesdayDate = new Date(Date.UTC(2026, 7, 12, 0, 0, 0));

  it('1. No manual notes -> returns empty events', () => {
    const entries = [
      makeEntry('e1', 'PROD_A', 'prod-a', mondayDate, 1),
    ];

    const result = calculateDayEventSummary(sampleLine, mondayDate, entries, sampleProducts, sampleCategories);
    expect(result.events).toEqual([]);
    expect(result.summaryNoteText).toBe('Normal Production');
  });

  it('2. Format Change note -> FORMAT_CHANGE event', () => {
    const notes = [
      {
        id: 'note-1',
        tenantId: 'tenant-1',
        siteId: 'site-1',
        productionLineId: 'F1',
        noteDate: fromDateIso(mondayDate),
        noteType: 'FORMAT_CHANGE' as const,
        title: 'Format Change',
        note: 'Switching format on line F1',
        startAt: null,
        endAt: null,
        severity: 'INFORMATION' as const,
        source: 'PLANNER' as const,
        active: true,
        createdBy: 'Test',
        createdDate: nowIso,
        modifiedBy: 'Test',
        modifiedDate: nowIso,
      }
    ];

    const result = calculateDayEventSummary(sampleLine, mondayDate, [], sampleProducts, sampleCategories, notes);
    expect(result.events).toEqual(['FORMAT_CHANGE']);
    expect(result.summaryNoteText).toBe('Format Change');
  });

  it('3. Grade Change note -> GRADE_CHANGE event', () => {
    const notes = [
      {
        id: 'note-2',
        tenantId: 'tenant-1',
        siteId: 'site-1',
        productionLineId: 'F1',
        noteDate: fromDateIso(mondayDate),
        noteType: 'GRADE_CHANGE' as const,
        title: 'Grade Change',
        note: 'Switching paper grade',
        startAt: null,
        endAt: null,
        severity: 'INFORMATION' as const,
        source: 'PLANNER' as const,
        active: true,
        createdBy: 'Test',
        createdDate: nowIso,
        modifiedBy: 'Test',
        modifiedDate: nowIso,
      }
    ];

    const result = calculateDayEventSummary(sampleLine, mondayDate, [], sampleProducts, sampleCategories, notes);
    expect(result.events).toEqual(['GRADE_CHANGE']);
    expect(result.summaryNoteText).toBe('Grade Change');
  });

  it('4. Cleaning note -> CLEAN event', () => {
    const notes = [
      {
        id: 'note-3',
        tenantId: 'tenant-1',
        siteId: 'site-1',
        productionLineId: 'F1',
        noteDate: fromDateIso(mondayDate),
        noteType: 'CLEANING' as const,
        title: 'Deep Clean',
        note: 'Required washdown',
        startAt: null,
        endAt: null,
        severity: 'INFORMATION' as const,
        source: 'PLANNER' as const,
        active: true,
        createdBy: 'Test',
        createdDate: nowIso,
        modifiedBy: 'Test',
        modifiedDate: nowIso,
      }
    ];

    const result = calculateDayEventSummary(sampleLine, mondayDate, [], sampleProducts, sampleCategories, notes);
    expect(result.events).toEqual(['CLEAN']);
    expect(result.summaryNoteText).toBe('Scheduled Clean');
  });

  it('5. Maintenance shutdown note -> MAINT_SHUT event', () => {
    const notes = [
      {
        id: 'note-4',
        tenantId: 'tenant-1',
        siteId: 'site-1',
        productionLineId: 'F1',
        noteDate: fromDateIso(mondayDate),
        noteType: 'MAINTENANCE' as const,
        title: 'Motor overhaul',
        note: 'Replacing main drive motor',
        startAt: null,
        endAt: null,
        severity: 'CRITICAL' as const,
        source: 'PLANNER' as const,
        active: true,
        createdBy: 'Test',
        createdDate: nowIso,
        modifiedBy: 'Test',
        modifiedDate: nowIso,
      }
    ];

    const result = calculateDayEventSummary(sampleLine, mondayDate, [], sampleProducts, sampleCategories, notes);
    expect(result.events).toEqual(['MAINT_SHUT']);
    expect(result.summaryNoteText).toBe('Maintenance Shutdown');
  });

  it('6. Trial note -> RSR_TRIAL event', () => {
    const notes = [
      {
        id: 'note-5',
        tenantId: 'tenant-1',
        siteId: 'site-1',
        productionLineId: 'F1',
        noteDate: fromDateIso(mondayDate),
        noteType: 'TRIAL' as const,
        title: 'RSR trial run',
        note: 'Testing new emboss roll',
        startAt: null,
        endAt: null,
        severity: 'WARNING' as const,
        source: 'PLANNER' as const,
        active: true,
        createdBy: 'Test',
        createdDate: nowIso,
        modifiedBy: 'Test',
        modifiedDate: nowIso,
      }
    ];

    const result = calculateDayEventSummary(sampleLine, mondayDate, [], sampleProducts, sampleCategories, notes);
    expect(result.events).toEqual(['RSR_TRIAL']);
    expect(result.summaryNoteText).toBe('RSR Trial');
  });

  it('7. Multiple manual notes -> multiple events combined canonical order', () => {
    const notes = [
      {
        id: 'note-a',
        tenantId: 'tenant-1',
        siteId: 'site-1',
        productionLineId: 'F1',
        noteDate: fromDateIso(mondayDate),
        noteType: 'TRIAL' as const,
        title: 'Trial',
        note: 'Testing new emboss roll',
        startAt: null,
        endAt: null,
        severity: 'WARNING' as const,
        source: 'PLANNER' as const,
        active: true,
        createdBy: 'Test',
        createdDate: nowIso,
        modifiedBy: 'Test',
        modifiedDate: nowIso,
      },
      {
        id: 'note-b',
        tenantId: 'tenant-1',
        siteId: 'site-1',
        productionLineId: 'F1',
        noteDate: fromDateIso(mondayDate),
        noteType: 'CLEANING' as const,
        title: 'Clean',
        note: 'Deep clean',
        startAt: null,
        endAt: null,
        severity: 'INFORMATION' as const,
        source: 'PLANNER' as const,
        active: true,
        createdBy: 'Test',
        createdDate: nowIso,
        modifiedBy: 'Test',
        modifiedDate: nowIso,
      }
    ];

    const result = calculateDayEventSummary(sampleLine, mondayDate, [], sampleProducts, sampleCategories, notes);
    expect(result.events).toEqual(['CLEAN', 'RSR_TRIAL']);
    expect(result.summaryNoteText).toBe('Scheduled Clean • RSR Trial');
  });

  it('Multi-color background gradient generation', () => {
    expect(getEventHeaderBackground([])).toBeUndefined();
    expect(getEventHeaderBackground(['FORMAT_CHANGE'])).toBe(PRODUCTION_EVENT_COLOURS.FORMAT_CHANGE);
    expect(getEventHeaderBackground(['FORMAT_CHANGE', 'CLEAN'])).toContain('linear-gradient');
    expect(getEventHeaderBackground(['FORMAT_CHANGE', 'GRADE_CHANGE', 'CLEAN'])).toContain('33.33%');
  });
});

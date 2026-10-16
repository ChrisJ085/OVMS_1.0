import { ProductionEvent, ProductionPlanEntry, ProductionStatus } from '../../../types/production';
import { ProductionLine, UnitOfMeasure } from '../../../types/configuration';
import { Product } from '../../../types/product';
import { createProductionEvent, updateProductionEvent } from './productionService';
import { getDocuments, where, createDocument, deleteDocument } from '../../../services/dbService';
import { toEpochMillis, toSafeDate } from '../../../utils/timeFormatters';

export interface SyncPlanResult {
  syncedCount: number;
  skippedCount: number;
  errors: string[];
}

export interface SeedScheduleResult {
  createdCount: number;
  errors: string[];
}

/**
 * Normalizes a date to UTC Midnight
 */
export const toUTCMidnight = (d: Date): Date => {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
};

/**
 * Syncs ProductionPlanEntries into operational ProductionEvents for a given week.
 */
export const syncEventsFromPlanEntries = async (
  tenantId: string,
  siteId: string,
  weekStart: Date,
  lines: ProductionLine[],
  products: Product[],
  uoms: UnitOfMeasure[]
): Promise<SyncPlanResult> => {
  const result: SyncPlanResult = { syncedCount: 0, skippedCount: 0, errors: [] };

  if (!tenantId || !siteId || tenantId === 'GLOBAL' || siteId === 'GLOBAL') {
    result.errors.push('Tenant and Site must be specified');
    return result;
  }

  try {
    const weekStartMidnight = toUTCMidnight(weekStart);
    const startMs = weekStartMidnight.getTime();
    const endMs = startMs + 7 * 24 * 60 * 60 * 1000;

    // 1. Fetch existing production plan entries
    const planEntries = await getDocuments<ProductionPlanEntry>('productionPlanEntries', [
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId)
    ]);

    const weekEntries = planEntries.filter(entry => {
      if (!entry.productionDate) return false;
      const pMillis = toEpochMillis(entry.productionDate);
      return pMillis !== null && pMillis >= startMs && pMillis < endMs;
    });

    if (weekEntries.length === 0) {
      return result;
    }

    // 2. Fetch existing production events to avoid duplicates
    const existingEvents = await getDocuments<ProductionEvent>('productionEvents', [
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId)
    ]);

    const defaultUom = uoms.find(u => u.code === 'CS' || u.name?.toLowerCase().includes('case')) || uoms[0];
    const defaultUomId = defaultUom?.id || '';

    // 3. For each plan entry, convert to a calendar event
    for (const entry of weekEntries) {
      const entryDate = toSafeDate(entry.productionDate);
      const entryDateStr = entryDate.toISOString().slice(0, 10);

      // Check if event already exists for this line, product, and date
      const alreadyExists = existingEvents.some(evt => {
        if (evt.status !== 'active') return false;
        if (evt.productionLineId !== entry.productionLineId && evt.productId !== entry.productId) return false;
        const evtDate = toSafeDate(evt.plannedStart).toISOString().slice(0, 10);
        return evtDate === entryDateStr && evt.productId === entry.productId && evt.productionLineId === entry.productionLineId;
      });

      if (alreadyExists) {
        result.skippedCount++;
        continue;
      }

      // Schedule default shift: 06:00 to 14:00 UTC
      const plannedStart = new Date(Date.UTC(entryDate.getUTCFullYear(), entryDate.getUTCMonth(), entryDate.getUTCDate(), 6, 0, 0, 0));
      const plannedFinish = new Date(Date.UTC(entryDate.getUTCFullYear(), entryDate.getUTCMonth(), entryDate.getUTCDate(), 14, 0, 0, 0));

      const matchedProduct = products.find(p => p.id === entry.productId || p.productCode === entry.productCodeSnapshot);
      const productUomId = matchedProduct?.unitOfMeasureId || defaultUomId;

      const plannedQty = entry.plannedCases || (entry.plannedPallets ? entry.plannedPallets * (entry.casesPerPallet || 60) : 1200);

      const createRes = await createProductionEvent({
        tenantId,
        siteId,
        productId: entry.productId,
        productCodeSnapshot: entry.productCodeSnapshot,
        descriptionSnapshot: entry.descriptionSnapshot,
        productionLineId: entry.productionLineId,
        productionStatus: (entry.status || 'PLANNED') as ProductionStatus,
        plannedStart: plannedStart.toISOString(),
        plannedFinish: plannedFinish.toISOString(),
        actualStart: null,
        actualFinish: null,
        plannedQuantity: plannedQty,
        actualQuantity: null,
        unitOfMeasureId: productUomId,
        delayReason: null,
        notes: `Imported from Production Plan (${entry.sourceType || 'SAP_MPPS7'})`,
        createdBy: 'PLANNER',
        modifiedBy: 'PLANNER'
      });

      if (createRes.success) {
        result.syncedCount++;
      } else {
        result.errors.push(`Failed for ${entry.productCodeSnapshot}: ${createRes.error}`);
      }
    }

    return result;
  } catch (err: any) {
    result.errors.push(err.message || 'Sync failed');
    return result;
  }
};

/**
 * Seeds a realistic multi-line production schedule for the current week.
 * This guarantees users immediately see live interactive data on the Production Calendar.
 */
export const seedSampleProductionSchedule = async (
  tenantId: string,
  siteId: string,
  lines: ProductionLine[],
  products: Product[],
  uoms: UnitOfMeasure[]
): Promise<SeedScheduleResult> => {
  const result: SeedScheduleResult = { createdCount: 0, errors: [] };

  if (!tenantId || !siteId) {
    result.errors.push('Tenant and Site must be specified');
    return result;
  }

  const activeLines = lines.filter(l => l.status === 'active');
  const activeProducts = products.filter(p => p.status === 'active');

  if (activeLines.length === 0) {
    result.errors.push('No active production lines available to schedule runs');
    return result;
  }

  if (activeProducts.length === 0) {
    result.errors.push('No active products available to schedule runs');
    return result;
  }

  const defaultUom = uoms.find(u => u.code === 'CS' || u.name?.toLowerCase().includes('case')) || uoms[0];
  const defaultUomId = defaultUom?.id || '';

  const now = new Date();
  const todayUTC = toUTCMidnight(now);

  // Helper to build dates relative to today
  const dayOffsetDate = (offsetDays: number, hourUTC: number): Date => {
    return new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), todayUTC.getUTCDate() + offsetDays, hourUTC, 0, 0, 0));
  };

  type NewProductionEvent = Omit<ProductionEvent, 'id' | 'status' | 'createdDate' | 'modifiedDate' | 'createdBy' | 'modifiedBy'>;
  const sampleRuns: NewProductionEvent[] = [];

  // Line 1: Main Packaging / High-Speed Line
  const line1 = activeLines[0];
  const prod1 = activeProducts[0];
  const prod2 = activeProducts.length > 1 ? activeProducts[1] : activeProducts[0];

  // Run 1: Yesterday COMPLETE
  sampleRuns.push({
    tenantId,
    siteId,
    productId: prod1.id,
    productCodeSnapshot: prod1.productCode,
    descriptionSnapshot: prod1.description,
    productionLineId: line1.id,
    productionStatus: 'COMPLETE',
    plannedStart: dayOffsetDate(-1, 6).toISOString(),
    plannedFinish: dayOffsetDate(-1, 14).toISOString(),
    actualStart: dayOffsetDate(-1, 6).toISOString(),
    actualFinish: dayOffsetDate(-1, 13).toISOString(),
    plannedQuantity: 2400,
    actualQuantity: 2450,
    unitOfMeasureId: prod1.unitOfMeasureId || defaultUomId,
    delayReason: null,
    notes: 'Completed ahead of schedule. Line speed 102%.'
  });

  // Run 2: Today RUNNING (Morning Shift)
  sampleRuns.push({
    tenantId,
    siteId,
    productId: prod2.id,
    productCodeSnapshot: prod2.productCode,
    descriptionSnapshot: prod2.description,
    productionLineId: line1.id,
    productionStatus: 'RUNNING',
    plannedStart: dayOffsetDate(0, 6).toISOString(),
    plannedFinish: dayOffsetDate(0, 14).toISOString(),
    actualStart: dayOffsetDate(0, 6).toISOString(),
    actualFinish: null,
    plannedQuantity: 3000,
    actualQuantity: 1850,
    unitOfMeasureId: prod2.unitOfMeasureId || defaultUomId,
    delayReason: null,
    notes: 'Running on target. Hourly check passed.'
  });

  // Run 3: Tomorrow PLANNED (Morning Shift)
  sampleRuns.push({
    tenantId,
    siteId,
    productId: prod1.id,
    productCodeSnapshot: prod1.productCode,
    descriptionSnapshot: prod1.description,
    productionLineId: line1.id,
    productionStatus: 'PLANNED',
    plannedStart: dayOffsetDate(1, 6).toISOString(),
    plannedFinish: dayOffsetDate(1, 14).toISOString(),
    actualStart: null,
    actualFinish: null,
    plannedQuantity: 2800,
    actualQuantity: null,
    unitOfMeasureId: prod1.unitOfMeasureId || defaultUomId,
    delayReason: null,
    notes: 'Planned batch with standard changeover.'
  });

  // If Line 2 exists
  if (activeLines.length > 1) {
    const line2 = activeLines[1];
    const prod3 = activeProducts.length > 2 ? activeProducts[2] : prod1;
    const prod4 = activeProducts.length > 3 ? activeProducts[3] : prod2;

    // Run 4: Today DELAYED on Line 2
    sampleRuns.push({
      tenantId,
      siteId,
      productId: prod3.id,
      productCodeSnapshot: prod3.productCode,
      descriptionSnapshot: prod3.description,
      productionLineId: line2.id,
      productionStatus: 'DELAYED',
      plannedStart: dayOffsetDate(0, 8).toISOString(),
      plannedFinish: dayOffsetDate(0, 16).toISOString(),
      actualStart: dayOffsetDate(0, 8).toISOString(),
      actualFinish: null,
      plannedQuantity: 1600,
      actualQuantity: 420,
      unitOfMeasureId: prod3.unitOfMeasureId || defaultUomId,
      delayReason: 'Changeover overrun - awaiting outer carton packaging roll',
      notes: 'Maintenance technician adjusting carton sealer feed.'
    });

    // Run 5: Tomorrow PLANNED on Line 2
    sampleRuns.push({
      tenantId,
      siteId,
      productId: prod4.id,
      productCodeSnapshot: prod4.productCode,
      descriptionSnapshot: prod4.description,
      productionLineId: line2.id,
      productionStatus: 'PLANNED',
      plannedStart: dayOffsetDate(1, 8).toISOString(),
      plannedFinish: dayOffsetDate(1, 16).toISOString(),
      actualStart: null,
      actualFinish: null,
      plannedQuantity: 2200,
      actualQuantity: null,
      unitOfMeasureId: prod4.unitOfMeasureId || defaultUomId,
      delayReason: null,
      notes: 'Scheduled regular replenishment run.'
    });

    // Run 6: 2 Days Out PLANNED on Line 2
    sampleRuns.push({
      tenantId,
      siteId,
      productId: prod3.id,
      productCodeSnapshot: prod3.productCode,
      descriptionSnapshot: prod3.description,
      productionLineId: line2.id,
      productionStatus: 'PLANNED',
      plannedStart: dayOffsetDate(2, 6).toISOString(),
      plannedFinish: dayOffsetDate(2, 14).toISOString(),
      actualStart: null,
      actualFinish: null,
      plannedQuantity: 1900,
      actualQuantity: null,
      unitOfMeasureId: prod3.unitOfMeasureId || defaultUomId,
      delayReason: null,
      notes: 'Promotion stock build.'
    });
  }

  // If Line 3 exists
  if (activeLines.length > 2) {
    const line3 = activeLines[2];
    const prod5 = activeProducts.length > 4 ? activeProducts[4] : prod1;

    // Run 7: Today Afternoon PLANNED on Line 3
    sampleRuns.push({
      tenantId,
      siteId,
      productId: prod5.id,
      productCodeSnapshot: prod5.productCode,
      descriptionSnapshot: prod5.description,
      productionLineId: line3.id,
      productionStatus: 'PLANNED',
      plannedStart: dayOffsetDate(0, 14).toISOString(),
      plannedFinish: dayOffsetDate(0, 22).toISOString(),
      actualStart: null,
      actualFinish: null,
      plannedQuantity: 1500,
      actualQuantity: null,
      unitOfMeasureId: prod5.unitOfMeasureId || defaultUomId,
      delayReason: null,
      notes: 'Afternoon shift production run.'
    });

    // Run 8: Yesterday COMPLETE on Line 3
    sampleRuns.push({
      tenantId,
      siteId,
      productId: prod5.id,
      productCodeSnapshot: prod5.productCode,
      descriptionSnapshot: prod5.description,
      productionLineId: line3.id,
      productionStatus: 'COMPLETE',
      plannedStart: dayOffsetDate(-1, 14).toISOString(),
      plannedFinish: dayOffsetDate(-1, 22).toISOString(),
      actualStart: dayOffsetDate(-1, 14).toISOString(),
      actualFinish: dayOffsetDate(-1, 21).toISOString(),
      plannedQuantity: 1800,
      actualQuantity: 1800,
      unitOfMeasureId: prod5.unitOfMeasureId || defaultUomId,
      delayReason: null,
      notes: 'Run achieved 100% adherence to plan.'
    });
  }

  // Insert all sample runs
  for (const runData of sampleRuns) {
    const res = await createProductionEvent({
      ...runData,
      createdBy: 'DEMO',
      modifiedBy: 'DEMO'
    });
    if (res.success) {
      result.createdCount++;
    } else {
      result.errors.push(typeof res.error === 'string' ? res.error : (res.error as any)?.message || 'Failed to create run');
    }
  }

  return result;
};

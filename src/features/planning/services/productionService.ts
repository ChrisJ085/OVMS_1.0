import {
  createDocument,
  updateDocument,
  subscribeToCollection
} from '../../../services/firestoreBase';
import { db } from '../../../config/firebase';
import { collection, query, where, getDocs, Timestamp, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { ProductionEvent, ProductProductionContext, ProductionRiskStatus, ProductionPlanEntry, ProductionLinePlanNote } from '../../../types/production';
import { ServiceResult } from '../../../types/common';

const COLLECTION_NAME = 'productionEvents';

export const validateEvent = (data: Partial<ProductionEvent>): string | null => {
  if (!data.productId) return 'Product is required';
  if (!data.productionLineId) return 'Production line is required';
  
  if (data.plannedStart && data.plannedFinish) {
    const start = (data.plannedStart as any).toDate ? (data.plannedStart as any).toDate() : new Date(data.plannedStart as any);
    const finish = (data.plannedFinish as any).toDate ? (data.plannedFinish as any).toDate() : new Date(data.plannedFinish as any);
    if (finish <= start) {
      return 'Planned finish must be after planned start';
    }
  } else {
    return 'Planned start and finish are required';
  }

  if (data.plannedQuantity !== null && data.plannedQuantity !== undefined && data.plannedQuantity < 0) return 'Planned quantity cannot be negative';
  if (data.actualQuantity !== null && data.actualQuantity !== undefined && data.actualQuantity < 0) return 'Actual quantity cannot be negative';

  if (data.productionStatus === 'RUNNING' && !data.actualStart) {
    return 'RUNNING status requires an actual start time';
  }

  if (data.productionStatus === 'COMPLETE' && !data.actualFinish) {
    return 'COMPLETE status requires an actual finish time';
  }

  if ((data.productionStatus === 'DELAYED' || data.productionStatus === 'STOPPED') && !data.delayReason) {
    return `${data.productionStatus} status requires a delay reason`;
  }

  return null;
};

export const checkRunningOverlap = async (
  tenantId: string,
  siteId: string,
  productionLineId: string,
  productId: string,
  excludeEventId?: string
): Promise<boolean> => {
  const eventsRef = collection(db, COLLECTION_NAME);
  const q = query(
    eventsRef,
    where('tenantId', '==', tenantId),
    where('siteId', '==', siteId),
    where('productionLineId', '==', productionLineId),
    where('productId', '==', productId),
    where('productionStatus', '==', 'RUNNING')
  );

  const snapshot = await getDocs(q);
  
  for (const doc of snapshot.docs) {
    if (excludeEventId && doc.id === excludeEventId) continue;
    return true; // Another RUNNING event found
  }

  return false;
};

export const createProductionEvent = async (
  data: Omit<ProductionEvent, 'id' | 'status' | 'createdDate' | 'modifiedDate'>
): Promise<ServiceResult<string>> => {
  const error = validateEvent(data);
  if (error) return { success: false, error };

  try {
    if (data.productionStatus === 'RUNNING') {
      const isOverlapping = await checkRunningOverlap(data.tenantId, data.siteId || '', data.productionLineId, data.productId);
      if (isOverlapping) {
        return { success: false, error: 'Cannot start event: another RUNNING event exists for this product on this line.' };
      }
    }

    const id = await createDocument<any>(COLLECTION_NAME, {
      ...data,
      status: 'active'
    });
    return { success: true, data: id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
};

export const updateProductionEvent = async (
  id: string,
  data: Partial<ProductionEvent>,
  tenantId: string,
  siteId: string
): Promise<ServiceResult<void>> => {
  const error = validateEvent(data);
  if (error) return { success: false, error };

  try {
    if (data.productionStatus === 'RUNNING' && data.productionLineId && data.productId) {
      const isOverlapping = await checkRunningOverlap(tenantId, siteId, data.productionLineId, data.productId, id);
      if (isOverlapping) {
        return { success: false, error: 'Cannot start event: another RUNNING event exists for this product on this line.' };
      }
    }

    await updateDocument(COLLECTION_NAME, id, data);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
};

export const subscribeToProductionEvents = (
  tenantId: string,
  siteId: string,
  onUpdate: (events: ProductionEvent[]) => void,
  onError: (error: Error) => void
) => {
  return subscribeToCollection<ProductionEvent>(
    COLLECTION_NAME,
    [
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId)
    ],
    (items) => {
      onUpdate(items);
    },
    onError
  );
};

export const obtainCurrentProductionContext = async (
  tenantId: string,
  siteId: string,
  productId: string,
  evaluationDate?: Date
): Promise<ProductProductionContext> => {
  if (!db) {
    return {
      productId,
      isScheduled: false,
      isCurrentlyInProduction: false,
      currentProductionLine: null,
      currentProductionDate: null,
      plannedCasesToday: 0,
      plannedPalletsToday: 0,
      plannedCasesNext7Days: 0,
      plannedPalletsNext7Days: 0,
      nextProductionDate: null,
      daysUntilNextProduction: null,
      lastProductionDate: null,
      plannerProductionStatus: null,
      activeProductionNotes: [],
      hasDelay: false,
      hasShutdown: false,
      hasMaintenance: false,
      hasTrial: false,
      sourceImportId: null,
      sourceUpdatedAt: null,
      dataFreshnessStatus: 'MISSING',
      productionRiskStatus: 'SOURCE_MISSING'
    };
  }

  const evalDate = evaluationDate || new Date();
  const evalStartOfDay = new Date(Date.UTC(evalDate.getUTCFullYear(), evalDate.getUTCMonth(), evalDate.getUTCDate(), 0, 0, 0, 0));
  const evalTimeMs = evalStartOfDay.getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;

  // 1. Fetch production entries for this product
  const entriesRef = collection(db, 'productionPlanEntries');
  const qEntries = query(
    entriesRef,
    where('tenantId', '==', tenantId),
    where('siteId', '==', siteId),
    where('productId', '==', productId)
  );

  const snapEntries = await getDocs(qEntries);
  const entries = snapEntries.docs.map(doc => ({ id: doc.id, ...doc.data() } as any as ProductionPlanEntry));

  // Partition entries
  const todayEntries = entries.filter(e => {
    const d = e.productionDate.toDate();
    const dStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
    return dStart.getTime() === evalTimeMs;
  });

  const futureEntries = entries.filter(e => {
    const d = e.productionDate.toDate();
    const dStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
    return dStart.getTime() > evalTimeMs;
  }).sort((a, b) => a.productionDate.toMillis() - b.productionDate.toMillis());

  const pastEntries = entries.filter(e => {
    const d = e.productionDate.toDate();
    const dStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
    return dStart.getTime() < evalTimeMs || e.status === 'COMPLETE';
  }).sort((a, b) => b.productionDate.toMillis() - a.productionDate.toMillis());

  const isScheduled = entries.some(e => e.status === 'PLANNED' && e.productionDate.toDate().getTime() >= evalTimeMs);
  const isCurrentlyInProduction = todayEntries.some(e => e.status === 'RUNNING') || entries.some(e => e.status === 'RUNNING');

  const activeEntry = todayEntries.find(e => e.status === 'RUNNING' || e.status === 'DELAYED' || e.status === 'STOPPED') || 
                      todayEntries.find(e => e.status === 'PLANNED') || 
                      entries.find(e => e.status === 'RUNNING') ||
                      null;

  const currentProductionLine = activeEntry ? activeEntry.productionLineCodeSnapshot : null;
  const currentProductionDate = activeEntry ? activeEntry.productionDate.toDate() : null;

  const plannedCasesToday = todayEntries.reduce((sum, e) => sum + (e.plannedCases || 0), 0);
  const plannedPalletsToday = todayEntries.reduce((sum, e) => sum + (e.plannedPallets || 0), 0);

  const sevenDaysLaterMs = evalTimeMs + 7 * oneDayMs;
  const next7DaysEntries = entries.filter(e => {
    const t = e.productionDate.toMillis();
    return t > evalTimeMs && t <= sevenDaysLaterMs;
  });

  const plannedCasesNext7Days = next7DaysEntries.reduce((sum, e) => sum + (e.plannedCases || 0), 0);
  const plannedPalletsNext7Days = next7DaysEntries.reduce((sum, e) => sum + (e.plannedPallets || 0), 0);

  const nextEntry = futureEntries.find(e => e.status === 'PLANNED' || e.status === 'RUNNING');
  const nextProductionDate = nextEntry ? nextEntry.productionDate.toDate() : null;

  let daysUntilNextProduction = null;
  if (nextProductionDate) {
    const diffMs = nextProductionDate.getTime() - evalTimeMs;
    daysUntilNextProduction = Math.ceil(diffMs / oneDayMs);
  }

  const lastEntry = pastEntries[0];
  const lastProductionDate = lastEntry ? lastEntry.productionDate.toDate() : null;

  const plannerProductionStatus = (activeEntry ? activeEntry.status : (nextEntry ? nextEntry.status : null)) as string | null;

  // Get active line notes
  const lineIds = Array.from(new Set(
    [...todayEntries, ...futureEntries]
      .map(e => e.productionLineId)
      .filter(Boolean)
  ));

  let activeProductionNotes: ProductionLinePlanNote[] = [];
  if (lineIds.length > 0) {
    const notesRef = collection(db, 'productionLinePlanNotes');
    const qNotes = query(
      notesRef,
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId),
      where('active', '==', true)
    );
    const snapNotes = await getDocs(qNotes);
    activeProductionNotes = snapNotes.docs
      .map(d => ({ id: d.id, ...d.data() } as any as ProductionLinePlanNote))
      .filter(note => lineIds.includes(note.productionLineId));
  }

  const hasDelay = plannerProductionStatus === 'DELAYED' || 
                   activeProductionNotes.some(n => n.noteType === 'DELAY' || n.severity === 'CRITICAL');
  const hasShutdown = activeProductionNotes.some(n => n.noteType === 'SHUTDOWN');
  const hasMaintenance = activeProductionNotes.some(n => n.noteType === 'MAINTENANCE');
  const hasTrial = activeProductionNotes.some(n => n.noteType === 'TRIAL');

  const sourceImportId = activeEntry?.activeImportId || nextEntry?.activeImportId || (entries.length > 0 ? entries[0].activeImportId : null);
  const sourceUpdatedAt = activeEntry?.sourceUpdatedAt?.toDate() || 
                          nextEntry?.sourceUpdatedAt?.toDate() || 
                          (entries.length > 0 ? entries[0].sourceUpdatedAt?.toDate() : null);

  let importUploadedAt: Date | null = null;
  if (sourceImportId) {
    try {
      const importDocRef = doc(db, 'productionPlanImports', sourceImportId);
      const importSnap = await getDoc(importDocRef);
      if (importSnap.exists()) {
        importUploadedAt = (importSnap.data() as any).uploadedAt?.toDate() || null;
      }
    } catch (err) {
      console.warn('Failed to fetch import upload time:', err);
    }
  }
  const finalSourceUpdatedAt = importUploadedAt || sourceUpdatedAt;

  let dataFreshnessStatus: 'FRESH' | 'STALE' | 'MISSING' = 'MISSING';
  if (entries.length > 0) {
    if (finalSourceUpdatedAt) {
      const ageMs = evalDate.getTime() - finalSourceUpdatedAt.getTime();
      if (ageMs > 24 * 60 * 60 * 1000) {
        dataFreshnessStatus = 'STALE';
      } else {
        dataFreshnessStatus = 'FRESH';
      }
    } else {
      dataFreshnessStatus = 'FRESH';
    }
  }

  let productionRiskStatus: ProductionRiskStatus = 'NORMAL';
  if (dataFreshnessStatus === 'MISSING') {
    productionRiskStatus = 'SOURCE_MISSING';
  } else if (dataFreshnessStatus === 'STALE') {
    productionRiskStatus = 'SOURCE_STALE';
  } else if (plannerProductionStatus === 'STOPPED') {
    productionRiskStatus = 'STOPPED';
  } else if (hasDelay || plannerProductionStatus === 'DELAYED') {
    productionRiskStatus = 'DELAYED';
  } else if (hasShutdown || hasMaintenance) {
    productionRiskStatus = 'MAINTENANCE_RISK';
  } else if (!isScheduled) {
    productionRiskStatus = 'NO_FUTURE_RUN';
  } else if (daysUntilNextProduction !== null && daysUntilNextProduction <= 2) {
    productionRiskStatus = 'NEXT_RUN_SOON';
  }

  // Map legacy properties for compatibility
  const currentEventFake: ProductionEvent | null = activeEntry ? {
    id: activeEntry.productId + '_' + activeEntry.productionLineId + '_legacy',
    productId: activeEntry.productId,
    productCodeSnapshot: activeEntry.productCodeSnapshot,
    descriptionSnapshot: activeEntry.descriptionSnapshot,
    productionLineId: activeEntry.productionLineId,
    productionStatus: activeEntry.status as any,
    plannedStart: activeEntry.productionDate,
    plannedFinish: activeEntry.productionDate, // Approximation
    actualStart: activeEntry.productionDate,
    actualFinish: null,
    plannedQuantity: activeEntry.plannedCases,
    actualQuantity: null,
    unitOfMeasureId: 'cases',
    delayReason: hasDelay ? 'Delayed run or note' : null,
    notes: activeProductionNotes.map(n => n.note).join(' | '),
    tenantId,
    siteId,
    status: 'active',
    createdDate: activeEntry.createdDate,
    modifiedDate: activeEntry.modifiedDate,
    createdBy: 'SYSTEM',
    modifiedBy: 'SYSTEM'
  } : null;

  const nextEventFake: ProductionEvent | null = nextEntry ? {
    id: nextEntry.productId + '_' + nextEntry.productionLineId + '_legacy_next',
    productId: nextEntry.productId,
    productCodeSnapshot: nextEntry.productCodeSnapshot,
    descriptionSnapshot: nextEntry.descriptionSnapshot,
    productionLineId: nextEntry.productionLineId,
    productionStatus: nextEntry.status as any,
    plannedStart: nextEntry.productionDate,
    plannedFinish: nextEntry.productionDate,
    actualStart: null,
    actualFinish: null,
    plannedQuantity: nextEntry.plannedCases,
    actualQuantity: null,
    unitOfMeasureId: 'cases',
    delayReason: null,
    notes: '',
    tenantId,
    siteId,
    status: 'active',
    createdDate: nextEntry.createdDate,
    modifiedDate: nextEntry.modifiedDate,
    createdBy: 'SYSTEM',
    modifiedBy: 'SYSTEM'
  } : null;

  return {
    productId,
    isScheduled,
    isCurrentlyInProduction,
    currentProductionLine,
    currentProductionDate,
    plannedCasesToday,
    plannedPalletsToday,
    plannedCasesNext7Days,
    plannedPalletsNext7Days,
    nextProductionDate,
    daysUntilNextProduction,
    lastProductionDate,
    plannerProductionStatus,
    activeProductionNotes,
    hasDelay,
    hasShutdown,
    hasMaintenance,
    hasTrial,
    sourceImportId,
    sourceUpdatedAt: finalSourceUpdatedAt,
    dataFreshnessStatus,
    productionRiskStatus,

    // Legacy fields
    currentProductionEvent: currentEventFake,
    currentLine: currentProductionLine,
    currentExpectedFinish: currentProductionDate,
    nextProductionEvent: nextEventFake,
    nextProductionStart: nextProductionDate,
    hoursUntilNextProduction: daysUntilNextProduction !== null ? daysUntilNextProduction * 24 : null
  };
};

export const getProductProductionContext = async (
  tenantId: string,
  siteId: string,
  productId: string
): Promise<ProductProductionContext> => {
  return obtainCurrentProductionContext(tenantId, siteId, productId);
};

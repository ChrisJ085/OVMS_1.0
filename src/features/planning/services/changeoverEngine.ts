import { ProductionLine } from '../../../types/configuration';
import { Product } from '../../../types/product';
import { ProductCategory } from '../../../types/configuration';
import { ProductionPlanEntry } from '../../../types/production';

export const PRODUCTION_EVENT_COLOURS = {
  FORMAT_CHANGE: '#06B6D4', // Cyan / Blue
  GRADE_CHANGE: '#A855F7',  // Purple / Magenta
  CLEAN: '#F97316',         // Orange
  MAINT_SHUT: '#22C55E',    // Green
  RSR_TRIAL: '#EAB308',     // Yellow / Gold
} as const;

export type ChangeoverEventType =
  | 'FORMAT_CHANGE'
  | 'GRADE_CHANGE'
  | 'CLEAN'
  | 'MAINT_SHUT'
  | 'RSR_TRIAL';

export interface TransitionDetail {
  eventType: 'FORMAT_CHANGE' | 'GRADE_CHANGE';
  fromProductId?: string;
  fromProductCode: string;
  fromProductDescription?: string;
  fromCategoryId?: string;
  fromCategoryName?: string;
  toProductId?: string;
  toProductCode: string;
  toProductDescription?: string;
  toCategoryId?: string;
  toCategoryName?: string;
  productionLineId: string;
  eventDate: string; // YYYY-MM-DD
}

export interface FormatChangeDetail {
  fromProductId?: string;
  fromProductCode: string;
  toProductId?: string;
  toProductCode: string;
}

export interface GradeChangeDetail {
  fromProductId?: string;
  fromProductCode: string;
  fromCategoryId?: string;
  fromCategoryName?: string;
  toProductId?: string;
  toProductCode: string;
  toCategoryId?: string;
  toCategoryName?: string;
}

export interface MaintenanceEventDetail {
  id?: string;
  productionLineId: string;
  startDate: string | Date;
  endDate: string | Date;
  reason?: string;
  notes?: string;
  status?: string;
}

export interface RsrTrialEventDetail {
  id?: string;
  productionLineId: string;
  startDate: string | Date;
  endDate: string | Date;
  description?: string;
  notes?: string;
  status?: string;
}

export interface ProductionDayEventSummary {
  tenantId?: string;
  siteId?: string;
  productionLineId: string;
  productionLineCode: string;
  productionLineName: string;
  productionDateKey: string; // YYYY-MM-DD
  date: Date;
  events: ChangeoverEventType[];
  transitions: TransitionDetail[];
  formatChanges: FormatChangeDetail[];
  gradeChanges: GradeChangeDetail[];
  scheduledClean: boolean;
  maintenanceEvents: MaintenanceEventDetail[];
  trialEvents: RsrTrialEventDetail[];
  warnings: string[];
  missingCategoryWarning?: boolean;
  summaryNoteText: string;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Returns a CSS background string (color or linear-gradient) based on active events.
 */
export function getEventHeaderBackground(events: ChangeoverEventType[]): string | undefined {
  if (!events || events.length === 0) return undefined;

  const colorMap: Record<ChangeoverEventType, string> = {
    FORMAT_CHANGE: PRODUCTION_EVENT_COLOURS.FORMAT_CHANGE,
    GRADE_CHANGE: PRODUCTION_EVENT_COLOURS.GRADE_CHANGE,
    CLEAN: PRODUCTION_EVENT_COLOURS.CLEAN,
    MAINT_SHUT: PRODUCTION_EVENT_COLOURS.MAINT_SHUT,
    RSR_TRIAL: PRODUCTION_EVENT_COLOURS.RSR_TRIAL,
  };

  const canonicalOrder: ChangeoverEventType[] = [
    'FORMAT_CHANGE',
    'GRADE_CHANGE',
    'CLEAN',
    'MAINT_SHUT',
    'RSR_TRIAL',
  ];

  const sortedEvents = canonicalOrder.filter(e => events.includes(e));

  if (sortedEvents.length === 0) return undefined;
  if (sortedEvents.length === 1) return colorMap[sortedEvents[0]];

  const pctStep = 100 / sortedEvents.length;
  const stops: string[] = [];

  sortedEvents.forEach((evt, idx) => {
    const color = colorMap[evt];
    const startPct = (idx * pctStep).toFixed(2);
    const endPct = ((idx + 1) * pctStep).toFixed(2);
    stops.push(`${color} ${startPct}%`, `${color} ${endPct}%`);
  });

  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

/**
 * Formats a Date object to YYYY-MM-DD in UTC.
 */
export function formatDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseEntryDate(entry: ProductionPlanEntry): Date {
  if (!entry || !entry.productionDate) return new Date();
  if (typeof (entry.productionDate as any).toDate === 'function') {
    return (entry.productionDate as any).toDate();
  }
  return new Date(entry.productionDate as any);
}

/**
 * Calculates automatic changeover events and scheduled cleans for a specific Production Line and Date.
 */
export function calculateDayEventSummary(
  productionLine: ProductionLine,
  targetDate: Date,
  lineEntries: ProductionPlanEntry[],
  products: Product[],
  categories: ProductCategory[],
  lineEvents?: { maintenanceEvents?: MaintenanceEventDetail[]; trialEvents?: RsrTrialEventDetail[] }
): ProductionDayEventSummary {
  const targetDateKey = formatDateKey(targetDate);

  // Sort ALL entries for this line chronologically
  const sortedEntries = [...lineEntries].sort((a, b) => {
    const dateA = parseEntryDate(a);
    const dateB = parseEntryDate(b);
    const timeA = dateA.getTime();
    const timeB = dateB.getTime();
    if (timeA !== timeB) return timeA - timeB;

    if (a.sourceRowNumber !== undefined && b.sourceRowNumber !== undefined) {
      return a.sourceRowNumber - b.sourceRowNumber;
    }
    const createdA = a.createdDate?.toDate ? a.createdDate.toDate().getTime() : 0;
    const createdB = b.createdDate?.toDate ? b.createdDate.toDate().getTime() : 0;
    return createdA - createdB;
  });

  const eventsSet = new Set<ChangeoverEventType>();
  const transitions: TransitionDetail[] = [];
  const formatChanges: FormatChangeDetail[] = [];
  const gradeChanges: GradeChangeDetail[] = [];
  const warnings: string[] = [];
  let missingCategoryWarning = false;

  // Walk through chronological pairs for this line
  for (let i = 1; i < sortedEntries.length; i++) {
    const prevEntry = sortedEntries[i - 1];
    const currEntry = sortedEntries[i];

    const prevDate = parseEntryDate(prevEntry);
    const currDate = parseEntryDate(currEntry);

    const prevDateKey = formatDateKey(prevDate);
    const currDateKey = formatDateKey(currDate);

    const prevCode = prevEntry.productCodeSnapshot;
    const currCode = currEntry.productCodeSnapshot;
    const prevProdId = prevEntry.productId;
    const currProdId = currEntry.productId;

    // Consecutive SAME product -> NO change event
    if ((prevProdId && currProdId && prevProdId === currProdId) || (prevCode && currCode && prevCode === currCode)) {
      continue;
    }

    // Products differ -> locate Product records
    const productPrev = products.find(
      p => (prevProdId && p.id === prevProdId) || (prevCode && p.productCode === prevCode)
    );
    const productCurr = products.find(
      p => (currProdId && p.id === currProdId) || (currCode && p.productCode === currCode)
    );

    const catPrevId = productPrev?.categoryId;
    const catCurrId = productCurr?.categoryId;

    // Determine which dates fall in the transition window
    // Window includes intervening non-production days and the currDateKey
    const transitionDateKeys: string[] = [];

    if (prevDateKey === currDateKey) {
      transitionDateKeys.push(currDateKey);
    } else {
      // Find intervening non-production days
      let temp = new Date(Date.UTC(prevDate.getUTCFullYear(), prevDate.getUTCMonth(), prevDate.getUTCDate() + 1));
      while (formatDateKey(temp) < currDateKey) {
        const k = formatDateKey(temp);
        // Check if there are entries scheduled on this intervening day
        const hasEntriesOnIntervening = sortedEntries.some(e => formatDateKey(parseEntryDate(e)) === k);
        if (!hasEntriesOnIntervening) {
          transitionDateKeys.push(k);
        }
        temp = new Date(Date.UTC(temp.getUTCFullYear(), temp.getUTCMonth(), temp.getUTCDate() + 1));
      }
      transitionDateKeys.push(currDateKey);
    }

    // Check if targetDateKey falls within transition window
    if (!transitionDateKeys.includes(targetDateKey)) {
      continue;
    }

    // Handle missing category
    if (!catPrevId || !catCurrId) {
      missingCategoryWarning = true;
      const missingCode = !catPrevId ? prevCode : currCode;
      const warnMsg = `Unable to determine changeover type. Product ${missingCode} is missing Production Category.`;
      if (!warnings.includes(warnMsg)) {
        warnings.push(warnMsg);
      }
      continue;
    }

    // Compare categories
    const catPrevObj = categories.find(c => c.id === catPrevId || c.code === catPrevId);
    const catCurrObj = categories.find(c => c.id === catCurrId || c.code === catCurrId);

    const catPrevKey = catPrevObj?.id || catPrevObj?.code || catPrevId;
    const catCurrKey = catCurrObj?.id || catCurrObj?.code || catCurrId;

    if (catPrevKey === catCurrKey) {
      // FORMAT_CHANGE
      eventsSet.add('FORMAT_CHANGE');
      transitions.push({
        eventType: 'FORMAT_CHANGE',
        fromProductId: productPrev?.id,
        fromProductCode: prevCode,
        fromProductDescription: prevEntry.descriptionSnapshot || productPrev?.description,
        fromCategoryId: catPrevKey,
        fromCategoryName: catPrevObj?.name || catPrevObj?.code || catPrevKey,
        toProductId: productCurr?.id,
        toProductCode: currCode,
        toProductDescription: currEntry.descriptionSnapshot || productCurr?.description,
        toCategoryId: catCurrKey,
        toCategoryName: catCurrObj?.name || catCurrObj?.code || catCurrKey,
        productionLineId: productionLine.id,
        eventDate: targetDateKey,
      });

      formatChanges.push({
        fromProductId: productPrev?.id,
        fromProductCode: prevCode,
        toProductId: productCurr?.id,
        toProductCode: currCode,
      });
    } else {
      // GRADE_CHANGE
      eventsSet.add('GRADE_CHANGE');
      transitions.push({
        eventType: 'GRADE_CHANGE',
        fromProductId: productPrev?.id,
        fromProductCode: prevCode,
        fromProductDescription: prevEntry.descriptionSnapshot || productPrev?.description,
        fromCategoryId: catPrevKey,
        fromCategoryName: catPrevObj?.name || catPrevObj?.code || catPrevKey,
        toProductId: productCurr?.id,
        toProductCode: currCode,
        toProductDescription: currEntry.descriptionSnapshot || productCurr?.description,
        toCategoryId: catCurrKey,
        toCategoryName: catCurrObj?.name || catCurrObj?.code || catCurrKey,
        productionLineId: productionLine.id,
        eventDate: targetDateKey,
      });

      gradeChanges.push({
        fromProductId: productPrev?.id,
        fromProductCode: prevCode,
        fromCategoryId: catPrevKey,
        fromCategoryName: catPrevObj?.name || catPrevObj?.code || catPrevKey,
        toProductId: productCurr?.id,
        toProductCode: currCode,
        toCategoryId: catCurrKey,
        toCategoryName: catCurrObj?.name || catCurrObj?.code || catCurrKey,
      });
    }
  }

  // Check Scheduled Clean Day
  let scheduledClean = false;
  const dayName = WEEKDAYS[targetDate.getUTCDay()];
  if (
    productionLine.scheduledCleanDay &&
    productionLine.scheduledCleanDay !== 'None' &&
    productionLine.scheduledCleanDay.toUpperCase() === dayName.toUpperCase()
  ) {
    scheduledClean = true;
    eventsSet.add('CLEAN');
  }

  // Check Maintenance Shutdown events
  const maintenanceEvents: MaintenanceEventDetail[] = [];
  if (lineEvents?.maintenanceEvents) {
    for (const maint of lineEvents.maintenanceEvents) {
      if (maint.productionLineId === productionLine.id || maint.productionLineId === productionLine.lineCode) {
        const start = new Date(maint.startDate);
        const end = new Date(maint.endDate);
        if (targetDate >= start && targetDate <= end) {
          eventsSet.add('MAINT_SHUT');
          maintenanceEvents.push(maint);
        }
      }
    }
  }

  // Check RSR Trial events
  const trialEvents: RsrTrialEventDetail[] = [];
  if (lineEvents?.trialEvents) {
    for (const trial of lineEvents.trialEvents) {
      if (trial.productionLineId === productionLine.id || trial.productionLineId === productionLine.lineCode) {
        const start = new Date(trial.startDate);
        const end = new Date(trial.endDate);
        if (targetDate >= start && targetDate <= end) {
          eventsSet.add('RSR_TRIAL');
          trialEvents.push(trial);
        }
      }
    }
  }

  // Canonical event ordering
  const canonicalOrder: ChangeoverEventType[] = [
    'FORMAT_CHANGE',
    'GRADE_CHANGE',
    'CLEAN',
    'MAINT_SHUT',
    'RSR_TRIAL',
  ];
  const events = canonicalOrder.filter(e => eventsSet.has(e));

  // Build summary note text
  const labelMap: Record<ChangeoverEventType, string> = {
    FORMAT_CHANGE: 'Format Change',
    GRADE_CHANGE: 'Grade Change',
    CLEAN: 'Scheduled Clean',
    MAINT_SHUT: 'Maintenance Shutdown',
    RSR_TRIAL: 'RSR Trial',
  };

  const noteParts = events.map(e => labelMap[e]);
  const summaryNoteText = noteParts.length > 0 ? noteParts.join(' • ') : 'Normal Production';

  return {
    tenantId: productionLine.tenantId,
    siteId: productionLine.siteId,
    productionLineId: productionLine.id,
    productionLineCode: productionLine.lineCode,
    productionLineName: productionLine.lineName,
    productionDateKey: targetDateKey,
    date: targetDate,
    events,
    transitions,
    formatChanges,
    gradeChanges,
    scheduledClean,
    maintenanceEvents,
    trialEvents,
    warnings,
    missingCategoryWarning,
    summaryNoteText,
  };
}


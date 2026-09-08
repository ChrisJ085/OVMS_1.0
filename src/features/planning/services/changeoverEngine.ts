import { ProductionLine } from '../../../types/configuration';
import { Product } from '../../../types/product';
import { ProductCategory } from '../../../types/configuration';
import { ProductionPlanEntry, ProductionLinePlanNote } from '../../../types/production';
import { toEpochMillis } from '../../../utils/timeFormatters';

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
  productionLineId: string;
  eventDate: string; // YYYY-MM-DD
  isSameDayEvent: boolean;
  previousProductId?: string;
  previousProductCode?: string;
  previousCategoryId?: string;
  previousCategoryName?: string;
  currentProductIds?: string[];
  currentProductCodes?: string[];
  currentCategoryIds?: string[];
  currentCategoryNames?: string[];
  reason?: string;
}

export interface FormatChangeDetail {
  fromProductId?: string;
  fromProductCode?: string;
  toProductId?: string;
  toProductCode?: string;
}

export interface GradeChangeDetail {
  fromProductId?: string;
  fromProductCode?: string;
  fromCategoryId?: string;
  fromCategoryName?: string;
  toProductId?: string;
  toProductCode?: string;
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

function parseEntryDate(entry: { productionDate: any }): Date {
  if (!entry || !entry.productionDate) return new Date();
  if (typeof entry.productionDate.toDate === 'function') {
    return entry.productionDate.toDate();
  }
  return new Date(entry.productionDate);
}

/**
 * Calculates day-level changeover events, scheduled cleans, maintenance shutdowns and RSR trials.
 */
export function calculateDayEventSummary(
  productionLine: ProductionLine,
  targetDate: Date,
  lineEntries: ProductionPlanEntry[],
  products: Product[],
  categories: ProductCategory[],
  lineEvents?: { maintenanceEvents?: MaintenanceEventDetail[]; trialEvents?: RsrTrialEventDetail[]; gridNotes?: ProductionLinePlanNote[] } | ProductionLinePlanNote[]
): ProductionDayEventSummary {
  const targetDateKey = formatDateKey(targetDate);

  const eventsSet = new Set<ChangeoverEventType>();
  const transitions: TransitionDetail[] = [];
  const formatChanges: FormatChangeDetail[] = [];
  const gradeChanges: GradeChangeDetail[] = [];
  const warnings: string[] = [];
  const missingCategoryWarning = false;

  let notesArray: ProductionLinePlanNote[] = [];
  if (Array.isArray(lineEvents)) {
    notesArray = lineEvents;
  } else if (lineEvents?.gridNotes) {
    notesArray = lineEvents.gridNotes;
  }

  const maintenanceEvents: MaintenanceEventDetail[] = [];
  const trialEvents: RsrTrialEventDetail[] = [];
  let scheduledClean = false;

  if (notesArray.length > 0) {
    const lineNotes = notesArray.filter(n =>
      n.active !== false &&
      (n.productionLineId?.toUpperCase() === productionLine.lineCode?.toUpperCase() ||
       n.productionLineId === productionLine.id)
    );

    for (const note of lineNotes) {
      let matchesDate = false;
      if (note.noteDate) {
        const nMs = toEpochMillis(note.noteDate);
        if (nMs && formatDateKey(new Date(nMs)) === targetDateKey) {
          matchesDate = true;
        }
      }
      if (!matchesDate && note.startAt && note.endAt) {
        const sMs = toEpochMillis(note.startAt);
        const eMs = toEpochMillis(note.endAt);
        if (sMs && eMs) {
          const sKey = formatDateKey(new Date(sMs));
          const eKey = formatDateKey(new Date(eMs));
          if (targetDateKey >= sKey && targetDateKey <= eKey) {
            matchesDate = true;
          }
        }
      }

      if (matchesDate) {
        if (note.noteType === 'FORMAT_CHANGE') {
          eventsSet.add('FORMAT_CHANGE');
          transitions.push({
            eventType: 'FORMAT_CHANGE',
            productionLineId: productionLine.id,
            eventDate: targetDateKey,
            isSameDayEvent: true,
            reason: note.note || note.title || 'Format Change',
          });
          formatChanges.push({
            fromProductCode: undefined,
            toProductCode: undefined,
          });
        } else if (note.noteType === 'GRADE_CHANGE') {
          eventsSet.add('GRADE_CHANGE');
          transitions.push({
            eventType: 'GRADE_CHANGE',
            productionLineId: productionLine.id,
            eventDate: targetDateKey,
            isSameDayEvent: true,
            reason: note.note || note.title || 'Grade Change',
          });
          gradeChanges.push({
            toCategoryName: note.note || note.title || 'Grade Change',
          });
        } else if (note.noteType === 'CLEANING') {
          scheduledClean = true;
          eventsSet.add('CLEAN');
        } else if (note.noteType === 'MAINTENANCE' || note.noteType === 'SHUTDOWN') {
          eventsSet.add('MAINT_SHUT');
          maintenanceEvents.push({
            id: (note as any).id,
            productionLineId: note.productionLineId,
            startDate: note.startAt ? parseEntryDate({ productionDate: note.startAt } as any) : targetDate,
            endDate: note.endAt ? parseEntryDate({ productionDate: note.endAt } as any) : targetDate,
            reason: note.title,
            notes: note.note,
          });
        } else if (note.noteType === 'TRIAL') {
          eventsSet.add('RSR_TRIAL');
          trialEvents.push({
            id: (note as any).id,
            productionLineId: note.productionLineId,
            startDate: note.startAt ? parseEntryDate({ productionDate: note.startAt } as any) : targetDate,
            endDate: note.endAt ? parseEntryDate({ productionDate: note.endAt } as any) : targetDate,
            description: note.title,
            notes: note.note,
          });
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



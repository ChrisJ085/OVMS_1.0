import * as XLSX from 'xlsx';
import { db } from '../../../config/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  doc,
  Timestamp,
  serverTimestamp,
  orderBy,
  limit
} from 'firebase/firestore';
import {
  ProductionPlanImport,
  ProductionPlanRow,
  ProductionPlanEntry,
  ProductionPlanImportStatus,
  ProductionPlanRowStatus,
  DuplicateCheckStatus,
  PlanComparisonStatus,
  ImportReconciliationSummary,
  ImportDiagnostics
} from '../../../types/production';
import { Product } from '../../../types/product';
import { ProductionLine } from '../../../types/configuration';

import { runSiteRecommendationJob } from './recommendationService';

// 1. Calculate File Hash
export const calculateFileHash = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// 2. Helper to Parse SAP Date Header (e.g. "Tue 21.07", "21-07", "21-Jul", or Serial Date)
const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

export const parseSapDate = (dateStr: string, referenceYear: number = new Date().getFullYear()): Date | null => {
  if (!dateStr) return null;
  const cleaned = dateStr.trim();
  const match = cleaned.match(/^([A-Za-z]{3,9}\s+)?(\d{1,2})[-./](\d{1,2})$/);
  if (match) {
    const day = parseInt(match[2], 10);
    const month = parseInt(match[3], 10) - 1; // 0-indexed month
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(referenceYear, month, day, 0, 0, 0, 0));
    }
  }

  // Check DD-Mon or Mon-DD
  const alphaMatch = cleaned.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,9})$/) || cleaned.match(/^([A-Za-z]{3,9})[-/ ](\d{1,2})$/);
  if (alphaMatch) {
    const p1 = alphaMatch[1];
    const p2 = alphaMatch[2];
    const isP1Num = !isNaN(Number(p1));
    const day = isP1Num ? parseInt(p1, 10) : parseInt(p2, 10);
    const monthStr = (isP1Num ? p2 : p1).substring(0, 3).toLowerCase();
    const month = MONTH_MAP[monthStr];
    if (month && day >= 1 && day <= 31) {
      return new Date(Date.UTC(referenceYear, month - 1, day, 0, 0, 0, 0));
    }
  }
  return null;
};

export const resolveHeaderDate = (cellValue: any, referenceYear: number = new Date().getFullYear()): Date | null => {
  if (!cellValue) return null;
  
  const asNumber = Number(cellValue);
  if (!isNaN(asNumber) && asNumber > 30000 && asNumber < 100000) {
    const date = new Date((asNumber - 25569) * 86400 * 1000);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }
  return parseSapDate(String(cellValue), referenceYear);
};

// 3. Supported Base Units of Measure
export const SUPPORTED_BASE_UNITS = ['CS', 'CASE', 'CASES', 'EA', 'EACH', 'KG', 'PAL', 'PALLET', 'BOX'];

export const isSupportedUnit = (unit: string): boolean => {
  if (!unit) return false;
  return SUPPORTED_BASE_UNITS.includes(unit.trim().toUpperCase());
};

// 4. Pallet Calculation (Returns null if casesPerPallet missing, zero, <=0 or invalid)
export const calculatePlannedPallets = (
  plannedCases: number,
  casesPerPallet: number | null | undefined
): number | null => {
  if (casesPerPallet === null || casesPerPallet === undefined || casesPerPallet <= 0 || isNaN(casesPerPallet)) {
    return null;
  }
  return Math.ceil(plannedCases / casesPerPallet);
};

// 5. Inspect MPPS7 Workbook Structure
export interface InspectedSheet {
  sheetName: string;
  headerRowIndex: number;
  headers: string[];
  isValid: boolean;
}

export interface WorkbookInspection {
  isValidMpps7: boolean;
  selectedSheetName: string | null;
  headerRowIndex: number;
  detectedWorksheetNames: string[];
  sampleHeaders: string[];
  inspectedSheets: InspectedSheet[];
  error?: string;
}

export const inspectMpps7Workbook = (workbook: XLSX.WorkBook): WorkbookInspection => {
  try {
    const worksheetNames = workbook.SheetNames || [];
    if (worksheetNames.length === 0) {
      return {
        isValidMpps7: false,
        selectedSheetName: null,
        headerRowIndex: 0,
        detectedWorksheetNames: [],
        sampleHeaders: [],
        inspectedSheets: [],
        error: 'Workbook is empty.'
      };
    }

    const inspectedSheets: InspectedSheet[] = [];
    let selectedSheetName: string | null = null;
    let headerRowIndex = 0;
    let sampleHeaders: string[] = [];

    for (const sheetName of worksheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet || !worksheet['!ref']) {
        inspectedSheets.push({ sheetName, headerRowIndex: 0, headers: [], isValid: false });
        continue;
      }

      const range = XLSX.utils.decode_range(worksheet['!ref']);
      const maxRowsToInspect = Math.min(range.e.r, 30);
      let foundHeaderRow = -1;
      let foundHeaders: string[] = [];

      for (let r = range.s.r; r <= maxRowsToInspect; r++) {
        const rowHeaders: string[] = [];
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellRef = XLSX.utils.encode_cell({ r, c: col });
          const cell = worksheet[cellRef];
          if (cell && cell.v !== undefined) {
            rowHeaders.push(String(cell.v).trim());
          }
        }

        const rowStrLower = rowHeaders.map(h => h.toLowerCase());
        const hasResource = rowStrLower.some(h => 
          h.includes('resource') || h.includes('line') || h.includes('machine') || 
          h.includes('work center') || h.includes('workcenter') || h.includes('asset') || 
          h.includes('plant') || h.includes('wc')
        );
        const hasProduct = rowStrLower.some(h => 
          h.includes('product') || h.includes('material') || h.includes('sku') || 
          h.includes('item') || h.includes('part') || h.includes('article')
        );

        if (hasResource && hasProduct) {
          foundHeaderRow = r;
          foundHeaders = rowHeaders;
          break;
        }
      }

      const isValid = foundHeaderRow !== -1;
      inspectedSheets.push({
        sheetName,
        headerRowIndex: foundHeaderRow !== -1 ? foundHeaderRow : 0,
        headers: foundHeaders,
        isValid
      });

      if (isValid && !selectedSheetName) {
        selectedSheetName = sheetName;
        headerRowIndex = foundHeaderRow;
        sampleHeaders = foundHeaders;
      }
    }

    if (!selectedSheetName && worksheetNames.length > 0) {
      selectedSheetName = worksheetNames[0];
      headerRowIndex = 0;
      const firstSheet = workbook.Sheets[selectedSheetName];
      if (firstSheet && firstSheet['!ref']) {
        const range = XLSX.utils.decode_range(firstSheet['!ref']);
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
          const cell = firstSheet[cellRef];
          if (cell && cell.v !== undefined) {
            sampleHeaders.push(String(cell.v).trim());
          }
        }
      }
    }

    const isValidMpps7 = !!selectedSheetName && inspectedSheets.some(s => s.isValid);

    return {
      isValidMpps7,
      selectedSheetName,
      headerRowIndex,
      detectedWorksheetNames: worksheetNames,
      sampleHeaders,
      inspectedSheets,
      error: isValidMpps7 ? undefined : 'No sheet matching MPPS7 structure (Resource, Product Number) was found.'
    };
  } catch (err: any) {
    return {
      isValidMpps7: false,
      selectedSheetName: null,
      headerRowIndex: 0,
      detectedWorksheetNames: [],
      sampleHeaders: [],
      inspectedSheets: [],
      error: err instanceof Error ? err.message : 'Unknown inspection error'
    };
  }
};

// 6. Year Resolution & Controlled Date Sequence
export interface YearResolutionResult {
  resolvedYear: number;
  method: 'EXPLICIT_HEADER_DATE' | 'METADATA_OR_TITLE' | 'FILE_OR_CURRENT_DATE' | 'USER_CONFIRMED';
  plannerConfirmationRequired: boolean;
  isConfirmed: boolean;
}

export const resolveProductionYear = (
  workbook: XLSX.WorkBook,
  worksheet: XLSX.WorkSheet,
  headerRowIndex: number,
  fileName: string,
  confirmedYear?: number | null
): YearResolutionResult => {
  if (confirmedYear && confirmedYear > 2000 && confirmedYear < 2100) {
    return {
      resolvedYear: confirmedYear,
      method: 'USER_CONFIRMED',
      plannerConfirmationRequired: false,
      isConfirmed: true
    };
  }

  // 1. Check if header cells contain explicit 4-digit years (e.g. 2026-05-15, 15/05/2026, or serial date number > 30000)
  if (worksheet && worksheet['!ref']) {
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: headerRowIndex, c });
      const cell = worksheet[cellRef];
      if (cell && cell.v !== undefined) {
        const valStr = String(cell.v).trim();
        const numVal = Number(cell.v);
        if (!isNaN(numVal) && numVal > 30000 && numVal < 100000) {
          const d = new Date((numVal - 25569) * 86400 * 1000);
          return {
            resolvedYear: d.getUTCFullYear(),
            method: 'EXPLICIT_HEADER_DATE',
            plannerConfirmationRequired: false,
            isConfirmed: true
          };
        }
        const match = valStr.match(/\b(20\d{2})[-/. ]\d{1,2}[-/. ]\d{1,2}\b/) || valStr.match(/\b\d{1,2}[-/. ]\d{1,2}[-/. ](20\d{2})\b/);
        if (match) {
          return {
            resolvedYear: parseInt(match[1], 10),
            method: 'EXPLICIT_HEADER_DATE',
            plannerConfirmationRequired: false,
            isConfirmed: true
          };
        }
      }
    }

    // 2. Check title/decorative rows above header row
    for (let r = 0; r < headerRowIndex; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        const cell = worksheet[cellRef];
        if (cell && cell.v !== undefined) {
          const valStr = String(cell.v);
          const match = valStr.match(/\b(20\d{2})\b/);
          if (match) {
            return {
              resolvedYear: parseInt(match[1], 10),
              method: 'METADATA_OR_TITLE',
              plannerConfirmationRequired: true,
              isConfirmed: false
            };
          }
        }
      }
    }
  }

  // 3. Check filename
  const fileNameMatch = fileName.match(/\b(20\d{2})\b/);
  if (fileNameMatch) {
    return {
      resolvedYear: parseInt(fileNameMatch[1], 10),
      method: 'FILE_OR_CURRENT_DATE',
      plannerConfirmationRequired: true,
      isConfirmed: false
    };
  }

  // 4. Fallback to current year
  const currentYear = new Date().getFullYear();
  return {
    resolvedYear: currentYear,
    method: 'FILE_OR_CURRENT_DATE',
    plannerConfirmationRequired: true,
    isConfirmed: false
  };
};

export interface ParsedDateColumn {
  key: string;
  rawHeader: string;
  date: Date;
  day: number;
  month: number;
  year: number;
  isRollover: boolean;
}

export const parseDateColumnsWithRollover = (
  sampleRowKeys: string[],
  initialYear: number
): {
  dateColumns: ParsedDateColumn[];
  hasRollover: boolean;
  rolloverCount: number;
  duplicateKeys: string[];
  sequenceIssues: string[];
} => {
  const dateColumns: ParsedDateColumn[] = [];
  let currentYear = initialYear;
  let prevMonth: number | null = null;
  let hasRollover = false;
  let rolloverCount = 0;
  const seenDateStrings = new Map<string, string>();
  const duplicateKeys: string[] = [];
  const sequenceIssues: string[] = [];

  for (const key of sampleRowKeys) {
    const rawVal = key.trim();
    if (!rawVal) continue;

    const asNum = Number(rawVal);
    let day = 0;
    let month = 0;
    let explicitYear: number | null = null;

    if (!isNaN(asNum) && asNum > 30000 && asNum < 100000) {
      const d = new Date((asNum - 25569) * 86400 * 1000);
      day = d.getUTCDate();
      month = d.getUTCMonth() + 1;
      explicitYear = d.getUTCFullYear();
    } else {
      const fullDateMatch = rawVal.match(/(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})/) || rawVal.match(/(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})/);
      if (fullDateMatch) {
        if (fullDateMatch[1].length === 4) {
          explicitYear = parseInt(fullDateMatch[1], 10);
          month = parseInt(fullDateMatch[2], 10);
          day = parseInt(fullDateMatch[3], 10);
        } else {
          day = parseInt(fullDateMatch[1], 10);
          month = parseInt(fullDateMatch[2], 10);
          explicitYear = parseInt(fullDateMatch[3], 10);
        }
      } else {
        const dmMatch = rawVal.match(/^([A-Za-z]{3}\s+)?(\d{1,2})[./](\d{1,2})$/);
        if (dmMatch) {
          day = parseInt(dmMatch[2], 10);
          month = parseInt(dmMatch[3], 10);
        }
      }
    }

    if (!day || !month || month < 1 || month > 12 || day < 1 || day > 31) {
      continue;
    }

    let isRollover = false;
    let columnYear = explicitYear || currentYear;

    if (!explicitYear) {
      if (prevMonth === 12 && month === 1) {
        currentYear++;
        columnYear = currentYear;
        isRollover = true;
        hasRollover = true;
        rolloverCount++;
      } else if (prevMonth !== null && month < prevMonth && !(prevMonth === 12 && month === 1)) {
        sequenceIssues.push(`Date header "${rawVal}" month (${month}) is prior to previous month (${prevMonth}) without valid Dec-to-Jan rollover.`);
      }
    }

    prevMonth = month;

    const dateObj = new Date(Date.UTC(columnYear, month - 1, day, 0, 0, 0, 0));
    if (isNaN(dateObj.getTime())) {
      sequenceIssues.push(`Invalid calendar date created from header "${rawVal}".`);
      continue;
    }

    const isoDateStr = dateObj.toISOString().split('T')[0];
    if (seenDateStrings.has(isoDateStr)) {
      duplicateKeys.push(rawVal);
      sequenceIssues.push(`Duplicate date column detected for date ${isoDateStr} ("${rawVal}").`);
    } else {
      seenDateStrings.set(isoDateStr, rawVal);
    }

    dateColumns.push({
      key,
      rawHeader: rawVal,
      date: dateObj,
      day,
      month,
      year: columnYear,
      isRollover
    });
  }

  return {
    dateColumns,
    hasRollover,
    rolloverCount,
    duplicateKeys,
    sequenceIssues
  };
};

// 7. Products & Production Lines Mapping
export const matchImportedProducts = async (tenantId: string): Promise<Record<string, Product>> => {
  if (!db) return {};
  try {
    const productsRef = collection(db, 'products');
    const q = query(productsRef, where('tenantId', '==', tenantId), where('status', '==', 'active'));
    const snap = await getDocs(q);
    const productsMap: Record<string, Product> = {};
    snap.forEach(docSnap => {
      const product = { id: docSnap.id, ...docSnap.data() } as Product;
      const rawCode = (product as any).code || product.productCode || '';
      if (rawCode) {
        productsMap[rawCode.trim()] = product;
        const paddedCode = rawCode.trim().padStart(8, '0');
        productsMap[paddedCode] = product;
      }
    });
    return productsMap;
  } catch (e) {
    console.error('Failed to match products:', e);
    return {};
  }
};

export const matchProductionLines = async (tenantId: string, siteId: string): Promise<ProductionLine[]> => {
  if (!db) return [];
  try {
    const linesRef = collection(db, 'productionLines');
    const q = query(
      linesRef,
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId),
      where('status', '==', 'active')
    );
    const snap = await getDocs(q);
    return snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as ProductionLine));
  } catch (e) {
    console.error('Failed to match production lines:', e);
    return [];
  }
};

export const matchResourceToLine = (resourceCode: string, lines: ProductionLine[]): ProductionLine | null => {
  if (!resourceCode) return null;
  const cleanResource = resourceCode.toUpperCase().trim();

  let matched = lines.find(l => l.sapResourceCode?.toUpperCase().trim() === cleanResource);
  if (matched) return matched;

  matched = lines.find(l => 
    Array.isArray(l.sapResourceAliases) && 
    l.sapResourceAliases.some((alias: string) => alias.toUpperCase().trim() === cleanResource)
  );
  if (matched) return matched;

  matched = lines.find(l => ((l.lineCode || (l as any).code || l.lineName || '').toUpperCase().trim() === cleanResource));
  if (matched) return matched;

  return null;
};

// 8. Duplicate Check Result
export const verifyDuplicateImport = async (
  tenantId: string,
  siteId: string,
  fileHash: string
): Promise<{ status: DuplicateCheckStatus; message: string; duplicateImportId?: string }> => {
  if (!db) {
    return { status: 'CHECK_FAILED', message: 'Firestore connection unavailable.' };
  }
  try {
    const importsRef = collection(db, 'productionPlanImports');
    const dupQuery = query(
      importsRef,
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId),
      where('fileHash', '==', fileHash),
      where('status', '==', 'COMMITTED'),
      limit(1)
    );
    const dupSnap = await getDocs(dupQuery);
    if (!dupSnap.empty) {
      const dupDoc = dupSnap.docs[0];
      return {
        status: 'DUPLICATE_FOUND',
        message: `Identical file hash committed previously (Import ID: ${dupDoc.id}).`,
        duplicateImportId: dupDoc.id
      };
    }
    return { status: 'PASSED', message: 'No duplicate committed import found.' };
  } catch (e: any) {
    console.error('Duplicate verification check failed:', e);
    return { status: 'CHECK_FAILED', message: `Duplicate verification check failed: ${e?.message || 'Database error'}` };
  }
};

// 9. Active Plan Comparison Status
export const evaluatePlanComparison = async (
  tenantId: string,
  siteId: string,
  newStart: Date,
  newEnd: Date
): Promise<{ status: PlanComparisonStatus; message: string; activeStart?: string; activeEnd?: string }> => {
  if (!db) {
    return { status: 'NEWER_NON_OVERLAPPING', message: 'Firestore unavailable for active plan comparison.' };
  }
  try {
    const importsRef = collection(db, 'productionPlanImports');
    const activeQuery = query(
      importsRef,
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId),
      where('status', '==', 'COMMITTED'),
      limit(20)
    );
    const activeSnap = await getDocs(activeQuery);
    if (activeSnap.empty) {
      return { status: 'NEWER_NON_OVERLAPPING', message: 'No active committed plans exist in system.' };
    }

    const importsList = activeSnap.docs.map(d => d.data() as ProductionPlanImport);
    importsList.sort((a, b) => {
      const tA = a.periodStart ? (typeof a.periodStart === 'string' ? new Date(a.periodStart).getTime() : ((a.periodStart as any).toMillis ? (a.periodStart as any).toMillis() : new Date(a.periodStart as any).getTime())) : 0;
      const tB = b.periodStart ? (typeof b.periodStart === 'string' ? new Date(b.periodStart).getTime() : ((b.periodStart as any).toMillis ? (b.periodStart as any).toMillis() : new Date(b.periodStart as any).getTime())) : 0;
      return tB - tA;
    });
    const activeDoc = importsList[0];
    const activeStart = activeDoc.periodStart?.toDate ? activeDoc.periodStart.toDate() : new Date(activeDoc.periodStart as any || Date.now());
    const activeEnd = activeDoc.periodEnd?.toDate ? activeDoc.periodEnd.toDate() : new Date(activeDoc.periodEnd as any || Date.now());

    const newStartMs = newStart.getTime();
    const newEndMs = newEnd.getTime();
    const activeStartMs = activeStart.getTime();
    const activeEndMs = activeEnd.getTime();

    const safeIsoDate = (d: Date) => (!d || isNaN(d.getTime())) ? '' : d.toISOString().split('T')[0];

    const activeStartStr = safeIsoDate(activeStart);
    const activeEndStr = safeIsoDate(activeEnd);

    if (newStartMs === activeStartMs && newEndMs === activeEndMs) {
      return {
        status: 'REPLACES_SAME_PERIOD',
        message: `Import matches current active plan period (${activeStartStr} to ${activeEndStr}) and will replace it.`,
        activeStart: activeStartStr,
        activeEnd: activeEndStr
      };
    }
    if (newEndMs < activeStartMs) {
      return {
        status: 'OLDER_THAN_ACTIVE',
        message: `Import period ends (${safeIsoDate(newEnd)}) before current active plan start (${activeStartStr}).`,
        activeStart: activeStartStr,
        activeEnd: activeEndStr
      };
    }
    if (newStartMs <= activeEndMs && newEndMs > activeEndMs) {
      return {
        status: 'EXTENDS_ACTIVE',
        message: `Import overlaps and extends active plan period beyond ${activeEndStr}.`,
        activeStart: activeStartStr,
        activeEnd: activeEndStr
      };
    }
    if (newStartMs >= activeStartMs && newEndMs <= activeEndMs) {
      return {
        status: 'OVERLAPS_ACTIVE',
        message: `Import period is fully contained within active plan period (${activeStartStr} to ${activeEndStr}).`,
        activeStart: activeStartStr,
        activeEnd: activeEndStr
      };
    }
    if (newStartMs < activeEndMs && newEndMs >= activeStartMs) {
      return {
        status: 'OVERLAPS_ACTIVE',
        message: `Import period overlaps current active plan period (${activeStartStr} to ${activeEndStr}).`,
        activeStart: activeStartStr,
        activeEnd: activeEndStr
      };
    }
    return {
      status: 'NEWER_NON_OVERLAPPING',
      message: `Import period starts after current active plan end (${activeEndStr}).`,
      activeStart: activeStartStr,
      activeEnd: activeEndStr
    };
  } catch (e: any) {
    console.warn('Plan comparison evaluation failed:', e);
    return { status: 'NEWER_NON_OVERLAPPING', message: 'Could not perform active plan comparison check.' };
  }
};

// 10. Parse & Create Import Preview
export interface ParsedPlanPreview {
  summary: Omit<ProductionPlanImport, 'id' | 'createdDate' | 'modifiedDate'>;
  rows: Omit<ProductionPlanRow, 'createdDate'>[];
  reconciliation: ImportReconciliationSummary;
  diagnostics: ImportDiagnostics;
  missingProducts: { code: string; desc: string }[];
  missingLines: { code: string; name: string }[];
}

export const createImportPreview = async (
  workbook: XLSX.WorkBook,
  fileName: string,
  fileSize: number,
  fileHash: string,
  tenantId: string,
  siteId: string,
  uploadedBy: string,
  confirmedYear?: number | null
): Promise<ParsedPlanPreview> => {
  const inspection = inspectMpps7Workbook(workbook);
  if (!inspection.isValidMpps7 || !inspection.selectedSheetName) {
    throw new Error(inspection.error || 'Workbook does not match mandatory MPPS7 structure.');
  }

  const selectedSheetName = inspection.selectedSheetName;
  const headerRowIndex = inspection.headerRowIndex;
  const worksheet = workbook.Sheets[selectedSheetName];
  if (!worksheet) {
    throw new Error(`Worksheet "${selectedSheetName}" could not be loaded.`);
  }

  // Raw row extraction starting from detected header row
  const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, {
    range: headerRowIndex,
    defval: ''
  });

  if (rawRows.length === 0) {
    throw new Error('The selected production worksheet contains no active data rows.');
  }

  // 1. Resolve Production Year
  const yearResolution = resolveProductionYear(workbook, worksheet, headerRowIndex, fileName, confirmedYear);

  // 2. Identify Date Header Columns & Rollover
  const sampleRow = rawRows[0];
  const keys = Object.keys(sampleRow);
  const { dateColumns, hasRollover, rolloverCount, duplicateKeys, sequenceIssues } = parseDateColumnsWithRollover(
    keys,
    yearResolution.resolvedYear
  );

  if (dateColumns.length === 0) {
    throw new Error('Could not identify any valid production date columns in the worksheet headers.');
  }

  // Sort date columns chronologically
  dateColumns.sort((a, b) => a.date.getTime() - b.date.getTime());
  const periodStart = dateColumns[0].date;
  const periodEnd = dateColumns[dateColumns.length - 1].date;

  // Period length check (e.g. > 365 days)
  const periodDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 3600 * 24)) + 1;
  if (periodDays > 365 || periodDays <= 0) {
    sequenceIssues.push(`Production period range (${periodDays} days) is invalid or out of range.`);
  }

  // 3. Duplicate Verification Check
  const duplicateVerification = await verifyDuplicateImport(tenantId, siteId, fileHash);

  // 4. Plan Comparison Check
  const activePlanComparison = await evaluatePlanComparison(tenantId, siteId, periodStart, periodEnd);

  // 5. Load Master Data Maps
  const productsMap = await matchImportedProducts(tenantId);
  const linesList = await matchProductionLines(tenantId, siteId);

  // Find source total column key if present
  let sourceTotalColKey: string | null = null;
  for (const k of keys) {
    const kl = k.trim().toLowerCase();
    if (kl === 'total' || kl === 'grand total' || kl === 'source total') {
      sourceTotalColKey = k;
      break;
    }
  }

  const parsedRows: Omit<ProductionPlanRow, 'createdDate'>[] = [];
  let totalSourceRows = 0;
  let recognisedRows = 0;
  let ignoredRows = 0;
  let warningCount = 0;
  let errorCount = 0;

  const previewImportId = `preview_${Math.random().toString(36).substring(2, 11)}`;
  const seenRowsSet = new Set<string>();

  const missingProductsMap = new Map<string, string>();
  const missingLinesSet = new Set<string>();

  const unsupportedUnitsFoundSet = new Set<string>();

  // Reconciliation aggregations
  let totalSourceCases = 0;
  let totalParsedCases = 0;
  let totalExcludedRowsCount = 0;
  let totalErrorRowsCount = 0;

  const reconciliationByLine: Record<string, { sourceCases: number; parsedCases: number; diff: number }> = {};
  const reconciliationByProduct: Record<string, { sourceCases: number; parsedCases: number; diff: number }> = {};
  const reconciliationByDate: Record<string, { parsedCases: number }> = {};

  // Check if year confirmation is required and missing
  const isYearRequiredAndUnconfirmed = yearResolution.plannerConfirmationRequired && !confirmedYear;

  rawRows.forEach((row, idx) => {
    totalSourceRows++;

    // Find Resource, SKU, Description, UoM in row with fallback column names
    let resourceVal = '';
    let skuVal = '';
    let descVal = '';
    let uomVal = '';

    for (const k of Object.keys(row)) {
      const kl = k.trim().toLowerCase();
      if (!resourceVal && (kl === 'resource' || kl === 'line' || kl === 'machine' || kl.includes('resource') || kl.includes('line') || kl.includes('work center') || kl.includes('workcenter') || kl.includes('asset') || kl.includes('plant'))) {
        resourceVal = String(row[k] || '').trim();
      } else if (!skuVal && (kl === 'product number' || kl === 'material' || kl === 'sku' || kl === 'product code' || kl === 'item' || kl.includes('product') || kl.includes('material') || kl.includes('sku') || kl.includes('item') || kl.includes('part') || kl.includes('article'))) {
        if (!kl.includes('description') && !kl.includes('name') && !kl.includes('short') && !kl.includes('desc')) {
          skuVal = String(row[k] || '').trim();
        } else if (!descVal) {
          descVal = String(row[k] || '').trim();
        }
      } else if (!descVal && (kl.includes('description') || kl.includes('name') || kl.includes('desc'))) {
        descVal = String(row[k] || '').trim();
      } else if (!uomVal && (kl.includes('uom') || kl.includes('unit') || kl.includes('base unit') || kl.includes('measure'))) {
        uomVal = String(row[k] || '').trim();
      }
    }

    const sourceTotalVal = sourceTotalColKey && row[sourceTotalColKey] !== undefined && row[sourceTotalColKey] !== ''
      ? Number(String(row[sourceTotalColKey]).replace(/,/g, ''))
      : null;

    if (sourceTotalVal !== null && !isNaN(sourceTotalVal)) {
      totalSourceCases += sourceTotalVal;
    }

    if (!resourceVal && !skuVal) {
      ignoredRows++;
      totalExcludedRowsCount++;
      return;
    }

    const lineObj = matchResourceToLine(resourceVal, linesList);
    const productObj = productsMap[skuVal];

    if (!lineObj && resourceVal) {
      missingLinesSet.add(resourceVal);
    }
    if (!productObj && skuVal) {
      missingProductsMap.set(skuVal, descVal || `SKU ${skuVal}`);
    }

    let calculatedRowTotal = 0;

    dateColumns.forEach(dateCol => {
      const qtyRaw = row[dateCol.key];
      const qty = typeof qtyRaw === 'number' ? qtyRaw : parseInt(String(qtyRaw || '0').replace(/,/g, ''), 10);

      if (!qty || qty <= 0 || isNaN(qty)) {
        return;
      }

      calculatedRowTotal += qty;
      totalParsedCases += qty;

      // Group totals
      const lineKey = lineObj ? lineObj.lineCode : (resourceVal || 'UNKNOWN');
      if (!reconciliationByLine[lineKey]) {
        reconciliationByLine[lineKey] = { sourceCases: 0, parsedCases: 0, diff: 0 };
      }
      reconciliationByLine[lineKey].parsedCases += qty;

      const productKey = skuVal || 'UNKNOWN';
      if (!reconciliationByProduct[productKey]) {
        reconciliationByProduct[productKey] = { sourceCases: 0, parsedCases: 0, diff: 0 };
      }
      reconciliationByProduct[productKey].parsedCases += qty;

      const dateKeyStr = dateCol.date && !isNaN(dateCol.date.getTime()) ? dateCol.date.toISOString().split('T')[0] : 'UNKNOWN_DATE';
      if (!reconciliationByDate[dateKeyStr]) {
        reconciliationByDate[dateKeyStr] = { parsedCases: 0 };
      }
      reconciliationByDate[dateKeyStr].parsedCases += qty;

      const rowErrors: string[] = [];
      const rowWarnings: string[] = [];
      const validationCodes: string[] = [];
      let rowStatus: ProductionPlanRowStatus = 'VALID';

      // Year confirmation validation
      if (isYearRequiredAndUnconfirmed) {
        rowWarnings.push(`Production year ${yearResolution.resolvedYear} requires planner confirmation.`);
        validationCodes.push('PRODUCTION_YEAR_REQUIRED');
        if (rowStatus === 'VALID') rowStatus = 'WARNING';
      }

      // 1. Line Mapping Validation
      if (!resourceVal) {
        rowErrors.push('Production line resource is missing.');
        validationCodes.push('PRODUCTION_LINE_MISSING');
        rowStatus = 'ERROR';
      } else if (!lineObj) {
        rowErrors.push(`SAP Resource Code "${resourceVal}" is not configured in production lines.`);
        validationCodes.push('PRODUCTION_LINE_NOT_CONFIGURED');
        rowStatus = 'ERROR';
      }

      // 2. Product Mapping Validation
      if (!skuVal) {
        rowErrors.push('Product Material Number is missing.');
        validationCodes.push('PRODUCT_CODE_MISSING');
        rowStatus = 'ERROR';
      } else if (!productObj) {
        rowErrors.push(`Product SKU "${skuVal}" not found in Product Master database.`);
        validationCodes.push('PRODUCT_NOT_FOUND');
        rowStatus = 'ERROR';
      } else if (productObj.status === 'inactive') {
        rowErrors.push(`Product SKU "${skuVal}" exists but is inactive in Product Master.`);
        validationCodes.push('PRODUCT_INACTIVE');
        rowStatus = 'ERROR';
      }

      // 3. Description Difference Warning
      if (productObj && descVal) {
        const ovmsDesc = (productObj.description || '').toLowerCase().trim();
        const sapDesc = descVal.toLowerCase().trim();
        if (ovmsDesc !== sapDesc) {
          rowWarnings.push(`SAP product description "${descVal}" differs from local Product Master: "${productObj.description}".`);
          validationCodes.push('DESCRIPTION_DIFFERENCE');
          if (rowStatus === 'VALID') rowStatus = 'WARNING';
        }
      }

      // 4. Quantity Validations
      if (isNaN(qty)) {
        rowErrors.push(`Planned quantity "${qtyRaw}" is not a valid number.`);
        validationCodes.push('QUANTITY_INVALID');
        rowStatus = 'ERROR';
      } else if (qty < 0) {
        rowErrors.push(`Planned quantity "${qtyRaw}" cannot be negative.`);
        validationCodes.push('QUANTITY_NEGATIVE');
        rowStatus = 'ERROR';
      }

      // 5. Unit of Measure & Cases Per Pallet Validation
      let cleanUom = uomVal ? uomVal.trim().toUpperCase() : 'CS';
      let casesPerPalletVal: number | null = null;
      let calculatedPalletsVal: number | null = null;
      let isUomSelectionRequired = false;

      if (productObj) {
        const configs = (productObj.configurations && productObj.configurations.length > 0)
          ? productObj.configurations
          : [{ unitOfMeasureId: productObj.unitOfMeasureId || uomVal || 'CS', casesPerPallet: productObj.casesPerPallet, unitsPerCase: productObj.unitsPerCase }];

        if (configs.length === 1) {
          // When a product has only one configuration, system must assume that cases per pallet and UoM will be whatever is set within Products table
          casesPerPalletVal = configs[0].casesPerPallet;
          if (configs[0].unitOfMeasureId && (productObj.configurations || productObj.unitOfMeasureId)) {
            cleanUom = configs[0].unitOfMeasureId.trim().toUpperCase();
          }
        } else if (configs.length > 1) {
          // Where a product has more than one Product Configuration, only these should have Data Validation Issues if UoM is not chosen/matched
          const explicitMatch = configs.find(c => c.unitOfMeasureId.trim().toUpperCase() === cleanUom);
          const defaultMatch = productObj.defaultImportUomId
            ? configs.find(c => c.unitOfMeasureId.trim().toUpperCase() === productObj.defaultImportUomId?.trim().toUpperCase())
            : null;

          if (explicitMatch) {
            casesPerPalletVal = explicitMatch.casesPerPallet;
            cleanUom = explicitMatch.unitOfMeasureId.trim().toUpperCase();
          } else if (defaultMatch) {
            casesPerPalletVal = defaultMatch.casesPerPallet;
            cleanUom = defaultMatch.unitOfMeasureId.trim().toUpperCase();
          } else {
            isUomSelectionRequired = true;
          }
        }
      }

      const isConfiguredUnit = Boolean(
        productObj &&
        productObj.configurations &&
        productObj.configurations.length > 0 &&
        productObj.configurations.some(c => c.unitOfMeasureId.trim().toUpperCase() === cleanUom)
      ) || Boolean(
        productObj &&
        productObj.unitOfMeasureId &&
        productObj.unitOfMeasureId.trim().toUpperCase() === cleanUom
      );

      if (!isSupportedUnit(cleanUom) && !isConfiguredUnit) {
        unsupportedUnitsFoundSet.add(uomVal || cleanUom || 'MISSING');
        rowErrors.push(`Unsupported Unit of Measure "${cleanUom}". Configured supported units: ${SUPPORTED_BASE_UNITS.join(', ')}.`);
        validationCodes.push('UNIT_NOT_SUPPORTED');
        rowStatus = 'ERROR';
      }

      if (isUomSelectionRequired) {
        rowErrors.push(`Product SKU "${skuVal}" has multiple Unit of Measure configurations. Please choose the Unit of Measure from those listed within the Product itself.`);
        validationCodes.push('UOM_SELECTION_REQUIRED');
        rowStatus = 'ERROR';
        calculatedPalletsVal = null;
      } else if (!casesPerPalletVal || casesPerPalletVal <= 0) {
        rowErrors.push(`Cases per Pallet (CS/Pallet) conversion rate for UoM "${cleanUom}" is missing or zero for SKU: ${skuVal}. Pallet quantity cannot be calculated.`);
        validationCodes.push('CASES_PER_PALLET_MISSING');
        rowStatus = 'ERROR';
        calculatedPalletsVal = null;
      } else if (isSupportedUnit(cleanUom) || isConfiguredUnit) {
        calculatedPalletsVal = calculatePlannedPallets(qty, casesPerPalletVal);
      } else {
        calculatedPalletsVal = null;
      }

      // 7. Duplicate row check within spreadsheet
      const rowUniqueKey = `${resourceVal}_${skuVal}_${dateCol.key}`;
      if (seenRowsSet.has(rowUniqueKey)) {
        rowWarnings.push(`Duplicate active production code entry found in spreadsheet for Line/SKU/Date: ${rowUniqueKey}.`);
        validationCodes.push('DUPLICATE_SOURCE_ROW');
        if (rowStatus === 'VALID') rowStatus = 'WARNING';
      } else {
        seenRowsSet.add(rowUniqueKey);
      }

      // 8. Date Sequence & Duplicate Date Column checks
      if (duplicateKeys.includes(dateCol.rawHeader)) {
        rowErrors.push(`Date column "${dateCol.rawHeader}" is a duplicate date header.`);
        validationCodes.push('DUPLICATE_DATE_COLUMN');
        rowStatus = 'ERROR';
      }

      if (dateCol.isRollover) {
        validationCodes.push('YEAR_ROLLOVER_DETECTED');
      }

      if (sequenceIssues.length > 0) {
        sequenceIssues.forEach(issue => {
          rowWarnings.push(issue);
        });
      }

      const dateVal = dateCol.date;
      if (!dateVal || isNaN(dateVal.getTime())) {
        rowErrors.push('Production date is invalid.');
        validationCodes.push('PRODUCTION_DATE_INVALID');
        rowStatus = 'ERROR';
      } else if (dateVal < periodStart || dateVal > periodEnd) {
        rowErrors.push('Row production date is outside of the detected planning period.');
        validationCodes.push('DATE_OUTSIDE_DETECTED_PERIOD');
        rowStatus = 'ERROR';
      }

      if (rowStatus === 'WARNING') warningCount++;
      if (rowStatus === 'ERROR') {
        errorCount++;
        totalErrorRowsCount++;
      }
      if (rowStatus === 'VALID' || rowStatus === 'WARNING') recognisedRows++;

      parsedRows.push({
        tenantId,
        siteId,
        importId: previewImportId,
        sourceSheetName: selectedSheetName,
        sourceRowNumber: idx + headerRowIndex + 2,
        productionLineCode: lineObj ? lineObj.lineCode : (resourceVal ? (resourceVal.split('_')[0] || resourceVal) : ''),
        productionLineName: lineObj ? lineObj.lineName : resourceVal,
        productCode: skuVal,
        sourceProductDescription: descVal,
        matchedProductId: productObj ? (productObj.id || null) : null,
        matchedProductDescription: productObj ? productObj.description : null,
        productionDate: Timestamp.fromDate(dateCol.date),
        plannedQuantity: qty,
        sourceUnitOfMeasure: uomVal || cleanUom || 'CS',
        casesPerPallet: casesPerPalletVal,
        calculatedPallets: calculatedPalletsVal,
        rowStatus,
        validationCodes,
        validationMessages: [...rowErrors, ...rowWarnings],
        sourceData: {
          Resource: resourceVal,
          'Product Number': skuVal,
          'Product Short Description': descVal,
          'Base Unit of Measure': uomVal,
          SourceTotal: sourceTotalVal
        },
        sourceTotalQty: sourceTotalVal,
        rowParsedQtySum: calculatedRowTotal,
        sourceTotalDiff: sourceTotalVal !== null ? calculatedRowTotal - sourceTotalVal : null
      });
    });

    // 9. Source Total Reconciliation per Row
    if (sourceTotalVal !== null && !isNaN(sourceTotalVal)) {
      const diff = calculatedRowTotal - sourceTotalVal;
      const lineKey = lineObj ? lineObj.lineCode : (resourceVal || 'UNKNOWN');
      const productKey = skuVal || 'UNKNOWN';

      if (reconciliationByLine[lineKey]) reconciliationByLine[lineKey].sourceCases += sourceTotalVal;
      if (reconciliationByProduct[productKey]) reconciliationByProduct[productKey].sourceCases += sourceTotalVal;

      parsedRows.forEach(parsedRow => {
        if (parsedRow.sourceRowNumber === idx + headerRowIndex + 2) {
          if (diff === 0) {
            parsedRow.validationCodes.push('SOURCE_TOTAL_MATCH');
          } else {
            parsedRow.validationCodes.push('SOURCE_TOTAL_MISMATCH');
            parsedRow.validationMessages.push(`Source Total column (${sourceTotalVal}) differs from sum of parsed dates (${calculatedRowTotal}). Diff: ${diff}.`);
            if (parsedRow.rowStatus === 'VALID') {
              parsedRow.rowStatus = 'WARNING';
              warningCount++;
            }
          }
        }
      });
    } else {
      parsedRows.forEach(parsedRow => {
        if (parsedRow.sourceRowNumber === idx + headerRowIndex + 2) {
          parsedRow.validationCodes.push('SOURCE_TOTAL_MISSING');
        }
      });
    }
  });

  // Calculate reconciliation total diffs
  Object.keys(reconciliationByLine).forEach(lk => {
    reconciliationByLine[lk].diff = reconciliationByLine[lk].parsedCases - reconciliationByLine[lk].sourceCases;
  });
  Object.keys(reconciliationByProduct).forEach(pk => {
    reconciliationByProduct[pk].diff = reconciliationByProduct[pk].parsedCases - reconciliationByProduct[pk].sourceCases;
  });

  const totalDifference = totalSourceCases > 0 ? totalParsedCases - totalSourceCases : 0;
  const hasMaterialMismatch = totalSourceCases > 0 && totalDifference !== 0;

  const reconciliationSummary: ImportReconciliationSummary = {
    totalSourceCases,
    totalParsedCases,
    totalDifference,
    totalExcludedRows: totalExcludedRowsCount,
    totalErrorRows: totalErrorRowsCount,
    hasMaterialMismatch,
    byLine: reconciliationByLine,
    byProduct: reconciliationByProduct,
    byDate: reconciliationByDate
  };

  // Build Diagnostics Summary
  const diagnostics: ImportDiagnostics = {
    yearResolution: {
      resolvedYear: yearResolution.resolvedYear,
      method: yearResolution.method,
      plannerConfirmationRequired: yearResolution.plannerConfirmationRequired,
      isConfirmed: yearResolution.isConfirmed,
      hasYearRollover: hasRollover,
      rolloverDatesCount: rolloverCount
    },
    dateSequence: {
      startDate: periodStart && !isNaN(periodStart.getTime()) ? periodStart.toISOString().split('T')[0] : '',
      endDate: periodEnd && !isNaN(periodEnd.getTime()) ? periodEnd.toISOString().split('T')[0] : '',
      totalDateColumns: dateColumns.length,
      isValidSequence: sequenceIssues.length === 0 && duplicateKeys.length === 0,
      issues: sequenceIssues
    },
    worksheetSelection: {
      selectedSheetName,
      headerRowIndex,
      inspectedSheetsCount: inspection.inspectedSheets.length,
      allDetectedSheets: inspection.detectedWorksheetNames
    },
    duplicateVerification: duplicateVerification,
    activePlanComparison: activePlanComparison,
    unitValidation: {
      supportedUnits: SUPPORTED_BASE_UNITS,
      unsupportedUnitsFound: Array.from(unsupportedUnitsFoundSet),
      hasUnsupportedUnits: unsupportedUnitsFoundSet.size > 0
    },
    reconciliation: {
      status: totalSourceCases === 0 ? 'MISSING' : (hasMaterialMismatch ? 'MISMATCH' : 'MATCH'),
      sourceTotalCases: totalSourceCases,
      parsedTotalCases: totalParsedCases,
      difference: totalDifference
    },
    productMapping: {
      totalSkus: Object.keys(productsMap).length,
      recognizedSkus: Object.keys(productsMap).length - missingProductsMap.size,
      missingSkus: Array.from(missingProductsMap.keys())
    },
    lineMapping: {
      totalLines: linesList.length,
      recognizedLines: linesList.length - missingLinesSet.size,
      missingLines: Array.from(missingLinesSet)
    }
  };

  // Preview import status calculation
  let previewStatus: ProductionPlanImportStatus = errorCount > 0
    ? 'FAILED'
    : (warningCount > 0 || duplicateVerification.status !== 'PASSED' || isYearRequiredAndUnconfirmed
        ? 'REQUIRES_REVIEW'
        : 'READY_TO_COMMIT');

  const notesList: string[] = [];
  if (duplicateVerification.status === 'DUPLICATE_FOUND') {
    notesList.push('Warning: File hash matches a previously committed import (DUPLICATE_FOUND).');
  } else if (duplicateVerification.status === 'CHECK_FAILED') {
    notesList.push('Warning: Duplicate check could not be verified (CHECK_FAILED). User acknowledgment required.');
  }

  if (activePlanComparison.status === 'OLDER_THAN_ACTIVE') {
    notesList.push('Warning: Import period is older than active plan (OLDER_THAN_ACTIVE).');
  } else if (activePlanComparison.status === 'OVERLAPS_ACTIVE') {
    notesList.push('Warning: Import period overlaps active plan (OVERLAPS_ACTIVE).');
  }

  if (hasRollover) {
    notesList.push(`December-to-January year rollover detected across ${rolloverCount} date column(s).`);
  }

  if (hasMaterialMismatch) {
    notesList.push(`Source total mismatch detected (Source: ${totalSourceCases}, Parsed: ${totalParsedCases}, Diff: ${totalDifference}).`);
  }

  const missingProductsList = Array.from(missingProductsMap.entries()).map(([code, desc]) => ({ code, desc }));
  const missingLinesList = Array.from(missingLinesSet).map(code => ({ code, name: `Line ${code}` }));

  return {
    summary: {
      tenantId,
      siteId,
      fileName,
      fileSize,
      fileHash,
      sourceType: 'MPPS7_SAP',
      sourceWorkbookDate: Timestamp.fromDate(new Date()),
      periodStart: Timestamp.fromDate(periodStart),
      periodEnd: Timestamp.fromDate(periodEnd),
      detectedWorksheetNames: inspection.detectedWorksheetNames,
      uploadedBy,
      uploadedAt: Timestamp.fromDate(new Date()),
      status: previewStatus,
      totalSourceRows,
      recognisedRows,
      ignoredRows,
      warningCount,
      errorCount,
      parserVersion: 'v2.0.0',
      supersedesImportId: null,
      duplicateCheckStatus: duplicateVerification.status,
      planComparisonStatus: activePlanComparison.status,
      notes: notesList.join(' ') || (errorCount > 0 ? 'Errors detected during structural validation. Ingestion blocked until resolved.' : '')
    },
    rows: parsedRows,
    reconciliation: reconciliationSummary,
    diagnostics,
    missingProducts: missingProductsList,
    missingLines: missingLinesList
  };
};

// 11. Commit Production Plan Import
export const commitProductionPlanImport = async (
  preview: ParsedPlanPreview,
  notes: string = ''
): Promise<string> => {
  if (!db) throw new Error('Firestore is not initialized.');

  if (preview.summary.errorCount > 0) {
    throw new Error(`Cannot commit production plan import with ${preview.summary.errorCount} blocking error(s). Please resolve all errors before committing.`);
  }

  const importsRef = collection(db, 'productionPlanImports');
  const importId = `imp_${Math.random().toString(36).substring(2, 11)}`;

  const importDoc: ProductionPlanImport = {
    ...preview.summary,
    id: importId,
    status: 'COMMITTED',
    notes: notes || preview.summary.notes,
    createdDate: Timestamp.fromDate(new Date()),
    modifiedDate: Timestamp.fromDate(new Date())
  };

  const batch = writeBatch(db);

  batch.set(doc(importsRef, importId), importDoc);

  preview.rows.forEach(row => {
    const rowRef = doc(collection(db, `productionPlanImports/${importId}/rows`));
    batch.set(rowRef, {
      ...row,
      importId,
      createdDate: serverTimestamp()
    });
  });

  await supersedePreviousProductionPlan(
    preview.summary.tenantId,
    preview.summary.siteId,
    preview.summary.periodStart,
    preview.summary.periodEnd,
    importId,
    batch
  );

  const entriesRef = collection(db, 'productionPlanEntries');
  preview.rows.forEach(row => {
    if (row.rowStatus === 'ERROR' || !row.matchedProductId || !row.productionLineCode) return;

    const entryDoc: Omit<ProductionPlanEntry, 'createdDate' | 'modifiedDate'> = {
      tenantId: row.tenantId,
      siteId: row.siteId,
      activeImportId: importId,
      productId: row.matchedProductId,
      productCodeSnapshot: row.productCode,
      descriptionSnapshot: row.matchedProductDescription || row.sourceProductDescription,
      productionLineId: row.productionLineCode,
      productionLineCodeSnapshot: row.productionLineCode,
      productionDate: row.productionDate,
      plannedCases: row.plannedQuantity,
      casesPerPallet: row.casesPerPallet,
      plannedPallets: row.calculatedPallets,
      sourceType: 'SAP_MPPS7',
      sourceSheetName: row.sourceSheetName,
      sourceRowNumber: row.sourceRowNumber,
      sourceUpdatedAt: Timestamp.fromDate(new Date()),
      planVersion: '2.0',
      status: 'PLANNED'
    };

    const newEntryRef = doc(entriesRef);
    batch.set(newEntryRef, {
      ...entryDoc,
      createdDate: serverTimestamp(),
      modifiedDate: serverTimestamp()
    });
  });

  await batch.commit();

  // Trigger automatic Decision Engine reassessment across the site
  runSiteRecommendationJob(preview.summary.tenantId, preview.summary.siteId, {
    triggerType: 'MPPS_IMPORT',
    triggerReferenceId: importId,
    requestedBy: (preview.summary as any).importedBy || 'Planner'
  }).catch(err => console.error('Background recommendation job error after MPPS commit:', err));

  return importId;
};

// 12. Supersede Previous Production Plan
export const supersedePreviousProductionPlan = async (
  tenantId: string,
  siteId: string,
  periodStart: Timestamp,
  periodEnd: Timestamp,
  newImportId: string,
  batch: any
): Promise<void> => {
  if (!db) return;

  try {
    const entriesRef = collection(db, 'productionPlanEntries');
    const qEntries = query(
      entriesRef,
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId)
    );

    const snapEntries = await getDocs(qEntries);
    snapEntries.forEach(docSnap => {
      const entryData = docSnap.data();
      if (entryData.productionDate) {
        const pMillis = entryData.productionDate.toMillis();
        if (pMillis >= periodStart.toMillis() && pMillis <= periodEnd.toMillis()) {
          if (entryData.activeImportId !== newImportId && entryData.status === 'PLANNED') {
            batch.delete(docSnap.ref);
          }
        }
      }
    });

    const importsRef = collection(db, 'productionPlanImports');
    const qImports = query(
      importsRef,
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId),
      where('status', '==', 'COMMITTED')
    );

    const snapImports = await getDocs(qImports);
    snapImports.forEach(docSnap => {
      const impData = docSnap.data() as ProductionPlanImport;
      if (
        impData.id !== newImportId &&
        impData.periodStart.toMillis() <= periodEnd.toMillis() &&
        impData.periodEnd.toMillis() >= periodStart.toMillis()
      ) {
        batch.update(docSnap.ref, {
          status: 'SUPERSEDED',
          supersedesImportId: newImportId,
          modifiedDate: serverTimestamp()
        });
      }
    });
  } catch (err) {
    console.warn('Error superseding previous plan entries:', err);
  }
};

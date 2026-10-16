import { BaseDocument, Timestamp } from './common';

/**
 * Recognised SNP87 planning types.
 * Rows with other InfoObjects/Row texts are classified as IGNORED.
 */
export type Snp87PlanningType = 'FORECAST' | 'CONFIRMED_PRODUCTION' | 'IGNORED';

/**
 * Robust normalizer for SNP87 planning type across various casing, alias, and source key representations.
 */
export function getNormalizedPlanningType(row: any): Snp87PlanningType {
  if (!row) return 'IGNORED';

  // 1. Check direct planningType / planning_type / rowType / row_type
  const rawType = String(
    row.planningType || 
    row.planning_type || 
    row.rowType || 
    row.row_type || 
    ''
  ).trim().toUpperCase();

  if (
    rawType === 'FORECAST' ||
    rawType === 'FCST' ||
    rawType === '9ADFCST' ||
    rawType.includes('FORECAST')
  ) {
    return 'FORECAST';
  }

  if (
    rawType === 'CONFIRMED_PRODUCTION' ||
    rawType === 'CONFIRMED' ||
    rawType === 'PRODUCTION (CONFIRMED)' ||
    rawType === 'PRODUCTION_CONFIRMED' ||
    rawType === 'CONFIRMED PRODUCTION' ||
    rawType === '9AFPROD' ||
    rawType.includes('CONFIRMED')
  ) {
    return 'CONFIRMED_PRODUCTION';
  }

  // 2. Check rowText / row_text and infoObject / info_object
  const cleanInfo = String(row.infoObject || row.info_object || '').trim().toUpperCase();
  const cleanText = String(row.rowText || row.row_text || '').trim().toUpperCase();

  if (cleanInfo === '9ADFCST' || cleanText === 'FORECAST' || cleanText.includes('FORECAST')) {
    return 'FORECAST';
  }

  if (
    cleanInfo === '9AFPROD' ||
    cleanText === 'PRODUCTION (CONFIRMED)' ||
    cleanText.includes('PRODUCTION (CONFIRMED)') ||
    cleanText.includes('CONFIRMED')
  ) {
    return 'CONFIRMED_PRODUCTION';
  }

  // 3. Check forecastQuantity vs confirmedProductionQuantity
  if (row.forecastQuantity !== null && row.forecastQuantity !== undefined && Number(row.forecastQuantity) > 0) {
    return 'FORECAST';
  }
  if (row.confirmedProductionQuantity !== null && row.confirmedProductionQuantity !== undefined && Number(row.confirmedProductionQuantity) > 0) {
    return 'CONFIRMED_PRODUCTION';
  }

  return 'IGNORED';
}

/**
 * Status of an SNP87 import batch.
 */
export type Snp87ImportStatus = 
  | 'DRAFT'
  | 'VALIDATED'
  | 'REQUIRES_REVIEW'
  | 'READY_TO_COMMIT'
  | 'COMMITTED'
  | 'FAILED'
  | 'SUPERSEDED';

/**
 * Validation status for individual SNP87 rows.
 */
export type Snp87RowValidationStatus = 'VALID' | 'WARNING' | 'ERROR' | 'IGNORED';

/**
 * Raw data row from an SNP87 report/spreadsheet.
 */
export interface Snp87RawRow {
  orderSku?: string | number;
  productNumber?: string | number;
  productDescription?: string;
  location?: string | number;
  sort?: string | number;
  infoObject?: string;
  rowText?: string;
  startDate?: string | number;
  endDate?: string | number;
  quantity?: string | number;
  baseUnitOfMeasure?: string;
  [key: string]: any;
}

/**
 * Parsed and validated SNP87 planning row.
 * Contains both raw audit fields and structured planning fields.
 * NOTE: ProductionLineId / ResourceId is intentionally NOT a required field.
 */
export interface Snp87PlanningRow {
  id: string;
  importId: string;
  tenantId: string;
  siteId: string;
  rowIndex: number;
  
  // Source SNP87 identifiers
  orderSku: string;
  productNumber: string;
  productDescription: string;
  location: string;
  sort: string | number;
  infoObject: string;
  rowText: string;
  
  // Classified planning type
  planningType: Snp87PlanningType;
  
  // Raw date inputs from source
  startDateRaw: string | number;
  endDateRaw: string | number;
  
  // Parsed calendar dates (YYYY-MM-DD)
  planningDate: string;
  startDate: string;
  endDate: string;
  horizonDate?: string;
  
  // Quantities
  quantity: number;
  forecastQuantity: number | null;
  confirmedProductionQuantity: number | null;
  baseUnitOfMeasure: string;
  
  // Product Master Mapping
  productId: string | null;
  productCodeSnapshot: string;
  descriptionSnapshot: string;
  productMatched: boolean;
  
  // Validation & Audit
  validationStatus: Snp87RowValidationStatus;
  validationErrors: string[];
  validationWarnings: string[];
  ignoredReason?: string;
  isDuplicate?: boolean;
  
  // Source row audit snapshot
  rawSourceRow: Record<string, any>;
  
  createdAt: string;
  updatedAt?: string;
}

/**
 * Diagnostics and issue breakdown for an SNP87 import.
 */
export interface Snp87ImportDiagnostics {
  errors: string[];
  warnings: string[];
  unknownProducts: Array<{
    productNumber: string;
    orderSku?: string;
    description?: string;
    rowCount: number;
  }>;
  ignoredInfoObjects: Array<{
    infoObject: string;
    rowText: string;
    count: number;
  }>;
}

/**
 * Header and summary information for an SNP87 Planning Import.
 */
export interface Snp87PlanningImport extends BaseDocument {
  sourceReportName: string;
  sourceReportType: 'SNP87';
  fileHash: string;
  importedBy: string;
  importedAt: string;
  importStatus: Snp87ImportStatus;
  
  // Row Counts
  sourceRowCount: number;
  recognisedRowCount: number;
  ignoredRowCount: number;
  forecastRowCount: number;
  confirmedProductionRowCount: number;
  
  // Quantities
  totalForecastQuantity: number;
  totalConfirmedProductionQuantity: number;
  
  // Validation issue counts
  warningCount: number;
  errorCount: number;
  unknownProductCount: number;
  
  // Planning Period
  importPeriod: {
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
  } | null;
  
  diagnostics: Snp87ImportDiagnostics;
  version: number;
  notes?: string;
}

/**
 * Clean SNP87 Planning Context for recommendation evaluation.
 * Decoupled from MPPS7 production-line/resource scheduling.
 */
export interface ProductPlanningContext {
  productId: string;
  productCode: string;
  productDescription: string;
  
  // Base Unit of Measure (actual UOM from SNP87 report, e.g. 'CS')
  baseUnitOfMeasure: string;

  // FORECAST (Dynamic demand requirement)
  forecastCasesToday: number;
  forecastCasesNext7Days: number;
  forecastByDate: Record<string, number>; // YYYY-MM-DD -> quantity
  forecastSourceImportId: string | null;
  forecastSourceUpdatedAt: Date | null;

  // CONFIRMED PRODUCTION (Future supply)
  confirmedProductionCasesToday: number;
  confirmedProductionCasesNext7Days: number;
  confirmedProductionByDate: Record<string, number>; // YYYY-MM-DD -> quantity
  productionSourceImportId: string | null;
  productionSourceUpdatedAt: Date | null;

  // SOURCE QUALITY & FRESHNESS
  dataFreshnessStatus: 'FRESH' | 'STALE' | 'MISSING';
  sourceStatus: 'CURRENT' | 'STALE' | 'SUPERSEDED' | 'MISSING';
  sourceImportId: string | null;
  sourceReportName: string | null;
  hasMissingPlanningData: boolean;

  // Evaluation window metadata
  evaluationDate: string; // YYYY-MM-DD
  sevenDayWindow: {
    startDate: string; // YYYY-MM-DD (Day 0)
    endDate: string;   // YYYY-MM-DD (Day 6)
  };
}

/**
 * Product-level aggregated Forecast weekly plan to work towards.
 * Computes SumProduct across horizon dates for weekly target visibility.
 */
export interface ProductForecastWeeklyPlan {
  productId: string | null;
  productCode: string;
  orderSku?: string;
  productDescription: string;
  baseUnitOfMeasure: string;
  horizonDate: string; // Weekly planning horizon date to work towards
  totalForecastCases: number; // Sumproduct total forecast cases across weekly horizon
  casesPerPallet: number;
  palletEquivalent: number; // Sumproduct with pallet conversion factor
  rowCount: number;
  distinctDates: string[];
}


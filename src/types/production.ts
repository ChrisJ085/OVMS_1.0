import { BaseDocument } from './common';
import { Timestamp } from 'firebase/firestore';

export type ProductionStatus = 'PLANNED' | 'RUNNING' | 'ENDING' | 'COMPLETE' | 'DELAYED' | 'STOPPED' | 'CANCELLED';

export interface ProductionEvent extends BaseDocument {
  productId: string;
  productCodeSnapshot: string;
  descriptionSnapshot: string;
  productionLineId: string;
  productionStatus: ProductionStatus;
  plannedStart: Timestamp;
  plannedFinish: Timestamp;
  actualStart: Timestamp | null;
  actualFinish: Timestamp | null;
  plannedQuantity: number | null;
  actualQuantity: number | null;
  unitOfMeasureId: string;
  delayReason: string | null;
  notes: string;
}

export type ProductionRiskStatus = 
  | 'NORMAL'
  | 'NEXT_RUN_SOON'
  | 'NO_FUTURE_RUN'
  | 'DELAYED'
  | 'STOPPED'
  | 'MAINTENANCE_RISK'
  | 'SOURCE_STALE'
  | 'SOURCE_MISSING'
  | 'DATA_MISSING';

export interface ProductProductionContext {
  productId: string;
  isScheduled: boolean;
  isCurrentlyInProduction: boolean;
  currentProductionLine: string | null;
  currentProductionDate: Date | null;
  plannedCasesToday: number;
  plannedPalletsToday: number;
  plannedCasesNext7Days: number;
  plannedPalletsNext7Days: number;
  nextProductionDate: Date | null;
  daysUntilNextProduction: number | null;
  lastProductionDate: Date | null;
  plannerProductionStatus: string | null;
  activeProductionNotes: ProductionLinePlanNote[];
  hasDelay: boolean;
  hasShutdown: boolean;
  hasMaintenance: boolean;
  hasTrial: boolean;
  sourceImportId: string | null;
  sourceUpdatedAt: Date | null;
  dataFreshnessStatus: 'FRESH' | 'STALE' | 'MISSING';
  productionRiskStatus: ProductionRiskStatus;

  // Preserve legacy fields for UI compatibility
  currentProductionEvent?: ProductionEvent | null;
  currentLine?: string | null;
  currentExpectedFinish?: Date | null;
  nextProductionEvent?: ProductionEvent | null;
  nextProductionStart?: Date | null;
  hoursUntilNextProduction?: number | null;
}

export type ProductionPlanImportStatus = 
  | 'UPLOADED'
  | 'VALIDATING'
  | 'REQUIRES_REVIEW'
  | 'READY_TO_COMMIT'
  | 'COMMITTED'
  | 'FAILED'
  | 'SUPERSEDED';

export type DuplicateCheckStatus = 'PASSED' | 'DUPLICATE_FOUND' | 'CHECK_FAILED';

export type PlanComparisonStatus =
  | 'OLDER_THAN_ACTIVE'
  | 'OVERLAPS_ACTIVE'
  | 'EXTENDS_ACTIVE'
  | 'REPLACES_SAME_PERIOD'
  | 'NEWER_NON_OVERLAPPING';

export interface ImportReconciliationSummary {
  totalSourceCases: number;
  totalParsedCases: number;
  totalDifference: number;
  totalExcludedRows: number;
  totalErrorRows: number;
  hasMaterialMismatch: boolean;
  byLine: Record<string, { sourceCases: number; parsedCases: number; diff: number }>;
  byProduct: Record<string, { sourceCases: number; parsedCases: number; diff: number }>;
  byDate: Record<string, { parsedCases: number }>;
}

export interface ImportDiagnostics {
  yearResolution: {
    resolvedYear: number;
    method: 'EXPLICIT_HEADER_DATE' | 'METADATA_OR_TITLE' | 'FILE_OR_CURRENT_DATE' | 'USER_CONFIRMED';
    plannerConfirmationRequired: boolean;
    isConfirmed: boolean;
    hasYearRollover: boolean;
    rolloverDatesCount: number;
  };
  dateSequence: {
    startDate: string;
    endDate: string;
    totalDateColumns: number;
    isValidSequence: boolean;
    issues: string[];
  };
  worksheetSelection: {
    selectedSheetName: string;
    headerRowIndex: number;
    inspectedSheetsCount: number;
    allDetectedSheets: string[];
  };
  duplicateVerification: {
    status: DuplicateCheckStatus;
    message: string;
    duplicateImportId?: string;
  };
  activePlanComparison: {
    status: PlanComparisonStatus;
    message: string;
    activePlanPeriodStart?: string;
    activePlanPeriodEnd?: string;
  };
  unitValidation: {
    supportedUnits: string[];
    unsupportedUnitsFound: string[];
    hasUnsupportedUnits: boolean;
  };
  reconciliation: {
    status: 'MATCH' | 'MISMATCH' | 'MISSING';
    sourceTotalCases: number;
    parsedTotalCases: number;
    difference: number;
  };
  productMapping: {
    totalSkus: number;
    recognizedSkus: number;
    missingSkus: string[];
  };
  lineMapping: {
    totalLines: number;
    recognizedLines: number;
    missingLines: string[];
  };
}

export interface ProductionPlanImport {
  id: string;
  tenantId: string;
  siteId: string;
  fileName: string;
  fileSize: number;
  fileHash: string;
  sourceType: 'MPPS7_SAP';
  sourceWorkbookDate: Timestamp;
  periodStart: Timestamp;
  periodEnd: Timestamp;
  detectedWorksheetNames: string[];
  uploadedBy: string;
  uploadedAt: Timestamp;
  status: ProductionPlanImportStatus;
  totalSourceRows: number;
  recognisedRows: number;
  ignoredRows: number;
  warningCount: number;
  errorCount: number;
  parserVersion: string;
  supersedesImportId: string | null;
  duplicateCheckStatus?: DuplicateCheckStatus;
  planComparisonStatus?: PlanComparisonStatus;
  notes: string;
  createdDate: Timestamp;
  modifiedDate: Timestamp;
}

export type ProductionPlanRowStatus = 'VALID' | 'WARNING' | 'ERROR' | 'IGNORED';

export interface ProductionPlanRow {
  tenantId: string;
  siteId: string;
  importId: string;
  sourceSheetName: string;
  sourceRowNumber: number;
  productionLineCode: string;
  productionLineName: string;
  productCode: string;
  sourceProductDescription: string;
  matchedProductId: string | null;
  matchedProductDescription: string | null;
  productionDate: Timestamp;
  plannedQuantity: number;
  sourceUnitOfMeasure: string;
  casesPerPallet: number | null;
  calculatedPallets: number | null;
  rowStatus: ProductionPlanRowStatus;
  validationCodes: string[];
  validationMessages: string[];
  sourceData: any;
  sourceTotalQty?: number | null;
  rowParsedQtySum?: number;
  sourceTotalDiff?: number | null;
  createdDate: Timestamp;
}

export interface ProductionPlanEntry {
  tenantId: string;
  siteId: string;
  activeImportId: string;
  productId: string;
  productCodeSnapshot: string;
  descriptionSnapshot: string;
  productionLineId: string;
  productionLineCodeSnapshot: string;
  productionDate: Timestamp;
  plannedCases: number;
  casesPerPallet: number | null;
  plannedPallets: number | null;
  sourceType: 'SAP_MPPS7';
  sourceSheetName: string;
  sourceRowNumber: number;
  sourceUpdatedAt: Timestamp;
  planVersion: string;
  status: 'PLANNED' | 'RUNNING' | 'DELAYED' | 'STOPPED' | 'COMPLETE' | 'CANCELLED';
  createdDate: Timestamp;
  modifiedDate: Timestamp;
}

export type ProductionLinePlanNoteType =
  | 'GENERAL'
  | 'MAINTENANCE'
  | 'CLEANING'
  | 'GRADE_CHANGE'
  | 'FORMAT_CHANGE'
  | 'TRIAL'
  | 'DELAY'
  | 'SHUTDOWN'
  | 'PRODUCT_RESTRICTION'
  | 'OTHER'
  | 'LINE_NOTE';

export type ProductionLinePlanNoteSeverity = 'INFORMATION' | 'WARNING' | 'CRITICAL';

export type NorthfleetStoStatus = 'UPCOMING' | 'DUE_FOR_COLLECTION' | 'ASSUMED_DISPATCHED' | 'CANCELLED';

export interface NorthfleetStoRequirement {
  id: string;
  tenantId: string;
  siteId: string;
  stoNumber: string;
  productId: string;
  productCode: string;
  productDescriptionSnapshot?: string;
  destinationId: string;
  destinationCode: string;
  northfleetDeliveryDate: Timestamp;
  barrowCollectionDate: Timestamp;
  pallets: number;
  cases: number;
  casesPerPalletSnapshot: number;
  importId: string;
  status: NorthfleetStoStatus;
  createdBy: string;
  createdDate: Timestamp;
  modifiedBy: string;
  modifiedDate: Timestamp;
}

export type NorthfleetStoImportStatus = 'VALIDATED' | 'COMMITTED' | 'FAILED';

export interface NorthfleetStoImport {
  id: string;
  tenantId: string;
  siteId: string;
  importedAt: Timestamp;
  importedBy: string;
  rowCount: number;
  validRowCount: number;
  warningCount: number;
  errorCount: number;
  effectiveStartDate: Timestamp | null;
  effectiveEndDate: Timestamp | null;
  status: NorthfleetStoImportStatus;
  notes?: string;
  createdDate: Timestamp;
  modifiedDate: Timestamp;
}

export interface ProductionLinePlanNote {
  id: string;
  tenantId: string;
  siteId: string;
  productionLineId: string;
  noteDate: Timestamp;
  noteType: ProductionLinePlanNoteType;
  title: string;
  note: string;
  startAt: Timestamp | null;
  endAt: Timestamp | null;
  severity: ProductionLinePlanNoteSeverity;
  source: 'PLANNER';
  active: boolean;
  createdBy: string;
  createdDate: Timestamp;
  modifiedBy: string;
  modifiedDate: Timestamp;
}

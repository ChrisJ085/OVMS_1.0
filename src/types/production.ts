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
  casesPerPallet: number;
  calculatedPallets: number;
  rowStatus: ProductionPlanRowStatus;
  validationCodes: string[];
  validationMessages: string[];
  sourceData: any;
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
  casesPerPallet: number;
  plannedPallets: number;
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
  | 'OTHER';

export type ProductionLinePlanNoteSeverity = 'INFORMATION' | 'WARNING' | 'CRITICAL';

export interface ProductionLinePlanNote {
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

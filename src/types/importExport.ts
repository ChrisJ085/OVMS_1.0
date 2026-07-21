export type ImportStatus = 'PENDING' | 'VALIDATING' | 'READY' | 'IMPORTING' | 'COMPLETED' | 'FAILED';

export interface ImportJob {
  id?: string;
  tenantId: string;
  siteId: string;
  importType: string;
  fileName: string;
  status: ImportStatus;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  errorCount: number;
  warningCount: number;
  startedAt: any;
  completedAt?: any;
  performedBy: string;
  summary?: string;
}

export interface ValidationResult {
  rowNumber: number;
  action: 'CREATE' | 'UPDATE' | 'IGNORE' | 'ERROR';
  data: any;
  errors: string[];
  warnings: string[];
}

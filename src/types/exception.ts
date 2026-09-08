import { BaseDocument, Timestamp } from './common';

export type ExceptionType = 
  | 'BELOW_RETENTION'
  | 'ABOVE_MAXIMUM'
  | 'INVENTORY_STALE'
  | 'MISSING_PLANNING_RULE'
  | 'PROMOTION_CONFLICT'
  | 'PRODUCTION_DELAYED'
  | 'PRODUCTION_STOPPED'
  | 'PRIORITY_BLOCKED'
  | 'PRIORITY_OVERDUE'
  | 'DATA_CONFIGURATION_ERROR';

export type ExceptionSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type ExceptionStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';

export interface OperationalException extends Omit<BaseDocument, 'status'> {
  siteId: string;
  exceptionType: ExceptionType;
  severity: ExceptionSeverity;
  entityType: string;
  entityId: string;
  productId: string | null;
  priorityId: string | null;
  title: string;
  message: string;
  reasonCodes: string[];
  exceptionStatus: ExceptionStatus;
  firstDetectedAt: Timestamp;
  lastDetectedAt: Timestamp;
  acknowledgedAt: Timestamp | null;
  resolvedAt: Timestamp | null;
  resolutionNote: string | null;
}

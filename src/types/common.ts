export type Timestamp = Date | string | number | { seconds?: number; toMillis?: () => number; toDate?: () => Date };
export type FieldValue = Date | string | number;

export interface TenantScopedDocument {
  tenantId: string;
}

export interface SiteScopedDocument extends TenantScopedDocument {
  siteId: string;
}

export interface AuditMetadata {
  createdBy: string;
  createdDate: Timestamp | FieldValue;
  modifiedBy: string;
  modifiedDate: Timestamp | FieldValue;
}

export type EntityStatus = 'active' | 'inactive' | 'archived';

export interface DataFreshness {
  lastRefreshed: Date;
  isStale: boolean;
}

export interface SelectOption {
  label: string;
  value: string;
}

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string | Error;
}

export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  hasMore: boolean;
  nextCursor?: any;
}

export interface BaseDocument extends TenantScopedDocument, AuditMetadata {
  id?: string;
  siteId?: string;
  status?: EntityStatus;
}

export interface AuditEvent {
  tenantId: string;
  siteId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  summary: string;
  previousValue: any;
  newValue: any;
  metadata?: Record<string, any>;
  performedBy: string;
  timestamp: Timestamp | FieldValue;
}

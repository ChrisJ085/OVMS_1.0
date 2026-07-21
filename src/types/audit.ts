export interface AuditEvent {
  id?: string;
  tenantId: string;
  siteId: string;
  eventType: string; // e.g. CONFIG_CREATE, PRODUCT_EDIT, INVENTORY_MOVE, etc.
  entityType: string; // e.g. Product, Priority, Settings
  entityId: string;
  summary: string;
  previousValue?: any;
  newValue?: any;
  metadata?: any;
  performedBy: string;
  timestamp: any; // Firestore Timestamp
}

export interface RecommendationAuditSnapshot {
  recommendationId: string;
  operationalPriorityId: string;
  productId: string;
  productCode: string;
  productDescription: string;
  action: string;
  actionTypeId?: string;
  actionTypeLabel?: string;
  requestedQuantity: number;
  quantityUnit: string;
  destinationId: string | null;
  destinationCode?: string | null;
  destinationName?: string | null;
  priorityLevel: string;
  priorityLevelId?: string;
  instruction: string;
  reason?: string;
  explanation?: string;
  supportingReasons?: string[];
  sourceType: string;
  createdAt: string;
  decisionContext?: {
    inventoryTotal?: number;
    controllingThresholdMode?: string | null;
    belowTargetBehavior?: string | null;
    outstandingStoCases?: number;
    plannedCasesNext7Days?: number;
    planningBand?: string | null;
  };
}

export interface RecommendationGenerationAuditMetadata {
  generationId: string;
  generationStatus: 'COMPLETED' | 'FAILED' | 'PARTIAL';
  generationDurationMs: number;
  candidateProductsCount: number;
  actionableRecommendationsCount: number;
  operationalPrioritiesCreatedCount: number;
  noActionCount: number;
  userId: string;
  userDisplayName?: string;
  userEmail?: string;
  errorMessage?: string;
}

export interface AuditEvent {
  id?: string;
  tenantId: string;
  siteId: string;
  eventType: string; // e.g. RECOMMENDATIONS_GENERATED, CONFIG_CREATE, PRODUCT_EDIT, etc.
  entityType: string; // e.g. RecommendationEngine, Product, Priority, Settings
  entityId: string;
  summary: string;
  performedBy: string;
  performedByName?: string;
  performedByEmail?: string;
  timestamp: any; // Firestore Timestamp or Date or string
  
  // Specific Recommendation Generation Audit fields
  generationId?: string;
  generationStatus?: 'COMPLETED' | 'FAILED' | 'PARTIAL';
  generationDurationMs?: number;
  candidateProductsCount?: number;
  actionableRecommendationsCount?: number;
  operationalPrioritiesCreatedCount?: number;
  noActionCount?: number;
  recommendationSnapshots?: RecommendationAuditSnapshot[];
  errorMessage?: string;

  previousValue?: any;
  newValue?: any;
  metadata?: any;
}


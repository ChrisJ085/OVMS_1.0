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

  // Generation and Fingerprint Context (Stage 9)
  generationId?: string;
  fingerprint?: string;
  sourceFingerprint?: string;
  recommendationStatus?: string;
  triggeredBy?: string;
  triggeredByName?: string;

  // Inventory Snapshot seen at evaluation time
  inventorySnapshot?: {
    totalCases: number;
    balanceCount?: number;
    updatedAt?: string | null;
  };

  // SNP87 Planning Data Source Snapshot
  snp87SourceSnapshot?: {
    sourceImportId: string | null;
    sourceReportName: string | null;
    importedAt: string | null;
    dataFreshnessStatus: 'FRESH' | 'STALE' | 'MISSING';
    sourceStatus: 'CURRENT' | 'STALE' | 'SUPERSEDED' | 'MISSING';
    planningHorizon?: {
      startDate: string;
      endDate: string;
    } | null;
    forecastCasesToday: number;
    forecastCasesNext7Days: number;
    forecastByDate: Record<string, number>;
    forecastSourceImportId?: string | null;
    forecastSourceUpdatedAt?: string | null;
    confirmedProductionCasesToday: number;
    confirmedProductionCasesNext7Days: number;
    confirmedProductionByDate: Record<string, number>;
    productionSourceImportId?: string | null;
    productionSourceUpdatedAt?: string | null;
    hasMissingPlanningData: boolean;
  };

  // Northfleet Protected Requirement Snapshot
  northfleetProtectionSnapshot?: {
    outstandingCases: number;
    requirementCount?: number;
    requirements?: Array<{
      id?: string;
      cases: number;
      barrowCollectionDate: string;
      destinationLocation?: string;
      carrier?: string;
      status?: string;
    }>;
  };

  // Product and Planning Rule Configuration Snapshot
  configurationSnapshot?: {
    productCode: string;
    preferredDestinationId: string | null;
    preferredDestinationCode?: string | null;
    preferredDestinationName?: string | null;
    minimumQuantity: number | null;
    targetQuantity: number | null;
    maximumQuantity: number | null;
    ddxmRetentionQuantity: number | null;
    controllingThresholdMode: string | null;
    belowTargetBehavior: string | null;
    engineVersion: string;
  };

  decisionContext?: {
    inventoryTotal?: number;
    controllingThresholdMode?: string | null;
    belowTargetBehavior?: string | null;
    outstandingStoCases?: number;
    plannedCasesNext7Days?: number;
    planningBand?: string | null;
    preferredDestinationId?: string | null;
    preferredDestinationName?: string | null;
    snp87ImportId?: string | null;
    snp87ImportedAt?: string | null;
    snp87Freshness?: string | null;
    snp87ForecastCases7Days?: number;
    snp87ConfirmedProductionCases7Days?: number;
    snp87NetPosition?: number;
  };
}

export interface RecommendationGenerationAuditMetadata {
  generationId: string;
  generationStatus: 'COMPLETED' | 'FAILED' | 'PARTIAL';
  generationDurationMs: number;
  candidateProductsCount: number;
  evaluatedProductsCount?: number;
  actionableRecommendationsCount: number;
  operationalPrioritiesCreatedCount: number;
  noActionCount: number;
  userId: string;
  userDisplayName?: string;
  userEmail?: string;
  sourceImportIds?: string[];
  evaluationDate?: string;
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
  evaluatedProductsCount?: number;
  actionableRecommendationsCount?: number;
  operationalPrioritiesCreatedCount?: number;
  noActionCount?: number;
  recommendationSnapshots?: RecommendationAuditSnapshot[];
  errorMessage?: string;

  previousValue?: any;
  newValue?: any;
  metadata?: any;
}


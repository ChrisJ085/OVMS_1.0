export interface SiteSettings {
  id?: string; // siteId
  tenantId: string;
  siteId: string;
  siteName: string;
  timezone: string;
  defaultUnitOfMeasureId: string;
  defaultDestinationId: string;
  completedPriorityTvRetentionMinutes: number;
  dashboardRotationSeconds: number;
  dashboardTitle: string;
  tickerSpeed: number; // e.g. 1 (slow) to 5 (fast)
  inventoryFreshMinutes: number;
  inventoryAgingMinutes: number;
  inventoryStaleMinutes: number;
  upcomingProductionWindowHours: number;
  promotionLookAheadDays: number;
  activeDecisionEngineVersion: string;
  modifiedBy: string;
  modifiedDate: any; // Firestore Timestamp
  
  // additional presentation logic (whether ticker is on)
  announcementTickerActive?: boolean;
  priorityPageSize?: number;
  visibleSummaryMetrics?: string[];
  visiblePlanningIndicators?: string[];
}

import { ProductPlanningRule, PlanningBandStatus } from './planning';
import { ProductProductionContext } from './production';
import { PromotionProductRule, PromotionWithPhase } from './promotion';
import { InventoryBalance } from './inventory';

export type DataQualitySeverity = 'INFO' | 'WARNING' | 'ERROR' | 'BLOCKING';

export type DataQualityCode = 
  | 'PLANNING_RULE_MISSING'
  | 'INVENTORY_STALE'
  | 'INVENTORY_MISSING'
  | 'MISSING_INVENTORY'
  | 'PRODUCTION_SOURCE_MISSING'
  | 'PRODUCTION_SOURCE_STALE'
  | 'PROMOTION_CONFLICT'
  | 'CONFIGURATION_MISSING'
  | 'PRODUCT_MASTER_INCOMPLETE'
  | 'INVALID_THRESHOLD'
  | 'ACTION_QUANTITY_CONTRADICTION';

export type DataQualityIssue = {
  code: DataQualityCode;
  severity: DataQualitySeverity;
  blocking: boolean;
  message: string;
  sourceArea: 'PLANNING_RULE' | 'INVENTORY' | 'PRODUCTION' | 'PROMOTION' | 'CONFIGURATION' | 'PRODUCT_MASTER';
  sourceReference?: string | null;
};

export type DataQualityStatus = 
  | 'COMPLETE'
  | 'INVENTORY_STALE'
  | 'INVENTORY_MISSING'
  | 'MISSING_INVENTORY'
  | 'PLANNING_RULE_MISSING'
  | 'PRODUCTION_DATA_MISSING'
  | 'PRODUCTION_SOURCE_MISSING'
  | 'PRODUCTION_SOURCE_STALE'
  | 'PROMOTION_CONFLICT'
  | 'CONFIGURATION_MISSING'
  | 'PRODUCT_MASTER_INCOMPLETE';

export type ReasonCode = 
  | 'BELOW_CONTROLLING_RETENTION'
  | 'AT_CONTROLLING_RETENTION'
  | 'BELOW_TARGET'
  | 'AT_TARGET'
  | 'ABOVE_TARGET'
  | 'ABOVE_MAXIMUM'
  | 'PROMOTION_ACTIVE'
  | 'PROMOTION_PRE_BUILD'
  | 'PRODUCTION_RUNNING'
  | 'PRODUCTION_DELAYED'
  | 'PRODUCTION_STOPPED'
  | 'NEXT_PRODUCTION_SOON'
  | 'PREFERRED_DESTINATION'
  | 'DESTINATION_PROMOTION_OVERRIDE'
  | 'EXISTING_PRIORITY'
  | 'STALE_INVENTORY'
  | 'REVIEW_REQUIRED'
  | 'PRODUCTION_SCHEDULED_TODAY'
  | 'PRODUCTION_DUE_WITHIN_WINDOW'
  | 'NO_FUTURE_PRODUCTION'
  | 'PRODUCTION_MAINTENANCE'
  | 'PRODUCTION_TRIAL'
  | 'PRODUCTION_SOURCE_STALE'
  | 'PRODUCTION_SOURCE_MISSING'
  | 'UPCOMING_PRODUCTION_CAPACITY_RISK'
  | 'PROMOTION_AND_PRODUCTION_RISK'
  | 'CONFIGURATION_MISSING'
  | 'PROMOTION_CONFLICT'
  | 'AS_PER_SCHEDULE';

export interface DefaultDestinationRules {
  defaultDestinationId?: string | null;
  allowFallbackDestination?: boolean;
}

export interface DecisionConfiguration {
  configurationVersion: string;
  holdActionId: string | null;
  reviewActionId: string | null;
  releaseActionId: string | null;
  asPerScheduleActionId?: string | null;
  urgentPriorityId: string | null;
  normalPriorityId: string | null;
  lowPriorityId: string | null;
  defaultDestinationRules?: DefaultDestinationRules;
  inventoryStalenessHoursThreshold?: number;
  productionStalenessHoursThreshold?: number;
  nearProductionDaysWindow?: number;
  capacityWarningThresholdPercentage?: number;
  validActionIds?: string[];
  validPriorityIds?: string[];
  validDestinationIds?: string[];
  inactiveActionIds?: string[];
  inactivePriorityIds?: string[];
  inactiveDestinationIds?: string[];
}

export interface DecisionInputSnapshot {
  tenantId: string;
  siteId: string;
  productId: string;
  productCodeSnapshot: string;
  descriptionSnapshot?: string;
  unitOfMeasure?: string;
  inventoryTotal: number;
  inventoryByLocation: InventoryBalance[];
  inventoryUpdatedAt: Date | null;
  planningRule: ProductPlanningRule | null;
  productionContext: ProductProductionContext | null;
  activePromotionImpacts: { rule: PromotionProductRule; promotion: PromotionWithPhase }[];
  existingActivePriorities: any[]; 
  evaluationTime: Date;
  configuration?: DecisionConfiguration | null;
}

export interface ThresholdBreakdown {
  baseValue: number;
  promotionAdjustment: number;
  effectiveValue: number;
}

export interface DecisionException {
  message: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
}

export interface StructuredExplanation {
  currentFacts: string[];
  thresholds: string[];
  productionContext: string[];
  promotionContext: string[];
  risks: string[];
  recommendation: string[];
  calculationTrace: string[];
}

export interface DecisionVersionInfo {
  engineVersion: string;
  configurationVersion: string;
  planningRuleVersion: string | null;
  inventorySnapshotTime: Date | null;
  productionImportId: string | null;
  promotionSnapshotIds: string[];
  evaluatedAt: Date;
  sourceHash: string;
}

export interface DecisionOutput {
  productId: string;
  planningBandStatus: PlanningBandStatus | 'UNKNOWN';
  
  effectiveMinimum: ThresholdBreakdown;
  effectiveTarget: ThresholdBreakdown;
  effectiveMaximum: ThresholdBreakdown;
  effectiveDDXM: ThresholdBreakdown;
  
  controllingRetention: number;
  availableToRelease: number;
  shortfallQuantity: number;
  headroomToMaximum: number;
  
  recommendedActionTypeId: string | null;
  recommendedQuantity: number;
  recommendedDestinationId: string | null;
  recommendedPriorityLevelId: string | null;
  
  reasonCodes: ReasonCode[];
  explanationLines: string[];
  structuredExplanation: StructuredExplanation;
  exceptions: DecisionException[];
  
  dataQualityStatus: DataQualityStatus;
  dataQualityIssues: DataQualityIssue[];
  versionInfo: DecisionVersionInfo;
  
  sourceSnapshot: DecisionInputSnapshot;
  evaluatedAt: Date;
}

import { ProductPlanningRule, PlanningBandStatus } from './planning';
import { ProductProductionContext } from './production';
import { PromotionProductRule, PromotionWithPhase } from './promotion';
import { InventoryBalance } from './inventory';

export type DataQualityStatus = 
  | 'COMPLETE'
  | 'INVENTORY_STALE'
  | 'INVENTORY_MISSING'
  | 'PLANNING_RULE_MISSING'
  | 'PRODUCTION_DATA_MISSING'
  | 'PROMOTION_CONFLICT'
  | 'CONFIGURATION_MISSING';

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
  | 'PROMOTION_AND_PRODUCTION_RISK';

export interface DecisionInputSnapshot {
  tenantId: string;
  siteId: string;
  productId: string;
  productCodeSnapshot: string;
  inventoryTotal: number;
  inventoryByLocation: InventoryBalance[];
  inventoryUpdatedAt: Date | null;
  planningRule: ProductPlanningRule | null;
  productionContext: ProductProductionContext | null;
  activePromotionImpacts: { rule: PromotionProductRule; promotion: PromotionWithPhase }[];
  existingActivePriorities: any[]; 
  evaluationTime: Date;
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
  exceptions: DecisionException[];
  
  dataQualityStatus: DataQualityStatus;
  sourceSnapshot: DecisionInputSnapshot;
  evaluatedAt: Date;
}

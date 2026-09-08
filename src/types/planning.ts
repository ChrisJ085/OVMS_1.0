import { BaseDocument, Timestamp } from './common';

export type ControllingThresholdMode = 'HIGHEST_MANDATORY' | 'MINIMUM_ONLY' | 'DDXM_ONLY' | 'CUSTOM';

export type BelowTargetBehavior = 'HOLD_UNTIL_TARGET' | 'RELEASE_ABOVE_CONTROL' | 'AS_PER_SCHEDULE' | 'PLANNER_REVIEW';

export interface ProductPlanningRule extends BaseDocument {
  productId: string;
  productCodeSnapshot: string;
  descriptionSnapshot: string;
  minimumQuantity: number;
  targetQuantity: number;
  maximumQuantity: number;
  ddxmRetentionQuantity: number;
  controllingThresholdMode: ControllingThresholdMode;
  customControllingRetentionQuantity: number | null;
  belowTargetBehavior?: BelowTargetBehavior;
  preferredDestinationId: string;
  secondaryDestinationId: string | null;
  defaultActionTypeId: string;
  defaultPriorityLevelId: string;
  allowQuantityOverride: boolean;
  allowDestinationOverride: boolean;
  overrideRequiresReason: boolean;
  effectiveFrom: Timestamp;
  effectiveTo: Timestamp | null;
  untilSwitchedOff?: boolean;
  notes: string;
}

export type PlanningBandStatus = 'BELOW_CONTROL' | 'AT_CONTROL' | 'BELOW_TARGET' | 'AT_TARGET' | 'ABOVE_TARGET' | 'ABOVE_MAXIMUM';

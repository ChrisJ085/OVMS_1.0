import { BaseDocument } from './common';
import { DecisionOutput, DecisionInputSnapshot } from './decision';
import { Timestamp } from 'firebase/firestore';

export type RecommendationStatus = 
  | 'GENERATED'
  | 'AUTO_PUBLISHED'
  | 'OVERRIDDEN'
  | 'SUPPRESSED'
  | 'SUPERSEDED'
  | 'WITHDRAWN'
  | 'FAILED_VALIDATION'
  | 'AWAITING_REVIEW' // Retained for backwards compatibility in migration
  | 'APPROVED'        // Retained for backwards compatibility in migration
  | 'DISMISSED';      // Retained for backwards compatibility in migration

export interface PlannerDecision {
  actionTypeId: string | null;
  quantity: number;
  destinationId: string | null;
  priorityLevelId: string | null;
  notes: string;
}

export interface OverrideFlags {
  actionOverridden: boolean;
  quantityOverridden: boolean;
  destinationOverridden: boolean;
  priorityOverridden: boolean;
}

export type ManualOverrideStatus = 'OVERRIDE_ACTIVE' | 'OVERRIDE_EXPIRED' | 'OVERRIDE_REPLACED' | 'OVERRIDE_CANCELLED';

export interface OverrideContext {
  overriddenBy: string;
  overriddenAt: Timestamp;
  reason: string;
  overrideStatus: ManualOverrideStatus;
  actionTypeId?: string | null;
  quantity?: number;
  destinationId?: string | null;
  priorityLevelId?: string | null;
  instruction?: string;
  expireAt?: Timestamp | null;
}

export type SuppressionScope = 'UNTIL_NEXT_SNAPSHOT' | 'UNTIL_DATE' | 'PERMANENT';

export interface SuppressionContext {
  suppressedBy: string;
  suppressedAt: Timestamp;
  reason: string;
  scope: SuppressionScope;
  expireAt?: Timestamp | null;
  inventorySnapshotId?: string | null;
}

export const CANONICAL_TRIGGER_TYPES = [
  'INVENTORY_IMPORT',
  'MPPS_IMPORT',
  'PLANNING_RULE_CHANGE',
  'PROMOTION_CHANGE',
  'DECISION_CONFIGURATION_CHANGE',
  'MANUAL_RECALCULATION',
  'REPAIR'
] as const;

export type GenerationTriggerType = typeof CANONICAL_TRIGGER_TYPES[number];

export type GenerationJobStatus = 
  | 'QUEUED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'COMPLETED_WITH_WARNINGS'
  | 'FAILED';

export interface RecommendationGenerationJob extends Omit<BaseDocument, 'status'> {
  jobId: string;
  tenantId: string;
  siteId: string;
  triggerType: GenerationTriggerType;
  triggerReferenceId?: string | null;
  requestedBy: string;
  requestedAt: Timestamp;
  startedAt?: Timestamp | null;
  completedAt?: Timestamp | null;
  status: GenerationJobStatus;
  productCount: number;
  processedCount: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  supersededCount: number;
  withdrawnCount: number;
  failedCount: number;
  errors: { productId: string; productCode?: string; error: string }[];
  inventorySnapshotId?: string | null;
  productionPlanImportId?: string | null;
  decisionConfigurationVersion?: string | null;
  engineVersion: string;
}

export interface Recommendation extends BaseDocument {
  siteId: string;
  productId: string;
  productCodeSnapshot: string;
  descriptionSnapshot: string;
  recommendationStatus: RecommendationStatus; // Using this instead of status to avoid conflict with active/inactive base status
  engineVersion: string;
  decisionOutput: DecisionOutput;
  sourceSnapshot: DecisionInputSnapshot;
  sourceFingerprint: string;
  generatedAt: Timestamp;
  reviewedAt: Timestamp | null;
  reviewedBy: string | null;
  plannerDecision: PlannerDecision | null;
  overrideFlags: OverrideFlags | null;
  overrideReason: string | null;
  overrideContext?: OverrideContext | null;
  suppressionContext?: SuppressionContext | null;
  supersededByRecommendationId: string | null;
  linkedPriorityId?: string | null;
  sourceInventorySnapshotId?: string | null;
  sourceMppsImportId?: string | null;
}

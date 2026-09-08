import { BaseDocument, Timestamp } from './common';
import { DecisionOutput, DecisionInputSnapshot } from './decision';

export type RecommendationStatus = 'AWAITING_REVIEW' | 'APPROVED' | 'AUTO_PUBLISHED' | 'OVERRIDDEN' | 'DISMISSED' | 'SUPERSEDED' | 'EXPIRED';

export type SiteRecommendationRunStatus = 'IDLE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface SiteRecommendationRun {
  id?: string;
  tenantId: string;
  siteId: string;
  status: SiteRecommendationRunStatus;
  startedAt: Timestamp | null;
  startedBy: string | null;
  startedByName: string | null;
  completedAt: Timestamp | null;
  completedBy: string | null;
  completedByName: string | null;
  totalProducts: number;
  currentProductIndex: number;
  currentProductCode: string;
  generatedCount: number;
  conflictsCount: number;
  error?: string | null;
  lastUpdatedAt: Timestamp | null;
}

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
  supersededByRecommendationId: string | null;
  linkedPriorityId?: string;
}

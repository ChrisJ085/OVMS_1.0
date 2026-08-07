import { BaseDocument } from './common';
import { DecisionOutput, DecisionInputSnapshot } from './decision';
import { Timestamp } from 'firebase/firestore';

export type RecommendationStatus = 'AWAITING_REVIEW' | 'APPROVED' | 'AUTO_PUBLISHED' | 'OVERRIDDEN' | 'DISMISSED' | 'SUPERSEDED' | 'EXPIRED';

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

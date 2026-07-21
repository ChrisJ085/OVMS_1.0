import { BaseDocument } from './common';
import { Timestamp } from 'firebase/firestore';

export type PriorityStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'WAITING' | 'BLOCKED' | 'PARTIALLY_COMPLETE' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED' | 'ARCHIVED';

export type PrioritySourceType = 'RECOMMENDATION' | 'MANUAL';

export interface Priority extends BaseDocument {
  siteId: string;
  sourceType: PrioritySourceType;
  sourceRecommendationId: string | null;
  productId: string;
  productCodeSnapshot: string;
  descriptionSnapshot: string;
  actionTypeId: string;
  requestedQuantity: number | null;
  destinationId: string | null;
  priorityLevelId: string;
  instruction: string;
  plannerReason: string;
  supportingReasons: string[];
  planningContextSnapshot: any | null;
  startAt: Timestamp;
  expireAt: Timestamp | null;
  priorityStatus: PriorityStatus;
  progressQuantity: number;
  remainingQuantity: number;
  progressPercent: number;
  latestProgressNote: string | null;
  publishedAt: Timestamp | null;
  completedAt: Timestamp | null;
  cancelledAt: Timestamp | null;
}

export type PriorityEventType = 'CREATED' | 'STATUS_CHANGED' | 'MATERIAL_AMENDMENT' | 'PROGRESS_UPDATED';

export interface PriorityEvent extends BaseDocument {
  siteId: string;
  priorityId: string;
  eventType: PriorityEventType;
  previousStatus: PriorityStatus | null;
  newStatus: PriorityStatus | null;
  previousValue: any | null;
  newValue: any | null;
  note: string;
  performedBy: string;
  timestamp: Timestamp;
}

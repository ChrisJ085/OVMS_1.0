import { BaseDocument } from './common';
import { Timestamp } from 'firebase/firestore';

export type PriorityStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'WAITING' | 'BLOCKED' | 'PARTIALLY_COMPLETE' | 'COMPLETED' | 'CANCELLED' | 'WITHDRAWN' | 'SUPERSEDED' | 'EXPIRED' | 'ARCHIVED';

export type PrioritySourceType = 'SYSTEM_RECOMMENDATION' | 'RECOMMENDATION' | 'MANUAL_OVERRIDE' | 'MANUAL' | 'PLA';

export interface Priority extends BaseDocument {
  siteId: string;
  sourceType: PrioritySourceType;
  sourceRecommendationId: string | null;
  sourceInventorySnapshotId?: string | null;
  sourceMppsImportId?: string | null;
  engineVersion?: string | null;
  planningRuleVersion?: string | null;
  decisionConfigurationVersion?: string | null;
  productId: string;
  productCodeSnapshot: string;
  descriptionSnapshot: string;
  actionTypeId: string;
  requestedQuantity: number | null;
  destinationId: string | null;
  priorityLevelId: string;
  instruction?: string;
  plannerReason?: string;
  overflowDestinationId?: string | null;
  actionTypeLabel?: string;
  destinationLabel?: string;
  overflowDestinationLabel?: string;
  priorityLevelLabel?: string;
  supportingReasons: string[];
  planningContextSnapshot: any | null;
  startAt: Timestamp;
  expireAt: Timestamp | null;
  untilSwitchedOff?: boolean;
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

export interface DisplayPriority {
  id: string;
  tenantId: string;
  siteId: string;
  sourcePriorityId: string;
  priorityCode: string;
  productCodeSnapshot: string;
  descriptionSnapshot: string;
  title: string;
  instruction?: string;
  priorityStatus: PriorityStatus;
  priorityLevelId: string;
  priorityLevelLabel?: string;
  actionTypeId?: string;
  actionTypeLabel?: string;
  requestedQuantity: number | null;
  progressQuantity: number;
  progressPercent: number;
  destinationId?: string | null;
  destinationLabel?: string;
  overflowDestinationId?: string | null;
  overflowDestinationLabel?: string;
  startAt: Timestamp | null;
  createdDate: Timestamp | null;
  completedAt?: Timestamp | null;
  expireAt?: Timestamp | null;
  untilSwitchedOff?: boolean;
  modifiedDate?: Timestamp;
}

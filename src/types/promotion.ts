import { BaseDocument } from './common';
import { Timestamp } from 'firebase/firestore';

export type PromotionImportance = 'STANDARD' | 'HIGH' | 'NATIONAL' | 'CRITICAL';
export type PromotionStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type PromotionPhase = 'PRE_BUILD' | 'ACTIVE' | 'RUN_DOWN' | 'INACTIVE';

export interface Promotion extends BaseDocument {
  promotionCode: string;
  promotionName: string;
  description: string;
  importance: PromotionImportance;
  promotionStatus: PromotionStatus; // Using promotionStatus instead of status because base document has status: 'active' | 'inactive'
  startDate: Timestamp;
  endDate: Timestamp;
  preBuildStartDate: Timestamp | null;
  runDownEndDate: Timestamp | null;
  notes: string;
}

export interface PromotionProductRule extends BaseDocument {
  siteId: string;
  promotionId: string;
  productId: string;
  productCodeSnapshot: string;
  descriptionSnapshot: string;
  expectedVolumeUpliftQuantity: number | null;
  expectedVolumeUpliftPercent: number | null;
  retentionUpliftQuantity: number | null;
  promotionMinimumOverride: number | null;
  promotionTargetOverride: number | null;
  promotionMaximumOverride: number | null;
  destinationOverrideId: string | null;
  priorityWeightUplift: number;
  actionTypeOverrideId: string | null;
  notes: string;
}

export interface PromotionWithPhase extends Promotion {
  phase: PromotionPhase;
}

import { UserRole } from './auth';
import { Timestamp } from './common';

export type SopCategory =
  | 'GETTING_STARTED'
  | 'PRIORITIES'
  | 'INVENTORY'
  | 'PLANNING'
  | 'PRODUCTION'
  | 'CONFIGURATION'
  | 'ADMINISTRATION'
  | 'DISPLAYS'
  | 'TROUBLESHOOTING';

export type SopDifficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export type SopStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type SopMediaType = 'IMAGE' | 'VIDEO' | 'GIF';

export interface SopMedia {
  id: string;
  type: SopMediaType;
  url: string;
  caption?: string;
  thumbnail?: string;
}

export interface SopStep {
  stepNumber: number;
  title: string;
  instruction: string;
  media?: SopMedia;
  tip?: string;
  warning?: string;
  troubleshooting?: string;
  actionUrl?: string;
  actionLabel?: string;
}

export interface SopTroubleshootingItem {
  problem: string;
  possibleCauses: string[];
  solutions: string[];
  relatedSopIds?: string[];
}

export interface SopDocument {
  id: string;
  title: string;
  slug: string;
  shortDescription: string;
  fullDescription: string;
  category: SopCategory;
  module: string;
  applicableRoles: UserRole[];
  applicableSiteIds?: string[];
  difficulty: SopDifficulty;
  estimatedDurationMinutes: number;
  status: SopStatus;
  version: string;
  publishedDate: string | Timestamp;
  updatedDate: string | Timestamp;
  author: string;
  steps: SopStep[];
  relatedSopIds: string[];
  keywords: string[];
  troubleshooting?: SopTroubleshootingItem[];
  tips?: string[];
  warnings?: string[];
  acknowledgementRequired?: boolean;
  isCustomOrOverridden?: boolean;
  tenantId?: string;
}

export type SopProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface UserSopProgress {
  sopId: string;
  userId: string;
  tenantId: string;
  status: SopProgressStatus;
  currentStepNumber: number;
  startedAt?: string;
  completedAt?: string;
  lastViewedAt: string;
  acknowledgedVersion?: string;
  acknowledgedAt?: string;
}

export type WhatsNewType = 'NEW_FEATURE' | 'CHANGED_FEATURE' | 'UPDATED_SOP' | 'ANNOUNCEMENT';

export interface WhatsNewItem {
  id: string;
  type: WhatsNewType;
  title: string;
  description: string;
  date: string;
  targetRoles?: UserRole[];
  sopId?: string;
  appRoute?: string;
  badgeText?: string;
}

export interface SopCategoryMeta {
  id: SopCategory;
  title: string;
  description: string;
  iconName: string;
  colorClass: string;
}

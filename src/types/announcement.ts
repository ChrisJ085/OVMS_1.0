import { BaseDocument, Timestamp } from './common';

export type AnnouncementType = 'GENERAL' | 'SAFETY' | 'ENGINEERING' | 'PRODUCTION' | 'HR' | 'OTHER';
export type AnnouncementSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface Announcement extends BaseDocument {
  siteId: string;
  type: AnnouncementType;
  title: string;
  message: string;
  severity: AnnouncementSeverity;
  startAt: Timestamp;
  expireAt: Timestamp | null;
  displayOnTv: boolean;
  active: boolean; // Logical toggle beyond dates
}

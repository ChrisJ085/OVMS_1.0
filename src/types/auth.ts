import { Timestamp } from 'firebase/firestore';

export type UserRole = 'PLATFORM_SUPERUSER' | 'TENANT_ADMIN' | 'PLANNER' | 'WAREHOUSE_OPERATOR' | 'VIEWER' | 'DISPLAY';

export type AccountStatus = 'ACTIVE' | 'DISABLED' | 'LOCKED' | 'ARCHIVED';

export interface Tenant {
  id: string; // Document ID
  tenantName: string;
  tenantCode: string;
  active: boolean;
  createdBy: string;
  createdDate: Timestamp;
  modifiedBy: string;
  modifiedDate: Timestamp;
}

export interface UserProfile {
  uid: string; // Document ID (auth UID)
  email: string;
  displayName: string;
  jobTitle: string;
  role: UserRole;
  tenantId: string | null;
  siteIds: string[];
  accountStatus: AccountStatus;
  requiresPasswordChange: boolean;
  failedLoginAttempts: number;
  failedAttemptWindowStartedAt: Timestamp | null;
  lockedAt: Timestamp | null;
  lastLoginAt: Timestamp | null;
  passwordChangedAt: Timestamp | null;
  createdBy: string;
  createdDate: Timestamp;
  modifiedBy: string;
  modifiedDate: Timestamp;
}

export interface UserSession {
  id: string; // Document ID
  userId: string;
  tenantId: string | null;
  siteId: string | null;
  loginAt: Timestamp;
  lastActivityAt: Timestamp;
  logoutAt: Timestamp | null;
  status: 'ACTIVE' | 'EXPIRED' | 'LOGGED_OUT';
  deviceInfo: string;
  createdDate: Timestamp;
  modifiedDate: Timestamp;
}

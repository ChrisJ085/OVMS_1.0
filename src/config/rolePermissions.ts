import { UserRole } from '../types/auth';

export type Permission =
  | 'VIEW_OVERVIEW'
  | 'VIEW_RECOMMENDATIONS'
  | 'MANAGE_RECOMMENDATIONS'
  | 'VIEW_PRODUCTION_PLAN'
  | 'IMPORT_PRODUCTION_PLAN'
  | 'MANAGE_PLANNING_RULES'
  | 'MANAGE_PROMOTIONS'
  | 'VIEW_PRIORITIES'
  | 'MANAGE_PRIORITIES'
  | 'VIEW_WAREHOUSE_EXECUTION'
  | 'UPDATE_WAREHOUSE_EXECUTION'
  | 'VIEW_INVENTORY'
  | 'MANAGE_INVENTORY'
  | 'VIEW_REPORTS'
  | 'VIEW_ADMINISTRATION'
  | 'MANAGE_USERS'
  | 'MANAGE_CONFIGURATION'
  | 'VIEW_AUDIT_LOG'
  | 'VIEW_TV_DASHBOARD';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  PLATFORM_SUPERUSER: [
    'VIEW_OVERVIEW',
    'VIEW_RECOMMENDATIONS',
    'MANAGE_RECOMMENDATIONS',
    'VIEW_PRODUCTION_PLAN',
    'IMPORT_PRODUCTION_PLAN',
    'MANAGE_PLANNING_RULES',
    'MANAGE_PROMOTIONS',
    'VIEW_PRIORITIES',
    'MANAGE_PRIORITIES',
    'VIEW_WAREHOUSE_EXECUTION',
    'UPDATE_WAREHOUSE_EXECUTION',
    'VIEW_INVENTORY',
    'MANAGE_INVENTORY',
    'VIEW_REPORTS',
    'VIEW_ADMINISTRATION',
    'MANAGE_USERS',
    'MANAGE_CONFIGURATION',
    'VIEW_AUDIT_LOG',
    'VIEW_TV_DASHBOARD',
  ],
  TENANT_ADMIN: [
    'VIEW_OVERVIEW',
    'VIEW_RECOMMENDATIONS',
    'MANAGE_RECOMMENDATIONS',
    'VIEW_PRODUCTION_PLAN',
    'IMPORT_PRODUCTION_PLAN',
    'MANAGE_PLANNING_RULES',
    'MANAGE_PROMOTIONS',
    'VIEW_PRIORITIES',
    'MANAGE_PRIORITIES',
    'VIEW_WAREHOUSE_EXECUTION',
    'UPDATE_WAREHOUSE_EXECUTION',
    'VIEW_INVENTORY',
    'MANAGE_INVENTORY',
    'VIEW_REPORTS',
    'VIEW_ADMINISTRATION',
    'MANAGE_USERS',
    'MANAGE_CONFIGURATION',
    'VIEW_AUDIT_LOG',
    'VIEW_TV_DASHBOARD',
  ],
  PLANNER: [
    'VIEW_OVERVIEW',
    'VIEW_RECOMMENDATIONS',
    'MANAGE_RECOMMENDATIONS',
    'VIEW_PRODUCTION_PLAN',
    'IMPORT_PRODUCTION_PLAN',
    'MANAGE_PLANNING_RULES',
    'MANAGE_PROMOTIONS',
    'VIEW_PRIORITIES',
    'MANAGE_PRIORITIES',
    'VIEW_WAREHOUSE_EXECUTION',
    'VIEW_INVENTORY',
    'VIEW_REPORTS',
    'VIEW_TV_DASHBOARD',
  ],
  WAREHOUSE_OPERATOR: [
    'VIEW_OVERVIEW',
    'VIEW_PRIORITIES',
    'VIEW_WAREHOUSE_EXECUTION',
    'UPDATE_WAREHOUSE_EXECUTION',
    'VIEW_INVENTORY',
    'VIEW_REPORTS',
    'VIEW_TV_DASHBOARD',
  ],
  VIEWER: [
    'VIEW_OVERVIEW',
    'VIEW_RECOMMENDATIONS',
    'VIEW_PRODUCTION_PLAN',
    'VIEW_PRIORITIES',
    'VIEW_WAREHOUSE_EXECUTION',
    'VIEW_INVENTORY',
    'VIEW_REPORTS',
    'VIEW_TV_DASHBOARD',
  ],
  DISPLAY: [
    'VIEW_TV_DASHBOARD',
  ],
};

export function hasPermission(role: UserRole | undefined, permission: Permission): boolean {
  if (!role) return false;
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
}

export function hasAnyPermission(role: UserRole | undefined, permissions: Permission[]): boolean {
  if (!role) return false;
  return permissions.some((perm) => hasPermission(role, perm));
}

export function hasAllPermissions(role: UserRole | undefined, permissions: Permission[]): boolean {
  if (!role) return false;
  return permissions.every((perm) => hasPermission(role, perm));
}

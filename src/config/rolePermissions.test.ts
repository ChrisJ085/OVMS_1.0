import { describe, it, expect } from 'vitest';
import {
  ROLE_PERMISSIONS,
  hasPermission,
  hasAllPermissions,
} from './rolePermissions';
import { UserRole } from '../types/auth';

describe('Role & Permission Security Tests', () => {
  it('1. Warehouse operator cannot access administration or planning routes', () => {
    const role: UserRole = 'WAREHOUSE_OPERATOR';

    expect(hasPermission(role, 'VIEW_ADMINISTRATION')).toBe(false);
    expect(hasPermission(role, 'MANAGE_USERS')).toBe(false);
    expect(hasPermission(role, 'MANAGE_CONFIGURATION')).toBe(false);
    expect(hasPermission(role, 'VIEW_AUDIT_LOG')).toBe(false);

    expect(hasPermission(role, 'VIEW_RECOMMENDATIONS')).toBe(false);
    expect(hasPermission(role, 'MANAGE_PLANNING_RULES')).toBe(false);
    expect(hasPermission(role, 'MANAGE_PROMOTIONS')).toBe(false);

    expect(hasPermission(role, 'VIEW_WAREHOUSE_EXECUTION')).toBe(true);
    expect(hasPermission(role, 'UPDATE_WAREHOUSE_EXECUTION')).toBe(true);
    expect(hasPermission(role, 'VIEW_PRIORITIES')).toBe(true);
    expect(hasPermission(role, 'VIEW_INVENTORY')).toBe(true);
  });

  it('2. Viewer cannot access planner editing or management routes', () => {
    const role: UserRole = 'VIEWER';

    expect(hasPermission(role, 'MANAGE_RECOMMENDATIONS')).toBe(false);
    expect(hasPermission(role, 'MANAGE_PLANNING_RULES')).toBe(false);
    expect(hasPermission(role, 'MANAGE_PROMOTIONS')).toBe(false);
    expect(hasPermission(role, 'IMPORT_PRODUCTION_PLAN')).toBe(false);
    expect(hasPermission(role, 'UPDATE_WAREHOUSE_EXECUTION')).toBe(false);
    expect(hasPermission(role, 'MANAGE_PRIORITIES')).toBe(false);

    expect(hasPermission(role, 'VIEW_WAREHOUSE_EXECUTION')).toBe(true);
    expect(hasPermission(role, 'VIEW_RECOMMENDATIONS')).toBe(true);
    expect(hasPermission(role, 'VIEW_PRODUCTION_PLAN')).toBe(true);
    expect(hasPermission(role, 'VIEW_PRIORITIES')).toBe(true);
  });

  it('3. Planner cannot access administration management routes', () => {
    const role: UserRole = 'PLANNER';

    expect(hasPermission(role, 'VIEW_ADMINISTRATION')).toBe(false);
    expect(hasPermission(role, 'MANAGE_USERS')).toBe(false);
    expect(hasPermission(role, 'MANAGE_CONFIGURATION')).toBe(false);
    expect(hasPermission(role, 'VIEW_AUDIT_LOG')).toBe(false);
    expect(hasPermission(role, 'UPDATE_WAREHOUSE_EXECUTION')).toBe(false);

    expect(hasPermission(role, 'VIEW_WAREHOUSE_EXECUTION')).toBe(true);
    expect(hasPermission(role, 'VIEW_RECOMMENDATIONS')).toBe(true);
    expect(hasPermission(role, 'MANAGE_PLANNING_RULES')).toBe(true);
    expect(hasPermission(role, 'IMPORT_PRODUCTION_PLAN')).toBe(true);
  });

  it('4. Display user can only access TV Dashboard and nothing else', () => {
    const role: UserRole = 'DISPLAY';

    expect(hasPermission(role, 'VIEW_TV_DASHBOARD')).toBe(true);

    expect(hasPermission(role, 'VIEW_OVERVIEW')).toBe(false);
    expect(hasPermission(role, 'VIEW_RECOMMENDATIONS')).toBe(false);
    expect(hasPermission(role, 'VIEW_PRODUCTION_PLAN')).toBe(false);
    expect(hasPermission(role, 'VIEW_PRIORITIES')).toBe(false);
    expect(hasPermission(role, 'VIEW_WAREHOUSE_EXECUTION')).toBe(false);
    expect(hasPermission(role, 'UPDATE_WAREHOUSE_EXECUTION')).toBe(false);
    expect(hasPermission(role, 'VIEW_INVENTORY')).toBe(false);
    expect(hasPermission(role, 'VIEW_REPORTS')).toBe(false);
    expect(hasPermission(role, 'VIEW_ADMINISTRATION')).toBe(false);
  });

  it('5. Superuser has full administrative and operational permissions', () => {
    const role: UserRole = 'PLATFORM_SUPERUSER';

    const allPermissions = ROLE_PERMISSIONS.PLATFORM_SUPERUSER;
    expect(hasAllPermissions(role, allPermissions)).toBe(true);
  });

  it('6. Tenant Admin has management permissions within tenant', () => {
    const role: UserRole = 'TENANT_ADMIN';

    expect(hasPermission(role, 'VIEW_ADMINISTRATION')).toBe(true);
    expect(hasPermission(role, 'MANAGE_USERS')).toBe(true);
    expect(hasPermission(role, 'MANAGE_CONFIGURATION')).toBe(true);
    expect(hasPermission(role, 'VIEW_AUDIT_LOG')).toBe(true);
  });
});

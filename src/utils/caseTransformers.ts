/**
 * Utility functions for converting keys between camelCase (TypeScript/UI) and snake_case (Supabase PostgreSQL).
 */

export function camelToSnakeKey(key: string): string {
  return key.replace(/([A-Z])/g, '_$1').toLowerCase();
}

export function snakeToCamelKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
}

export function toSnakeCase<T = Record<string, any>>(obj: any): T {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => toSnakeCase(item)) as unknown as T;
  }

  if (obj instanceof Date) {
    return obj as unknown as T;
  }

  const newObj: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      const snakeKey = camelToSnakeKey(key);
      newObj[snakeKey] = typeof value === 'object' && value !== null && !(value instanceof Date)
        ? toSnakeCase(value)
        : value;
    }
  }
  return newObj as T;
}

export function toCamelCase<T = Record<string, any>>(obj: any): T {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => toCamelCase(item)) as unknown as T;
  }

  if (obj instanceof Date) {
    return obj as unknown as T;
  }

  const newObj: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = snakeToCamelKey(key);
    newObj[camelKey] = typeof value === 'object' && value !== null && !(value instanceof Date)
      ? toCamelCase(value)
      : value;
  }
  return newObj as T;
}

/**
 * Collection/Table name mapping between legacy Firestore names and Supabase table names.
 */
export const TABLE_MAP: Record<string, string> = {
  users: 'users',
  tenants: 'tenants',
  sites: 'sites',
  userSites: 'user_sites',
  productionLines: 'production_lines',
  products: 'products',
  locations: 'locations',
  destinations: 'destinations',
  actionTypes: 'action_types',
  priorityLevels: 'priority_levels',
  balances: 'inventory_balances',
  inventory: 'inventory_balances',
  inventory_balances: 'inventory_balances',
  movements: 'inventory_movements',
  inventory_movements: 'inventory_movements',
  priorities: 'priorities',
  exceptions: 'exceptions',
  announcements: 'announcements',
  planningRules: 'planning_rules',
  planning_rules: 'planning_rules',
  productionPlanImports: 'production_plan_imports',
  production_plan_imports: 'production_plan_imports',
  productionPlanEntries: 'production_plan_entries',
  production_plan_entries: 'production_plan_entries',
  productionEvents: 'production_events',
  productionLinePlanNotes: 'production_events',
  production_events: 'production_events',
  promotions: 'promotions',
  recommendations: 'recommendations',
  northfleetStoRequirements: 'northfleet_sto_requirements',
  northfleet_sto_requirements: 'northfleet_sto_requirements',
  northfleetStoImports: 'northfleet_sto_imports',
  northfleet_sto_imports: 'northfleet_sto_imports',
  siteSettings: 'site_settings',
  site_settings: 'site_settings',
  siteOnboarding: 'site_onboarding',
  site_onboarding: 'site_onboarding',
  siteRecommendationRuns: 'recommendation_runs',
  site_recommendation_runs: 'recommendation_runs',
  recommendationRuns: 'recommendation_runs',
  recommendation_runs: 'recommendation_runs',
  auditLogs: 'audit_logs',
  audit_logs: 'audit_logs',
  tenantDeletionJobs: 'tenant_deletion_jobs',
  tenant_deletion_jobs: 'tenant_deletion_jobs',
  platformDeletionReceipts: 'platform_deletion_receipts',
  platform_deletion_receipts: 'platform_deletion_receipts',
  sessions: 'sessions'
};

export function getTableName(collectionName: string): string {
  return TABLE_MAP[collectionName] || camelToSnakeKey(collectionName);
}

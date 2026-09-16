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

  // Cross-populate common alias fields for complete frontend compatibility
  if (newObj.code && !newObj.lineCode) newObj.lineCode = newObj.code;
  if (newObj.lineCode && !newObj.code) newObj.code = newObj.lineCode;
  if (newObj.name && !newObj.lineName) newObj.lineName = newObj.name;
  if (newObj.lineName && !newObj.name) newObj.name = newObj.lineName;

  if (newObj.code && !newObj.siteCode) newObj.siteCode = newObj.code;
  if (newObj.siteCode && !newObj.code) newObj.code = newObj.siteCode;
  if (newObj.name && !newObj.siteName) newObj.siteName = newObj.name;
  if (newObj.siteName && !newObj.name) newObj.name = newObj.siteName;

  if (newObj.code && !newObj.destinationCode) newObj.destinationCode = newObj.code;
  if (newObj.destinationCode && !newObj.code) newObj.code = newObj.destinationCode;
  if (newObj.name && !newObj.destinationName) newObj.destinationName = newObj.name;
  if (newObj.destinationName && !newObj.name) newObj.name = newObj.destinationName;

  if (newObj.code && !newObj.areaCode) newObj.areaCode = newObj.code;
  if (newObj.areaCode && !newObj.code) newObj.code = newObj.areaCode;
  if (newObj.name && !newObj.areaName) newObj.areaName = newObj.name;
  if (newObj.areaName && !newObj.name) newObj.name = newObj.areaName;

  if (newObj.label && !newObj.name) newObj.name = newObj.label;
  if (newObj.name && !newObj.label) newObj.label = newObj.name;

  if (newObj.code && !newObj.productCode) newObj.productCode = newObj.code;
  if (newObj.productCode && !newObj.code) newObj.code = newObj.productCode;
  if (newObj.name && !newObj.description) newObj.description = newObj.name;
  if (newObj.description && !newObj.name) newObj.name = newObj.description;

  // Decision Configurations mappings
  if (newObj.version && !newObj.configurationVersion) {
    newObj.configurationVersion = newObj.version;
  }
  if (newObj.dataQualityRules && typeof newObj.dataQualityRules === 'object') {
    if (newObj.dataQualityRules.inventoryStalenessHoursThreshold !== undefined && newObj.inventoryStalenessHoursThreshold === undefined) {
      newObj.inventoryStalenessHoursThreshold = newObj.dataQualityRules.inventoryStalenessHoursThreshold;
    }
    if (newObj.dataQualityRules.productionStalenessHoursThreshold !== undefined && newObj.productionStalenessHoursThreshold === undefined) {
      newObj.productionStalenessHoursThreshold = newObj.dataQualityRules.productionStalenessHoursThreshold;
    }
    if (newObj.dataQualityRules.nearProductionDaysWindow !== undefined && newObj.nearProductionDaysWindow === undefined) {
      newObj.nearProductionDaysWindow = newObj.dataQualityRules.nearProductionDaysWindow;
    }
    if (newObj.dataQualityRules.capacityWarningThresholdPercentage !== undefined && newObj.capacityWarningThresholdPercentage === undefined) {
      newObj.capacityWarningThresholdPercentage = newObj.dataQualityRules.capacityWarningThresholdPercentage;
    }
    if (newObj.dataQualityRules.asPerScheduleActionId !== undefined && newObj.asPerScheduleActionId === undefined) {
      newObj.asPerScheduleActionId = newObj.dataQualityRules.asPerScheduleActionId;
    }
  }

  return newObj as T;
}

/**
 * Normalizes snake_case database payloads before inserting/updating to satisfy
 * PostgreSQL NOT NULL constraints across all known table column aliases.
 */
export function normalizeTablePayload(tableName: string, snakeObj: Record<string, any>): Record<string, any> {
  const result = { ...snakeObj };

  if (tableName === 'production_lines') {
    const code = result.code || result.line_code;
    const name = result.name || result.line_name;
    if (code !== undefined) {
      result.code = code;
      result.line_code = code;
    }
    if (name !== undefined) {
      result.name = name;
      result.line_name = name;
    }
  } else if (tableName === 'sites') {
    delete result.site_id;
    delete result.siteId;
    delete result.site;
    const code = result.code || result.site_code;
    const name = result.name || result.site_name;
    if (code !== undefined) {
      result.code = code;
      result.site_code = code;
    }
    if (name !== undefined) {
      result.name = name;
      result.site_name = name;
    }
  } else if (tableName === 'tenants') {
    delete result.site_id;
    delete result.siteId;
    delete result.site;
  } else if (tableName === 'users') {
    delete result.site_id;
    delete result.siteId;
    delete result.site;
  } else if (tableName === 'destinations') {
    const code = result.code || result.destination_code;
    const name = result.name || result.destination_name;
    if (code !== undefined) {
      result.code = code;
      result.destination_code = code;
    }
    if (name !== undefined) {
      result.name = name;
      result.destination_name = name;
    }
  } else if (tableName === 'storage_areas') {
    const code = result.code || result.area_code;
    const name = result.name || result.area_name;
    if (code !== undefined) {
      result.code = code;
      result.area_code = code;
    }
    if (name !== undefined) {
      result.name = name;
      result.area_name = name;
    }
  } else if (tableName === 'action_types') {
    const label = result.label || result.name;
    if (label !== undefined) {
      result.label = label;
      result.name = label;
    }
  } else if (tableName === 'priority_levels') {
    const label = result.label || result.name;
    if (label !== undefined) {
      result.label = label;
      result.name = label;
    }
    const weight = result.numeric_weight ?? result.level ?? result.weight ?? 1;
    result.numeric_weight = weight;
  } else if (tableName === 'products') {
    const code = result.code || result.product_code || result.sku_code;
    const name = result.name || result.description || result.product_name;
    if (code !== undefined) {
      result.code = code;
      result.product_code = code;
    }
    if (name !== undefined) {
      result.name = name;
      result.description = name;
    }
  } else if (tableName === 'units_of_measure') {
    const code = result.code;
    const name = result.name || result.description || result.label || code;
    if (name !== undefined) {
      result.name = name;
    }
  } else if (tableName === 'locations') {
    const code = result.code || result.location_code || result.code_snapshot;
    const name = result.name || result.location_name || code;
    if (code !== undefined) {
      result.code = code;
      result.location_code = code;
    }
    if (name !== undefined) {
      result.name = name;
      result.location_name = name;
    }
  } else if (tableName === 'decision_configurations') {
    // Ensure primary key text ID is populated
    if (!result.id && result.tenant_id && result.site_id) {
      result.id = `${result.tenant_id}_${result.site_id}`;
    }

    // Map configurationVersion -> version
    if (result.configuration_version !== undefined) {
      result.version = result.version || result.configuration_version;
      delete result.configuration_version;
    }
    // Extract thresholds and extra rules into data_quality_rules JSONB
    const dataQualityRules = typeof result.data_quality_rules === 'object' && result.data_quality_rules !== null
      ? { ...result.data_quality_rules }
      : {};

    if (result.inventory_staleness_hours_threshold !== undefined) {
      dataQualityRules.inventoryStalenessHoursThreshold = result.inventory_staleness_hours_threshold;
      delete result.inventory_staleness_hours_threshold;
    }
    if (result.production_staleness_hours_threshold !== undefined) {
      dataQualityRules.productionStalenessHoursThreshold = result.production_staleness_hours_threshold;
      delete result.production_staleness_hours_threshold;
    }
    if (result.near_production_days_window !== undefined) {
      dataQualityRules.nearProductionDaysWindow = result.near_production_days_window;
      delete result.near_production_days_window;
    }
    if (result.capacity_warning_threshold_percentage !== undefined) {
      dataQualityRules.capacityWarningThresholdPercentage = result.capacity_warning_threshold_percentage;
      delete result.capacity_warning_threshold_percentage;
    }
    if (result.as_per_schedule_action_id !== undefined) {
      dataQualityRules.asPerScheduleActionId = result.as_per_schedule_action_id;
      delete result.as_per_schedule_action_id;
    }

    // Clean up any other virtual fields
    delete result.valid_action_ids;
    delete result.valid_priority_ids;
    delete result.valid_destination_ids;
    delete result.inactive_action_ids;
    delete result.inactive_priority_ids;
    delete result.inactive_destination_ids;

    result.data_quality_rules = dataQualityRules;
  } else if (tableName === 'recommendation_runs') {
    if (!result.id && result.tenant_id && result.site_id) {
      result.id = `${result.tenant_id}_${result.site_id}`;
    }
  } else if (tableName === 'production_plan_imports') {
    if (result.file_size !== undefined && result.file_size_bytes === undefined) {
      result.file_size_bytes = Number(result.file_size) || 0;
    }
    if (result.file_size_bytes !== undefined && result.file_size === undefined) {
      result.file_size = result.file_size_bytes;
    }
    if (result.period_start && !result.plan_start_date) {
      result.plan_start_date = typeof result.period_start === 'string' ? result.period_start.split('T')[0] : result.period_start;
    }
    if (result.period_end && !result.plan_end_date) {
      result.plan_end_date = typeof result.period_end === 'string' ? result.period_end.split('T')[0] : result.period_end;
    }
    if (Array.isArray(result.detected_worksheet_names)) {
      result.detected_worksheet_names = JSON.stringify(result.detected_worksheet_names);
    }
  } else if (tableName === 'production_plan_entries') {
    if (result.planned_cases !== undefined && result.planned_cases !== null) {
      result.planned_cases = Math.round(Number(result.planned_cases)) || 0;
    }
    if (result.cases_per_pallet !== undefined && result.cases_per_pallet !== null) {
      result.cases_per_pallet = Math.round(Number(result.cases_per_pallet)) || 0;
    }
    if (result.planned_pallets !== undefined && result.planned_pallets !== null) {
      result.planned_pallets = Math.round(Number(result.planned_pallets)) || 0;
    }
    if (result.source_row_number !== undefined && result.source_row_number !== null) {
      result.source_row_number = Number(result.source_row_number) || 0;
    }
  }

  // Sanitize invalid non-UUID foreign key fields ending in _id (e.g. 'default', '', 'general') to null
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const [key, val] of Object.entries(result)) {
    if (key.endsWith('_id') && key !== 'id' && key !== 'tenant_id' && key !== 'site_id') {
      if (val !== undefined && val !== null && typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed === '' || trimmed.toLowerCase() === 'default' || trimmed.toLowerCase() === 'general' || trimmed.toLowerCase() === 'none' || !UUID_REGEX.test(trimmed)) {
          result[key] = null;
        }
      }
    }
  }

  return result;
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
  decisionConfigurations: 'decision_configurations',
  decision_configurations: 'decision_configurations',
  priorityEvents: 'priority_events',
  priority_events: 'priority_events',
  productCategories: 'product_categories',
  product_categories: 'product_categories',
  storageAreas: 'storage_areas',
  storage_areas: 'storage_areas',
  unitsOfMeasure: 'units_of_measure',
  units_of_measure: 'units_of_measure',
  promotionProductRules: 'promotion_product_rules',
  promotion_product_rules: 'promotion_product_rules',
  auditLogs: 'audit_logs',
  audit_logs: 'audit_logs',
  tenantDeletionJobs: 'tenant_deletion_jobs',
  tenant_deletion_jobs: 'tenant_deletion_jobs',
  platformDeletionReceipts: 'platform_deletion_receipts',
  platform_deletion_receipts: 'platform_deletion_receipts',
  sessions: 'sessions'
};

export function getTableName(collectionName: string): string {
  if (TABLE_MAP[collectionName]) {
    return TABLE_MAP[collectionName];
  }

  // Gracefully handle subcollection-style paths like 'productionPlanImports/.../rows'
  if (collectionName.includes('/')) {
    const parts = collectionName.split('/').filter(Boolean);
    const lastPart = parts[parts.length - 1];
    if (lastPart === 'rows' && parts[0].toLowerCase().includes('production')) {
      return 'production_plan_entries';
    }
    return TABLE_MAP[lastPart] || camelToSnakeKey(lastPart);
  }

  return camelToSnakeKey(collectionName);
}

import { supabase } from '../config/supabase';
import { getTableName } from '../utils/caseTransformers';

export const isRequired = (value: string | undefined | null): boolean => {
  if (value === undefined || value === null) return false;
  return value.trim().length > 0;
};

export const trimCode = (value: string): string => {
  return value ? value.trim().toUpperCase() : '';
};

export const trimDescription = (value: string): string => {
  return value ? value.trim() : '';
};

export const isNonNegative = (value: number | undefined | null): boolean => {
  if (value === undefined || value === null) return false;
  return value >= 0;
};

export const isValidStockRange = (minimum: number, target: number, maximum: number): boolean => {
  return minimum >= 0 && minimum <= target && target <= maximum;
};

export const isValidEffectiveDateRange = (startDate: Date, endDate: Date | null): boolean => {
  if (!endDate) return true;
  return startDate <= endDate;
};

export const isValidDateRange = (startDate: Date, expiryDate: Date): boolean => {
  return startDate <= expiryDate;
};

export const isUniqueCode = async (
  collectionName: string,
  tenantId: string,
  siteId: string,
  codeField: string,
  codeValue: string,
  excludeId?: string
): Promise<boolean> => {
  const tableName = getTableName(collectionName);
  const snakeCodeField = codeField.replace(/([A-Z])/g, '_$1').toLowerCase();
  
  let dbQuery = supabase
    .from(tableName)
    .select('id')
    .eq('tenant_id', tenantId)
    .eq(snakeCodeField, codeValue);

  if (siteId && siteId !== 'GLOBAL') {
    dbQuery = dbQuery.eq('site_id', siteId);
  }

  const { data, error } = await dbQuery;
  if (error) {
    console.error(`[isUniqueCode] Error querying table ${tableName}:`, error);
    throw error;
  }

  if (!data || data.length === 0) return true;

  if (excludeId) {
    const filtered = data.filter((row: any) => row.id !== excludeId);
    return filtered.length === 0;
  }

  return false;
};

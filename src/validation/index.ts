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
    // If the error is specifically "column ... does not exist" (Postgres code 42703),
    // it likely means the table doesn't have a site_id column.
    // In this case, we should log a warning instead of crashing, and treat it 
    // as "not found" (or let the caller handle it based on requirements).
    // Given the user wants to check for duplicates, we should return false 
    // if we can't perform the site-scoped check safely.
    if (error.code === '42703') {
      console.warn(`[isUniqueCode] Table ${tableName} does not support site-scoped filtering (missing site_id). Falling back to global check.`);
      // If we can't filter by site, re-run query without the site filter.
      let globalQuery = supabase
        .from(tableName)
        .select('id')
        .eq('tenant_id', tenantId)
        .eq(snakeCodeField, codeValue);
      
      const { data: globalData, error: globalError } = await globalQuery;
      if (globalError) {
        console.error(`[isUniqueCode] Error in global query for ${tableName}:`, globalError);
        throw globalError;
      }
      return !globalData || globalData.length === 0;
    }
    
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

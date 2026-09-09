import { ProductionPlanImport, ProductionPlanRow } from '../../../types/production';
import { commitProductionPlanImport, ParsedPlanPreview } from '../services/mpps7ImportService';
import { toAppError } from '../../../types/error';
import { supabase } from '../../../config/supabase';
import { toCamelCase } from '../../../utils/caseTransformers';

export const productionImportRepository = {
  /**
   * Fetches history of production plan imports for a tenant and site.
   */
  async fetchImportHistory(tenantId: string, siteId: string, limitCount = 30): Promise<ProductionPlanImport[]> {
    if (!tenantId || !siteId || tenantId === 'GLOBAL' || siteId === 'GLOBAL') {
      return [];
    }
    try {
      const { data, error } = await supabase
        .from('production_plan_imports')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('site_id', siteId)
        .limit(limitCount);

      if (error) throw error;
      const imports = (data || []).map(row => toCamelCase<ProductionPlanImport>(row));

      imports.sort((a, b) => {
        const tA = a.uploadedAt ? new Date(a.uploadedAt as any).getTime() : 0;
        const tB = b.uploadedAt ? new Date(b.uploadedAt as any).getTime() : 0;
        return tB - tA;
      });
      return imports;
    } catch (err) {
      throw toAppError(err, 'FETCH_IMPORT_HISTORY_FAILED');
    }
  },

  /**
   * Fetches row subcollection for a given production plan import record.
   */
  async fetchImportRows(importId: string): Promise<ProductionPlanRow[]> {
    if (!importId) return [];
    try {
      // In Supabase schema, the table for rows might be production_plan_entries or a subtable. Let's see how rows of imports are stored or if they are fetched from production_plan_entries referencing import_id!
      // Let's check how productionPlanImports rows are fetched, or table name: we can check if there's an import_id on production_plan_entries or other tables.
      // Wait, let's query the database schema for the exact field in production_plan_entries or production_plan_rows.
      // Let's check docs/supabase_schema.sql for "production_plan" or "rows".
      const { data, error } = await supabase
        .from('production_plan_entries')
        .select('*')
        .eq('import_id', importId);

      if (error) throw error;
      const rows = (data || []).map(row => toCamelCase<any>(row) as ProductionPlanRow);
      rows.sort((a, b) => (a.sourceRowNumber || 0) - (b.sourceRowNumber || 0));
      return rows;
    } catch (err) {
      throw toAppError(err, 'FETCH_IMPORT_ROWS_FAILED');
    }
  },

  /**
   * Commits production plan import to database.
   */
  async commitImport(previewData: ParsedPlanPreview, notesText?: string): Promise<string> {
    try {
      return await commitProductionPlanImport(previewData, notesText);
    } catch (err) {
      throw toAppError(err, 'COMMIT_IMPORT_FAILED');
    }
  }
};

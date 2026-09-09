import { ProductionPlanEntry } from '../../../types/production';
import { toAppError } from '../../../types/error';
import { toEpochMillis } from '../../../utils/timeFormatters';
import { supabase } from '../../../config/supabase';
import { toCamelCase } from '../../../utils/caseTransformers';

export interface FetchPlanEntriesParams {
  tenantId: string;
  siteId: string;
  weekStart: Date;
}

export const productionPlanRepository = {
  /**
   * Fetches production plan entries for a given tenant, site, and week start range.
   */
  async fetchPlanEntries({ tenantId, siteId, weekStart }: FetchPlanEntriesParams): Promise<ProductionPlanEntry[]> {
    if (!tenantId || !siteId || tenantId === 'GLOBAL' || siteId === 'GLOBAL') {
      return [];
    }
    try {
      const startMs = weekStart.getTime() - 24 * 60 * 60 * 1000;
      const endMs = weekStart.getTime() + 8 * 24 * 60 * 60 * 1000;

      const { data, error } = await supabase
        .from('production_plan_entries')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('site_id', siteId);

      if (error) throw error;
      const allFetched = (data || []).map(row => toCamelCase<ProductionPlanEntry>(row));
      
      return allFetched.filter(entry => {
        if (!entry.productionDate) return false;
        const pMillis = toEpochMillis(entry.productionDate);
        return pMillis !== null && pMillis >= startMs && pMillis < endMs;
      });
    } catch (err) {
      throw toAppError(err, 'FETCH_PLAN_ENTRIES_FAILED');
    }
  }
};

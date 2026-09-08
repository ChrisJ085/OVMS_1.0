import { ProductionPlanEntry } from '../../../types/production';
import { toAppError } from '../../../types/error';
import { toEpochMillis } from '../../../utils/timeFormatters';
import { Timestamp, collection, db, getDocs, query, where } from '../../../services/firestoreBase';

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
    if (!db) return [];
    try {
      const startMs = weekStart.getTime() - 24 * 60 * 60 * 1000;
      const endMs = weekStart.getTime() + 8 * 24 * 60 * 60 * 1000;

      const entriesRef = collection(db, 'productionPlanEntries');
      const q = query(
        entriesRef,
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId)
      );
      const snap = await getDocs(q);
      const allFetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as any as ProductionPlanEntry));
      
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

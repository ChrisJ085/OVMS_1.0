import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { ProductionPlanEntry } from '../../../types/production';
import { toAppError } from '../../../types/error';

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
      const startTimestamp = Timestamp.fromDate(new Date(weekStart.getTime() - 24 * 60 * 60 * 1000));
      const endWeek = new Date(weekStart.getTime() + 8 * 24 * 60 * 60 * 1000);
      const endTimestamp = Timestamp.fromDate(endWeek);

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
        const pMillis = entry.productionDate.toMillis();
        return pMillis >= startTimestamp.toMillis() && pMillis < endTimestamp.toMillis();
      });
    } catch (err) {
      throw toAppError(err, 'FETCH_PLAN_ENTRIES_FAILED');
    }
  }
};

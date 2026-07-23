import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { ProductionPlanImport, ProductionPlanRow } from '../../../types/production';
import { commitProductionPlanImport, ParsedPlanPreview } from '../services/mpps7ImportService';
import { toAppError } from '../../../types/error';

export const productionImportRepository = {
  /**
   * Fetches history of production plan imports for a tenant and site.
   */
  async fetchImportHistory(tenantId: string, siteId: string, limitCount = 30): Promise<ProductionPlanImport[]> {
    if (!db) return [];
    try {
      const importsRef = collection(db, 'productionPlanImports');
      const q = query(
        importsRef,
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        orderBy('uploadedAt', 'desc'),
        limit(limitCount)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductionPlanImport));
    } catch (err) {
      throw toAppError(err, 'FETCH_IMPORT_HISTORY_FAILED');
    }
  },

  /**
   * Fetches row subcollection for a given production plan import record.
   */
  async fetchImportRows(importId: string): Promise<ProductionPlanRow[]> {
    if (!db || !importId) return [];
    try {
      const rowsRef = collection(db, `productionPlanImports/${importId}/rows`);
      const snap = await getDocs(rowsRef);
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as any as ProductionPlanRow));
      rows.sort((a, b) => a.sourceRowNumber - b.sourceRowNumber);
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

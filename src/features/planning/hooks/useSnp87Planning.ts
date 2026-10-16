import { useState, useEffect, useCallback } from 'react';
import { 
  Snp87PlanningImport, 
  Snp87PlanningRow 
} from '../../../types/snp87';
import { 
  getActiveSnp87Snapshot, 
  getSnp87Imports, 
  subscribeToSnp87Imports 
} from '../services/snp87ImportService';

export function useSnp87Planning(tenantId: string, siteId: string) {
  const [activeSnapshot, setActiveSnapshot] = useState<Snp87PlanningImport | null>(null);
  const [activeRows, setActiveRows] = useState<Snp87PlanningRow[]>([]);
  const [snapshotLoading, setSnapshotLoading] = useState<boolean>(true);

  const [historyImports, setHistoryImports] = useState<Snp87PlanningImport[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(true);

  // Load Active Snapshot
  const refreshActiveSnapshot = useCallback(async () => {
    if (!tenantId || !siteId) return;
    setSnapshotLoading(true);
    try {
      const res = await getActiveSnp87Snapshot(tenantId, siteId);
      setActiveSnapshot(res.importSummary);
      setActiveRows(res.rows);
    } catch (err) {
      console.error('Error fetching active SNP87 snapshot:', err);
    } finally {
      setSnapshotLoading(false);
    }
  }, [tenantId, siteId]);

  // Load Import History
  const refreshHistory = useCallback(async () => {
    if (!tenantId || !siteId) return;
    setHistoryLoading(true);
    try {
      const imports = await getSnp87Imports(tenantId, siteId);
      setHistoryImports(imports);
    } catch (err) {
      console.error('Error fetching SNP87 import history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [tenantId, siteId]);

  useEffect(() => {
    refreshActiveSnapshot();
    refreshHistory();

    // Subscribe to imports changes
    const unsub = subscribeToSnp87Imports(
      tenantId,
      siteId,
      (imports) => {
        setHistoryImports(imports);
        // If the active snapshot changed, refresh active snapshot
        const active = imports.find(imp => imp.importStatus === 'COMMITTED');
        if (active) {
          refreshActiveSnapshot();
        }
      },
      (err) => console.warn('Realtime subscription error for SNP87 imports:', err)
    );

    return () => {
      unsub();
    };
  }, [tenantId, siteId, refreshActiveSnapshot, refreshHistory]);

  return {
    activeSnapshot,
    activeRows,
    snapshotLoading,
    historyImports,
    historyLoading,
    refreshActiveSnapshot,
    refreshHistory
  };
}

import { useState, useEffect, useCallback } from 'react';
import { ProductionPlanImport, ProductionPlanRow } from '../../../types/production';
import { productionImportRepository } from '../repositories/productionImportRepository';

export function useProductionImportHistory(tenantId: string, siteId: string, enabled = true) {
  const [historyImports, setHistoryImports] = useState<ProductionPlanImport[]>([]);
  const [selectedHistoryImport, setSelectedHistoryImport] = useState<ProductionPlanImport | null>(null);
  const [historyRows, setHistoryRows] = useState<ProductionPlanRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [loadingHistoryDetails, setLoadingHistoryDetails] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!enabled || !tenantId || !siteId) return;
    setLoadingHistory(true);
    setError(null);
    try {
      const fetched = await productionImportRepository.fetchImportHistory(tenantId, siteId);
      setHistoryImports(fetched);
      setLoadingHistory(false);
    } catch (err: any) {
      console.error('Failed to load history:', err);
      setError(err.message || 'Failed to load import history');
      setLoadingHistory(false);
    }
  }, [tenantId, siteId, enabled]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Load details for selected history import
  useEffect(() => {
    if (!selectedHistoryImport) {
      setHistoryRows([]);
      return;
    }
    const fetchRows = async () => {
      setLoadingHistoryDetails(true);
      try {
        const rows = await productionImportRepository.fetchImportRows(selectedHistoryImport.id);
        setHistoryRows(rows);
        setLoadingHistoryDetails(false);
      } catch (err: any) {
        console.error('Failed to load history rows:', err);
        setLoadingHistoryDetails(false);
      }
    };
    fetchRows();
  }, [selectedHistoryImport]);

  return {
    historyImports,
    selectedHistoryImport,
    historyRows,
    loadingHistory,
    loadingHistoryDetails,
    error,
    setSelectedHistoryImport,
    refreshHistory: fetchHistory
  };
}

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ProductionPlanEntry, ProductionLinePlanNote } from '../../../types/production';
import { productionPlanRepository } from '../repositories/productionPlanRepository';
import { productionNotesRepository } from '../repositories/productionNotesRepository';
import { Timestamp } from '../../../services/supabaseBase';

export function useCurrentProductionPlan(tenantId: string, siteId: string, enabled = true) {
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const today = new Date();
    const day = today.getDay(); // 0 is Sunday
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Monday start
    return new Date(Date.UTC(today.getFullYear(), today.getMonth(), diff, 0, 0, 0, 0));
  });

  const [activeEntries, setActiveEntries] = useState<ProductionPlanEntry[]>([]);
  const [gridNotes, setGridNotes] = useState<ProductionLinePlanNote[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const gridDates = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(currentWeekStart);
      d.setUTCDate(currentWeekStart.getUTCDate() + i);
      return d;
    });
  }, [currentWeekStart]);

  const loadPlanData = useCallback(async () => {
    if (!enabled || !tenantId || !siteId) return;
    setLoading(true);
    setError(null);
    try {
      const entries = await productionPlanRepository.fetchPlanEntries({ tenantId, siteId, weekStart: currentWeekStart });
      setActiveEntries(entries);

      const startTimestamp = Timestamp.fromDate(new Date(currentWeekStart.getTime() - 24 * 60 * 60 * 1000));
      const endWeek = new Date(currentWeekStart.getTime() + 8 * 24 * 60 * 60 * 1000);
      const endTimestamp = Timestamp.fromDate(endWeek);

      const notes = await productionNotesRepository.fetchGridNotes(tenantId, siteId, startTimestamp, endTimestamp);
      setGridNotes(notes);
      setLoading(false);
    } catch (err: any) {
      console.error('Failed to load current plan entries:', err);
      setError(err.message || 'Failed to load plan entries');
      setLoading(false);
    }
  }, [tenantId, siteId, currentWeekStart, enabled]);

  useEffect(() => {
    loadPlanData();
  }, [loadPlanData]);

  const nextWeek = () => {
    const d = new Date(currentWeekStart);
    d.setUTCDate(d.getUTCDate() + 7);
    setCurrentWeekStart(d);
  };

  const prevWeek = () => {
    const d = new Date(currentWeekStart);
    d.setUTCDate(d.getUTCDate() - 7);
    setCurrentWeekStart(d);
  };

  const resetToCurrentWeek = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    setCurrentWeekStart(new Date(Date.UTC(today.getFullYear(), today.getMonth(), diff, 0, 0, 0, 0)));
  };

  return {
    currentWeekStart,
    gridDates,
    activeEntries,
    gridNotes,
    loading,
    error,
    nextWeek,
    prevWeek,
    resetToCurrentWeek,
    refreshPlan: loadPlanData
  };
}

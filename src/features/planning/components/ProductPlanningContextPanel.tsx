import React, { useEffect, useState } from 'react';
import { Calendar, FileSpreadsheet, CheckCircle2, AlertTriangle, AlertCircle, Clock } from 'lucide-react';
import { ProductPlanningContext } from '../../../types/snp87';
import { getProductPlanningContext } from '../services/snp87PlanningContextService';
import { useSiteContext } from '../../../contexts/SiteContext';
import { LoadingState } from '../../../components/ui/States';

interface ProductPlanningContextPanelProps {
  productId: string;
  productCode?: string;
  evaluationDate?: Date | string;
}

export const ProductPlanningContextPanel: React.FC<ProductPlanningContextPanelProps> = ({
  productId,
  productCode,
  evaluationDate
}) => {
  const { tenantId, siteId } = useSiteContext();
  const [context, setContext] = useState<ProductPlanningContext | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchContext = async () => {
      setLoading(true);
      try {
        const result = await getProductPlanningContext(tenantId, siteId, productId, productCode, evaluationDate);
        if (isMounted) {
          setContext(result);
        }
      } catch (err) {
        console.error('Failed to load SNP87 planning context:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchContext();
    return () => { isMounted = false; };
  }, [tenantId, siteId, productId, productCode, evaluationDate]);

  if (loading) {
    return <div className="h-24"><LoadingState message="Loading SAP planning context..." /></div>;
  }

  if (!context) {
    return null;
  }

  const getFreshnessBadge = () => {
    if (context.dataFreshnessStatus === 'FRESH') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
          <CheckCircle2 className="w-3 h-3" />
          Fresh (SNP87)
        </span>
      );
    }
    if (context.dataFreshnessStatus === 'STALE') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950 text-amber-400 border border-amber-800">
          <AlertTriangle className="w-3 h-3" />
          Stale Source
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-red-950 text-red-400 border border-red-800">
        <AlertCircle className="w-3 h-3" />
        No Planning Snapshot
      </span>
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
          SAP Planning Context (SNP87)
        </h3>
        {getFreshnessBadge()}
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        {/* FORECAST */}
        <div className="p-3 bg-slate-950/60 rounded-lg border border-sky-900/40">
          <span className="text-[11px] text-sky-400 font-semibold block mb-1">
            Forecast Demand ({context.baseUnitOfMeasure})
          </span>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Today:</span>
              <span className="font-mono font-bold text-slate-100">
                {context.forecastCasesToday.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Next 7 Days (D0–D6):</span>
              <span className="font-mono font-bold text-sky-300">
                {context.forecastCasesNext7Days.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* CONFIRMED PRODUCTION */}
        <div className="p-3 bg-slate-950/60 rounded-lg border border-emerald-900/40">
          <span className="text-[11px] text-emerald-400 font-semibold block mb-1">
            Confirmed Production ({context.baseUnitOfMeasure})
          </span>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Today:</span>
              <span className="font-mono font-bold text-slate-100">
                {context.confirmedProductionCasesToday.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Next 7 Days:</span>
              <span className="font-mono font-bold text-emerald-300">
                {context.confirmedProductionCasesNext7Days.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Snapshot Source Info */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
        <span>Source: {context.sourceReportName || 'No Active Snapshot'}</span>
        <span>7-Day Window: {context.sevenDayWindow.startDate} → {context.sevenDayWindow.endDate}</span>
      </div>
    </div>
  );
};

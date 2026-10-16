import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  Calendar, 
  Package, 
  Search, 
  Layers, 
  CheckCircle2, 
  ArrowUpDown,
  FileSpreadsheet,
  Target
} from 'lucide-react';
import { Snp87PlanningRow, Snp87PlanningImport, ProductForecastWeeklyPlan } from '../../../../types/snp87';
import { Product } from '../../../../types/product';
import { computeWeeklyForecastPlan } from '../../services/snp87ImportService';

interface ForecastWeeklyPlanViewProps {
  rows: Snp87PlanningRow[];
  activeSnapshot?: Snp87PlanningImport | null;
  products?: Product[];
  className?: string;
}

export const ForecastWeeklyPlanView: React.FC<ForecastWeeklyPlanViewProps> = ({
  rows,
  activeSnapshot,
  products = [],
  className = ''
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<'productCode' | 'totalForecastCases' | 'palletEquivalent' | 'horizonDate'>('totalForecastCases');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Compute SumProduct for each Product
  const weeklyPlans = useMemo(() => {
    return computeWeeklyForecastPlan(rows, products);
  }, [rows, products]);

  // Aggregate totals
  const totalForecastCases = useMemo(() => {
    return weeklyPlans.reduce((sum, p) => sum + p.totalForecastCases, 0);
  }, [weeklyPlans]);

  const totalForecastPallets = useMemo(() => {
    return Math.round(weeklyPlans.reduce((sum, p) => sum + p.palletEquivalent, 0) * 10) / 10;
  }, [weeklyPlans]);

  const targetHorizonDate = useMemo(() => {
    if (weeklyPlans.length > 0 && weeklyPlans[0].horizonDate) {
      return weeklyPlans[0].horizonDate;
    }
    return activeSnapshot?.importPeriod?.startDate || 'Weekly Horizon';
  }, [weeklyPlans, activeSnapshot]);

  // Filtered and sorted list
  const filteredPlans = useMemo(() => {
    return weeklyPlans.filter(p => {
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      return (
        p.productCode.toLowerCase().includes(q) ||
        p.productDescription.toLowerCase().includes(q) ||
        (p.orderSku && p.orderSku.toLowerCase().includes(q))
      );
    }).sort((a, b) => {
      if (sortField === 'productCode') {
        return sortAsc ? a.productCode.localeCompare(b.productCode) : b.productCode.localeCompare(a.productCode);
      }
      if (sortField === 'totalForecastCases') {
        return sortAsc ? a.totalForecastCases - b.totalForecastCases : b.totalForecastCases - a.totalForecastCases;
      }
      if (sortField === 'palletEquivalent') {
        return sortAsc ? a.palletEquivalent - b.palletEquivalent : b.palletEquivalent - a.palletEquivalent;
      }
      if (sortField === 'horizonDate') {
        return sortAsc ? a.horizonDate.localeCompare(b.horizonDate) : b.horizonDate.localeCompare(a.horizonDate);
      }
      return 0;
    });
  }, [weeklyPlans, searchTerm, sortField, sortAsc]);

  if (weeklyPlans.length === 0) {
    return (
      <div className={`p-8 rounded-xl bg-slate-900/60 border border-slate-800 text-center ${className}`}>
        <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 mx-auto mb-3">
          <TrendingUp className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-semibold text-slate-200">No Forecast Demand Rows</h4>
        <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
          No SAP SNP87 Forecast records (9ADFCST) were found in the active planning snapshot.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header and KPI summary */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-950/90 border border-sky-600/40 flex items-center justify-center text-sky-400">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-100">
                  Weekly Forecast Plan (SumProduct by Product)
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">
                  Weekly Plan Target
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Aggregated forecast sumproduct using horizon date <strong className="text-sky-300 font-mono">{targetHorizonDate}</strong> as the weekly plan to work towards.
              </p>
            </div>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
          <div className="p-3 rounded-lg bg-slate-950/70 border border-sky-900/40">
            <span className="text-[11px] text-sky-400 font-medium">Weekly Forecast Demand</span>
            <div className="text-2xl font-bold text-sky-300 mt-0.5">
              {totalForecastCases.toLocaleString()} <span className="text-xs font-normal text-slate-400">CS</span>
            </div>
            <span className="text-[10px] text-slate-500">SumProduct across horizon</span>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800/80">
            <span className="text-[11px] text-slate-400 font-medium">Pallet Equivalent</span>
            <div className="text-2xl font-bold text-slate-100 mt-0.5">
              ~{totalForecastPallets.toLocaleString()} <span className="text-xs font-normal text-slate-400">PAL</span>
            </div>
            <span className="text-[10px] text-slate-500">Converted by cases/pallet</span>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800/80">
            <span className="text-[11px] text-slate-400 font-medium">Distinct Products</span>
            <div className="text-2xl font-bold text-slate-100 mt-0.5">{weeklyPlans.length}</div>
            <span className="text-[10px] text-slate-500">Active SKUs planned</span>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800/80">
            <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
              <Calendar className="w-3 h-3 text-sky-400" />
              Target Horizon Date
            </span>
            <div className="text-sm sm:text-base font-bold text-sky-300 mt-1 font-mono">
              {targetHorizonDate}
            </div>
            <span className="text-[10px] text-slate-500">Weekly baseline target</span>
          </div>
        </div>
      </div>

      {/* Search and Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-3 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/40">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search product code or description..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 w-full"
            />
          </div>
          <span className="text-xs text-slate-400">
            Showing {filteredPlans.length} of {weeklyPlans.length} products
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/90 text-slate-400 uppercase tracking-wider border-b border-slate-800 text-[11px] font-semibold">
              <tr>
                <th 
                  className="px-4 py-3 cursor-pointer hover:text-slate-200"
                  onClick={() => {
                    if (sortField === 'productCode') setSortAsc(!sortAsc);
                    else { setSortField('productCode'); setSortAsc(true); }
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    Product Code
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>
                <th className="px-4 py-3">Product Description</th>
                <th 
                  className="px-4 py-3 cursor-pointer hover:text-slate-200"
                  onClick={() => {
                    if (sortField === 'horizonDate') setSortAsc(!sortAsc);
                    else { setSortField('horizonDate'); setSortAsc(true); }
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    Horizon Date (Weekly Plan)
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-right cursor-pointer hover:text-slate-200"
                  onClick={() => {
                    if (sortField === 'totalForecastCases') setSortAsc(!sortAsc);
                    else { setSortField('totalForecastCases'); setSortAsc(false); }
                  }}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    SumProduct Cases (CS)
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-right cursor-pointer hover:text-slate-200"
                  onClick={() => {
                    if (sortField === 'palletEquivalent') setSortAsc(!sortAsc);
                    else { setSortField('palletEquivalent'); setSortAsc(false); }
                  }}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    Pallets Equivalent
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>
                <th className="px-4 py-3 text-center">Interval Entries</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filteredPlans.map(plan => {
                const sharePct = totalForecastCases > 0 ? (plan.totalForecastCases / totalForecastCases) * 100 : 0;

                return (
                  <tr key={plan.productCode} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-sky-300">
                      {plan.productCode}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-200">{plan.productDescription}</div>
                      {plan.orderSku && plan.orderSku !== plan.productCode && (
                        <div className="text-[10px] text-slate-500">SKU: {plan.orderSku}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-300">
                      <span className="px-2 py-0.5 rounded bg-sky-950/60 border border-sky-800/60 text-sky-300 text-[11px] font-semibold">
                        {plan.horizonDate || targetHorizonDate}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-bold text-slate-100">
                        {plan.totalForecastCases.toLocaleString()} {plan.baseUnitOfMeasure}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {sharePct.toFixed(1)}% of weekly plan
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">
                      {plan.palletEquivalent > 0 ? `${plan.palletEquivalent} PAL` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-400 font-mono">
                      {plan.rowCount}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-950 text-sky-400 border border-sky-800/60">
                        <CheckCircle2 className="w-3 h-3" />
                        Target Active
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

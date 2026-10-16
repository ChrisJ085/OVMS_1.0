import React, { useState, useMemo } from 'react';
import { 
  Upload, 
  Calendar, 
  Layers, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Filter, 
  FileSpreadsheet, 
  RefreshCw,
  Clock,
  User,
  ArrowUpDown,
  Target,
  Factory,
  Boxes,
  X
} from 'lucide-react';
import { Snp87PlanningImport, Snp87PlanningRow, getNormalizedPlanningType } from '../../../../types/snp87';
import { Product } from '../../../../types/product';
import { areProductCodesEqual } from '../../../../utils/productCodeNormalizer';
import { ConfirmedProductionVisual } from './ConfirmedProductionVisual';
import { ForecastWeeklyPlanView } from './ForecastWeeklyPlanView';

interface Snp87CurrentSnapshotViewProps {
  activeSnapshot: Snp87PlanningImport | null;
  rows: Snp87PlanningRow[];
  loading: boolean;
  onNavigateToImport: () => void;
  onRefresh: () => void;
  products?: Product[];
}

export const Snp87CurrentSnapshotView: React.FC<Snp87CurrentSnapshotViewProps> = ({
  activeSnapshot,
  rows,
  loading,
  onNavigateToImport,
  onRefresh,
  products = []
}) => {
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'FORECAST' | 'CONFIRMED_PRODUCTION'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWeeks, setSelectedWeeks] = useState<string[]>([]);
  const [isWeekDropdownOpen, setIsWeekDropdownOpen] = useState(false);
  const [sortField, setSortField] = useState<'planningDate' | 'productNumber' | 'quantity'>('planningDate');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [forecastViewMode, setForecastViewMode] = useState<'WEEKLY_PLAN' | 'ROWS'>('WEEKLY_PLAN');
  
  // Unit preference for users working in cases, pallets, or both
  const [quantityUnit, setQuantityUnit] = useState<'BOTH' | 'CASES' | 'PALLETS'>('BOTH');

  // Compute dynamic counts based on normalized planning type
  const forecastCount = useMemo(() => {
    const direct = rows.filter(r => getNormalizedPlanningType(r) === 'FORECAST').length;
    return direct > 0 ? direct : (activeSnapshot?.forecastRowCount || 0);
  }, [rows, activeSnapshot]);

  const confirmedProdCount = useMemo(() => {
    const direct = rows.filter(r => getNormalizedPlanningType(r) === 'CONFIRMED_PRODUCTION').length;
    return direct > 0 ? direct : (activeSnapshot?.confirmedProductionRowCount || 0);
  }, [rows, activeSnapshot]);

  // Week parsing helper & available weeks in active snapshot
  interface WeekInfo {
    weekKey: string;
    label: string;
    startDate: string;
    endDate: string;
  }

  const getWeekInfoForDate = (dateStr: string): WeekInfo => {
    const cleanDate = dateStr.split('T')[0];
    const d = new Date(cleanDate);
    if (isNaN(d.getTime())) {
      return { weekKey: 'unknown', label: 'Other Dates', startDate: cleanDate, endDate: cleanDate };
    }
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const fmt = (dt: Date) => dt.toISOString().split('T')[0];
    const startFmt = fmt(monday);
    const endFmt = fmt(sunday);

    const firstJan = new Date(d.getFullYear(), 0, 1);
    const days = Math.floor((d.getTime() - firstJan.getTime()) / (24 * 60 * 60 * 1000));
    const weekNum = Math.ceil((days + firstJan.getDay() + 1) / 7);

    return {
      weekKey: `${startFmt}_${endFmt}`,
      label: `Week ${weekNum} (${startFmt} → ${endFmt})`,
      startDate: startFmt,
      endDate: endFmt
    };
  };

  const availableWeeks = useMemo(() => {
    const map = new Map<string, WeekInfo>();
    rows.forEach(r => {
      const d = (r.planningDate || r.startDate || '').split('T')[0];
      if (d) {
        const info = getWeekInfoForDate(d);
        map.set(info.weekKey, info);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [rows]);

  // Filter rows by selected weeks
  const rowsInSelectedWeeks = useMemo(() => {
    if (selectedWeeks.length === 0) return rows;
    return rows.filter(r => {
      const d = (r.planningDate || r.startDate || '').split('T')[0];
      if (!d) return false;
      const info = getWeekInfoForDate(d);
      return selectedWeeks.includes(info.weekKey);
    });
  }, [rows, selectedWeeks]);

  // Helper to resolve product master casesPerPallet
  const resolveProductCpp = (row: Snp87PlanningRow): { cpp: number; matched: Product | null; description: string } => {
    const pCode = row.productCodeSnapshot || row.productNumber || row.orderSku || '';
    let matched = row.productId ? products.find(p => p.id === row.productId) : null;
    if (!matched && pCode) {
      matched = products.find(p => areProductCodesEqual(p.productCode, pCode) || (p.code && areProductCodesEqual(p.code, pCode))) || null;
    }
    const cpp = matched?.casesPerPallet || matched?.configurations?.[0]?.casesPerPallet || 40;
    const description = row.descriptionSnapshot || row.productDescription || matched?.description || 'Confirmed Product';
    return { cpp, matched, description };
  };

  // Filtered rows
  const filteredRows = useMemo(() => {
    return rowsInSelectedWeeks.filter(row => {
      const rowType = getNormalizedPlanningType(row);
      if (typeFilter !== 'ALL' && rowType !== typeFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesProduct = (row.productNumber || '').toLowerCase().includes(query) ||
                               (row.productCodeSnapshot || '').toLowerCase().includes(query) ||
                               (row.productDescription || '').toLowerCase().includes(query) ||
                               (row.descriptionSnapshot || '').toLowerCase().includes(query) ||
                               (row.orderSku || '').toLowerCase().includes(query);
        if (!matchesProduct) return false;
      }
      return true;
    }).sort((a, b) => {
      const dateA = (a.planningDate || a.startDate || '').split('T')[0];
      const dateB = (b.planningDate || b.startDate || '').split('T')[0];
      if (sortField === 'planningDate') {
        const cmp = dateA.localeCompare(dateB);
        return sortAsc ? cmp : -cmp;
      }
      if (sortField === 'productNumber') {
        const numA = a.productNumber || a.productCodeSnapshot || '';
        const numB = b.productNumber || b.productCodeSnapshot || '';
        const cmp = numA.localeCompare(numB);
        return sortAsc ? cmp : -cmp;
      }
      if (sortField === 'quantity') {
        return sortAsc ? (a.quantity || 0) - (b.quantity || 0) : (b.quantity || 0) - (a.quantity || 0);
      }
      return 0;
    });
  }, [rowsInSelectedWeeks, typeFilter, searchTerm, sortField, sortAsc]);

  // Aggregate totals for filtered view
  const { totalFilteredCases, totalFilteredPallets } = useMemo(() => {
    let cases = 0;
    let pallets = 0;
    filteredRows.forEach(r => {
      const q = r.quantity || 0;
      cases += q;
      const { cpp } = resolveProductCpp(r);
      pallets += cpp > 0 ? q / cpp : q / 40;
    });
    return {
      totalFilteredCases: cases,
      totalFilteredPallets: Math.round(pallets * 10) / 10
    };
  }, [filteredRows, products]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-slate-900 border border-slate-800 rounded-xl">
        <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
        <p className="text-sm text-slate-300 font-medium">Loading active SAP planning snapshot...</p>
      </div>
    );
  }

  if (!activeSnapshot) {
    return (
      <div className="flex flex-col items-center justify-center p-16 bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl text-center max-w-2xl mx-auto my-8">
        <div className="w-16 h-16 rounded-2xl bg-cyan-950/60 border border-cyan-800/80 flex items-center justify-center text-cyan-400 mb-4 shadow-lg shadow-cyan-950/20">
          <FileSpreadsheet className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-slate-100">No Active SNP87 Planning Snapshot</h3>
        <p className="text-sm text-slate-400 max-w-md mt-2 mb-6">
          There is currently no active weekly SAP SNP87 planning dataset committed for this site. Upload and validate the weekly SNP87 Excel report to establish the planning baseline.
        </p>
        <button
          onClick={onNavigateToImport}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-sm transition-all shadow-md shadow-cyan-900/30"
        >
          <Upload className="w-4 h-4" />
          Import Weekly SNP87 Report
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Streamlined Planning Action Bar: Baseline file details are accessible in Import History tab */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/70 border border-slate-800/80 px-4 py-3 rounded-xl shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-cyan-950/80 border border-cyan-800/60 text-cyan-400">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-200">Current Planning Horizon:</span>
              <span className="font-mono text-cyan-300 font-bold">
                {activeSnapshot.importPeriod 
                  ? `${activeSnapshot.importPeriod.startDate} → ${activeSnapshot.importPeriod.endDate}`
                  : 'Weekly Baseline'}
              </span>
              <span className="text-slate-500 hidden sm:inline">•</span>
              <span className="text-slate-400 hidden sm:inline">
                {rows.length} total rows ({availableWeeks.length} scheduled weeks)
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
            title="Refresh Planning Snapshot"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={onNavigateToImport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs transition-colors shadow-sm"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload New SNP87
          </button>
        </div>
      </div>

      {/* Filter & Preferences Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 border border-slate-800/90 p-3 rounded-xl shadow-sm">
        {/* Type Toggle Pills */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setTypeFilter('ALL')}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
              typeFilter === 'ALL'
                ? 'bg-slate-800 text-slate-100 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Types ({rows.length})
          </button>
          <button
            onClick={() => setTypeFilter('FORECAST')}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
              typeFilter === 'FORECAST'
                ? 'bg-sky-950/80 text-sky-300 border border-sky-800/80 shadow'
                : 'text-slate-400 hover:text-sky-300'
            }`}
          >
            Forecast ({forecastCount})
          </button>
          <button
            onClick={() => setTypeFilter('CONFIRMED_PRODUCTION')}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
              typeFilter === 'CONFIRMED_PRODUCTION'
                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 shadow'
                : 'text-slate-400 hover:text-emerald-300'
            }`}
          >
            Confirmed Production ({confirmedProdCount})
          </button>
        </div>

        {/* Pallet & Case Unit Toggle */}
        <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 p-1 rounded-lg text-xs">
          <span className="text-[10px] text-slate-500 uppercase font-semibold pl-1">Unit:</span>
          <button
            onClick={() => setQuantityUnit('BOTH')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
              quantityUnit === 'BOTH'
                ? 'bg-slate-800 text-emerald-300 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Show both Case quantities and Pallet quantities"
          >
            Both (CS & PAL)
          </button>
          <button
            onClick={() => setQuantityUnit('CASES')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
              quantityUnit === 'CASES'
                ? 'bg-slate-800 text-emerald-300 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Show in Case quantities"
          >
            Cases
          </button>
          <button
            onClick={() => setQuantityUnit('PALLETS')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
              quantityUnit === 'PALLETS'
                ? 'bg-slate-800 text-cyan-300 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Show in Pallet quantities"
          >
            Pallets
          </button>
        </div>

        {/* Multi-Select Week Picker & Search */}
        <div className="flex items-center gap-3">
          {availableWeeks.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setIsWeekDropdownOpen(!isWeekDropdownOpen)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                  selectedWeeks.length > 0
                    ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300 font-semibold'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                <span>
                  {selectedWeeks.length === 0 
                    ? `All Weeks (${availableWeeks.length})` 
                    : `${selectedWeeks.length} of ${availableWeeks.length} Weeks Selected`}
                </span>
                <span className="text-[10px] text-slate-400 ml-1">▼</span>
              </button>

              {isWeekDropdownOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-3 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="text-xs font-bold text-slate-200">Filter by Planning Weeks (Multi-select)</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedWeeks(availableWeeks.map(w => w.weekKey))}
                        className="text-[11px] text-cyan-400 hover:underline cursor-pointer"
                      >
                        Select All
                      </button>
                      <span className="text-slate-600">|</span>
                      <button
                        onClick={() => setSelectedWeeks([])}
                        className="text-[11px] text-slate-400 hover:underline cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                    {availableWeeks.map(week => {
                      return (
                        <label
                          key={week.weekKey}
                          className="flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-slate-800 cursor-pointer text-xs transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={selectedWeeks.length === 0 || selectedWeeks.includes(week.weekKey)}
                              onChange={(e) => {
                                if (selectedWeeks.length === 0) {
                                  const allKeys = availableWeeks.map(w => w.weekKey);
                                  if (!e.target.checked) {
                                    setSelectedWeeks(allKeys.filter(k => k !== week.weekKey));
                                  }
                                } else {
                                  if (e.target.checked) {
                                    setSelectedWeeks([...selectedWeeks, week.weekKey]);
                                  } else {
                                    const next = selectedWeeks.filter(k => k !== week.weekKey);
                                    setSelectedWeeks(next.length === availableWeeks.length ? [] : next);
                                  }
                                }
                              }}
                              className="rounded border-slate-700 bg-slate-950 text-cyan-600 focus:ring-cyan-500 w-3.5 h-3.5 cursor-pointer"
                            />
                            <span className="font-mono text-slate-200">{week.label}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-[11px] text-slate-400">
                    <span>{selectedWeeks.length === 0 ? 'Showing all weeks' : `${selectedWeeks.length} week(s) selected`}</span>
                    <button
                      onClick={() => setIsWeekDropdownOpen(false)}
                      className="px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium cursor-pointer shadow-sm"
                    >
                      Apply Filter
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search product number or description..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-56 sm:w-64"
            />
          </div>
        </div>
      </div>

      {/* Forecast Weekly Plan sub-toggle */}
      {typeFilter === 'FORECAST' && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900/80 border border-sky-900/50 rounded-xl">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-sky-300 flex items-center gap-1.5">
              <Target className="w-4 h-4 text-sky-400" />
              Forecast Plan Presentation:
            </span>
            <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
              <button
                onClick={() => setForecastViewMode('WEEKLY_PLAN')}
                className={`px-3 py-1 rounded font-semibold transition-colors ${
                  forecastViewMode === 'WEEKLY_PLAN'
                    ? 'bg-sky-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Weekly Plan (SumProduct by Product)
              </button>
              <button
                onClick={() => setForecastViewMode('ROWS')}
                className={`px-3 py-1 rounded font-semibold transition-colors ${
                  forecastViewMode === 'ROWS'
                    ? 'bg-slate-800 text-sky-300 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Individual Ingested Rows ({filteredRows.length})
              </button>
            </div>
          </div>
          <span className="text-xs text-slate-400">
            Target weekly plan aggregated towards Horizon Date
          </span>
        </div>
      )}

      {/* Render Forecast Weekly Plan View when in Forecast weekly mode */}
      {typeFilter === 'FORECAST' && forecastViewMode === 'WEEKLY_PLAN' && (
        <ForecastWeeklyPlanView
          rows={rowsInSelectedWeeks}
          activeSnapshot={activeSnapshot}
          products={products}
        />
      )}

      {/* Render Confirmed Production Visualizer when in Confirmed Production view */}
      {typeFilter === 'CONFIRMED_PRODUCTION' && (
        <ConfirmedProductionVisual
          rows={rowsInSelectedWeeks}
          activeSnapshot={activeSnapshot}
          products={products}
          showNavigationButton={false}
          quantityUnit={quantityUnit}
          onQuantityUnitChange={setQuantityUnit}
          showEmbeddedTable={false}
        />
      )}

      {/* Snapshot Rows Data Table (shown when not in FORECAST WEEKLY_PLAN view) */}
      {(typeFilter !== 'FORECAST' || forecastViewMode === 'ROWS') && (
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {/* Active Week Filter Banner */}
        {selectedWeeks.length > 0 && (
          <div className="bg-cyan-950/60 border-b border-cyan-800/80 px-4 py-2 flex items-center justify-between text-xs text-cyan-200">
            <span className="flex items-center gap-1.5 font-medium">
              <Filter className="w-3.5 h-3.5 text-cyan-400" />
              Table filtered by <strong className="font-mono text-cyan-300">{selectedWeeks.length} planning week(s)</strong>
              <span className="text-slate-400 ml-1">({filteredRows.length} matching rows)</span>
            </span>
            <button
              onClick={() => setSelectedWeeks([])}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-300 hover:text-cyan-100 underline decoration-cyan-500 cursor-pointer"
            >
              Clear Week Filter
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-slate-800 text-[11px] font-semibold">
              <tr>
                <th 
                  className="px-4 py-3 cursor-pointer hover:text-slate-200"
                  onClick={() => {
                    if (sortField === 'productNumber') setSortAsc(!sortAsc);
                    else { setSortField('productNumber'); setSortAsc(true); }
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    Product Number
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>
                <th className="px-4 py-3">Product Description</th>
                <th 
                  className="px-4 py-3 cursor-pointer hover:text-slate-200"
                  onClick={() => {
                    if (sortField === 'planningDate') setSortAsc(!sortAsc);
                    else { setSortField('planningDate'); setSortAsc(true); }
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    Date
                    <ArrowUpDown className="w-3 h-3 text-slate-500" />
                  </div>
                </th>
                <th className="px-4 py-3">Type</th>
                
                {/* Case Quantity Column */}
                {(quantityUnit === 'BOTH' || quantityUnit === 'CASES') && (
                  <th 
                    className="px-4 py-3 text-right cursor-pointer hover:text-slate-200"
                    onClick={() => {
                      if (sortField === 'quantity') setSortAsc(!sortAsc);
                      else { setSortField('quantity'); setSortAsc(true); }
                    }}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      Quantity (CS)
                      <ArrowUpDown className="w-3 h-3 text-slate-500" />
                    </div>
                  </th>
                )}

                {/* Pallet Quantity Column */}
                {(quantityUnit === 'BOTH' || quantityUnit === 'PALLETS') && (
                  <th className="px-4 py-3 text-right text-cyan-300">
                    <div className="flex items-center justify-end gap-1.5">
                      Pallet Qty (PAL)
                    </div>
                  </th>
                )}

                {/* Pallet Conversion Factor */}
                {quantityUnit === 'BOTH' && (
                  <th className="px-4 py-3 text-center text-slate-400">
                    Pallet Factor
                  </th>
                )}

                <th className="px-4 py-3 text-center">Base Unit</th>
                <th className="px-4 py-3 text-center">Validation Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400 text-xs">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-md mx-auto">
                      <p>
                        No SNP87 planning rows matching the current filter criteria
                        {typeFilter !== 'ALL' && ` (${typeFilter === 'FORECAST' ? 'Forecast' : 'Confirmed Production'})`}
                        {selectedWeeks.length > 0 && ` across ${selectedWeeks.length} selected week(s)`}
                        {searchTerm.trim() && ` matching "${searchTerm}"`}.
                      </p>
                      {(typeFilter !== 'ALL' || selectedWeeks.length > 0 || searchTerm.trim()) && (
                        <button
                          onClick={() => {
                            setTypeFilter('ALL');
                            setSelectedWeeks([]);
                            setSearchTerm('');
                          }}
                          className="mt-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 font-medium text-xs transition-colors border border-slate-700 cursor-pointer"
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const rowType = getNormalizedPlanningType(row);
                  const { cpp, description } = resolveProductCpp(row);
                  const rowQty = row.quantity || 0;
                  const rowPallets = cpp > 0 ? rowQty / cpp : rowQty / 40;
                  const formattedPallets = (Math.round(rowPallets * 10) / 10).toFixed(1);

                  return (
                    <tr key={row.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-slate-200 font-medium">
                        {row.productNumber || row.productCodeSnapshot}
                      </td>
                      <td className="px-4 py-2.5 text-slate-300 max-w-xs truncate" title={description}>
                        {description || '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-300">
                        {row.planningDate || row.startDate}
                      </td>
                      <td className="px-4 py-2.5">
                        {rowType === 'FORECAST' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-950/80 text-sky-400 border border-sky-800/80">
                            Forecast
                          </span>
                        ) : rowType === 'CONFIRMED_PRODUCTION' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/80">
                            Confirmed Production
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-400">
                            Ignored
                          </span>
                        )}
                      </td>

                      {/* Case Quantity */}
                      {(quantityUnit === 'BOTH' || quantityUnit === 'CASES') && (
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-100">
                          {rowQty.toLocaleString(undefined, { minimumFractionDigits: rowQty % 1 !== 0 ? 3 : 0 })}
                        </td>
                      )}

                      {/* Pallet Quantity */}
                      {(quantityUnit === 'BOTH' || quantityUnit === 'PALLETS') && (
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-cyan-300">
                          {formattedPallets}
                        </td>
                      )}

                      {/* Cases/Pallet ratio */}
                      {quantityUnit === 'BOTH' && (
                        <td className="px-4 py-2.5 text-center font-mono text-slate-400 text-[11px]">
                          {cpp} CS/PAL
                        </td>
                      )}

                      <td className="px-4 py-2.5 text-center font-mono text-slate-400">
                        {row.baseUnitOfMeasure || 'CS'}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                          <CheckCircle2 className="w-3 h-3" />
                          VALID
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer with Both Case and Pallet Totals */}
        <div className="px-4 py-3 bg-slate-950/80 border-t border-slate-800 flex flex-wrap justify-between items-center gap-3 text-xs text-slate-400">
          <div>
            <span>Showing {filteredRows.length} of {rows.length} rows</span>
            {selectedWeeks.length > 0 && <span className="text-cyan-400 font-medium ml-1.5">(Filtered for {selectedWeeks.length} week(s))</span>}
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span>
              Total Cases: <strong className="text-slate-100 font-semibold">{totalFilteredCases.toLocaleString()} CS</strong>
            </span>
            <span>
              Total Pallets: <strong className="text-cyan-300 font-bold">~{totalFilteredPallets.toLocaleString()} PAL</strong>
            </span>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};

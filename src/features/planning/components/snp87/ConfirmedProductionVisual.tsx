import React, { useState, useMemo } from 'react';
import { 
  Factory, 
  Calendar, 
  Package, 
  Layers, 
  TrendingUp, 
  ArrowRight, 
  CheckCircle2, 
  Sparkles,
  BarChart3,
  PieChart,
  Filter,
  X,
  Boxes,
  HelpCircle
} from 'lucide-react';
import { Snp87PlanningRow, Snp87PlanningImport, getNormalizedPlanningType } from '../../../../types/snp87';
import { Product } from '../../../../types/product';
import { areProductCodesEqual } from '../../../../utils/productCodeNormalizer';
import { useNavigate } from 'react-router-dom';

export interface ConfirmedProductionVisualProps {
  rows: Snp87PlanningRow[];
  activeSnapshot?: Snp87PlanningImport | null;
  products?: Product[];
  onNavigateToPlanning?: () => void;
  showNavigationButton?: boolean;
  className?: string;
  selectedDate?: string | null;
  onSelectDate?: (date: string | null) => void;
  quantityUnit?: 'BOTH' | 'CASES' | 'PALLETS';
  onQuantityUnitChange?: (unit: 'BOTH' | 'CASES' | 'PALLETS') => void;
  showEmbeddedTable?: boolean;
}

export const ConfirmedProductionVisual: React.FC<ConfirmedProductionVisualProps> = ({
  rows,
  activeSnapshot,
  products = [],
  onNavigateToPlanning,
  showNavigationButton = true,
  className = '',
  selectedDate: selectedDateProp,
  onSelectDate,
  quantityUnit: quantityUnitProp,
  onQuantityUnitChange,
  showEmbeddedTable = true
}) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'timeline' | 'products'>('timeline');
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  // Controlled or uncontrolled date filter
  const [internalSelectedDate, setInternalSelectedDate] = useState<string | null>(null);
  const activeDate = selectedDateProp !== undefined ? selectedDateProp : internalSelectedDate;

  // Controlled or uncontrolled unit toggle: 'BOTH' | 'CASES' | 'PALLETS'
  const [internalQuantityUnit, setInternalQuantityUnit] = useState<'BOTH' | 'CASES' | 'PALLETS'>('BOTH');
  const effectiveUnit = quantityUnitProp !== undefined ? quantityUnitProp : internalQuantityUnit;

  // Chart display metric: 'CASES' or 'PALLETS'
  const [chartMetric, setChartMetric] = useState<'CASES' | 'PALLETS'>('CASES');

  const handleUnitChange = (unit: 'BOTH' | 'CASES' | 'PALLETS') => {
    if (quantityUnitProp === undefined) {
      setInternalQuantityUnit(unit);
    }
    if (onQuantityUnitChange) {
      onQuantityUnitChange(unit);
    }
  };

  // Extract only Confirmed Production rows
  const confirmedRows = useMemo(() => {
    return rows.filter(r => getNormalizedPlanningType(r) === 'CONFIRMED_PRODUCTION');
  }, [rows]);

  // Handle date bar click:
  // Initial click will filter the table and highlight the bar that has been clicked.
  // Second click on the same date will remove the filter and highlight.
  // Click on another date bar will filter by that other date and move the highlight.
  const handleDateBarClick = (date: string) => {
    const nextDate = activeDate === date ? null : date;
    if (selectedDateProp === undefined) {
      setInternalSelectedDate(nextDate);
    }
    if (onSelectDate) {
      onSelectDate(nextDate);
    }
  };

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

  // Aggregate metrics
  const {
    totalCases,
    totalPallets,
    dailyDistribution,
    productDistribution,
    distinctSkuCount,
    dateRange,
    maxDailyCases,
    maxDailyPallets,
    avgDailyCases,
    avgDailyPallets
  } = useMemo(() => {
    let cases = 0;
    let pallets = 0;
    const dailyMap = new Map<string, { 
      date: string; 
      cases: number; 
      pallets: number; 
      skuCount: Set<string>;
      rows: Snp87PlanningRow[];
    }>();
    
    const productMap = new Map<string, {
      code: string;
      description: string;
      cases: number;
      pallets: number;
      casesPerPallet: number;
      dates: Set<string>;
    }>();

    confirmedRows.forEach(row => {
      const rowDate = (row.planningDate || row.startDate || row.endDate || '').split('T')[0] || 'Unknown';
      const rowQty = row.confirmedProductionQuantity ?? row.quantity ?? 0;
      cases += rowQty;

      const { cpp, description } = resolveProductCpp(row);
      const rowPallets = cpp > 0 ? rowQty / cpp : rowQty / 40;
      pallets += rowPallets;

      // Daily distribution
      const day = dailyMap.get(rowDate) || { 
        date: rowDate, 
        cases: 0, 
        pallets: 0, 
        skuCount: new Set<string>(),
        rows: []
      };
      day.cases += rowQty;
      day.pallets += rowPallets;
      const pCode = row.productCodeSnapshot || row.productNumber || row.orderSku || 'UNKNOWN';
      day.skuCount.add(pCode);
      day.rows.push(row);
      dailyMap.set(rowDate, day);

      // Product distribution
      const prod = productMap.get(pCode) || {
        code: pCode,
        description,
        cases: 0,
        pallets: 0,
        casesPerPallet: cpp,
        dates: new Set<string>()
      };
      prod.cases += rowQty;
      prod.pallets += rowPallets;
      prod.dates.add(rowDate);
      productMap.set(pCode, prod);
    });

    const sortedDaily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    const sortedProducts = Array.from(productMap.values()).sort((a, b) => b.cases - a.cases);

    let maxDayCases = 0;
    let maxDayPallets = 0;
    sortedDaily.forEach(d => {
      if (d.cases > maxDayCases) maxDayCases = d.cases;
      if (d.pallets > maxDayPallets) maxDayPallets = d.pallets;
    });

    const dayCount = sortedDaily.length || 1;
    const avgDayCases = Math.round(cases / dayCount);
    const avgDayPallets = Math.round((pallets / dayCount) * 10) / 10;

    const minD = sortedDaily.length > 0 ? sortedDaily[0].date : '';
    const maxD = sortedDaily.length > 0 ? sortedDaily[sortedDaily.length - 1].date : '';

    return {
      totalCases: cases,
      totalPallets: Math.round(pallets * 10) / 10,
      dailyDistribution: sortedDaily,
      productDistribution: sortedProducts,
      distinctSkuCount: productMap.size,
      dateRange: minD && maxD ? `${minD} → ${maxD}` : 'Active Horizon',
      maxDailyCases: maxDayCases,
      maxDailyPallets: Math.round(maxDayPallets * 10) / 10,
      avgDailyCases: avgDayCases,
      avgDailyPallets: avgDayPallets
    };
  }, [confirmedRows, products]);

  // Filtered rows for the Confirmed Production table based on active date click
  const tableRows = useMemo(() => {
    if (!activeDate) return confirmedRows;
    return confirmedRows.filter(r => {
      const rowDate = (r.planningDate || r.startDate || r.endDate || '').split('T')[0];
      return rowDate === activeDate;
    });
  }, [confirmedRows, activeDate]);

  // Aggregate totals for the active table
  const tableSummary = useMemo(() => {
    let cases = 0;
    let pallets = 0;
    tableRows.forEach(r => {
      const q = r.confirmedProductionQuantity ?? r.quantity ?? 0;
      cases += q;
      const { cpp } = resolveProductCpp(r);
      pallets += cpp > 0 ? q / cpp : q / 40;
    });
    return {
      cases,
      pallets: Math.round(pallets * 10) / 10,
      count: tableRows.length
    };
  }, [tableRows, products]);

  const handlePlanningClick = () => {
    if (onNavigateToPlanning) {
      onNavigateToPlanning();
    } else {
      navigate('/planning/production-plan');
    }
  };

  if (confirmedRows.length === 0) {
    return (
      <div className={`p-6 rounded-xl bg-slate-900/60 border border-slate-800 text-center ${className}`}>
        <div className="w-12 h-12 rounded-xl bg-slate-800/80 flex items-center justify-center text-slate-400 mx-auto mb-3">
          <Factory className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-semibold text-slate-200">No Confirmed Production Scheduled</h4>
        <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-4">
          No SAP SNP87 Confirmed Production records (9AFPROD) are currently active in the planning baseline.
        </p>
        {showNavigationButton && (
          <button
            onClick={handlePlanningClick}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-colors"
          >
            Open SAP Planning
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-sm ${className}`}>
      {/* Header Strip */}
      <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-950/90 border border-emerald-600/40 flex items-center justify-center text-emerald-400 shadow-sm">
              <Factory className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2">
                  SAP Confirmed Production Visualizer
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  9AFPROD Committed
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                <span>{dateRange}</span>
                <span>•</span>
                <span>{activeSnapshot?.sourceReportName || 'SNP87 Weekly Snapshot'}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Quantity Unit Preference Toggle: Both | Cases | Pallets */}
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
              <span className="px-1.5 text-[10px] text-slate-500 font-medium uppercase">Unit:</span>
              <button
                onClick={() => handleUnitChange('BOTH')}
                className={`px-2 py-1 rounded font-medium transition-colors ${
                  effectiveUnit === 'BOTH'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Display both Case quantities and Pallet quantities"
              >
                Both (CS & PAL)
              </button>
              <button
                onClick={() => handleUnitChange('CASES')}
                className={`px-2 py-1 rounded font-medium transition-colors ${
                  effectiveUnit === 'CASES'
                    ? 'bg-slate-800 text-emerald-300 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Display in Case quantities (CS)"
              >
                Cases
              </button>
              <button
                onClick={() => handleUnitChange('PALLETS')}
                className={`px-2 py-1 rounded font-medium transition-colors ${
                  effectiveUnit === 'PALLETS'
                    ? 'bg-slate-800 text-cyan-300 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Display in Pallet quantities (PAL)"
              >
                Pallets
              </button>
            </div>

            {/* View Tab Toggle */}
            <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
              <button
                onClick={() => setActiveTab('timeline')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded font-medium transition-colors ${
                  activeTab === 'timeline'
                    ? 'bg-slate-800 text-emerald-300 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Daily Timeline
              </button>
              <button
                onClick={() => setActiveTab('products')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded font-medium transition-colors ${
                  activeTab === 'products'
                    ? 'bg-slate-800 text-cyan-300 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <PieChart className="w-3.5 h-3.5" />
                Products ({distinctSkuCount})
              </button>
            </div>

            {showNavigationButton && (
              <button
                onClick={handlePlanningClick}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors border border-slate-700/60"
                title="View in SAP Planning"
              >
                <span>Planning Page</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* High-level KPI Mini Grid with both Case & Pallet metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
          <div className="p-2.5 rounded-lg bg-slate-950/70 border border-emerald-950/40">
            <span className="text-[11px] text-slate-400 font-medium">Confirmed Volume</span>
            <div className="text-xl font-bold text-emerald-300 mt-0.5">
              {totalCases.toLocaleString()} <span className="text-xs font-normal text-slate-400">CS</span>
            </div>
            <div className="text-[11px] font-semibold text-cyan-300 mt-0.5 flex items-center gap-1">
              <Boxes className="w-3 h-3 text-cyan-400" />
              ~{totalPallets.toLocaleString()} pallets
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/60">
            <span className="text-[11px] text-slate-400 font-medium">Distinct Products</span>
            <div className="text-xl font-bold text-slate-100 mt-0.5">{distinctSkuCount}</div>
            <span className="text-[10px] text-slate-500">{confirmedRows.length} confirmed production runs</span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/60">
            <span className="text-[11px] text-slate-400 font-medium">Production Days</span>
            <div className="text-xl font-bold text-cyan-300 mt-0.5">{dailyDistribution.length}</div>
            <span className="text-[10px] text-slate-500">
              Avg {avgDailyCases.toLocaleString()} CS (~{avgDailyPallets} PAL)/day
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/60">
            <span className="text-[11px] text-slate-400 font-medium">Peak Daily Run</span>
            <div className="text-xl font-bold text-amber-300 mt-0.5">
              {maxDailyCases.toLocaleString()} <span className="text-xs font-normal text-slate-400">CS</span>
            </div>
            <span className="text-[10px] text-slate-500">~{maxDailyPallets.toLocaleString()} PAL maximum day</span>
          </div>
        </div>
      </div>

      {/* Main Visual Display */}
      <div className="p-5 space-y-5">
        {activeTab === 'timeline' ? (
          <div>
            {/* Chart Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 font-medium text-slate-300">
                  <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                  Daily Confirmed Production Volume Across Planning Horizon
                </span>
                <span className="text-[11px] text-slate-500 hidden sm:inline">
                  (Click any date bar to filter the Confirmed Production table)
                </span>
              </div>

              {/* Chart Metric Toggle: Cases vs Pallets */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400">Bar Metric:</span>
                <div className="flex bg-slate-950 border border-slate-800 rounded p-0.5 text-[11px]">
                  <button
                    onClick={() => setChartMetric('CASES')}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      chartMetric === 'CASES'
                        ? 'bg-emerald-950 text-emerald-300 font-semibold border border-emerald-800/80 shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Cases (CS)
                  </button>
                  <button
                    onClick={() => setChartMetric('PALLETS')}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      chartMetric === 'PALLETS'
                        ? 'bg-cyan-950 text-cyan-300 font-semibold border border-cyan-800/80 shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Pallets (PAL)
                  </button>
                </div>
              </div>
            </div>

            {/* Active Date Filter Alert / Clear Button */}
            {activeDate && (
              <div className="flex items-center justify-between bg-emerald-950/70 border border-emerald-500/50 rounded-lg px-3.5 py-2 text-xs text-emerald-200 mb-3 animate-fadeIn">
                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    Table filtered by Date: <strong className="font-mono text-emerald-300 underline">{activeDate}</strong> ({tableSummary.count} batch runs • {tableSummary.cases.toLocaleString()} CS • ~{tableSummary.pallets} PAL)
                  </span>
                </div>
                <button
                  onClick={() => handleDateBarClick(activeDate)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-900/90 hover:bg-emerald-800 text-emerald-100 text-[11px] font-semibold border border-emerald-600 transition-colors shadow-sm"
                  title="Remove date filter and display all dates"
                >
                  <X className="w-3 h-3" />
                  Show All Dates
                </button>
              </div>
            )}

            {/* Interactive Visual Bar Graph */}
            <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-4">
              <div className="h-52 flex items-end gap-2 sm:gap-4 pt-6 pb-2 px-2 border-b border-slate-800/80">
                {dailyDistribution.map((day) => {
                  const dayCases = day.cases;
                  const dayPallets = Math.round(day.pallets * 10) / 10;
                  const maxMetric = chartMetric === 'PALLETS' ? maxDailyPallets : maxDailyCases;
                  const currentMetric = chartMetric === 'PALLETS' ? dayPallets : dayCases;
                  const pct = maxMetric > 0 ? (currentMetric / maxMetric) * 100 : 0;
                  
                  const isHovered = hoveredDate === day.date;
                  const isSelected = activeDate === day.date;
                  const isDimmed = activeDate !== null && !isSelected;

                  return (
                    <div 
                      key={day.date}
                      onClick={() => handleDateBarClick(day.date)}
                      onMouseEnter={() => setHoveredDate(day.date)}
                      onMouseLeave={() => setHoveredDate(null)}
                      className={`flex-1 flex flex-col items-center h-full justify-end group relative cursor-pointer transition-all duration-200 ${
                        isDimmed ? 'opacity-40 hover:opacity-85' : 'opacity-100'
                      }`}
                      title={`${isSelected ? 'Click to remove filter' : 'Click to filter table by ' + day.date}`}
                    >
                      {/* Tooltip Popup on Hover */}
                      <div className={`absolute bottom-full mb-2 bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs shadow-2xl z-30 pointer-events-none transition-all duration-150 whitespace-nowrap ${
                        isHovered ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                      }`}>
                        <div className="flex items-center justify-between gap-3 font-semibold text-slate-100 border-b border-slate-800 pb-1">
                          <span>{day.date}</span>
                          {isSelected && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              ACTIVE FILTER
                            </span>
                          )}
                        </div>
                        <div className="text-emerald-400 font-bold mt-1.5 flex items-center gap-1.5">
                          <span>{dayCases.toLocaleString()} Cases</span>
                          <span className="text-slate-500">•</span>
                          <span className="text-cyan-300 font-mono">~{dayPallets} Pallets</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {day.skuCount.size} active product{day.skuCount.size !== 1 ? 's' : ''} scheduled
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1 pt-1 border-t border-slate-800/80 italic">
                          {isSelected ? 'Click bar again to remove filter' : 'Click bar to filter table'}
                        </div>
                      </div>

                      {/* Selected State Badge on top of bar */}
                      {isSelected && (
                        <div className="mb-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-400 text-slate-950 uppercase tracking-wider shadow-md animate-bounce">
                          FILTERED
                        </div>
                      )}

                      {/* Quantity Label above bar */}
                      <span className={`text-[10px] font-mono mb-1 transition-opacity ${
                        isSelected 
                          ? 'text-emerald-300 font-bold opacity-100' 
                          : isHovered 
                            ? 'text-slate-200 opacity-100' 
                            : 'text-slate-400 opacity-0 group-hover:opacity-100'
                      }`}>
                        {chartMetric === 'PALLETS' ? `${dayPallets} PAL` : `${dayCases.toLocaleString()} CS`}
                      </span>

                      {/* Bar Fill */}
                      <div 
                        style={{ height: `${Math.max(pct, 6)}%` }}
                        className={`w-full max-w-[48px] rounded-t-md transition-all duration-200 ${
                          isSelected 
                            ? 'bg-gradient-to-t from-emerald-500 via-teal-300 to-emerald-200 ring-2 ring-emerald-300 ring-offset-2 ring-offset-slate-950 shadow-lg shadow-emerald-500/40 scale-105'
                            : isHovered 
                              ? 'bg-gradient-to-t from-emerald-600 to-teal-300 shadow-md shadow-emerald-500/20' 
                              : 'bg-gradient-to-t from-emerald-900/90 to-emerald-500/80 hover:from-emerald-700 hover:to-emerald-400'
                        }`}
                      />
                    </div>
                  );
                })}
              </div>

              {/* X-Axis Date Labels with clickable selection styling */}
              <div className="flex items-center gap-2 sm:gap-4 px-2 pt-2 text-[10px] sm:text-xs font-mono">
                {dailyDistribution.map((day) => {
                  const parts = day.date.split('-');
                  const label = parts.length === 3 ? `${parts[2]}/${parts[1]}` : day.date;
                  const isSelected = activeDate === day.date;

                  return (
                    <div 
                      key={day.date} 
                      onClick={() => handleDateBarClick(day.date)}
                      className={`flex-1 text-center truncate cursor-pointer transition-colors ${
                        isSelected 
                          ? 'text-emerald-300 font-bold underline decoration-emerald-400 decoration-2' 
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title={`Filter by ${day.date}`}
                    >
                      {label}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" />
                Firm scheduled manufacturing batches from SAP SNP87 (9AFPROD)
              </span>
              <span>
                Average Daily Output: {avgDailyCases.toLocaleString()} CS (~{avgDailyPallets} PAL)
              </span>
            </div>

            {/* Embedded Interactive Confirmed Production Table */}
            {showEmbeddedTable && (
              <div className="mt-6 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Factory className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-sm font-bold text-slate-200">
                      Confirmed Production Table
                      {activeDate ? (
                        <span className="text-xs font-normal text-emerald-400 ml-1.5">
                          (Filtered for {activeDate})
                        </span>
                      ) : (
                        <span className="text-xs font-normal text-slate-400 ml-1.5">
                          (All Horizon Dates)
                        </span>
                      )}
                    </h4>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>
                      Showing {tableRows.length} {tableRows.length === 1 ? 'batch' : 'batches'}
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="font-semibold text-emerald-300">
                      {tableSummary.cases.toLocaleString()} CS
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="font-semibold text-cyan-300 font-mono">
                      ~{tableSummary.pallets} PAL
                    </span>
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider border-b border-slate-800 text-[11px] font-semibold">
                        <tr>
                          <th className="px-4 py-2.5">Product Code</th>
                          <th className="px-4 py-2.5">Product Description</th>
                          <th className="px-4 py-2.5">Scheduled Date</th>
                          {(effectiveUnit === 'BOTH' || effectiveUnit === 'CASES') && (
                            <th className="px-4 py-2.5 text-right">Case Qty (CS)</th>
                          )}
                          {(effectiveUnit === 'BOTH' || effectiveUnit === 'PALLETS') && (
                            <th className="px-4 py-2.5 text-right text-cyan-300">Pallet Qty (PAL)</th>
                          )}
                          {effectiveUnit === 'BOTH' && (
                            <th className="px-4 py-2.5 text-center text-slate-400">Cases/Pallet</th>
                          )}
                          <th className="px-4 py-2.5 text-center">Base Unit</th>
                          <th className="px-4 py-2.5 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {tableRows.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center py-8 text-slate-500">
                              No confirmed production batches found for this date.
                            </td>
                          </tr>
                        ) : (
                          tableRows.map((row) => {
                            const rowDate = (row.planningDate || row.startDate || row.endDate || '').split('T')[0];
                            const { cpp, description } = resolveProductCpp(row);
                            const rowQty = row.confirmedProductionQuantity ?? row.quantity ?? 0;
                            const rowPallets = cpp > 0 ? rowQty / cpp : rowQty / 40;
                            const formattedPallets = (Math.round(rowPallets * 10) / 10).toFixed(1);

                            return (
                              <tr key={row.id} className="hover:bg-slate-900/40 transition-colors">
                                <td className="px-4 py-2 font-mono text-slate-200 font-semibold">
                                  {row.productCodeSnapshot || row.productNumber || row.orderSku}
                                </td>
                                <td className="px-4 py-2 text-slate-300 max-w-xs truncate" title={description}>
                                  {description}
                                </td>
                                <td className="px-4 py-2 font-mono text-slate-300">
                                  <span className={activeDate === rowDate ? 'text-emerald-300 font-bold' : ''}>
                                    {rowDate}
                                  </span>
                                </td>
                                {(effectiveUnit === 'BOTH' || effectiveUnit === 'CASES') && (
                                  <td className="px-4 py-2 text-right font-mono font-semibold text-emerald-400">
                                    {rowQty.toLocaleString(undefined, { minimumFractionDigits: rowQty % 1 !== 0 ? 3 : 0 })}
                                  </td>
                                )}
                                {(effectiveUnit === 'BOTH' || effectiveUnit === 'PALLETS') && (
                                  <td className="px-4 py-2 text-right font-mono font-bold text-cyan-300">
                                    {formattedPallets}
                                  </td>
                                )}
                                {effectiveUnit === 'BOTH' && (
                                  <td className="px-4 py-2 text-center font-mono text-slate-400 text-[11px]">
                                    {cpp} CS/PAL
                                  </td>
                                )}
                                <td className="px-4 py-2 text-center font-mono text-slate-400">
                                  {row.baseUnitOfMeasure || 'CS'}
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                                    <CheckCircle2 className="w-3 h-3" />
                                    CONFIRMED
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Footer summary */}
                  <div className="px-4 py-2.5 bg-slate-900/60 border-t border-slate-800/80 flex flex-wrap justify-between items-center text-xs text-slate-400">
                    <span>
                      Total Runs: <strong>{tableRows.length}</strong>
                      {activeDate && ` on ${activeDate}`}
                    </span>
                    <div className="flex items-center gap-4">
                      <span>
                        Total Cases: <strong className="text-emerald-300">{tableSummary.cases.toLocaleString()} CS</strong>
                      </span>
                      <span>
                        Total Pallets: <strong className="text-cyan-300 font-mono">~{tableSummary.pallets} PAL</strong>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Products Distribution View */
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs text-slate-400">
              <span className="flex items-center gap-1.5 font-medium text-slate-300">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                Confirmed Production Volume Share by Product (Cases & Pallets)
              </span>
              <span className="text-[11px] text-slate-500">
                Ranked by scheduled output volume
              </span>
            </div>

            <div className="space-y-2.5">
              {productDistribution.map((prod, idx) => {
                const sharePct = totalCases > 0 ? (prod.cases / totalCases) * 100 : 0;
                const pallets = Math.round(prod.pallets * 10) / 10;

                return (
                  <div 
                    key={prod.code}
                    className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded bg-slate-800 text-slate-300 flex items-center justify-center text-[10px] font-bold">
                          {idx + 1}
                        </span>
                        <span className="font-mono text-xs font-semibold text-slate-200">
                          {prod.code}
                        </span>
                        <span className="text-xs text-slate-400 truncate max-w-xs sm:max-w-md">
                          {prod.description}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                          ({prod.casesPerPallet} CS/PAL)
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-cyan-300 font-mono font-semibold">
                          ~{pallets} PAL
                        </span>
                        <span className="font-bold text-emerald-400 font-mono">
                          {prod.cases.toLocaleString()} CS
                        </span>
                        <span className="text-[11px] font-mono text-slate-500 w-12 text-right">
                          {sharePct.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    {/* Visual Progress Meter */}
                    <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                      <div 
                        style={{ width: `${Math.max(sharePct, 2)}%` }}
                        className="bg-gradient-to-r from-emerald-500 to-cyan-400 h-full rounded-full transition-all duration-300"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Search, Filter, CalendarCheck, X, Factory } from 'lucide-react';
import { SectionCard } from '../../../../components/ui/SectionCard';
import { ProductionPlanGrid } from './ProductionPlanGrid';
import { ProductionPlanLegend } from './ProductionPlanLegend';
import { ProductionLine, ProductCategory } from '../../../../types/configuration';
import { Product } from '../../../../types/product';
import { ProductionPlanEntry, ProductionLinePlanNote } from '../../../../types/production';

export const formatUTCDate = (d: Date) => {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
};

export const formatUTCFull = (d: Date) => {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

interface CurrentPlanViewProps {
  currentWeekStart: Date;
  gridDates: Date[];
  productionLines: ProductionLine[];
  activeEntries: ProductionPlanEntry[];
  gridNotes: ProductionLinePlanNote[];
  products?: Product[];
  categories?: ProductCategory[];
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onResetWeek: () => void;
  onRefreshPlan?: () => void;
}

export const CurrentPlanView: React.FC<CurrentPlanViewProps> = ({
  currentWeekStart,
  gridDates,
  productionLines,
  activeEntries,
  gridNotes,
  products = [],
  categories = [],
  onPrevWeek,
  onNextWeek,
  onResetWeek,
  onRefreshPlan
}) => {
  const endWeekUTC = new Date(currentWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000);

  // Filter states
  const [selectedLineCode, setSelectedLineCode] = useState<string>('ALL');
  const [skuSearch, setSkuSearch] = useState<string>('');
  const [showTodayOnly, setShowTodayOnly] = useState<boolean>(false);

  const today = new Date();
  const todayYear = today.getUTCFullYear();
  const todayMonth = today.getUTCMonth();
  const todayDate = today.getUTCDate();

  // Count entries running today overall
  const todayEntriesCount = useMemo(() => {
    return activeEntries.filter(e => {
      const d = e.productionDate.toDate();
      return d.getUTCFullYear() === todayYear &&
             d.getUTCMonth() === todayMonth &&
             d.getUTCDate() === todayDate;
    }).length;
  }, [activeEntries, todayYear, todayMonth, todayDate]);

  // Check if today's date is in the currently visible grid week
  const isTodayInGridWindow = useMemo(() => {
    return gridDates.some(date => 
      date.getUTCFullYear() === todayYear &&
      date.getUTCMonth() === todayMonth &&
      date.getUTCDate() === todayDate
    );
  }, [gridDates, todayYear, todayMonth, todayDate]);

  // Handle toggling Today's SKUs filter
  const handleToggleTodayOnly = () => {
    const nextState = !showTodayOnly;
    setShowTodayOnly(nextState);
    if (nextState && !isTodayInGridWindow) {
      onResetWeek();
    }
  };

  const isFiltered = selectedLineCode !== 'ALL' || skuSearch.trim() !== '' || showTodayOnly;

  const handleClearFilters = () => {
    setSelectedLineCode('ALL');
    setSkuSearch('');
    setShowTodayOnly(false);
  };

  // Filtered Production Lines
  const filteredProductionLines = useMemo(() => {
    if (selectedLineCode === 'ALL') return productionLines;
    return productionLines.filter(
      l => l.lineCode.toUpperCase() === selectedLineCode.toUpperCase() || l.id === selectedLineCode
    );
  }, [productionLines, selectedLineCode]);

  // Filtered Production Entries
  const filteredEntries = useMemo(() => {
    return activeEntries.filter(entry => {
      // 1. Line Filter
      if (selectedLineCode !== 'ALL') {
        const targetLine = productionLines.find(
          l => l.lineCode.toUpperCase() === selectedLineCode.toUpperCase() || l.id === selectedLineCode
        );
        const codeToMatch = targetLine ? targetLine.lineCode : selectedLineCode;
        if (entry.productionLineId.toUpperCase() !== codeToMatch.toUpperCase()) {
          return false;
        }
      }

      // 2. SKU Filter (Code or Description)
      if (skuSearch.trim()) {
        const query = skuSearch.trim().toLowerCase();
        const codeMatch = entry.productCodeSnapshot.toLowerCase().includes(query);
        const descMatch = (entry.descriptionSnapshot || '').toLowerCase().includes(query);
        if (!codeMatch && !descMatch) return false;
      }

      // 3. Today's SKUs filter
      if (showTodayOnly) {
        const eDate = entry.productionDate.toDate();
        const isToday = eDate.getUTCFullYear() === todayYear &&
                        eDate.getUTCMonth() === todayMonth &&
                        eDate.getUTCDate() === todayDate;
        if (!isToday) return false;
      }

      return true;
    });
  }, [activeEntries, selectedLineCode, skuSearch, showTodayOnly, productionLines, todayYear, todayMonth, todayDate]);

  // Summary statistics for filtered entries
  const filteredCasesSum = useMemo(() => {
    return filteredEntries.reduce((sum, e) => sum + e.plannedCases, 0);
  }, [filteredEntries]);

  const filteredSKUsCount = useMemo(() => {
    return new Set(filteredEntries.map(e => e.productCodeSnapshot)).size;
  }, [filteredEntries]);

  return (
    <div className="space-y-6">
      {/* Date Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-lg">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-brand-500" />
          <div>
            <h3 className="font-semibold text-slate-200">
              Planning Window: {formatUTCDate(currentWeekStart)} - {formatUTCFull(endWeekUTC)}
            </h3>
            <p className="text-xs text-slate-400">Weekly scheduling matrix mapped by production lines</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onPrevWeek}
            className="p-2 bg-slate-800 border border-slate-700 rounded-md hover:bg-slate-700 transition-colors"
            title="Previous Week"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onResetWeek}
            className="px-3 py-1 text-xs font-medium bg-slate-800 border border-slate-700 rounded-md hover:bg-slate-700 transition-colors"
          >
            Today's Week
          </button>
          <button
            onClick={onNextWeek}
            className="p-2 bg-slate-800 border border-slate-700 rounded-md hover:bg-slate-700 transition-colors"
            title="Next Week"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Production Plan Filter Controls Toolbar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-brand-400" />
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Filter Plan
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Filter by Production Line */}
            <div className="flex items-center gap-2 min-w-[180px]">
              <Factory className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={selectedLineCode}
                onChange={(e) => setSelectedLineCode(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
              >
                <option value="ALL">All Production Lines ({productionLines.length})</option>
                {productionLines.map(line => (
                  <option key={line.id} value={line.lineCode}>
                    {line.lineName} ({line.lineCode})
                  </option>
                ))}
              </select>
            </div>

            {/* Filter by SKU / Search */}
            <div className="relative min-w-[200px] flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={skuSearch}
                onChange={(e) => setSkuSearch(e.target.value)}
                placeholder="Filter by SKU code or name..."
                className="w-full bg-slate-950 border border-slate-700 rounded-md pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500"
              />
              {skuSearch && (
                <button
                  onClick={() => setSkuSearch('')}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-200"
                  title="Clear SKU Search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Today's SKUs Toggle Button */}
            <button
              onClick={handleToggleTodayOnly}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors shrink-0 ${
                showTodayOnly 
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-950/50 font-semibold' 
                  : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
            >
              <CalendarCheck className={`w-3.5 h-3.5 ${showTodayOnly ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span>Today's SKUs</span>
              {todayEntriesCount > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  showTodayOnly ? 'bg-emerald-500/40 text-emerald-200' : 'bg-slate-800 text-slate-400'
                }`}>
                  {todayEntriesCount}
                </span>
              )}
            </button>

            {/* Reset All Filters Button */}
            {isFiltered && (
              <button
                onClick={handleClearFilters}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors underline decoration-slate-600 underline-offset-2 shrink-0 ml-1"
              >
                <X className="w-3.5 h-3.5" />
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Filter Summary Pill Bar */}
        {isFiltered && (
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-300">Active View:</span>
              {selectedLineCode !== 'ALL' && (
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                  Line: {productionLines.find(l => l.lineCode === selectedLineCode)?.lineName || selectedLineCode}
                </span>
              )}
              {skuSearch.trim() && (
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                  SKU: "{skuSearch}"
                </span>
              )}
              {showTodayOnly && (
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium">
                  Today's Production Only
                </span>
              )}
            </div>
            <div className="text-slate-400">
              Found <strong className="text-slate-200">{filteredSKUsCount}</strong> SKU{filteredSKUsCount !== 1 ? 's' : ''} ({filteredCasesSum.toLocaleString()} CS)
            </div>
          </div>
        )}
      </div>

      {/* Production Plan Event Legend */}
      <ProductionPlanLegend />

      <SectionCard 
        title="Active Production Planning Board" 
        description="Review active production schedules loaded from committed SAP plans with automated changeover & clean events."
      >
        <ProductionPlanGrid
          productionLines={filteredProductionLines}
          fullActiveEntries={activeEntries}
          displayEntries={filteredEntries}
          gridNotes={gridNotes}
          gridDates={gridDates}
          products={products}
          categories={categories}
          isFiltered={isFiltered}
          onRefreshPlan={onRefreshPlan}
        />
      </SectionCard>
    </div>
  );
};


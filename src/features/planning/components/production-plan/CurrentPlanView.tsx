import React from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { SectionCard } from '../../../../components/ui/SectionCard';
import { ProductionPlanGrid } from './ProductionPlanGrid';
import { ProductionLine } from '../../../../types/configuration';
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
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onResetWeek: () => void;
}

export const CurrentPlanView: React.FC<CurrentPlanViewProps> = ({
  currentWeekStart,
  gridDates,
  productionLines,
  activeEntries,
  gridNotes,
  onPrevWeek,
  onNextWeek,
  onResetWeek
}) => {
  const endWeekUTC = new Date(currentWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000);

  return (
    <div className="space-y-6">
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

      <SectionCard title="Active Production Planning Board" description="Review active production schedules loaded from committed SAP plans. Click to modify notes.">
        <ProductionPlanGrid
          productionLines={productionLines}
          activeEntries={activeEntries}
          gridNotes={gridNotes}
          gridDates={gridDates}
        />
      </SectionCard>
    </div>
  );
};

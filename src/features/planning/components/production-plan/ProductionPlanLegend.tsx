import React from 'react';
import { PRODUCTION_EVENT_COLOURS } from '../../services/changeoverEngine';

export const ProductionPlanLegend: React.FC = () => {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs bg-slate-900 border border-slate-800 px-4 py-2.5 rounded-lg shadow-sm">
      <div className="text-slate-400 font-semibold uppercase tracking-wider text-[11px] shrink-0">
        Event Legend:
      </div>

      {/* Format Change */}
      <div className="flex items-center gap-2">
        <span
          className="w-3.5 h-3.5 rounded-sm border border-slate-900 shadow-sm shrink-0"
          style={{ backgroundColor: PRODUCTION_EVENT_COLOURS.FORMAT_CHANGE }}
        />
        <span className="font-medium text-slate-200">Format Change</span>
      </div>

      {/* Grade Change */}
      <div className="flex items-center gap-2">
        <span
          className="w-3.5 h-3.5 rounded-sm border border-slate-900 shadow-sm shrink-0"
          style={{ backgroundColor: PRODUCTION_EVENT_COLOURS.GRADE_CHANGE }}
        />
        <span className="font-medium text-slate-200">Grade Change</span>
      </div>

      {/* Scheduled Clean */}
      <div className="flex items-center gap-2">
        <span
          className="w-3.5 h-3.5 rounded-sm border border-slate-900 shadow-sm shrink-0"
          style={{ backgroundColor: PRODUCTION_EVENT_COLOURS.CLEAN }}
        />
        <span className="font-medium text-slate-200">Scheduled Clean</span>
      </div>

      {/* Multi Event Example */}
      <div className="flex items-center gap-2">
        <span
          className="w-4 h-3.5 rounded-sm border border-slate-900 shadow-sm shrink-0"
          style={{
            background: `linear-gradient(90deg, ${PRODUCTION_EVENT_COLOURS.FORMAT_CHANGE} 0%, ${PRODUCTION_EVENT_COLOURS.FORMAT_CHANGE} 50%, ${PRODUCTION_EVENT_COLOURS.CLEAN} 50%, ${PRODUCTION_EVENT_COLOURS.CLEAN} 100%)`,
          }}
        />
        <span className="font-medium text-slate-300">Combined Events (Split Header)</span>
      </div>
    </div>
  );
};

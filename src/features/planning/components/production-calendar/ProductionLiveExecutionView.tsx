import React from 'react';
import { ProductionEvent } from '../../../../types/production';
import { ProductionLine, UnitOfMeasure } from '../../../../types/configuration';
import { ProductionRunCard } from './ProductionRunCard';
import { 
  Play, 
  Pause, 
  CheckCircle2, 
  AlertTriangle, 
  Square, 
  Clock, 
  Activity, 
  CalendarClock, 
  CheckCircle,
  Factory
} from 'lucide-react';
import { toSafeDate } from '../../../../utils/timeFormatters';

interface ProductionLiveExecutionViewProps {
  events: ProductionEvent[];
  lines: ProductionLine[];
  uoms: UnitOfMeasure[];
  onOpenDetails: (event: ProductionEvent) => void;
  onTriggerAction: (event: ProductionEvent, actionType: string) => void;
  onPlanNew: () => void;
}

export const ProductionLiveExecutionView: React.FC<ProductionLiveExecutionViewProps> = ({
  events,
  lines,
  uoms,
  onOpenDetails,
  onTriggerAction,
  onPlanNew
}) => {
  const getLineName = (lineId: string) => lines.find(l => l.id === lineId)?.lineName || lineId;
  const getUomCode = (uomId: string) => uoms.find(u => u.id === uomId)?.code || 'CS';

  const activeRuns = events.filter(e => 
    e.status === 'active' && ['RUNNING', 'ENDING', 'DELAYED', 'STOPPED'].includes(e.productionStatus)
  );

  const upcomingRuns = events.filter(e => 
    e.status === 'active' && e.productionStatus === 'PLANNED'
  ).sort((a, b) => toSafeDate(a.plannedStart).getTime() - toSafeDate(b.plannedStart).getTime());

  const completedRuns = events.filter(e => 
    e.status === 'active' && ['COMPLETE', 'CANCELLED'].includes(e.productionStatus)
  ).sort((a, b) => {
    const aTime = a.actualFinish ? toSafeDate(a.actualFinish).getTime() : 0;
    const bTime = b.actualFinish ? toSafeDate(b.actualFinish).getTime() : 0;
    return bTime - aTime;
  });

  return (
    <div className="space-y-8">
      {/* 1. Active Production Runs */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                Active Line Runs
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30">
                  {activeRuns.length} Running
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Live shop floor operations, line telemetry, and output tracking
              </p>
            </div>
          </div>
        </div>

        {activeRuns.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeRuns.map(run => (
              <ProductionRunCard
                key={run.id}
                event={run}
                lineName={getLineName(run.productionLineId)}
                uomCode={getUomCode(run.unitOfMeasureId)}
                onOpenDetails={onOpenDetails}
                onTriggerAction={onTriggerAction}
              />
            ))}
          </div>
        ) : (
          <div className="p-8 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 text-center">
            <Factory className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-300">No active runs currently running on lines</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
              Select an upcoming run from the queue below and click &quot;Start&quot; to begin tracking live output.
            </p>
            {upcomingRuns.length > 0 && (
              <button
                onClick={() => onTriggerAction(upcomingRuns[0], 'START')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-sm"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Start Next Run: {upcomingRuns[0].productCodeSnapshot}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* 2. Scheduled Queue */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Scheduled Next
              </h3>
              <p className="text-xs text-slate-400">
                Planned runs queued up for line production
              </p>
            </div>
          </div>

          <button
            onClick={onPlanNew}
            className="text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors"
          >
            + Plan New Run
          </button>
        </div>

        {upcomingRuns.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcomingRuns.slice(0, 6).map(run => (
              <ProductionRunCard
                key={run.id}
                event={run}
                lineName={getLineName(run.productionLineId)}
                uomCode={getUomCode(run.unitOfMeasureId)}
                onOpenDetails={onOpenDetails}
                onTriggerAction={onTriggerAction}
              />
            ))}
          </div>
        ) : (
          <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/30 text-center text-xs text-slate-500">
            No planned runs scheduled in the queue.
          </div>
        )}
      </div>

      {/* 3. Completed Runs */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 rounded-lg bg-slate-800 text-slate-400 border border-slate-700">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">
              Completed Batches
            </h3>
            <p className="text-xs text-slate-400">
              Recently finished runs and output reconciliation
            </p>
          </div>
        </div>

        {completedRuns.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 shadow-md">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="p-3">Product</th>
                  <th className="p-3">Line</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Planned Qty</th>
                  <th className="p-3">Actual Output</th>
                  <th className="p-3">Yield / Adherence</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {completedRuns.slice(0, 5).map(run => {
                  const planned = run.plannedQuantity || 0;
                  const actual = run.actualQuantity || 0;
                  const adherence = planned > 0 ? Math.round((actual / planned) * 100) : 100;
                  const uom = getUomCode(run.unitOfMeasureId);

                  return (
                    <tr key={run.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3">
                        <div className="font-mono font-semibold text-slate-200">{run.productCodeSnapshot}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-xs">{run.descriptionSnapshot}</div>
                      </td>
                      <td className="p-3 font-medium text-slate-300">
                        {getLineName(run.productionLineId)}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                          {run.productionStatus}
                        </span>
                      </td>
                      <td className="p-3 text-slate-300 font-medium">
                        {planned.toLocaleString()} {uom}
                      </td>
                      <td className="p-3 text-slate-100 font-bold">
                        {actual.toLocaleString()} {uom}
                      </td>
                      <td className="p-3">
                        <span className={`font-semibold ${adherence >= 95 ? 'text-emerald-400' : adherence >= 80 ? 'text-amber-400' : 'text-red-400'}`}>
                          {adherence}%
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => onOpenDetails(run)}
                          className="text-xs text-brand-400 hover:text-brand-300 transition-colors font-medium"
                        >
                          View Log
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/30 text-center text-xs text-slate-500">
            No completed batches recorded yet.
          </div>
        )}
      </div>
    </div>
  );
};

import React from 'react';
import { ProductionEvent } from '../../../../types/production';
import { ProductionLine, UnitOfMeasure } from '../../../../types/configuration';
import { ProductionRunCard } from './ProductionRunCard';
import { Plus, Factory, Calendar, Clock, AlertCircle } from 'lucide-react';
import { toSafeDate } from '../../../../utils/timeFormatters';

interface ProductionCalendarGridProps {
  gridDates: Date[];
  lines: ProductionLine[];
  events: ProductionEvent[];
  uoms: UnitOfMeasure[];
  onOpenDetails: (event: ProductionEvent) => void;
  onTriggerAction: (event: ProductionEvent, actionType: string) => void;
  onPlanForSlot: (lineId: string, date: Date) => void;
}

export const ProductionCalendarGrid: React.FC<ProductionCalendarGridProps> = ({
  gridDates,
  lines,
  events,
  uoms,
  onOpenDetails,
  onTriggerAction,
  onPlanForSlot
}) => {
  const today = new Date();
  const todayDateStr = today.toISOString().slice(0, 10);

  const getUomCode = (uomId: string) => {
    return uoms.find(u => u.id === uomId)?.code || 'CS';
  };

  const getDayEventsForLine = (lineId: string, date: Date) => {
    const targetDateStr = date.toISOString().slice(0, 10);
    return events.filter(evt => {
      if (evt.status !== 'active') return false;
      if (evt.productionLineId !== lineId) return false;
      const evtDateStr = toSafeDate(evt.plannedStart).toISOString().slice(0, 10);
      return evtDateStr === targetDateStr;
    }).sort((a, b) => {
      const aTime = toSafeDate(a.plannedStart).getTime();
      const bTime = toSafeDate(b.plannedStart).getTime();
      return aTime - bTime;
    });
  };

  const getLineStatus = (lineId: string) => {
    const activeLineEvents = events.filter(
      evt => evt.status === 'active' && evt.productionLineId === lineId
    );
    const running = activeLineEvents.find(e => e.productionStatus === 'RUNNING');
    if (running) return { label: 'RUNNING', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
    
    const delayed = activeLineEvents.find(e => e.productionStatus === 'DELAYED');
    if (delayed) return { label: 'DELAYED', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30' };

    const stopped = activeLineEvents.find(e => e.productionStatus === 'STOPPED');
    if (delayed) return { label: 'STOPPED', badge: 'bg-red-500/10 text-red-400 border-red-500/30' };

    const plannedToday = activeLineEvents.find(e => {
      if (e.productionStatus !== 'PLANNED') return false;
      return toSafeDate(e.plannedStart).toISOString().slice(0, 10) === todayDateStr;
    });
    if (plannedToday) return { label: 'SCHEDULED', badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' };

    return { label: 'STANDBY', badge: 'bg-slate-800 text-slate-400 border-slate-700' };
  };

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 shadow-xl">
      <div className="min-w-[1100px]">
        {/* Table Header: Days of the Week */}
        <div className="grid grid-cols-[200px_repeat(7,1fr)] bg-slate-900 border-b border-slate-800 sticky top-0 z-20">
          <div className="p-3.5 flex items-center gap-2 border-r border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-950/70">
            <Factory className="w-4 h-4 text-brand-400" />
            <span>Production Line</span>
          </div>

          {gridDates.map((date, index) => {
            const dateStr = date.toISOString().slice(0, 10);
            const isToday = dateStr === todayDateStr;
            const dayNum = date.getUTCDate();
            const monthName = date.toLocaleDateString([], { month: 'short' });
            const dayName = date.toLocaleDateString([], { weekday: 'short' });

            return (
              <div 
                key={dateStr}
                className={`p-3 text-center border-r last:border-r-0 border-slate-800 transition-colors ${
                  isToday ? 'bg-brand-500/10' : 'bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <span className={`text-xs font-semibold ${isToday ? 'text-brand-400 font-bold' : 'text-slate-300'}`}>
                    {dayName}
                  </span>
                  {isToday && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded-full bg-brand-500 text-slate-950">
                      Today
                    </span>
                  )}
                </div>
                <div className={`text-sm mt-0.5 ${isToday ? 'font-bold text-white' : 'text-slate-400 font-medium'}`}>
                  {dayNum} {monthName}
                </div>
              </div>
            );
          })}
        </div>

        {/* Rows: Production Lines */}
        <div className="divide-y divide-slate-800/80">
          {lines.map((line) => {
            const lineStatus = getLineStatus(line.id);

            return (
              <div 
                key={line.id}
                className="grid grid-cols-[200px_repeat(7,1fr)] transition-colors hover:bg-slate-900/30"
              >
                {/* Line Identification Lane */}
                <div className="p-4 border-r border-slate-800 flex flex-col justify-between bg-slate-950/30">
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-semibold text-slate-200 text-sm">
                        {line.lineName}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 font-medium px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">
                        {line.lineCode}
                      </span>
                    </div>
                    {line.description && (
                      <p className="text-[11px] text-slate-400 line-clamp-2">
                        {line.description}
                      </p>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${lineStatus.badge}`}>
                      {lineStatus.label}
                    </span>
                    <button
                      onClick={() => onPlanForSlot(line.id, gridDates[0])}
                      className="text-xs text-brand-400 hover:text-brand-300 transition-colors p-1"
                      title={`Plan event on ${line.lineName}`}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Day Cells */}
                {gridDates.map((date) => {
                  const dayEvents = getDayEventsForLine(line.id, date);
                  const isToday = date.toISOString().slice(0, 10) === todayDateStr;

                  return (
                    <div 
                      key={date.toISOString()}
                      className={`p-2 border-r last:border-r-0 border-slate-800 flex flex-col gap-2 min-h-[140px] group/cell relative transition-colors ${
                        isToday ? 'bg-brand-500/[0.02]' : ''
                      }`}
                    >
                      {dayEvents.length > 0 ? (
                        dayEvents.map(evt => (
                          <ProductionRunCard
                            key={evt.id}
                            event={evt}
                            lineName={line.lineName}
                            uomCode={getUomCode(evt.unitOfMeasureId)}
                            onOpenDetails={onOpenDetails}
                            onTriggerAction={onTriggerAction}
                            compact={true}
                          />
                        ))
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-2 rounded-lg border border-dashed border-transparent group-hover/cell:border-slate-800 transition-colors">
                          <button
                            onClick={() => onPlanForSlot(line.id, date)}
                            className="opacity-0 group-hover/cell:opacity-100 transition-opacity flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-brand-400 bg-slate-800/80 hover:bg-slate-800 px-2 py-1 rounded border border-slate-700"
                          >
                            <Plus className="w-3 h-3 text-brand-400" />
                            <span>Schedule</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

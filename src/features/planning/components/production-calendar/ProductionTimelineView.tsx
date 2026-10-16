import React from 'react';
import { ProductionEvent } from '../../../../types/production';
import { ProductionLine, UnitOfMeasure } from '../../../../types/configuration';
import { ChevronLeft, ChevronRight, Clock, AlertTriangle, Play, CheckCircle2, Factory } from 'lucide-react';
import { toSafeDate } from '../../../../utils/timeFormatters';

interface ProductionTimelineViewProps {
  selectedDate: Date;
  onChangeDate: (date: Date) => void;
  lines: ProductionLine[];
  events: ProductionEvent[];
  uoms: UnitOfMeasure[];
  onOpenDetails: (event: ProductionEvent) => void;
  onTriggerAction: (event: ProductionEvent, actionType: string) => void;
  onPlanForSlot: (lineId: string, date: Date) => void;
}

export const ProductionTimelineView: React.FC<ProductionTimelineViewProps> = ({
  selectedDate,
  onChangeDate,
  lines,
  events,
  uoms,
  onOpenDetails,
  onTriggerAction,
  onPlanForSlot
}) => {
  const selectedDateStr = selectedDate.toISOString().slice(0, 10);
  const now = new Date();
  const isToday = now.toISOString().slice(0, 10) === selectedDateStr;

  // Current hour marker (0 to 24)
  const currentHourFloat = isToday ? now.getHours() + now.getMinutes() / 60 : null;
  const currentHourPercentage = currentHourFloat !== null ? (currentHourFloat / 24) * 100 : null;

  const handlePrevDay = () => {
    const prev = new Date(selectedDate);
    prev.setUTCDate(prev.getUTCDate() - 1);
    onChangeDate(prev);
  };

  const handleNextDay = () => {
    const next = new Date(selectedDate);
    next.setUTCDate(next.getUTCDate() + 1);
    onChangeDate(next);
  };

  const handleToday = () => {
    onChangeDate(new Date());
  };

  // Filter events for this day
  const dayEvents = events.filter(evt => {
    if (evt.status !== 'active') return false;
    const startStr = toSafeDate(evt.plannedStart).toISOString().slice(0, 10);
    return startStr === selectedDateStr;
  });

  const getUomCode = (uomId: string) => {
    return uoms.find(u => u.id === uomId)?.code || 'CS';
  };

  // Hours: 00:00 to 24:00 (increments of 2)
  const hourTicks = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RUNNING':
        return 'bg-emerald-600/80 hover:bg-emerald-500 border-emerald-400 text-white';
      case 'DELAYED':
        return 'bg-amber-600/80 hover:bg-amber-500 border-amber-400 text-white';
      case 'STOPPED':
        return 'bg-red-600/80 hover:bg-red-500 border-red-400 text-white';
      case 'ENDING':
        return 'bg-purple-600/80 hover:bg-purple-500 border-purple-400 text-white';
      case 'COMPLETE':
        return 'bg-slate-700 hover:bg-slate-600 border-slate-500 text-slate-200';
      case 'CANCELLED':
        return 'bg-slate-800 border-slate-700 text-slate-500 opacity-60';
      case 'PLANNED':
      default:
        return 'bg-cyan-700/80 hover:bg-cyan-600 border-cyan-400 text-white';
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Date Navigation & Shifts Legend */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevDay}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          <div className="px-3 py-1 bg-slate-950 rounded-lg border border-slate-800 text-sm font-semibold text-slate-100 flex items-center gap-2">
            <span>{selectedDate.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
            {isToday && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-500 text-slate-950">
                Today
              </span>
            )}
          </div>

          <button
            onClick={handleNextDay}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {!isToday && (
            <button
              onClick={handleToday}
              className="text-xs font-medium text-brand-400 hover:text-brand-300 px-2 py-1 rounded bg-slate-800 border border-slate-700 ml-2"
            >
              Jump to Today
            </button>
          )}
        </div>

        {/* Shift Breakdown */}
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-sky-500/30 border border-sky-400" />
            <span>Shift 1 (06:00 - 14:00)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-amber-500/30 border border-amber-400" />
            <span>Shift 2 (14:00 - 22:00)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-indigo-500/30 border border-indigo-400" />
            <span>Shift 3 (22:00 - 06:00)</span>
          </span>
        </div>
      </div>

      {/* 24-Hour Timeline Grid */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 shadow-xl">
        <div className="min-w-[900px]">
          {/* Timeline Header: 24h Ruler */}
          <div className="grid grid-cols-[200px_1fr] bg-slate-950/80 border-b border-slate-800 sticky top-0 z-20">
            <div className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider border-r border-slate-800 flex items-center gap-2">
              <Factory className="w-4 h-4 text-brand-400" />
              <span>Production Line</span>
            </div>

            <div className="relative h-10 flex items-center">
              {/* Shift background bands */}
              <div className="absolute inset-0 grid grid-cols-24 pointer-events-none opacity-20">
                <div className="col-span-6 bg-indigo-900/30 border-r border-slate-700" title="Shift 3 Night" />
                <div className="col-span-8 bg-sky-900/30 border-r border-slate-700" title="Shift 1 Morning" />
                <div className="col-span-8 bg-amber-900/30 border-r border-slate-700" title="Shift 2 Afternoon" />
                <div className="col-span-2 bg-indigo-900/30" title="Shift 3 Night" />
              </div>

              {/* Hour Labels */}
              <div className="w-full flex justify-between px-2 text-[11px] font-mono text-slate-400 z-10">
                {hourTicks.map(hour => (
                  <span key={hour} className="-translate-x-1/2">
                    {String(hour).padStart(2, '0')}:00
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Swimlanes per Line */}
          <div className="divide-y divide-slate-800/80">
            {lines.map(line => {
              const lineEvents = dayEvents.filter(e => e.productionLineId === line.id);

              return (
                <div 
                  key={line.id}
                  className="grid grid-cols-[200px_1fr] transition-colors hover:bg-slate-900/30 group"
                >
                  {/* Line Column */}
                  <div className="p-3.5 border-r border-slate-800 bg-slate-950/40 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 text-xs">
                        {line.lineName}
                      </div>
                      <div className="font-mono text-[10px] text-slate-500">
                        {line.lineCode}
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                      {lineEvents.length} runs
                    </span>
                  </div>

                  {/* 24-hour Lane */}
                  <div className="relative h-20 bg-slate-900/40 overflow-hidden">
                    {/* Background grid lines for every 2 hours */}
                    <div className="absolute inset-0 flex justify-between pointer-events-none">
                      {Array.from({ length: 13 }).map((_, i) => (
                        <div key={i} className="h-full border-r border-slate-800/50" />
                      ))}
                    </div>

                    {/* Current Time Marker */}
                    {currentHourPercentage !== null && (
                      <div 
                        className="absolute top-0 bottom-0 z-20 pointer-events-none flex flex-col items-center"
                        style={{ left: `${currentHourPercentage}%` }}
                      >
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-md animate-pulse -mt-1" />
                        <div className="w-0.5 h-full bg-red-500/80" />
                      </div>
                    )}

                    {/* Event Blocks */}
                    {lineEvents.map(evt => {
                      const start = toSafeDate(evt.plannedStart);
                      const finish = toSafeDate(evt.plannedFinish);
                      
                      const startHour = start.getHours() + start.getMinutes() / 60;
                      let duration = (finish.getTime() - start.getTime()) / (1000 * 60 * 60);
                      if (duration <= 0) duration = 2; // minimum visual block
                      
                      const leftPercent = Math.max(0, Math.min(100, (startHour / 24) * 100));
                      const widthPercent = Math.max(4, Math.min(100 - leftPercent, (duration / 24) * 100));

                      const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                      const uom = getUomCode(evt.unitOfMeasureId);

                      return (
                        <div
                          key={evt.id}
                          onClick={() => onOpenDetails(evt)}
                          style={{
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`
                          }}
                          className={`absolute top-2 bottom-2 rounded-lg border p-2 cursor-pointer shadow-sm transition-all duration-200 hover:scale-[1.01] hover:z-30 flex flex-col justify-between overflow-hidden ${getStatusColor(evt.productionStatus)}`}
                          title={`${evt.productCodeSnapshot} (${formatTime(start)} - ${formatTime(finish)})`}
                        >
                          <div className="flex items-center justify-between gap-1 overflow-hidden">
                            <span className="font-mono text-xs font-bold truncate">
                              {evt.productCodeSnapshot}
                            </span>
                            <span className="text-[10px] font-semibold uppercase tracking-wider shrink-0 bg-black/30 px-1.5 py-0.2 rounded">
                              {evt.productionStatus}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[10px] opacity-90 truncate">
                            <span>{formatTime(start)} - {formatTime(finish)}</span>
                            <span className="font-semibold">
                              {evt.actualQuantity ? `${evt.actualQuantity} / ` : ''}{evt.plannedQuantity} {uom}
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {lineEvents.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-600 italic">
                        No production scheduled on this line today
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

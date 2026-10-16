import React from 'react';
import { ProductionEvent, ProductionStatus } from '../../../../types/production';
import { Play, Pause, CheckCircle2, AlertTriangle, Square, Clock, MoreVertical, Edit3 } from 'lucide-react';
import { toSafeDate } from '../../../../utils/timeFormatters';

interface ProductionRunCardProps {
  event: ProductionEvent;
  lineName?: string;
  uomCode?: string;
  onOpenDetails: (event: ProductionEvent) => void;
  onTriggerAction: (event: ProductionEvent, actionType: string) => void;
  compact?: boolean;
}

export const ProductionRunCard: React.FC<ProductionRunCardProps> = ({
  event,
  lineName,
  uomCode = 'CS',
  onOpenDetails,
  onTriggerAction,
  compact = false
}) => {
  const startDate = toSafeDate(event.plannedStart);
  const finishDate = toSafeDate(event.plannedFinish);

  const formatTime = (d: Date) => {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const planned = event.plannedQuantity ?? 0;
  const actual = event.actualQuantity ?? 0;
  const progressPercent = planned > 0 ? Math.min(100, Math.round((actual / planned) * 100)) : 0;

  // Status Styling
  const getStatusConfig = (status: ProductionStatus) => {
    switch (status) {
      case 'RUNNING':
        return {
          border: 'border-emerald-500/40 bg-emerald-950/20',
          badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          dot: 'bg-emerald-400 animate-pulse',
          label: 'Running'
        };
      case 'DELAYED':
        return {
          border: 'border-amber-500/50 bg-amber-950/20',
          badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          dot: 'bg-amber-400',
          label: 'Delayed'
        };
      case 'STOPPED':
        return {
          border: 'border-red-500/50 bg-red-950/20',
          badge: 'bg-red-500/20 text-red-300 border-red-500/40',
          dot: 'bg-red-400',
          label: 'Stopped'
        };
      case 'ENDING':
        return {
          border: 'border-purple-500/40 bg-purple-950/20',
          badge: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
          dot: 'bg-purple-400',
          label: 'Ending'
        };
      case 'COMPLETE':
        return {
          border: 'border-slate-700 bg-slate-900/60',
          badge: 'bg-slate-800 text-slate-300 border-slate-700',
          dot: 'bg-slate-400',
          label: 'Complete'
        };
      case 'CANCELLED':
        return {
          border: 'border-slate-800 bg-slate-950/40 opacity-60',
          badge: 'bg-slate-800 text-slate-500 border-slate-700',
          dot: 'bg-slate-600',
          label: 'Cancelled'
        };
      case 'PLANNED':
      default:
        return {
          border: 'border-cyan-500/30 bg-cyan-950/10',
          badge: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
          dot: 'bg-cyan-400',
          label: 'Planned'
        };
    }
  };

  const statusConfig = getStatusConfig(event.productionStatus);

  if (compact) {
    return (
      <div 
        onClick={() => onOpenDetails(event)}
        className={`group p-2.5 rounded-lg border text-left cursor-pointer transition-all hover:border-brand-500 hover:shadow-md ${statusConfig.border}`}
      >
        <div className="flex items-center justify-between gap-1 mb-1.5">
          <span className="font-mono text-xs font-semibold text-slate-100 truncate">
            {event.productCodeSnapshot}
          </span>
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${statusConfig.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
            {statusConfig.label}
          </span>
        </div>

        <div className="text-[11px] text-slate-400 truncate mb-2" title={event.descriptionSnapshot}>
          {event.descriptionSnapshot}
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1">
          <span className="flex items-center gap-1 text-slate-400">
            <Clock className="w-3 h-3 text-slate-500" />
            {formatTime(startDate)} - {formatTime(finishDate)}
          </span>
          <span className="font-semibold text-slate-200">
            {actual > 0 ? `${actual.toLocaleString()} / ` : ''}{planned.toLocaleString()} {uomCode}
          </span>
        </div>

        {event.productionStatus === 'RUNNING' && (
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div 
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {event.delayReason && (
          <div className="mt-1 text-[10px] text-amber-300 flex items-center gap-1 truncate bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
            <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate">{event.delayReason}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-xl border transition-all shadow-sm hover:shadow-md hover:border-brand-500/60 flex flex-col justify-between ${statusConfig.border}`}>
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-slate-100">
                {event.productCodeSnapshot}
              </span>
              {lineName && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {lineName}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-300 font-medium line-clamp-1 mt-0.5" title={event.descriptionSnapshot}>
              {event.descriptionSnapshot}
            </p>
          </div>

          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border ${statusConfig.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
            {statusConfig.label}
          </span>
        </div>

        {/* Schedule & Quantity Metrics */}
        <div className="grid grid-cols-2 gap-2 my-3 p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80 text-xs">
          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">Scheduled Window</span>
            <div className="font-medium text-slate-200 mt-0.5 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{formatTime(startDate)} - {formatTime(finishDate)}</span>
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">Target Output</span>
            <div className="font-medium text-slate-200 mt-0.5">
              {actual > 0 ? (
                <span>
                  <strong className="text-emerald-400">{actual.toLocaleString()}</strong> / {planned.toLocaleString()} {uomCode}
                </span>
              ) : (
                <span>{planned.toLocaleString()} {uomCode}</span>
              )}
            </div>
          </div>
        </div>

        {/* Live Progress Bar for active runs */}
        {['RUNNING', 'ENDING', 'DELAYED'].includes(event.productionStatus) && planned > 0 && (
          <div className="space-y-1 mb-3">
            <div className="flex justify-between text-[11px] text-slate-400 font-medium">
              <span>Run Progress</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700/50">
              <div 
                className={`h-2 rounded-full transition-all duration-500 ${event.productionStatus === 'DELAYED' ? 'bg-amber-400' : 'bg-emerald-400'}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Delay Alert */}
        {event.delayReason && (
          <div className="mb-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <div>
              <span className="font-semibold">Delay logged:</span> {event.delayReason}
            </div>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 gap-2 mt-1">
        <button
          onClick={() => onOpenDetails(event)}
          className="text-xs font-medium text-slate-400 hover:text-slate-100 transition-colors"
        >
          View Details
        </button>

        <div className="flex items-center gap-1.5">
          {event.productionStatus === 'PLANNED' && (
            <button
              onClick={() => onTriggerAction(event, 'START')}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition-colors shadow-sm"
              title="Start Production Run"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Start</span>
            </button>
          )}

          {['RUNNING', 'DELAYED'].includes(event.productionStatus) && (
            <>
              <button
                onClick={() => onTriggerAction(event, 'UPDATE_QTY')}
                className="px-2 py-1 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors"
                title="Log Actual Output Quantity"
              >
                Output Qty
              </button>
              {event.productionStatus !== 'DELAYED' && (
                <button
                  onClick={() => onTriggerAction(event, 'DELAY')}
                  className="p-1 text-amber-400 hover:bg-slate-800 rounded border border-transparent hover:border-amber-500/30 transition-colors"
                  title="Log Line Delay"
                >
                  <Clock className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => onTriggerAction(event, 'COMPLETE')}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition-colors"
                title="Complete Run"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Complete</span>
              </button>
            </>
          )}

          {event.productionStatus === 'STOPPED' && (
            <button
              onClick={() => onTriggerAction(event, 'START')}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition-colors"
              title="Resume Production Run"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Resume</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

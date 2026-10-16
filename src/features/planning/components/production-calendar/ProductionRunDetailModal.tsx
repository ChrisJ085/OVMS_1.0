import React from 'react';
import { ProductionEvent } from '../../../../types/production';
import { ProductionLine, UnitOfMeasure } from '../../../../types/configuration';
import { 
  X, 
  Calendar, 
  Clock, 
  Factory, 
  Box, 
  AlertTriangle, 
  Play, 
  CheckCircle2, 
  Square, 
  FileText,
  TrendingUp,
  Activity
} from 'lucide-react';
import { toSafeDate } from '../../../../utils/timeFormatters';

interface ProductionRunDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  event?: ProductionEvent;
  lines: ProductionLine[];
  uoms: UnitOfMeasure[];
  onTriggerAction: (event: ProductionEvent, actionType: string) => void;
  onEdit: (event: ProductionEvent) => void;
}

export const ProductionRunDetailModal: React.FC<ProductionRunDetailModalProps> = ({
  isOpen,
  onClose,
  event,
  lines,
  uoms,
  onTriggerAction,
  onEdit
}) => {
  if (!isOpen || !event) return null;

  const line = lines.find(l => l.id === event.productionLineId);
  const lineName = line?.lineName || event.productionLineId;
  const lineCode = line?.lineCode || '';
  const uom = uoms.find(u => u.id === event.unitOfMeasureId)?.code || 'CS';

  const plannedStart = toSafeDate(event.plannedStart);
  const plannedFinish = toSafeDate(event.plannedFinish);
  const actualStart = event.actualStart ? toSafeDate(event.actualStart) : null;
  const actualFinish = event.actualFinish ? toSafeDate(event.actualFinish) : null;

  const plannedQty = event.plannedQuantity || 0;
  const actualQty = event.actualQuantity || 0;
  const variance = actualQty - plannedQty;
  const progressPercent = plannedQty > 0 ? Math.min(100, Math.round((actualQty / plannedQty) * 100)) : 0;

  const formatDate = (d: Date) => {
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + ' ' +
           d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RUNNING': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'DELAYED': return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'STOPPED': return 'bg-red-500/20 text-red-300 border-red-500/40';
      case 'ENDING': return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      case 'COMPLETE': return 'bg-slate-800 text-slate-300 border-slate-700';
      default: return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-brand-500/10 text-brand-400 border border-brand-500/20">
              <Factory className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-bold text-slate-100">
                  {event.productCodeSnapshot}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${getStatusColor(event.productionStatus)}`}>
                  {event.productionStatus}
                </span>
              </div>
              <p className="text-xs text-slate-400">{event.descriptionSnapshot}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Production Line Banner */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div className="flex items-center gap-2.5">
              <Factory className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-400">Assigned Production Line:</span>
              <span className="text-xs font-semibold text-slate-100">{lineName}</span>
              {lineCode && (
                <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">
                  {lineCode}
                </span>
              )}
            </div>
            {line?.status && (
              <span className="text-[10px] uppercase font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                {line.status}
              </span>
            )}
          </div>

          {/* Quantity Metrics & Progress */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-brand-400" />
              <span>Production Target & Output</span>
            </h4>

            <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-slate-950/70 border border-slate-800">
              <div>
                <span className="text-[11px] text-slate-500 font-medium">Planned Target</span>
                <div className="text-lg font-bold text-slate-200 mt-0.5">
                  {plannedQty.toLocaleString()} <span className="text-xs font-normal text-slate-400">{uom}</span>
                </div>
              </div>

              <div>
                <span className="text-[11px] text-slate-500 font-medium">Actual Output</span>
                <div className="text-lg font-bold text-emerald-400 mt-0.5">
                  {actualQty.toLocaleString()} <span className="text-xs font-normal text-slate-400">{uom}</span>
                </div>
              </div>

              <div>
                <span className="text-[11px] text-slate-500 font-medium">Adherence / Variance</span>
                <div className="text-lg font-bold mt-0.5">
                  <span className={variance >= 0 ? 'text-emerald-400' : 'text-amber-400'}>
                    {variance > 0 ? `+${variance.toLocaleString()}` : variance.toLocaleString()} {uom}
                  </span>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            {plannedQty > 0 && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>Batch Completion</span>
                  <span className="font-semibold text-slate-200">{progressPercent}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-700">
                  <div
                    className={`h-2.5 rounded-full transition-all duration-500 ${
                      event.productionStatus === 'DELAYED' ? 'bg-amber-400' : 'bg-emerald-400'
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Time & Shift Windows */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span>Shift Timing & Execution Window</span>
            </h4>

            <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
              <div className="space-y-2">
                <span className="font-semibold text-slate-300">Planned Window</span>
                <div>
                  <div className="text-[11px] text-slate-500">Planned Start:</div>
                  <div className="font-medium text-slate-200">{formatDate(plannedStart)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Planned Finish:</div>
                  <div className="font-medium text-slate-200">{formatDate(plannedFinish)}</div>
                </div>
              </div>

              <div className="space-y-2 border-l border-slate-800/80 pl-4">
                <span className="font-semibold text-slate-300">Actual Recorded</span>
                <div>
                  <div className="text-[11px] text-slate-500">Actual Start:</div>
                  <div className="font-medium text-slate-200">
                    {actualStart ? formatDate(actualStart) : <span className="text-slate-500 italic">Not started yet</span>}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Actual Finish:</div>
                  <div className="font-medium text-slate-200">
                    {actualFinish ? formatDate(actualFinish) : <span className="text-slate-500 italic">In progress / Pending</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Delay Details (if logged) */}
          {event.delayReason && (
            <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/30 space-y-1">
              <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs">
                <AlertTriangle className="w-4 h-4" />
                <span>Line Delay Notice</span>
              </div>
              <p className="text-xs text-amber-200">{event.delayReason}</p>
            </div>
          )}

          {/* Operator Notes */}
          {event.notes && (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <div className="flex items-center gap-2 text-slate-400 font-semibold text-xs">
                <FileText className="w-4 h-4" />
                <span>Notes & Annotations</span>
              </div>
              <p className="text-xs text-slate-300 whitespace-pre-wrap">{event.notes}</p>
            </div>
          )}
        </div>

        {/* Modal Actions Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onEdit(event);
              }}
              className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
            >
              Edit Details
            </button>
          </div>

          <div className="flex items-center gap-2">
            {event.productionStatus === 'PLANNED' && (
              <button
                onClick={() => {
                  onClose();
                  onTriggerAction(event, 'START');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-sm"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Start Production</span>
              </button>
            )}

            {['RUNNING', 'DELAYED'].includes(event.productionStatus) && (
              <>
                <button
                  onClick={() => {
                    onClose();
                    onTriggerAction(event, 'UPDATE_QTY');
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
                >
                  Update Qty
                </button>
                {event.productionStatus !== 'DELAYED' && (
                  <button
                    onClick={() => {
                      onClose();
                      onTriggerAction(event, 'DELAY');
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition-colors"
                  >
                    Log Delay
                  </button>
                )}
                <button
                  onClick={() => {
                    onClose();
                    onTriggerAction(event, 'COMPLETE');
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Complete Run</span>
                </button>
              </>
            )}

            {event.productionStatus === 'STOPPED' && (
              <button
                onClick={() => {
                  onClose();
                  onTriggerAction(event, 'START');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Resume Production</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

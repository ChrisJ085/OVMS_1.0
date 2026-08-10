import React, { useState } from 'react';
import {
  ProductionDayEventSummary,
  getEventHeaderBackground,
  PRODUCTION_EVENT_COLOURS,
} from '../../services/changeoverEngine';
import { AlertTriangle, Info, Sparkles } from 'lucide-react';

interface LineDayHeaderCellProps {
  date: Date;
  summary: ProductionDayEventSummary;
  isToday?: boolean;
  onClick?: () => void;
}

export const LineDayHeaderCell: React.FC<LineDayHeaderCellProps> = ({
  date,
  summary,
  isToday = false,
  onClick,
}) => {
  const [showTooltip, setShowTooltip] = useState<boolean>(false);

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const fullDaysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fullMonthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const dayOfWeekStr = daysOfWeek[date.getUTCDay()];
  const dayNumStr = String(date.getUTCDate()).padStart(2, '0');
  const monthNumStr = String(date.getUTCMonth() + 1).padStart(2, '0');

  const fullDateStr = `${fullDaysOfWeek[date.getUTCDay()]} ${date.getUTCDate()} ${
    fullMonthNames[date.getUTCMonth()]
  } ${date.getUTCFullYear()}`;

  const hasEvents = summary.events.length > 0;
  const bgStyle = getEventHeaderBackground(summary.events);

  return (
    <div
      className="relative group cursor-pointer select-none"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={(e) => {
        if (onClick) {
          e.stopPropagation();
          onClick();
        } else {
          setShowTooltip(prev => !prev);
        }
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (onClick) {
            e.stopPropagation();
            onClick();
          } else {
            setShowTooltip(prev => !prev);
          }
        }
      }}
      tabIndex={0}
      role="button"
      aria-expanded={showTooltip}
      aria-label={`Production Line Header for ${fullDateStr}: ${summary.summaryNoteText}`}
    >
      {/* Header Cell Content */}
      <div
        className={`px-2 py-1.5 rounded text-center border font-mono transition-all duration-150 ${
          hasEvents
            ? 'border-slate-900 shadow-sm text-slate-950 font-bold'
            : isToday
            ? 'bg-brand-500/20 text-brand-300 border-brand-500/40 font-semibold'
            : 'bg-slate-800/80 text-slate-300 border-slate-700/60 font-medium hover:bg-slate-750'
        }`}
        style={hasEvents ? { background: bgStyle } : undefined}
      >
        <div className="text-[11px] uppercase tracking-tight flex items-center justify-center gap-1">
          <span>{dayOfWeekStr}</span>
          <span>{dayNumStr}.{monthNumStr}</span>
          {summary.missingCategoryWarning && (
            <AlertTriangle className="w-3 h-3 text-amber-900 shrink-0 inline animate-pulse" />
          )}
        </div>

        {/* Small badge overlay if note text exists */}
        {hasEvents && (
          <div className="text-[9px] font-sans font-extrabold uppercase tracking-tighter truncate max-w-[100px] mx-auto mt-0.5 text-slate-950/90 drop-shadow-sm">
            {summary.events.length === 1
              ? summary.events[0] === 'FORMAT_CHANGE'
                ? 'FORMAT'
                : summary.events[0] === 'GRADE_CHANGE'
                ? 'GRADE'
                : summary.events[0] === 'CLEAN'
                ? 'CLEAN'
                : summary.events[0] === 'MAINT_SHUT'
                ? 'MAINT'
                : 'TRIAL'
              : `${summary.events.length} EVENTS`}
          </div>
        )}
      </div>

      {/* Tooltip detail popup */}
      {showTooltip && (
        <div className="absolute z-40 top-full left-1/2 -translate-x-1/2 mt-2 w-64 p-3 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl text-left text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-150 pointer-events-none">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <span className="font-semibold text-slate-100">{fullDateStr}</span>
            {isToday && (
              <span className="px-1.5 py-0.5 text-[9px] font-bold bg-brand-500 text-slate-950 rounded uppercase">
                Today
              </span>
            )}
          </div>

          {!hasEvents && !summary.missingCategoryWarning && (
            <div className="text-slate-400 text-[11px]">
              Normal scheduled production. No events.
            </div>
          )}

          {hasEvents && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-brand-400 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>Planning Events & Notes:</span>
              </div>
              <div className="font-medium text-slate-200 bg-slate-950 px-2.5 py-1 rounded border border-slate-800 text-xs">
                {summary.summaryNoteText}
              </div>

              {/* Transitions (Format / Grade changes) */}
              {summary.transitions && summary.transitions.length > 0 && (
                <div className="space-y-1 pt-1">
                  {summary.transitions.map((t, idx) => (
                    <div key={idx} className="text-[11px] font-mono bg-slate-950/80 p-1.5 rounded border border-slate-800">
                      <div className="text-[10px] font-bold uppercase flex items-center gap-1" style={{ color: PRODUCTION_EVENT_COLOURS[t.eventType] }}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PRODUCTION_EVENT_COLOURS[t.eventType] }} />
                        {t.eventType === 'FORMAT_CHANGE' ? 'Format Change' : 'Grade Change'}:
                      </div>
                      <div className="text-[11px] text-slate-300 whitespace-pre-line mt-0.5">
                        {t.reason}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Scheduled Clean details */}
              {summary.scheduledClean && (
                <div className="text-[11px] text-orange-300 font-medium pt-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PRODUCTION_EVENT_COLOURS.CLEAN }} />
                  <span>Scheduled Clean Day for {summary.productionLineName}</span>
                </div>
              )}

              {/* Maintenance Shutdown details */}
              {summary.maintenanceEvents && summary.maintenanceEvents.length > 0 && (
                <div className="text-[11px] text-green-300 font-medium pt-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PRODUCTION_EVENT_COLOURS.MAINT_SHUT }} />
                  <span>Maintenance Shutdown</span>
                </div>
              )}

              {/* Trial details */}
              {summary.trialEvents && summary.trialEvents.length > 0 && (
                <div className="text-[11px] text-amber-300 font-medium pt-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PRODUCTION_EVENT_COLOURS.RSR_TRIAL }} />
                  <span>RSR Trial Scheduled</span>
                </div>
              )}
            </div>
          )}

          {summary.warnings && summary.warnings.length > 0 ? (
            summary.warnings.map((warn, idx) => (
              <div key={idx} className="mt-2 p-2 bg-amber-950/60 border border-amber-800/80 rounded text-[11px] text-amber-300 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>{warn}</span>
              </div>
            ))
          ) : summary.missingCategoryWarning ? (
            <div className="mt-2 p-2 bg-amber-950/60 border border-amber-800/80 rounded text-[11px] text-amber-300 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>
                Unable to determine change type because Product Category is missing for one or more scheduled products.
              </span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

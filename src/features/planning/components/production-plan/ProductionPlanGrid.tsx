import React from 'react';
import { StickyNote, Sparkles, AlertTriangle } from 'lucide-react';
import { ProductionLine, ProductCategory } from '../../../../types/configuration';
import { Product } from '../../../../types/product';
import { ProductionPlanEntry, ProductionLinePlanNote } from '../../../../types/production';
import {
  calculateDayEventSummary,
  PRODUCTION_EVENT_COLOURS,
} from '../../services/changeoverEngine';
import { LineDayHeaderCell } from './LineDayHeaderCell';

export const formatUTCDate = (d: Date) => {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
};

interface ProductionPlanGridProps {
  productionLines: ProductionLine[];
  activeEntries: ProductionPlanEntry[];
  gridNotes: ProductionLinePlanNote[];
  gridDates: Date[];
  products?: Product[];
  categories?: ProductCategory[];
  isFiltered?: boolean;
}

export const ProductionPlanGrid: React.FC<ProductionPlanGridProps> = ({
  productionLines,
  activeEntries,
  gridNotes,
  gridDates,
  products = [],
  categories = [],
  isFiltered = false
}) => {
  const today = new Date();
  const isTodayColumn = (date: Date) => {
    return date.getUTCFullYear() === today.getUTCFullYear() &&
           date.getUTCMonth() === today.getUTCMonth() &&
           date.getUTCDate() === today.getUTCDate();
  };

  if (productionLines.length === 0) {
    return (
      <div className="p-12 text-center text-slate-500">
        No active production lines configured. Go to site master database to seed.
      </div>
    );
  }

  // Check if any matching entries exist overall across all lines when filtering
  const totalMatchingSKUs = productionLines.reduce((acc, line) => {
    const lineEntries = activeEntries.filter(e => e.productionLineId.toUpperCase() === line.lineCode.toUpperCase());
    return acc + new Set(lineEntries.map(e => e.productCodeSnapshot)).size;
  }, 0);

  if (isFiltered && totalMatchingSKUs === 0) {
    return (
      <div className="p-12 text-center text-slate-400 space-y-2 bg-slate-900/40 rounded-lg border border-slate-800">
        <div className="text-base font-semibold text-slate-200">No Production Entries Match Your Filter</div>
        <p className="text-xs text-slate-400">Try adjusting or clearing your Production Line, SKU search, or Today's SKUs filter.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[1000px]">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-900/80">
            <th className="p-4 text-xs font-bold text-slate-300 uppercase tracking-wider w-64">
              Production Line / SKU
            </th>
            {gridDates.map((date, idx) => {
              const isToday = isTodayColumn(date);
              return (
                <th 
                  key={idx} 
                  className={`p-3 text-xs font-semibold uppercase tracking-wider text-center border-l border-slate-850 transition-colors ${
                    isToday ? 'bg-brand-500/10 text-brand-300 border-b-2 border-b-brand-500' : 'text-slate-400'
                  }`}
                >
                  {isToday && (
                    <div className="inline-block px-1.5 py-0.5 mb-1 rounded text-[9px] font-bold bg-brand-500 text-slate-950 uppercase tracking-wider">
                      Today
                    </div>
                  )}
                  <div>{['SUN','MON','TUE','WED','THU','FRI','SAT'][date.getUTCDay()]}</div>
                  <div className={isToday ? 'text-brand-300 font-semibold' : 'text-slate-500 font-normal'}>
                    {String(date.getUTCDate()).padStart(2, '0')}/{String(date.getUTCMonth() + 1).padStart(2, '0')}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {productionLines.map(line => {
            const lineEntries = activeEntries.filter(e => e.productionLineId.toUpperCase() === line.lineCode.toUpperCase());
            const scheduledSKUs = Array.from(new Set(lineEntries.map(e => e.productCodeSnapshot)));

            // Calculate day summaries for this line across all grid dates
            const daySummaries = gridDates.map(date =>
              calculateDayEventSummary(line, date, lineEntries, products, categories)
            );

            const hasAnyEventsOnLine = daySummaries.some(s => s.events.length > 0 || s.missingCategoryWarning);

            if (scheduledSKUs.length === 0) {
              if (isFiltered) return null; // Hide non-matching lines when filtering
              return (
                <React.Fragment key={line.id}>
                  {/* Line Title Bar */}
                  <tr className="border-b border-slate-850 bg-slate-900/40">
                    <td colSpan={8} className="p-3 text-xs font-semibold text-slate-300">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-bold text-slate-200">{line.lineName}</span>
                          <span className="text-slate-500 font-mono ml-2">({line.sapResourceCode || line.lineCode})</span>
                        </div>
                        {line.scheduledCleanDay && line.scheduledCleanDay !== 'None' && (
                          <span className="text-[10px] px-2 py-0.5 bg-pink-950 text-pink-300 border border-pink-800 rounded font-medium">
                            Scheduled Clean: {line.scheduledCleanDay}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Line Specific Date Header Row */}
                  <tr className="border-b border-slate-800 bg-slate-950/60">
                    <td className="p-2 pl-4 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Operational Schedule
                    </td>
                    {gridDates.map((date, idx) => (
                      <td key={idx} className="p-1.5 border-l border-slate-850">
                        <LineDayHeaderCell
                          date={date}
                          summary={daySummaries[idx]}
                          isToday={isTodayColumn(date)}
                        />
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="p-4 font-medium text-slate-300">
                      <div className="text-xs text-slate-500 font-mono">No Active SKUs</div>
                    </td>
                    <td colSpan={7} className="p-4 text-center text-slate-500 italic text-xs">
                      No production scheduled for this line within this period.
                    </td>
                  </tr>
                </React.Fragment>
              );
            }

            return (
              <React.Fragment key={line.id}>
                {/* Line Title Header Bar */}
                <tr className="border-b border-slate-800 bg-slate-900/60">
                  <td colSpan={8} className="p-3 bg-slate-900/80 text-xs font-semibold text-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-100">{line.lineName}</span>
                        <span className="text-slate-400 font-mono text-xs bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                          {line.sapResourceCode || line.lineCode}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {line.scheduledCleanDay && line.scheduledCleanDay !== 'None' && (
                          <span className="text-[11px] px-2 py-0.5 bg-pink-950/80 text-pink-300 border border-pink-800/80 rounded font-medium flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PRODUCTION_EVENT_COLOURS.CLEAN }} />
                            Clean Day: {line.scheduledCleanDay}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>

                {/* Requirement 4: Per-Line Day / Date Header Row with Event Color Highlights */}
                <tr className="border-b border-slate-800 bg-slate-950/80">
                  <td className="p-2 pl-4 text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                    {line.lineCode} Schedule Events
                  </td>
                  {gridDates.map((date, idx) => (
                    <td key={idx} className="p-1.5 border-l border-slate-850">
                      <LineDayHeaderCell
                        date={date}
                        summary={daySummaries[idx]}
                        isToday={isTodayColumn(date)}
                      />
                    </td>
                  ))}
                </tr>

                {/* Scheduled SKUs Rows */}
                {scheduledSKUs.map(sku => {
                  const sampleEntry = lineEntries.find(e => e.productCodeSnapshot === sku);
                  const desc = sampleEntry?.descriptionSnapshot || 'Unknown Product';

                  return (
                    <tr key={sku} className="border-b border-slate-850/50 hover:bg-slate-900/20 transition-colors">
                      <td className="p-3 pl-6">
                        <div className="font-semibold text-slate-200 text-xs font-mono">{sku}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[220px]" title={desc}>
                          {desc}
                        </div>
                      </td>
                      {gridDates.map((date, idx) => {
                        const isToday = isTodayColumn(date);
                        const entry = lineEntries.find(e => {
                          const entryDate = e.productionDate.toDate();
                          return entryDate.getUTCFullYear() === date.getUTCFullYear() &&
                                 entryDate.getUTCMonth() === date.getUTCMonth() &&
                                 entryDate.getUTCDate() === date.getUTCDate() &&
                                 e.productCodeSnapshot === sku;
                        });

                        return (
                          <td 
                            key={idx} 
                            className={`p-3 text-center border-l border-slate-900 min-w-[120px] ${
                              isToday ? 'bg-brand-500/5' : 'bg-slate-900/5'
                            }`}
                          >
                            {entry ? (
                              <div className="flex flex-col gap-1 items-center">
                                <div className="text-xs font-bold text-brand-400">
                                  {Number(entry.plannedCases).toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">CS</span>
                                </div>
                                <div className="text-[10px] text-slate-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 font-mono">
                                  {entry.plannedPallets !== null && entry.plannedPallets !== undefined ? (
                                    `${entry.plannedPallets} Pallets`
                                  ) : (
                                    <span className="text-amber-400 italic">Not calculated</span>
                                  )}
                                </div>
                                {entry.status !== 'PLANNED' && (
                                  <span className="text-[9px] px-1 bg-amber-500/10 text-amber-400 rounded">
                                    {entry.status}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-700 text-xs">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {/* Line Totals row */}
                <tr className="border-b border-slate-800 bg-slate-900/30 font-medium">
                  <td className="p-3 pl-6 text-xs text-slate-400 uppercase tracking-wider font-semibold">
                    {line.lineName} Totals
                  </td>
                  {gridDates.map((date, idx) => {
                    const isToday = isTodayColumn(date);
                    const dayEntries = lineEntries.filter(e => {
                      const entryDate = e.productionDate.toDate();
                      return entryDate.getUTCFullYear() === date.getUTCFullYear() &&
                             entryDate.getUTCMonth() === date.getUTCMonth() &&
                             entryDate.getUTCDate() === date.getUTCDate();
                    });

                    const sumCases = dayEntries.reduce((acc, curr) => acc + curr.plannedCases, 0);
                    const sumPallets = Math.round(
                      dayEntries.reduce((acc, curr) => acc + (curr.plannedPallets || 0), 0) * 100
                    ) / 100;

                    return (
                      <td key={idx} className={`p-3 text-center border-l border-slate-850 text-xs ${isToday ? 'bg-brand-500/5' : ''}`}>
                        {sumCases > 0 ? (
                          <div className="font-semibold text-slate-200">
                            <div>{sumCases.toLocaleString()} cs</div>
                            <div className="text-[10px] text-slate-400 font-mono">{sumPallets} pal</div>
                          </div>
                        ) : (
                          <span className="text-slate-700">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>

                {/* Requirement 2 & 15: Automated Production Planning Notes Row */}
                {hasAnyEventsOnLine && (
                  <tr className="border-b border-slate-800 bg-slate-950/70">
                    <td className="p-3 pl-6 text-xs text-slate-300 font-semibold align-top">
                      <div className="flex items-center gap-1.5 text-amber-400">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>Automated Planning Notes</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-normal mt-0.5">
                        Derived from schedule & line config
                      </p>
                    </td>
                    {gridDates.map((date, idx) => {
                      const summary = daySummaries[idx];
                      const isToday = isTodayColumn(date);

                      if (summary.events.length === 0 && !summary.missingCategoryWarning) {
                        return (
                          <td key={idx} className={`p-2 border-l border-slate-850 text-center text-[10px] text-slate-600 ${isToday ? 'bg-brand-500/5' : ''}`}>
                            -
                          </td>
                        );
                      }

                      return (
                        <td key={idx} className={`p-2 border-l border-slate-850 align-top text-left ${isToday ? 'bg-brand-500/5' : ''}`}>
                          <div className="space-y-1">
                            {summary.events.map(event => (
                              <div
                                key={event}
                                className={`px-2 py-1 rounded text-[10px] font-bold tracking-tight text-slate-950 shadow-sm ${
                                  event === 'FORMAT_CHANGE'
                                    ? 'bg-amber-400'
                                    : event === 'GRADE_CHANGE'
                                    ? 'bg-cyan-400'
                                    : 'bg-pink-400'
                                }`}
                              >
                                {event === 'FORMAT_CHANGE'
                                  ? 'Format Change'
                                  : event === 'GRADE_CHANGE'
                                  ? 'Grade Change'
                                  : 'Scheduled Clean'}
                              </div>
                            ))}

                            {/* Format change transitions */}
                            {summary.formatChanges.map((fc, i) => (
                              <div key={i} className="text-[10px] font-mono text-amber-300 bg-slate-900/90 p-1 rounded border border-amber-900/50 truncate">
                                {fc.fromProductCode} → {fc.toProductCode}
                              </div>
                            ))}

                            {/* Grade change transitions */}
                            {summary.gradeChanges.map((gc, i) => (
                              <div key={i} className="text-[10px] font-mono text-cyan-300 bg-slate-900/90 p-1 rounded border border-cyan-900/50 truncate">
                                {gc.fromCategoryName} → {gc.toCategoryName}
                              </div>
                            ))}

                            {/* Missing category warning */}
                            {summary.missingCategoryWarning && (
                              <div className="p-1 bg-amber-950/80 border border-amber-700/80 rounded text-[9px] text-amber-300 flex items-center gap-1" title="Missing Product Category">
                                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                                <span>Cat Missing</span>
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                )}

                {/* Active Manual Planner Notes for this line */}
                {gridNotes.filter(n => n.productionLineId.toUpperCase() === line.lineCode.toUpperCase()).length > 0 && (
                  <tr className="bg-slate-900/20 border-b border-slate-800">
                    <td colSpan={8} className="p-3 pl-6">
                      <div className="text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
                        <StickyNote className="w-3.5 h-3.5 text-amber-500" />
                        <span>Manual Planner Notes</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                        {gridNotes
                          .filter(n => n.productionLineId.toUpperCase() === line.lineCode.toUpperCase())
                          .map(note => (
                            <div key={note.id} className="p-2 bg-slate-900 border border-slate-850 rounded flex flex-col gap-0.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-200">{note.title}</span>
                                <span className={`text-[9px] px-1.5 py-0.2 rounded font-medium ${
                                  note.severity === 'CRITICAL' ? 'bg-red-500/10 text-red-400' :
                                  note.severity === 'WARNING' ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-800 text-slate-400'
                                }`}>
                                  {note.noteType}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 line-clamp-2">{note.note}</p>
                              <span className="text-[9px] text-slate-500 mt-1 self-end">
                                For {formatUTCDate(note.noteDate.toDate())}
                              </span>
                            </div>
                          ))}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};


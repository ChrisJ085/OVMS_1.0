import React from 'react';
import { StickyNote } from 'lucide-react';
import { ProductionLine } from '../../../../types/configuration';
import { ProductionPlanEntry, ProductionLinePlanNote } from '../../../../types/production';

export const formatUTCDate = (d: Date) => {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
};

interface ProductionPlanGridProps {
  productionLines: ProductionLine[];
  activeEntries: ProductionPlanEntry[];
  gridNotes: ProductionLinePlanNote[];
  gridDates: Date[];
}

export const ProductionPlanGrid: React.FC<ProductionPlanGridProps> = ({
  productionLines,
  activeEntries,
  gridNotes,
  gridDates
}) => {
  if (productionLines.length === 0) {
    return (
      <div className="p-12 text-center text-slate-500">
        No active production lines configured. Go to site master database to seed.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[1000px]">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-900/50">
            <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider w-64">Production Line / SKU</th>
            {gridDates.map((date, idx) => (
              <th key={idx} className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-center border-l border-slate-850">
                <div>{['SUN','MON','TUE','WED','THU','FRI','SAT'][date.getUTCDay()]}</div>
                <div className="text-slate-500 font-normal">{String(date.getUTCDate()).padStart(2, '0')}/{String(date.getUTCMonth() + 1).padStart(2, '0')}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {productionLines.map(line => {
            const lineEntries = activeEntries.filter(e => e.productionLineId.toUpperCase() === line.lineCode.toUpperCase());
            const scheduledSKUs = Array.from(new Set(lineEntries.map(e => e.productCodeSnapshot)));

            if (scheduledSKUs.length === 0) {
              return (
                <React.Fragment key={line.id}>
                  <tr className="border-b border-slate-850/80 bg-slate-900/10">
                    <td className="p-4 font-medium text-slate-300">
                      <div className="text-sm font-semibold">{line.lineName}</div>
                      <div className="text-xs text-slate-500 font-mono">Resource: {line.sapResourceCode || line.lineCode}</div>
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
                <tr className="border-b border-slate-850 bg-slate-900/30">
                  <td colSpan={8} className="p-3 bg-slate-900/50 text-xs font-semibold text-slate-300">
                    <span>{line.lineName}</span>
                    <span className="text-slate-500 font-mono ml-2">({line.sapResourceCode || line.lineCode})</span>
                  </td>
                </tr>

                {scheduledSKUs.map(sku => {
                  const sampleEntry = lineEntries.find(e => e.productCodeSnapshot === sku);
                  const desc = sampleEntry?.descriptionSnapshot || 'Unknown Product';

                  return (
                    <tr key={sku} className="border-b border-slate-850/50 hover:bg-slate-900/10 transition-colors">
                      <td className="p-3 pl-6">
                        <div className="font-semibold text-slate-300 text-xs">{sku}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[220px]" title={desc}>
                          {desc}
                        </div>
                      </td>
                      {gridDates.map((date, idx) => {
                        const entry = lineEntries.find(e => {
                          const entryDate = e.productionDate.toDate();
                          return entryDate.getUTCFullYear() === date.getUTCFullYear() &&
                                 entryDate.getUTCMonth() === date.getUTCMonth() &&
                                 entryDate.getUTCDate() === date.getUTCDate() &&
                                 e.productCodeSnapshot === sku;
                        });

                        return (
                          <td key={idx} className="p-3 text-center border-l border-slate-900 bg-slate-900/5 min-w-[120px]">
                            {entry ? (
                              <div className="flex flex-col gap-1 items-center">
                                <div className="text-xs font-semibold text-brand-400">
                                  {Number(entry.plannedCases).toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">CS</span>
                                </div>
                                <div className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
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
                <tr className="border-b border-slate-800 bg-slate-900/20 font-medium">
                  <td className="p-3 pl-6 text-xs text-slate-400 uppercase tracking-wider font-semibold">
                    {line.lineName} Totals
                  </td>
                  {gridDates.map((date, idx) => {
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
                      <td key={idx} className="p-3 text-center border-l border-slate-850 text-xs">
                        {sumCases > 0 ? (
                          <div className="font-semibold text-slate-200">
                            <div>{sumCases.toLocaleString()} cs</div>
                            <div className="text-[10px] text-slate-400">{sumPallets} pal</div>
                          </div>
                        ) : (
                          <span className="text-slate-700">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>

                {/* Planner Notes for this line in current period */}
                {gridNotes.filter(n => n.productionLineId.toUpperCase() === line.lineCode.toUpperCase()).length > 0 && (
                  <tr className="bg-slate-900/5">
                    <td colSpan={8} className="p-3 pl-6">
                      <div className="text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
                        <StickyNote className="w-3.5 h-3.5 text-amber-500" />
                        <span>Active Planner Notes</span>
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

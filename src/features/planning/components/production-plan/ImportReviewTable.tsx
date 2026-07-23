import React from 'react';
import { Search } from 'lucide-react';
import { ProductionPlanRow } from '../../../../types/production';

interface ImportReviewTableProps {
  rows: ProductionPlanRow[];
  reviewFilter: 'ALL' | 'VALID' | 'WARNING' | 'ERROR';
  reviewSearch: string;
  reviewLineFilter: string;
  onFilterChange: (filter: 'ALL' | 'VALID' | 'WARNING' | 'ERROR') => void;
  onSearchChange: (search: string) => void;
  onLineFilterChange: (line: string) => void;
}

export const ImportReviewTable: React.FC<ImportReviewTableProps> = ({
  rows,
  reviewFilter,
  reviewSearch,
  reviewLineFilter,
  onFilterChange,
  onSearchChange,
  onLineFilterChange
}) => {
  const lineOptions = Array.from(new Set(rows.map(r => r.productionLineCode)));

  const filteredRows = rows.filter(row => {
    const matchesSearch = row.productCode.includes(reviewSearch) || 
                          row.sourceProductDescription.toLowerCase().includes(reviewSearch.toLowerCase());
    const matchesLine = reviewLineFilter === 'ALL' || row.productionLineCode === reviewLineFilter;
    const matchesStatus = reviewFilter === 'ALL' || row.rowStatus === reviewFilter;
    return matchesSearch && matchesLine && matchesStatus;
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
        <div>
          <h3 className="font-bold text-slate-200">Granular Row Validation Trace</h3>
          <p className="text-xs text-slate-400">Filter and search the parsed rows before writing to active schedule collections.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded px-2 text-xs">
            <Search className="w-3.5 h-3.5 text-slate-500 mr-1.5" />
            <input
              type="text"
              placeholder="Search SKU..."
              value={reviewSearch}
              onChange={(e) => onSearchChange(e.target.value)}
              className="bg-transparent border-none text-slate-200 focus:outline-none py-1.5 w-32"
            />
          </div>
          <select
            value={reviewLineFilter}
            onChange={(e) => onLineFilterChange(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded px-2 py-1.5"
          >
            <option value="ALL">All Lines</option>
            {lineOptions.map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <select
            value={reviewFilter}
            onChange={(e) => onFilterChange(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded px-2 py-1.5"
          >
            <option value="ALL">All Statuses</option>
            <option value="VALID">Valid Rows Only</option>
            <option value="WARNING">Warnings Only</option>
            <option value="ERROR">Errors Only</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[40vh] overflow-y-auto border border-slate-850 rounded">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-950 border-b border-slate-850">
              <th className="p-3 font-semibold text-slate-400">Sheet / Row</th>
              <th className="p-3 font-semibold text-slate-400">Resource</th>
              <th className="p-3 font-semibold text-slate-400">Product SKU</th>
              <th className="p-3 font-semibold text-slate-400">Description</th>
              <th className="p-3 font-semibold text-slate-400 text-center">Date</th>
              <th className="p-3 font-semibold text-slate-400 text-right">Planned Qty</th>
              <th className="p-3 font-semibold text-slate-400 text-right">Pallets</th>
              <th className="p-3 font-semibold text-slate-400">Status / Diagnostic</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, idx) => (
              <tr key={idx} className="border-b border-slate-850/50 hover:bg-slate-950/40">
                <td className="p-3 text-slate-500 font-mono">
                  {row.sourceSheetName} <span className="text-slate-600">R{row.sourceRowNumber}</span>
                </td>
                <td className="p-3 font-mono text-slate-300">
                  {row.productionLineCode}
                </td>
                <td className="p-3 font-mono font-semibold text-slate-200">
                  {row.productCode}
                </td>
                <td className="p-3 truncate max-w-[180px]" title={row.sourceProductDescription}>
                  {row.sourceProductDescription}
                </td>
                <td className="p-3 text-center">
                  {`${row.productionDate.toDate().getUTCDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][row.productionDate.toDate().getUTCMonth()]}`}
                </td>
                <td className="p-3 text-right font-mono font-semibold">
                  {row.plannedQuantity.toLocaleString()} {row.sourceUnitOfMeasure}
                </td>
                <td className="p-3 text-right font-mono text-slate-400">
                  {row.calculatedPallets !== null && row.calculatedPallets !== undefined ? (
                    `${row.calculatedPallets} PAL`
                  ) : (
                    <span className="text-amber-400 font-sans italic text-[11px]">Not calculated</span>
                  )}
                </td>
                <td className="p-3">
                  <div className="flex flex-col gap-1">
                    <span className={`inline-flex items-center w-fit px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      row.rowStatus === 'ERROR' ? 'bg-red-500/10 text-red-400' :
                      row.rowStatus === 'WARNING' ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
                    }`}>
                      {row.rowStatus}
                    </span>
                    {row.validationMessages.map((msg, mIdx) => (
                      <span key={mIdx} className="text-[10px] text-slate-400 block max-w-[200px] break-words">
                        • {msg}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

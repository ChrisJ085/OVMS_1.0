import React from 'react';
import { RefreshCw } from 'lucide-react';
import { ProductionPlanImport, ProductionPlanRow } from '../../../../types/production';

interface ImportHistoryDetailProps {
  selectedImport: ProductionPlanImport | null;
  historyRows: ProductionPlanRow[];
  loadingDetails: boolean;
  onClose: () => void;
}

export const ImportHistoryDetail: React.FC<ImportHistoryDetailProps> = ({
  selectedImport,
  historyRows,
  loadingDetails,
  onClose
}) => {
  if (!selectedImport) {
    return (
      <div className="bg-slate-900 border border-slate-850 rounded-lg p-8 text-center text-slate-500 italic text-xs h-40 flex items-center justify-center">
        Select an import record on the left to trace historical planner row-by-row configurations.
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 className="font-bold text-slate-200 text-sm">Detailed Trace Auditing</h3>
          <p className="text-[10px] text-slate-400">Reviewing details for: {selectedImport.id}</p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-slate-300 text-xs"
        >
          Close
        </button>
      </div>

      <div className="space-y-2.5 text-xs">
        <div className="flex justify-between border-b border-slate-850 pb-1.5">
          <span className="text-slate-400">File Ingested</span>
          <strong className="text-slate-200 text-right truncate max-w-[150px]" title={selectedImport.fileName}>
            {selectedImport.fileName}
          </strong>
        </div>
        <div className="flex justify-between border-b border-slate-850 pb-1.5">
          <span className="text-slate-400">Parser Logic version</span>
          <strong className="text-slate-200 font-mono">{selectedImport.parserVersion}</strong>
        </div>
        {selectedImport.notes && (
          <div className="p-2 bg-slate-950 border border-slate-850 rounded text-[11px] text-slate-400">
            <span className="font-semibold block text-slate-300 mb-0.5">Auditor Notes:</span>
            {selectedImport.notes}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-xs font-semibold text-slate-300 mb-2">Ingested Plan Cells</h4>
        {loadingDetails ? (
          <div className="flex justify-center p-6">
            <RefreshCw className="w-5 h-5 text-brand-500 animate-spin" />
          </div>
        ) : (
          <div className="space-y-2 max-h-[30vh] overflow-y-auto pr-1">
            {historyRows.length === 0 ? (
              <span className="text-xs text-slate-500 italic block">No staging rows recorded for this import audit.</span>
            ) : (
              historyRows.map((row, idx) => (
                <div key={idx} className="p-2 bg-slate-950 border border-slate-850 rounded flex justify-between items-center text-[11px]">
                  <div>
                    <div className="font-mono font-semibold text-slate-200">{row.productCode}</div>
                    <span className="text-slate-500">Resource: {row.productionLineCode}</span>
                  </div>
                  <div className="text-right">
                    <strong className="text-brand-400 block">{row.plannedQuantity.toLocaleString()} cs</strong>
                    <span className="text-slate-500 text-[10px]">
                      On {`${row.productionDate.toDate().getUTCDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][row.productionDate.toDate().getUTCMonth()]}`}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

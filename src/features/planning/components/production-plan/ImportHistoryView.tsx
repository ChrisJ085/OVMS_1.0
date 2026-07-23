import React from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { SectionCard } from '../../../../components/ui/SectionCard';
import { ImportHistoryDetail } from './ImportHistoryDetail';
import { ProductionPlanImport, ProductionPlanRow } from '../../../../types/production';

export const formatUTCDate = (d: Date) => {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
};

export const formatUTCFull = (d: Date) => {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

interface ImportHistoryViewProps {
  historyImports: ProductionPlanImport[];
  selectedHistoryImport: ProductionPlanImport | null;
  historyRows: ProductionPlanRow[];
  loadingHistoryDetails: boolean;
  onSelectHistoryImport: (imp: ProductionPlanImport | null) => void;
}

export const ImportHistoryView: React.FC<ImportHistoryViewProps> = ({
  historyImports,
  selectedHistoryImport,
  historyRows,
  loadingHistoryDetails,
  onSelectHistoryImport
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <SectionCard title="SAP Ingestion Influx Ledger" description="Audit log of historical SAP production plan file uploads and system version control tags.">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-850 bg-slate-900/50">
                  <th className="p-3 font-semibold text-slate-400">File Metadata</th>
                  <th className="p-3 font-semibold text-slate-400 text-center">Period Boundaries</th>
                  <th className="p-3 font-semibold text-slate-400 text-center">Rows Audit</th>
                  <th className="p-3 font-semibold text-slate-400">Status</th>
                  <th className="p-3 font-semibold text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {historyImports.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500 italic">No historical imports recorded in Firestore.</td>
                  </tr>
                ) : (
                  historyImports.map(imp => (
                    <tr key={imp.id} className={`border-b border-slate-850/50 hover:bg-slate-900/20 transition-colors ${
                      selectedHistoryImport?.id === imp.id ? 'bg-slate-900/30 border-l-2 border-brand-500' : ''
                    }`}>
                      <td className="p-3">
                        <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                          <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                          <span>{imp.fileName}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          ID: {imp.id} • Hash: {imp.fileHash.slice(0, 8)}...
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          Uploaded by: {imp.uploadedBy} on {imp.uploadedAt.toDate().toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <div className="font-medium text-slate-300">
                          {formatUTCDate(imp.periodStart.toDate())} - {formatUTCFull(imp.periodEnd.toDate())}
                        </div>
                        <span className="text-[10px] text-slate-500 block mt-0.5">MPPS7 Source Period</span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="font-semibold text-slate-300">
                          {imp.recognisedRows} <span className="text-[10px] text-slate-500">/ {imp.totalSourceRows} rows</span>
                        </div>
                        {imp.warningCount > 0 && (
                          <span className="text-[9px] text-amber-400 bg-amber-500/10 px-1 rounded">
                            {imp.warningCount} Warnings
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          imp.status === 'COMMITTED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          imp.status === 'SUPERSEDED' ? 'bg-slate-850 text-slate-400 border border-slate-700/50' :
                          'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                          {imp.status}
                        </span>
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => onSelectHistoryImport(imp)}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 font-semibold rounded transition-colors"
                        >
                          Trace Logs
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      <div className="space-y-6">
        <ImportHistoryDetail
          selectedImport={selectedHistoryImport}
          historyRows={historyRows}
          loadingDetails={loadingHistoryDetails}
          onClose={() => onSelectHistoryImport(null)}
        />
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { 
  History, 
  FileCheck, 
  Clock, 
  User, 
  Calendar, 
  Eye, 
  X, 
  CheckCircle2, 
  Layers, 
  FileSpreadsheet,
  RefreshCw
} from 'lucide-react';
import { Snp87PlanningImport, Snp87PlanningRow, getNormalizedPlanningType } from '../../../../types/snp87';
import { getSnp87RowsByImportId } from '../../services/snp87ImportService';

interface Snp87ImportHistoryViewProps {
  imports: Snp87PlanningImport[];
  loading: boolean;
  onRefresh: () => void;
}

export const Snp87ImportHistoryView: React.FC<Snp87ImportHistoryViewProps> = ({
  imports,
  loading,
  onRefresh
}) => {
  const [selectedImport, setSelectedImport] = useState<Snp87PlanningImport | null>(null);
  const [selectedRows, setSelectedRows] = useState<Snp87PlanningRow[]>([]);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

  const handleSelectImport = async (imp: Snp87PlanningImport) => {
    setSelectedImport(imp);
    setLoadingDetails(true);
    try {
      const rows = await getSnp87RowsByImportId(imp.id);
      setSelectedRows(rows);
    } catch (err) {
      console.error('Failed to load historical rows:', err);
      setSelectedRows([]);
    } finally {
      setLoadingDetails(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-slate-900 border border-slate-800 rounded-xl">
        <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
        <p className="text-sm text-slate-300 font-medium">Loading SAP planning import history...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <History className="w-4 h-4 text-cyan-400" />
            SNP87 Planning Import Audit Trail
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Historical snapshots are preserved for regulatory compliance and auditability.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
          title="Refresh History"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {imports.length === 0 ? (
        <div className="p-16 text-center bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl max-w-xl mx-auto">
          <FileSpreadsheet className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h4 className="text-base font-bold text-slate-200">No SNP87 Imports Found</h4>
          <p className="text-xs text-slate-400 mt-1">
            No historical SNP87 planning reports have been uploaded for this site yet.
          </p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-slate-800 text-[11px] font-semibold">
                <tr>
                  <th className="px-4 py-3">Report File Name</th>
                  <th className="px-4 py-3">Imported At</th>
                  <th className="px-4 py-3">Imported By</th>
                  <th className="px-4 py-3 text-center">Planning Horizon</th>
                  <th className="px-4 py-3 text-right">Forecast</th>
                  <th className="px-4 py-3 text-right">Confirmed Prod</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {imports.map(imp => {
                  const isCurrentActive = imp.importStatus === 'COMMITTED';
                  return (
                    <tr 
                      key={imp.id} 
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isCurrentActive ? 'bg-emerald-950/15' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-medium text-slate-200">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="w-4 h-4 text-cyan-400 shrink-0" />
                          <span className="truncate max-w-xs">{imp.sourceReportName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-400">
                        {new Date(imp.importedAt).toLocaleDateString()} {new Date(imp.importedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {imp.importedBy}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-slate-400">
                        {imp.importPeriod ? `${imp.importPeriod.startDate} → ${imp.importPeriod.endDate}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sky-300 font-semibold">
                        {imp.totalForecastQuantity.toLocaleString()} CS
                        <span className="block text-[10px] text-slate-500 font-normal">{imp.forecastRowCount} rows</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-300 font-semibold">
                        {imp.totalConfirmedProductionQuantity.toLocaleString()} CS
                        <span className="block text-[10px] text-slate-500 font-normal">{imp.confirmedProductionRowCount} rows</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isCurrentActive ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                            <CheckCircle2 className="w-3 h-3" />
                            ACTIVE
                          </span>
                        ) : imp.importStatus === 'SUPERSEDED' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400">
                            SUPERSEDED
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300">
                            {imp.importStatus}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleSelectImport(imp)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5 text-cyan-400" />
                          View Rows
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Snapshot Details Modal */}
      {selectedImport && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
                  {selectedImport.sourceReportName}
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Imported on {new Date(selectedImport.importedAt).toLocaleString()} by {selectedImport.importedBy}
                </p>
              </div>
              <button
                onClick={() => setSelectedImport(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Table */}
            <div className="p-4 overflow-y-auto flex-1">
              {loadingDetails ? (
                <div className="flex flex-col items-center justify-center p-12">
                  <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin mb-2" />
                  <p className="text-xs text-slate-400">Loading historical rows...</p>
                </div>
              ) : selectedRows.length === 0 ? (
                <p className="text-xs text-center py-8 text-slate-500">
                  No row entries recorded for this import snapshot.
                </p>
              ) : (
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/80 sticky top-0 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                    <tr>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2 text-right">Quantity</th>
                      <th className="px-3 py-2 text-center">Unit</th>
                      <th className="px-3 py-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {selectedRows.map(row => (
                      <tr key={row.id} className="hover:bg-slate-800/30">
                        <td className="px-3 py-2 text-slate-200">{row.productNumber}</td>
                        <td className="px-3 py-2 text-slate-300 font-sans truncate max-w-xs">{row.productDescription || row.descriptionSnapshot || '—'}</td>
                        <td className="px-3 py-2 text-slate-400">{row.planningDate || row.startDate}</td>
                        <td className="px-3 py-2 font-sans">
                          {getNormalizedPlanningType(row) === 'FORECAST' ? (
                            <span className="text-sky-400">Forecast</span>
                          ) : getNormalizedPlanningType(row) === 'CONFIRMED_PRODUCTION' ? (
                            <span className="text-emerald-400">Confirmed Prod</span>
                          ) : (
                            <span className="text-slate-500">Ignored</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-100 font-semibold">{row.quantity.toLocaleString()}</td>
                        <td className="px-3 py-2 text-center text-slate-400">{row.baseUnitOfMeasure}</td>
                        <td className="px-3 py-2 text-center font-sans">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">
                            {row.validationStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-slate-800 bg-slate-950 flex justify-between items-center text-xs text-slate-400">
              <span>Total Rows: {selectedRows.length}</span>
              <button
                onClick={() => setSelectedImport(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

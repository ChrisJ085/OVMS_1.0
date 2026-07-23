import React from 'react';
import { CheckCircle } from 'lucide-react';
import { ParsedPlanPreview } from '../../services/mpps7ImportService';

interface ImportCommitStepProps {
  committedImportId: string;
  previewData: ParsedPlanPreview | null;
  onViewPlanGrid: () => void;
  onViewImportHistory: () => void;
}

export const ImportCommitStep: React.FC<ImportCommitStepProps> = ({
  committedImportId,
  previewData,
  onViewPlanGrid,
  onViewImportHistory
}) => {
  return (
    <div className="max-w-xl mx-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center space-y-6">
        <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-slate-100">Planning Ingestion Succeeded</h3>
          <p className="text-sm text-slate-400 mt-1">SAP MPPS7 spreadsheet rows have been written to the master planning collection.</p>
        </div>
        <div className="bg-slate-950 p-4 border border-slate-850 rounded text-xs font-mono text-slate-400 space-y-2">
          <div className="flex justify-between">
            <span>Generated Import ID</span>
            <strong className="text-slate-200 font-semibold">{committedImportId}</strong>
          </div>
          <div className="flex justify-between">
            <span>Active Schedule entries</span>
            <strong className="text-slate-200 font-semibold">{previewData?.rows.length || 0} rows written</strong>
          </div>
        </div>

        <div className="flex gap-3 justify-center pt-4">
          <button
            onClick={onViewPlanGrid}
            className="px-4 py-2 bg-brand-500 text-slate-950 font-semibold text-sm rounded hover:bg-brand-400 transition-colors"
          >
            View Plan Grid
          </button>
          <button
            onClick={onViewImportHistory}
            className="px-4 py-2 bg-slate-800 border border-slate-700 text-sm font-semibold text-slate-200 rounded hover:bg-slate-750 transition-colors"
          >
            View Import History
          </button>
        </div>
      </div>
    </div>
  );
};

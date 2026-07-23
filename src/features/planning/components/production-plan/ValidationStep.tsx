import React from 'react';
import { ArrowRight, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { ParsedPlanPreview } from '../../services/mpps7ImportService';

export const formatUTCDate = (d: Date) => {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
};

export const formatUTCFull = (d: Date) => {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

interface ValidationStepProps {
  previewData: ParsedPlanPreview;
  onRemoveFile: () => void;
  onProceedToReview: () => void;
}

export const ValidationStep: React.FC<ValidationStepProps> = ({
  previewData,
  onRemoveFile,
  onProceedToReview
}) => {
  const uniqueDatesCount = Array.from(new Set(previewData.rows.map(r => r.productionDate.toDate().toISOString()))).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-lg space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-200">Structural Validation Summary</h3>
            <p className="text-xs text-slate-400">Inspected worksheet: "{previewData.summary.detectedWorksheetNames[0]}"</p>
          </div>
          <button
            onClick={onRemoveFile}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Replace File
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-950 p-4 rounded-md border border-slate-850">
            <span className="text-xs text-slate-400 block">Detected Period</span>
            <strong className="text-sm text-slate-200 mt-1 block">
              {formatUTCDate(previewData.summary.periodStart.toDate())} - {formatUTCFull(previewData.summary.periodEnd.toDate())}
            </strong>
          </div>
          <div className="bg-slate-950 p-4 rounded-md border border-slate-850">
            <span className="text-xs text-slate-400 block">Total Ingested Dates</span>
            <strong className="text-lg text-slate-200 mt-1 block">
              {uniqueDatesCount} days
            </strong>
          </div>
          <div className="bg-slate-950 p-4 rounded-md border border-slate-850">
            <span className="text-xs text-slate-400 block">Rows Filtered</span>
            <strong className="text-lg text-slate-200 mt-1 block">
              {previewData.summary.recognisedRows} <span className="text-xs text-slate-500 font-normal">/ {previewData.summary.totalSourceRows} raw</span>
            </strong>
          </div>
          <div className="bg-slate-950 p-4 rounded-md border border-slate-850">
            <span className="text-xs text-slate-400 block">File Integrity Hash</span>
            <code className="text-[10px] text-slate-500 block truncate mt-1.5 font-mono">
              {previewData.summary.fileHash}
            </code>
          </div>
        </div>

        {/* Warning / Error Indicator panels */}
        <div className="flex flex-col gap-3">
          {previewData.summary.errorCount > 0 ? (
            <div className="p-4 bg-red-950/20 border border-red-900 rounded-lg flex gap-3">
              <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-red-400 text-sm">Critical Row Errors Detected ({previewData.summary.errorCount})</h4>
                <p className="text-xs text-slate-300 mt-1">One or more active production plan cells contain invalid formatting or structural issues. Ingestion is blocked until corrected.</p>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-emerald-950/20 border border-emerald-900 rounded-lg flex gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-emerald-400 text-sm">Structural Integrity Verified</h4>
                <p className="text-xs text-slate-300 mt-1">All row metrics, column headings, and cell values are validated and ready for review.</p>
              </div>
            </div>
          )}

          {previewData.summary.warningCount > 0 && (
            <div className="p-4 bg-amber-950/20 border border-amber-900 rounded-lg flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-amber-400 text-sm">Row Warnings Detected ({previewData.summary.warningCount})</h4>
                <p className="text-xs text-slate-300 mt-1">Unmapped SAP Resource codes, description differences, or unconfigured master products detected. These row warnings should be audited carefully.</p>
              </div>
            </div>
          )}

          {/* Duplicate / Older Plan Warnings */}
          {previewData.summary.notes.includes('DUPLICATE_FILE') && (
            <div className="p-4 bg-amber-950/20 border border-amber-900 rounded-lg flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-amber-400 text-sm">Duplicate File Alert</h4>
                <p className="text-xs text-slate-300 mt-1">This Excel sheet contains the exact same file integrity hash as a previously committed plan. Loading it again may create duplicates.</p>
              </div>
            </div>
          )}

          {previewData.summary.notes.includes('OLDER_THAN_ACTIVE_PLAN') && (
            <div className="p-4 bg-amber-950/20 border border-amber-900 rounded-lg flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-amber-400 text-sm">Older Planning Period Alert</h4>
                <p className="text-xs text-slate-300 mt-1">This file's detected planning period is older than the current active plan on the board. Ingesting this may revert scheduling information.</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
          <button
            onClick={onRemoveFile}
            className="px-4 py-2 bg-slate-800 border border-slate-750 text-sm font-semibold rounded-md hover:bg-slate-750"
          >
            Cancel
          </button>
          <button
            onClick={onProceedToReview}
            className="px-5 py-2 bg-brand-500 text-slate-950 font-bold text-sm rounded-md hover:bg-brand-400 flex items-center gap-1.5"
          >
            <span>Proceed to Row Review</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

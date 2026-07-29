import React from 'react';
import { ParsedPlanPreview } from '../../services/mpps7ImportService';
import { ImportDiagnosticsPanel } from '../ImportDiagnosticsPanel';
import { MasterDataIssuesPanel } from '../MasterDataIssuesPanel';
import { ImportReviewTable } from './ImportReviewTable';
import { Product } from '../../../../types/product';
import { ProductionLine, UnitOfMeasure } from '../../../../types/configuration';

export const formatUTCDate = (d: Date) => {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
};

interface ImportReviewStepProps {
  previewData: ParsedPlanPreview;
  products: Product[];
  units: UnitOfMeasure[];
  productionLines: ProductionLine[];
  tenantId: string;
  siteId: string;
  userFullName: string;
  confirmedYear: number | null;
  duplicateCheckAcknowledged: boolean;
  confirmReviewed: boolean;
  confirmSupersede: boolean;
  importNotesText: string;
  reviewFilter: 'ALL' | 'VALID' | 'WARNING' | 'ERROR';
  reviewSearch: string;
  reviewLineFilter: string;
  onConfirmYear: (year: number) => void;
  onAcknowledgeDuplicate: (ack: boolean) => void;
  onRevalidateMasterData: () => void;
  onFilterChange: (filter: 'ALL' | 'VALID' | 'WARNING' | 'ERROR') => void;
  onSearchChange: (search: string) => void;
  onLineFilterChange: (line: string) => void;
  onConfirmReviewedChange: (reviewed: boolean) => void;
  onConfirmSupersedeChange: (supersede: boolean) => void;
  onNotesTextChange: (notes: string) => void;
  onBackToStep2: () => void;
  onCommit: () => void;
}

export const ImportReviewStep: React.FC<ImportReviewStepProps> = ({
  previewData,
  products,
  units,
  productionLines,
  tenantId,
  siteId,
  userFullName,
  confirmedYear,
  duplicateCheckAcknowledged,
  confirmReviewed,
  confirmSupersede,
  importNotesText,
  reviewFilter,
  reviewSearch,
  reviewLineFilter,
  onConfirmYear,
  onAcknowledgeDuplicate,
  onRevalidateMasterData,
  onFilterChange,
  onSearchChange,
  onLineFilterChange,
  onConfirmReviewedChange,
  onConfirmSupersedeChange,
  onNotesTextChange,
  onBackToStep2,
  onCommit
}) => {
  const periodStartFormatted = `${previewData.summary.periodStart.toDate().getUTCDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][previewData.summary.periodStart.toDate().getUTCMonth()]}`;
  const periodEndFormatted = `${previewData.summary.periodEnd.toDate().getUTCDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][previewData.summary.periodEnd.toDate().getUTCMonth()]}`;

  const isCommitDisabled =
    previewData.summary.errorCount > 0 ||
    !confirmReviewed ||
    !confirmSupersede ||
    (previewData.diagnostics?.duplicateVerification.status === 'CHECK_FAILED' && !duplicateCheckAcknowledged) ||
    (previewData.diagnostics?.yearResolution.plannerConfirmationRequired && !confirmedYear);

  return (
    <div className="space-y-6">
      {/* Import Diagnostics Panel */}
      <div className="max-w-6xl mx-auto">
        <ImportDiagnosticsPanel
          diagnostics={previewData.diagnostics}
          reconciliation={previewData.reconciliation}
          confirmedYear={confirmedYear}
          onConfirmYear={onConfirmYear}
          duplicateCheckAcknowledged={duplicateCheckAcknowledged}
          onAcknowledgeDuplicate={onAcknowledgeDuplicate}
        />
      </div>

      {/* Master Data Issues Section */}
      <div className="max-w-6xl mx-auto">
        <MasterDataIssuesPanel
          rows={previewData.rows}
          existingProducts={products}
          existingUnits={units}
          existingLines={productionLines}
          tenantId={tenantId}
          siteId={siteId}
          userProfileName={userFullName}
          onRevalidate={onRevalidateMasterData}
        />
      </div>

      {/* Granular Row Validation Trace Table */}
      <ImportReviewTable
        rows={previewData.rows}
        reviewFilter={reviewFilter}
        reviewSearch={reviewSearch}
        reviewLineFilter={reviewLineFilter}
        onFilterChange={onFilterChange}
        onSearchChange={onSearchChange}
        onLineFilterChange={onLineFilterChange}
      />

      {/* Commit Checklist & Notes */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 max-w-6xl mx-auto space-y-4">
        <h4 className="font-bold text-slate-200 text-sm">Planner Commit Checklist</h4>
        <div className="space-y-3">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmReviewed}
              onChange={(e) => onConfirmReviewedChange(e.target.checked)}
              className="mt-1 bg-slate-950 border border-slate-800 rounded focus:ring-brand-500 text-brand-500"
            />
            <span className="text-xs text-slate-300">
              I confirm I have audited the granular row diagnostics and accept any skipped unmapped catalog SKUs.
            </span>
          </label>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmSupersede}
              onChange={(e) => onConfirmSupersedeChange(e.target.checked)}
              className="mt-1 bg-slate-950 border border-slate-800 rounded focus:ring-brand-500 text-brand-500"
            />
            <span className="text-xs text-slate-300">
              I understand that committing this plan will supersede and archive existing scheduling rows for the overlapping period ({periodStartFormatted} to {periodEndFormatted}).
            </span>
          </label>
        </div>

        {/* Notes input */}
        <div className="flex flex-col gap-1.5 mt-4">
          <label className="text-xs font-semibold text-slate-300">Auditor Notes / Reason for upload (Optional)</label>
          <textarea
            placeholder="Enter optional comments on why this MPPS7 revision is being committed (e.g. Demand adjustment, weekly rollover)"
            value={importNotesText}
            onChange={(e) => onNotesTextChange(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded p-3 focus:outline-none focus:border-slate-700 min-h-[60px]"
          />
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-slate-800">
          <button
            onClick={onBackToStep2}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Back to Stats
          </button>
          <button
            onClick={onCommit}
            disabled={isCommitDisabled}
            className="px-6 py-2 bg-brand-500 text-slate-950 font-bold text-sm rounded hover:bg-brand-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg"
          >
            Commit Production Plan
          </button>
        </div>
      </div>
    </div>
  );
};

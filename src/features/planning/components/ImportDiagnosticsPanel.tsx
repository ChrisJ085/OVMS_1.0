import React, { useState } from 'react';
import {
  Calendar,
  Layers,
  FileSpreadsheet,
  Copy,
  Clock,
  Calculator,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Box,
  Settings
} from 'lucide-react';
import { ImportDiagnostics, ImportReconciliationSummary } from '../../../types/production';

interface ImportDiagnosticsPanelProps {
  diagnostics: ImportDiagnostics;
  reconciliation: ImportReconciliationSummary;
  confirmedYear: number | null;
  onConfirmYear: (year: number) => void;
  duplicateCheckAcknowledged: boolean;
  onAcknowledgeDuplicate: (ack: boolean) => void;
}

export const ImportDiagnosticsPanel: React.FC<ImportDiagnosticsPanelProps> = ({
  diagnostics,
  reconciliation,
  confirmedYear,
  onConfirmYear,
  duplicateCheckAcknowledged,
  onAcknowledgeDuplicate
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [selectedYearInput, setSelectedYearInput] = useState<number>(
    confirmedYear || diagnostics.yearResolution.resolvedYear || new Date().getFullYear()
  );

  const { yearResolution, dateSequence, worksheetSelection, duplicateVerification, activePlanComparison, unitValidation, productMapping, lineMapping } = diagnostics;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-xl">
      {/* Header Bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-6 py-4 bg-slate-850 border-b border-slate-800 flex items-center justify-between cursor-pointer hover:bg-slate-800/80 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-brand-500/10 text-brand-400 rounded-md border border-brand-500/20">
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100">OVMS Import Parser Diagnostics & Reconciliation</h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                Parser v2.0
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Structural inspection, date sequence verification, duplicate checks, and source totals reconciliation.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick status summary pills */}
          <div className="hidden md:flex items-center gap-2">
            {yearResolution.plannerConfirmationRequired && !confirmedYear ? (
              <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold rounded-full flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                Year Unconfirmed
              </span>
            ) : (
              <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold rounded-full flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Year: {confirmedYear || yearResolution.resolvedYear}
              </span>
            )}

            {reconciliation.hasMaterialMismatch ? (
              <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold rounded-full flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                Total Diff: {reconciliation.totalDifference}
              </span>
            ) : (
              <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold rounded-full flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Totals Match
              </span>
            )}
          </div>

          <button className="text-slate-400 hover:text-slate-200 p-1">
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-6 space-y-6">
          {/* Top Banner Alert if Planner Action is needed */}
          {yearResolution.plannerConfirmationRequired && !confirmedYear && (
            <div className="p-4 bg-amber-950/30 border border-amber-900/60 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-400 text-xs uppercase tracking-wider">Planner Production Year Confirmation Required</h4>
                  <p className="text-xs text-slate-300 mt-1">
                    Workbook date headers contain day and month only (e.g. "29.12", "01.01"). Please confirm the production year below before finalizing.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
                <input
                  type="number"
                  value={selectedYearInput}
                  onChange={(e) => setSelectedYearInput(Number(e.target.value))}
                  className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-center font-bold text-slate-100 text-xs focus:outline-none focus:border-brand-500"
                  min={2020}
                  max={2035}
                />
                <button
                  onClick={() => onConfirmYear(selectedYearInput)}
                  className="px-3 py-1 bg-brand-500 hover:bg-brand-400 text-slate-950 font-bold text-xs rounded transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Confirm Year {selectedYearInput}</span>
                </button>
              </div>
            </div>
          )}

          {duplicateVerification.status === 'CHECK_FAILED' && (
            <div className="p-4 bg-amber-950/30 border border-amber-900/60 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-400 text-xs uppercase tracking-wider">Duplicate Check Unverified</h4>
                  <p className="text-xs text-slate-300 mt-1">{duplicateVerification.message}</p>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer bg-slate-950 px-3 py-1.5 rounded border border-slate-800 self-start sm:self-auto shrink-0">
                <input
                  type="checkbox"
                  checked={duplicateCheckAcknowledged}
                  onChange={(e) => onAcknowledgeDuplicate(e.target.checked)}
                  className="rounded text-brand-500 focus:ring-brand-500 bg-slate-900 border-slate-700 w-4 h-4"
                />
                <span className="text-xs text-slate-200 font-medium">Acknowledge & Proceed</span>
              </label>
            </div>
          )}

          {/* Diagnostics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* 1. Year Resolution */}
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-brand-400" />
                  1. Year Resolution
                </span>
                <span className="text-xs font-mono font-bold text-brand-400">
                  {confirmedYear || yearResolution.resolvedYear}
                </span>
              </div>

              <div className="text-xs text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Resolution Method:</span>
                  <span className="font-semibold text-slate-200">{yearResolution.method}</span>
                </div>
                <div className="flex justify-between">
                  <span>Confirmation Required:</span>
                  <span className={yearResolution.plannerConfirmationRequired && !confirmedYear ? "text-amber-400 font-bold" : "text-slate-400"}>
                    {yearResolution.plannerConfirmationRequired && !confirmedYear ? 'YES (Pending)' : 'No'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Dec-Jan Rollover:</span>
                  <span className={yearResolution.hasYearRollover ? "text-emerald-400 font-bold" : "text-slate-400"}>
                    {yearResolution.hasYearRollover ? `Detected (${yearResolution.rolloverDatesCount} cols)` : 'None'}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Date Sequence */}
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-brand-400" />
                  2. Date Sequence
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${dateSequence.isValidSequence ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                  {dateSequence.isValidSequence ? 'Valid' : 'Issues'}
                </span>
              </div>

              <div className="text-xs text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Period Start:</span>
                  <span className="font-mono font-semibold text-slate-200">{dateSequence.startDate}</span>
                </div>
                <div className="flex justify-between">
                  <span>Period End:</span>
                  <span className="font-mono font-semibold text-slate-200">{dateSequence.endDate}</span>
                </div>
                <div className="flex justify-between">
                  <span>Date Columns:</span>
                  <span className="font-semibold text-slate-200">{dateSequence.totalDateColumns} days</span>
                </div>
              </div>
            </div>

            {/* 3. Worksheet Selection */}
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-brand-400" />
                  3. Worksheet Selection
                </span>
                <span className="text-xs font-mono font-semibold text-slate-200">
                  {worksheetSelection.selectedSheetName}
                </span>
              </div>

              <div className="text-xs text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Header Row:</span>
                  <span className="font-semibold text-slate-200">Row {worksheetSelection.headerRowIndex + 1}</span>
                </div>
                <div className="flex justify-between">
                  <span>Sheets Inspected:</span>
                  <span className="font-semibold text-slate-200">{worksheetSelection.inspectedSheetsCount} sheets</span>
                </div>
                <div className="flex justify-between">
                  <span>Worksheets Found:</span>
                  <span className="text-slate-300 truncate max-w-[140px]">{worksheetSelection.allDetectedSheets.join(', ')}</span>
                </div>
              </div>
            </div>

            {/* 4. Duplicate Verification */}
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <Copy className="w-4 h-4 text-brand-400" />
                  4. Duplicate Check
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  duplicateVerification.status === 'PASSED'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : duplicateVerification.status === 'DUPLICATE_FOUND'
                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}>
                  {duplicateVerification.status}
                </span>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                {duplicateVerification.message}
              </p>
            </div>

            {/* 5. Active Plan Comparison */}
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-brand-400" />
                  5. Active Plan Check
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20">
                  {activePlanComparison.status}
                </span>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                {activePlanComparison.message}
              </p>
            </div>

            {/* 6. Source Total Reconciliation */}
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-brand-400" />
                  6. Source Reconciliation
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  reconciliation.status === 'MATCH'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : reconciliation.status === 'MISMATCH'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  {reconciliation.status}
                </span>
              </div>

              <div className="text-xs text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Source Cases:</span>
                  <span className="font-mono font-semibold text-slate-200">{reconciliation.totalSourceCases.toLocaleString()} CS</span>
                </div>
                <div className="flex justify-between">
                  <span>Parsed Cases:</span>
                  <span className="font-mono font-semibold text-slate-200">{reconciliation.totalParsedCases.toLocaleString()} CS</span>
                </div>
                <div className="flex justify-between">
                  <span>Difference:</span>
                  <span className={`font-mono font-bold ${reconciliation.totalDifference !== 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {reconciliation.totalDifference > 0 ? `+${reconciliation.totalDifference}` : reconciliation.totalDifference} CS
                  </span>
                </div>
              </div>
            </div>

            {/* 7. Unit Validation */}
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <Box className="w-4 h-4 text-brand-400" />
                  7. Unit Validation
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  unitValidation.hasUnsupportedUnits
                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                }`}>
                  {unitValidation.hasUnsupportedUnits ? 'Unsupported Units' : 'Valid'}
                </span>
              </div>

              <div className="text-xs text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Supported Units:</span>
                  <span className="font-mono text-slate-300">{unitValidation.supportedUnits.slice(0, 5).join(', ')}...</span>
                </div>
                {unitValidation.hasUnsupportedUnits && (
                  <div className="text-red-400 font-semibold text-[11px] mt-1">
                    Unsupported: {unitValidation.unsupportedUnitsFound.join(', ')}
                  </div>
                )}
              </div>
            </div>

            {/* 8. Product Mapping */}
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-brand-400" />
                  8. Product Catalog
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  productMapping.missingSkus.length > 0
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                }`}>
                  {productMapping.missingSkus.length > 0 ? `${productMapping.missingSkus.length} Missing` : 'Mapped'}
                </span>
              </div>

              <div className="text-xs text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Registered SKUs in System:</span>
                  <span className="font-semibold text-slate-200">{productMapping.totalSkus}</span>
                </div>
                <div className="flex justify-between">
                  <span>Missing from Import:</span>
                  <span className="font-semibold text-amber-400">{productMapping.missingSkus.length} SKUs</span>
                </div>
              </div>
            </div>

            {/* 9. Line Mapping */}
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-850 pb-2">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-brand-400" />
                  9. Line Resources
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  lineMapping.missingLines.length > 0
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                }`}>
                  {lineMapping.missingLines.length > 0 ? `${lineMapping.missingLines.length} Missing` : 'Mapped'}
                </span>
              </div>

              <div className="text-xs text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Configured Lines:</span>
                  <span className="font-semibold text-slate-200">{lineMapping.totalLines}</span>
                </div>
                <div className="flex justify-between">
                  <span>Unconfigured Lines:</span>
                  <span className="font-semibold text-amber-400">{lineMapping.missingLines.length}</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

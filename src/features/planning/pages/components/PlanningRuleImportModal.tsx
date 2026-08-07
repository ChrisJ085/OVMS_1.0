import React, { useState, useRef } from 'react';
import { X, Upload, Download, CheckCircle2, AlertTriangle, FileSpreadsheet, Loader2, Info } from 'lucide-react';
import { 
  parsePlanningRulesFile, 
  commitPlanningRulesImport, 
  downloadPlanningRulesTemplate, 
  PlanningRuleImportSummary, 
  ImportCommitResult 
} from '../../services/planningRuleImportService';
import { Destination } from '../../../../types/configuration';
import { Product } from '../../../../types/product';
import { useSiteContext } from '../../../../contexts/SiteContext';

interface PlanningRuleImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  destinations: Destination[];
  products: Product[];
  onImportComplete?: () => void;
}

export const PlanningRuleImportModal: React.FC<PlanningRuleImportModalProps> = ({
  isOpen,
  onClose,
  destinations,
  products,
  onImportComplete
}) => {
  const { tenantId, siteId } = useSiteContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [summary, setSummary] = useState<PlanningRuleImportSummary | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>('');

  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null);

  if (!isOpen) return null;

  const handleReset = () => {
    setParsing(false);
    setParseError(null);
    setSummary(null);
    setSelectedFileName('');
    setShowErrorsOnly(false);
    setSubmitting(false);
    setCommitResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setParsing(true);
    setParseError(null);
    setSummary(null);
    setCommitResult(null);

    try {
      const parsed = await parsePlanningRulesFile(file);
      setSummary(parsed);
    } catch (err: any) {
      setParseError(err.message || 'Failed to parse Excel file.');
    } finally {
      setParsing(false);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setParsing(true);
    setParseError(null);
    setSummary(null);
    setCommitResult(null);

    try {
      const parsed = await parsePlanningRulesFile(file);
      setSummary(parsed);
    } catch (err: any) {
      setParseError(err.message || 'Failed to parse Excel file.');
    } finally {
      setParsing(false);
    }
  };

  const handleCommit = async () => {
    if (!summary || summary.validRows === 0) return;

    setSubmitting(true);
    try {
      const validRows = summary.rows.filter(r => r.status === 'VALID');
      const res = await commitPlanningRulesImport(tenantId, siteId, validRows, destinations, products);
      setCommitResult(res);
      if (onImportComplete) {
        onImportComplete();
      }
    } catch (err: any) {
      setParseError(err.message || 'Failed to commit planning rules import.');
    } finally {
      setSubmitting(false);
    }
  };

  const displayedRows = summary 
    ? (showErrorsOnly ? summary.rows.filter(r => r.status === 'ERROR') : summary.rows)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Import Product Planning Rules</h2>
              <p className="text-xs text-slate-400">Upload an Excel (.xlsx, .xls) or CSV file with product thresholds & destinations</p>
            </div>
          </div>
          <button 
            onClick={() => { handleReset(); onClose(); }}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">

          {/* Success Result View */}
          {commitResult ? (
            <div className="space-y-6 text-center py-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-100">Import Completed Successfully</h3>
                <p className="text-sm text-slate-400 mt-1">Product planning rules have been updated and recommendation engine refreshed.</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto text-left">
                <div className="p-4 rounded-lg bg-slate-800/60 border border-slate-700/60">
                  <div className="text-xs text-slate-400">New Rules Created</div>
                  <div className="text-2xl font-bold text-emerald-400">{commitResult.createdRulesCount}</div>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/60 border border-slate-700/60">
                  <div className="text-xs text-slate-400">Rules Updated</div>
                  <div className="text-2xl font-bold text-brand-400">{commitResult.updatedRulesCount}</div>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/60 border border-slate-700/60">
                  <div className="text-xs text-slate-400">New Products Linked</div>
                  <div className="text-2xl font-bold text-indigo-400">{commitResult.createdProductsCount}</div>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/60 border border-slate-700/60">
                  <div className="text-xs text-slate-400">Destinations Resolved</div>
                  <div className="text-2xl font-bold text-slate-200">{commitResult.createdDestinationsCount}</div>
                </div>
              </div>

              {commitResult.errors.length > 0 && (
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs text-left max-w-2xl mx-auto space-y-1">
                  <div className="font-semibold text-sm mb-1">Non-critical Warnings:</div>
                  {commitResult.errors.map((err, idx) => (
                    <div key={idx}>• {err}</div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* File Upload & Template Row */}
              <div className="flex flex-col md:flex-row items-stretch gap-4">
                {/* Drag & Drop Area */}
                <div 
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 border-2 border-dashed border-slate-700 hover:border-brand-500/70 bg-slate-950/50 hover:bg-slate-950/80 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept=".xlsx, .xls, .csv" 
                    className="hidden" 
                  />
                  <div className="p-3 rounded-full bg-slate-800 group-hover:bg-brand-500/20 group-hover:text-brand-400 text-slate-400 transition-colors mb-3">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div className="text-sm font-medium text-slate-200 group-hover:text-brand-400 transition-colors">
                    {selectedFileName ? selectedFileName : 'Click to upload or drag & drop file'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Supports Excel (.xlsx, .xls) and CSV formats</div>
                </div>

                {/* Template Card */}
                <div className="w-full md:w-72 bg-slate-800/40 border border-slate-700/60 rounded-xl p-5 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-brand-400">Sample Template</div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Need a template formatted with the exact columns (Product, Description, DDXM, Min, Max, Target, Destinations)?
                    </p>
                  </div>
                  <button
                    onClick={downloadPlanningRulesTemplate}
                    type="button"
                    className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-lg text-xs font-medium transition-colors"
                  >
                    <Download className="w-4 h-4 text-brand-400" />
                    Download Template
                  </button>
                </div>
              </div>

              {/* Parsing Indicator */}
              {parsing && (
                <div className="p-8 text-center space-y-3 bg-slate-950/40 rounded-xl border border-slate-800">
                  <Loader2 className="w-8 h-8 animate-spin text-brand-400 mx-auto" />
                  <div className="text-sm font-medium text-slate-300">Reading and validating Excel worksheet...</div>
                </div>
              )}

              {/* Parse Error */}
              {parseError && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 flex items-start gap-3 text-sm">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
                  <div>
                    <div className="font-semibold text-red-200">File Error</div>
                    <div className="mt-0.5">{parseError}</div>
                  </div>
                </div>
              )}

              {/* Preview Table */}
              {summary && (
                <div className="space-y-4">
                  {/* Summary Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div className="flex items-center gap-6 text-sm">
                      <div>
                        <span className="text-slate-400">Total Rows: </span>
                        <span className="font-semibold text-slate-200">{summary.totalRows}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Valid Rules: </span>
                        <span className="font-semibold text-emerald-400">{summary.validRows}</span>
                      </div>
                      {summary.errorRows > 0 && (
                        <div>
                          <span className="text-slate-400">Errors: </span>
                          <span className="font-semibold text-red-400">{summary.errorRows}</span>
                        </div>
                      )}
                    </div>

                    {summary.errorRows > 0 && (
                      <button
                        onClick={() => setShowErrorsOnly(!showErrorsOnly)}
                        className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                          showErrorsOnly 
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                        }`}
                      >
                        {showErrorsOnly ? 'Show All Rows' : 'Filter Errors Only'}
                      </button>
                    )}
                  </div>

                  {/* Table */}
                  <div className="border border-slate-800 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400 font-medium sticky top-0 border-b border-slate-800 z-10">
                        <tr>
                          <th className="px-3 py-2.5">Row</th>
                          <th className="px-3 py-2.5">Product Code</th>
                          <th className="px-3 py-2.5">Description</th>
                          <th className="px-3 py-2.5">DDXM</th>
                          <th className="px-3 py-2.5">Min</th>
                          <th className="px-3 py-2.5">Max</th>
                          <th className="px-3 py-2.5">Target</th>
                          <th className="px-3 py-2.5">Pref Destination</th>
                          <th className="px-3 py-2.5">Sec Destination</th>
                          <th className="px-3 py-2.5">UOM</th>
                          <th className="px-3 py-2.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 bg-slate-900/50 text-slate-200">
                        {displayedRows.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                              No rows to display.
                            </td>
                          </tr>
                        ) : (
                          displayedRows.map((row) => (
                            <tr key={row.rowIndex} className={row.status === 'ERROR' ? 'bg-red-500/5' : 'hover:bg-slate-800/40'}>
                              <td className="px-3 py-2 text-slate-400 font-mono">{row.rowIndex}</td>
                              <td className="px-3 py-2 font-semibold text-slate-200">{row.productCode || '-'}</td>
                              <td className="px-3 py-2 text-slate-300 max-w-[180px] truncate">{row.description}</td>
                              <td className="px-3 py-2 text-slate-200 font-mono">{row.ddxmRetentionQuantity}</td>
                              <td className="px-3 py-2 text-slate-200 font-mono">{row.minimumQuantity}</td>
                              <td className="px-3 py-2 text-slate-200 font-mono">{row.maximumQuantity}</td>
                              <td className="px-3 py-2 text-brand-300 font-bold font-mono">{row.targetQuantity}</td>
                              <td className="px-3 py-2 text-slate-300">{row.preferredDestinationName || '-'}</td>
                              <td className="px-3 py-2 text-slate-400">{row.secondaryDestinationName || '-'}</td>
                              <td className="px-3 py-2 text-slate-400 font-mono">{row.primaryUom}</td>
                              <td className="px-3 py-2">
                                {row.status === 'VALID' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                    <CheckCircle2 className="w-3 h-3" /> Valid
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/15 text-red-400 border border-red-500/30" title={row.validationErrors.join(', ')}>
                                    <AlertTriangle className="w-3 h-3" /> {row.validationErrors[0]}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-3 bg-slate-800/30 border border-slate-700/40 rounded-xl text-xs text-slate-400 flex items-center gap-2">
                    <Info className="w-4 h-4 text-brand-400 shrink-0" />
                    <span>
                      Importing will automatically resolve or create missing destination records and update existing product rules for your active site.
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={() => { handleReset(); onClose(); }}
            className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors"
          >
            {commitResult ? 'Close' : 'Cancel'}
          </button>

          {!commitResult && (
            <button
              type="button"
              disabled={!summary || summary.validRows === 0 || submitting}
              onClick={handleCommit}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-slate-900 bg-brand-500 rounded-lg hover:bg-brand-400 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Importing Rules...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Import {summary?.validRows || 0} Valid Rules
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};

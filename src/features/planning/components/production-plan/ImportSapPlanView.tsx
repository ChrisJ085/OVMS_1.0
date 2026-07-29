import React from 'react';
import { ArrowRight, XCircle, RefreshCw } from 'lucide-react';
import { FileSelectionStep } from './FileSelectionStep';
import { ValidationStep } from './ValidationStep';
import { ImportReviewStep } from './ImportReviewStep';
import { ImportCommitStep } from './ImportCommitStep';
import { Product } from '../../../../types/product';
import { ProductionLine, UnitOfMeasure } from '../../../../types/configuration';
import { ParsedPlanPreview } from '../../services/mpps7ImportService';

interface ImportSapPlanViewProps {
  importStep: number;
  selectedFile: File | null;
  previewData: ParsedPlanPreview | null;
  fileLoading: boolean;
  error: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
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
  committedImportId: string | null;
  reviewFilter: 'ALL' | 'VALID' | 'WARNING' | 'ERROR';
  reviewSearch: string;
  reviewLineFilter: string;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: () => void;
  onStartValidation: (overrideYear?: number | null) => void;
  onConfirmYear: (year: number) => void;
  onAcknowledgeDuplicate: (ack: boolean) => void;
  onRevalidateMasterData: () => void;
  onFilterChange: (filter: 'ALL' | 'VALID' | 'WARNING' | 'ERROR') => void;
  onSearchChange: (search: string) => void;
  onLineFilterChange: (line: string) => void;
  onConfirmReviewedChange: (reviewed: boolean) => void;
  onConfirmSupersedeChange: (supersede: boolean) => void;
  onNotesTextChange: (notes: string) => void;
  onCommitImport: () => void;
  onViewPlanGrid: () => void;
  onViewImportHistory: () => void;
}

export const ImportSapPlanView: React.FC<ImportSapPlanViewProps> = ({
  importStep,
  selectedFile,
  previewData,
  fileLoading,
  error,
  fileInputRef,
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
  committedImportId,
  reviewFilter,
  reviewSearch,
  reviewLineFilter,
  onFileSelect,
  onRemoveFile,
  onStartValidation,
  onConfirmYear,
  onAcknowledgeDuplicate,
  onRevalidateMasterData,
  onFilterChange,
  onSearchChange,
  onLineFilterChange,
  onConfirmReviewedChange,
  onConfirmSupersedeChange,
  onNotesTextChange,
  onCommitImport,
  onViewPlanGrid,
  onViewImportHistory
}) => {
  const [stepState, setStepState] = React.useState<number>(importStep);

  React.useEffect(() => {
    setStepState(importStep);
  }, [importStep]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      const ext = file && file.name ? file.name.split('.').pop()?.toLowerCase() : '';
      if (ext !== 'xlsx' && ext !== 'xls') {
        alert('Supported format is strictly Microsoft Excel (.xlsx, .xls) workbook files.');
        return;
      }
      // Create event mock
      onFileSelect({ target: { files: [file] } } as any);
    }
  };

  return (
    <div className="space-y-6">
      {/* Wizard Step Indicator */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex justify-between items-center max-w-4xl mx-auto">
        <div className="flex items-center gap-2">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
            stepState >= 1 ? 'bg-brand-500 text-slate-950' : 'bg-slate-800 text-slate-500'
          }`}>1</span>
          <span className={`text-sm ${stepState >= 1 ? 'text-slate-100 font-semibold' : 'text-slate-500'}`}>Select File</span>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-600" />
        <div className="flex items-center gap-2">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
            stepState >= 2 ? 'bg-brand-500 text-slate-950' : 'bg-slate-800 text-slate-500'
          }`}>2</span>
          <span className={`text-sm ${stepState >= 2 ? 'text-slate-100 font-semibold' : 'text-slate-500'}`}>Validate</span>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-600" />
        <div className="flex items-center gap-2">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
            stepState >= 3 ? 'bg-brand-500 text-slate-950' : 'bg-slate-800 text-slate-500'
          }`}>3</span>
          <span className={`text-sm ${stepState >= 3 ? 'text-slate-100 font-semibold' : 'text-slate-500'}`}>Review</span>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-600" />
        <div className="flex items-center gap-2">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
            stepState >= 4 ? 'bg-brand-500 text-slate-950' : 'bg-slate-800 text-slate-500'
          }`}>4</span>
          <span className={`text-sm ${stepState >= 4 ? 'text-slate-100 font-semibold' : 'text-slate-500'}`}>Commit</span>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800/80 p-4 rounded-lg flex gap-3 items-start max-w-4xl mx-auto">
          <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-red-400">Ingestion Check Failed</h4>
            <p className="text-sm text-slate-300 mt-1">{error}</p>
            {stepState === 1 && (
              <button
                onClick={onRemoveFile}
                className="mt-3 px-3 py-1.5 text-xs bg-red-900/60 border border-red-700 hover:bg-red-800 text-slate-200 font-medium rounded transition-colors"
              >
                Clear and Retry
              </button>
            )}
          </div>
        </div>
      )}

      {fileLoading && (
        <div className="flex flex-col items-center justify-center p-20 bg-slate-900 border border-slate-800 rounded-lg max-w-4xl mx-auto">
          <RefreshCw className="w-10 h-10 text-brand-500 animate-spin mb-4" />
          <h4 className="text-lg font-bold text-slate-200">Processing Workbook</h4>
          <p className="text-sm text-slate-400 mt-1">Parsing schema structure, verifying row sums, and resolving master data mappings...</p>
        </div>
      )}

      {/* STEP 1 */}
      {stepState === 1 && !fileLoading && (
        <FileSelectionStep
          selectedFile={selectedFile}
          fileInputRef={fileInputRef}
          onFileSelect={onFileSelect}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onRemoveFile={onRemoveFile}
          onStartValidation={() => onStartValidation()}
        />
      )}

      {/* STEP 2 */}
      {stepState === 2 && previewData && !fileLoading && (
        <ValidationStep
          previewData={previewData}
          onRemoveFile={onRemoveFile}
          onProceedToReview={() => setStepState(3)}
        />
      )}

      {/* STEP 3 */}
      {stepState === 3 && previewData && !fileLoading && (
        <ImportReviewStep
          previewData={previewData}
          products={products}
          units={units}
          productionLines={productionLines}
          tenantId={tenantId}
          siteId={siteId}
          userFullName={userFullName}
          confirmedYear={confirmedYear}
          duplicateCheckAcknowledged={duplicateCheckAcknowledged}
          confirmReviewed={confirmReviewed}
          confirmSupersede={confirmSupersede}
          importNotesText={importNotesText}
          reviewFilter={reviewFilter}
          reviewSearch={reviewSearch}
          reviewLineFilter={reviewLineFilter}
          onConfirmYear={(year) => {
            onConfirmYear(year);
            onStartValidation(year);
          }}
          onAcknowledgeDuplicate={onAcknowledgeDuplicate}
          onRevalidateMasterData={() => {
            onRevalidateMasterData();
            onStartValidation();
          }}
          onFilterChange={onFilterChange}
          onSearchChange={onSearchChange}
          onLineFilterChange={onLineFilterChange}
          onConfirmReviewedChange={onConfirmReviewedChange}
          onConfirmSupersedeChange={onConfirmSupersedeChange}
          onNotesTextChange={onNotesTextChange}
          onBackToStep2={() => setStepState(2)}
          onCommit={onCommitImport}
        />
      )}

      {/* STEP 4 */}
      {stepState === 4 && committedImportId && (
        <ImportCommitStep
          committedImportId={committedImportId}
          previewData={previewData}
          onViewPlanGrid={onViewPlanGrid}
          onViewImportHistory={onViewImportHistory}
        />
      )}
    </div>
  );
};

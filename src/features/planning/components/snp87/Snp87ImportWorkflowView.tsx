import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  AlertCircle, 
  ArrowRight, 
  RefreshCw, 
  Info, 
  Search, 
  Eye, 
  Check, 
  Trash2,
  FileCheck,
  ChevronDown,
  Plus,
  X,
  Package,
  Layers
} from 'lucide-react';
import { 
  Snp87PlanningImport, 
  Snp87PlanningRow, 
  Snp87PlanningType,
  getNormalizedPlanningType
} from '../../../../types/snp87';
import { Product } from '../../../../types/product';
import { ProductCategory, UnitOfMeasure, Destination } from '../../../../types/configuration';
import { 
  parseSnp87Workbook, 
  commitSnp87Import 
} from '../../services/snp87ImportService';
import { areProductCodesEqual } from '../../../../utils/productCodeNormalizer';
import { UnknownProductsPromptModal } from './UnknownProductsPromptModal';
import { AddUnknownProductsWizardModal, UnknownProductItem } from './AddUnknownProductsWizardModal';

interface Snp87ImportWorkflowViewProps {
  tenantId: string;
  siteId: string;
  userFullName: string;
  existingProducts: Product[];
  activeSnapshot: Snp87PlanningImport | null;
  categories?: ProductCategory[];
  units?: UnitOfMeasure[];
  destinations?: Destination[];
  initialStep?: 1 | 2 | 3 | 4;
  initialSummary?: Snp87PlanningImport | null;
  initialRows?: Snp87PlanningRow[];
  onProductCreated?: (newProduct: Product) => void;
  onCommitSuccess: () => void;
  onViewCurrentSnapshot: () => void;
  onViewHistory: () => void;
}

export const Snp87ImportWorkflowView: React.FC<Snp87ImportWorkflowViewProps> = ({
  tenantId,
  siteId,
  userFullName,
  existingProducts,
  activeSnapshot,
  categories = [],
  units = [],
  destinations = [],
  initialStep = 1,
  initialSummary = null,
  initialRows = [],
  onProductCreated,
  onCommitSuccess,
  onViewCurrentSnapshot,
  onViewHistory
}) => {
  // Workflow Step: 1 = Upload, 2 = Validating, 3 = Review, 4 = Committed
  const [step, setStep] = useState<1 | 2 | 3 | 4>(initialStep);

  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Master products state (ensures newly created products remain available throughout session)
  const [currentProducts, setCurrentProducts] = useState<Product[]>(existingProducts);

  useEffect(() => {
    // Merge existingProducts with currentProducts without losing newly created ones
    setCurrentProducts(prev => {
      const merged = [...prev];
      for (const p of existingProducts) {
        if (!merged.some(m => areProductCodesEqual(m.productCode, p.productCode))) {
          merged.push(p);
        }
      }
      return merged;
    });
  }, [existingProducts]);

  // Parse result state
  const [parsedSummary, setParsedSummary] = useState<Snp87PlanningImport | null>(initialSummary);
  const [parsedRows, setParsedRows] = useState<Snp87PlanningRow[]>(initialRows);
  const [headerValidation, setHeaderValidation] = useState<{ isValid: boolean; missingHeaders: string[] }>({ isValid: true, missingHeaders: [] });
  
  // Review filters
  const [reviewFilter, setReviewFilter] = useState<'ALL' | 'FORECAST' | 'CONFIRMED_PRODUCTION' | 'IGNORED' | 'EXCEPTIONS'>('ALL');
  const [reviewSearch, setReviewSearch] = useState<string>('');

  // Commit state
  const [commitNotes, setCommitNotes] = useState<string>('');
  const [isCommitting, setIsCommitting] = useState<boolean>(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  // Slide-in right to left specifications drawer state (hidden by default)
  const [isSpecsDrawerOpen, setIsSpecsDrawerOpen] = useState(false);

  // Unknown products modal states (auto-show prompt if initialSummary has unknown products)
  const [isPromptOpen, setIsPromptOpen] = useState(
    initialSummary && initialSummary.unknownProductCount > 0 ? true : false
  );
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [productsAddedBanner, setProductsAddedBanner] = useState<string | null>(null);

  // Escape key handler for specifications drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSpecsDrawerOpen) {
        setIsSpecsDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSpecsDrawerOpen]);

  // Auto-validate whenever a file is selected
  const handleFileChosen = async (file: File) => {
    const ext = file.name ? file.name.split('.').pop()?.toLowerCase() : '';
    if (ext !== 'xlsx' && ext !== 'xls') {
      setFileError('Invalid file format. Please upload a Microsoft Excel (.xlsx, .xls) workbook.');
      return;
    }

    setFileError(null);
    setSelectedFile(file);
    setStep(2); // Step 2: Auto-validation

    try {
      // Execute automatic parsing and validation against current products
      const result = await parseSnp87Workbook(file, currentProducts, {
        tenantId,
        siteId,
        sourceReportName: file.name,
        importedBy: userFullName
      });

      setParsedSummary(result.importSummary);
      setParsedRows(result.rows);
      setHeaderValidation(result.headerValidation);
      setStep(3); // Step 3: Review Exceptions

      // When unknown products are detected, ask user if they'd like to add them
      if (result.importSummary.unknownProductCount > 0) {
        setIsPromptOpen(true);
      }
    } catch (err: any) {
      console.error('Failed to parse SNP87 workbook:', err);
      setFileError(err.message || 'Failed to parse SNP87 report. Ensure the file is not corrupted.');
      setStep(1);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileChosen(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChosen(e.dataTransfer.files[0]);
    }
  };

  // Reset upload - note: newly added products stay in Product Master!
  const resetUpload = () => {
    setSelectedFile(null);
    setParsedSummary(null);
    setParsedRows([]);
    setFileError(null);
    setCommitError(null);
    setIsPromptOpen(false);
    setIsWizardOpen(false);
    setStep(1);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Prepare list of unknown product items for wizard
  const unknownProductItems: UnknownProductItem[] = useMemo(() => {
    if (!parsedSummary?.diagnostics?.unknownProducts) return [];
    return parsedSummary.diagnostics.unknownProducts.map(up => {
      const matchingRow = parsedRows.find(
        r => areProductCodesEqual(r.productNumber, up.productNumber) || 
            (up.orderSku && areProductCodesEqual(r.orderSku, up.orderSku))
      );
      return {
        productNumber: up.productNumber,
        orderSku: up.orderSku,
        description: up.description || matchingRow?.productDescription || '',
        rowCount: up.rowCount,
        baseUnitOfMeasure: matchingRow?.baseUnitOfMeasure
      };
    });
  }, [parsedSummary, parsedRows]);

  // Handler when an unknown product is saved in the wizard
  const handleProductSavedInWizard = (savedProduct: Product, remainingCount: number) => {
    // 1. Add to currentProducts state
    setCurrentProducts(prev => {
      if (prev.some(p => areProductCodesEqual(p.productCode, savedProduct.productCode))) {
        return prev;
      }
      return [...prev, savedProduct];
    });

    // 2. Update all matching rows in parsedRows to matched status
    setParsedRows(prevRows => {
      return prevRows.map(row => {
        const matchesThisProduct = areProductCodesEqual(row.productNumber, savedProduct.productCode) ||
                                  (row.orderSku && areProductCodesEqual(row.orderSku, savedProduct.productCode));
        if (!matchesThisProduct) return row;

        const updatedErrors = (row.validationErrors || []).filter(
          err => !err.toLowerCase().includes('unknown product') && !err.toLowerCase().includes('not found in product master')
        );

        const updatedStatus = updatedErrors.length > 0 
          ? 'ERROR' 
          : (row.validationWarnings && row.validationWarnings.length > 0 ? 'WARNING' : 'VALID');

        return {
          ...row,
          productMatched: true,
          productId: savedProduct.id,
          productCodeSnapshot: savedProduct.productCode,
          productDescription: row.productDescription || savedProduct.description,
          validationErrors: updatedErrors,
          validationStatus: row.planningType === 'IGNORED' ? 'IGNORED' : updatedStatus
        };
      });
    });

    // 3. Update parsedSummary diagnostics & counts
    setParsedSummary(prevSummary => {
      if (!prevSummary) return null;
      const remainingUnknowns = (prevSummary.diagnostics?.unknownProducts || []).filter(
        up => !areProductCodesEqual(up.productNumber, savedProduct.productCode) &&
              !(up.orderSku && areProductCodesEqual(up.orderSku, savedProduct.productCode))
      );

      const newErrorCount = Math.max(0, prevSummary.errorCount - 1);

      return {
        ...prevSummary,
        unknownProductCount: remainingUnknowns.length,
        errorCount: newErrorCount,
        importStatus: newErrorCount === 0 && headerValidation.isValid ? 'VALIDATED' : prevSummary.importStatus,
        diagnostics: {
          ...prevSummary.diagnostics,
          unknownProducts: remainingUnknowns
        }
      };
    });

    // 4. Notify parent callback
    if (onProductCreated) {
      onProductCreated(savedProduct);
    }
  };

  // Handler when all unknown products are completed
  const handleAllCompleted = (allSaved: Product[]) => {
    setIsWizardOpen(false);
    setProductsAddedBanner(`Successfully added ${allSaved.length} product(s) to Product Master. They will remain in Product Master even if this upload is discarded.`);
    setTimeout(() => {
      setProductsAddedBanner(null);
    }, 10000);
  };

  // Commit execution
  const handleCommit = async () => {
    if (!parsedSummary) return;
    setIsCommitting(true);
    setCommitError(null);

    try {
      const commitRes = await commitSnp87Import(
        parsedSummary,
        parsedRows,
        userFullName,
        commitNotes.trim() || undefined
      );

      if (commitRes.success) {
        setStep(4);
        onCommitSuccess();
      } else {
        setCommitError(commitRes.error || 'Failed to commit snapshot.');
      }
    } catch (err: any) {
      setCommitError(err.message || 'Failed to commit snapshot.');
    } finally {
      setIsCommitting(false);
    }
  };

  // Filtered rows for review table
  const displayedReviewRows = useMemo(() => {
    return parsedRows.filter(row => {
      const rowType = getNormalizedPlanningType(row);
      // Filter by type or exception
      if (reviewFilter === 'FORECAST' && rowType !== 'FORECAST') return false;
      if (reviewFilter === 'CONFIRMED_PRODUCTION' && rowType !== 'CONFIRMED_PRODUCTION') return false;
      if (reviewFilter === 'IGNORED' && rowType !== 'IGNORED') return false;
      if (reviewFilter === 'EXCEPTIONS') {
        const hasIssue = row.validationStatus === 'ERROR' || row.validationStatus === 'WARNING' || !row.productMatched;
        if (!hasIssue) return false;
      }

      // Filter by search query
      if (reviewSearch.trim()) {
        const query = reviewSearch.toLowerCase();
        const matchesCode = (row.productNumber || '').toLowerCase().includes(query) ||
                            (row.orderSku || '').toLowerCase().includes(query) ||
                            (row.productDescription || '').toLowerCase().includes(query);
        if (!matchesCode) return false;
      }
      return true;
    });
  }, [parsedRows, reviewFilter, reviewSearch]);

  return (
    <div className="space-y-6">
      {/* 4-Step Wizard Indicator */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex justify-between items-center max-w-4xl mx-auto shadow-sm">
        <div className="flex items-center gap-2">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
            step >= 1 ? 'bg-cyan-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-500'
          }`}>1</span>
          <span className={`text-xs sm:text-sm ${step >= 1 ? 'text-slate-100 font-semibold' : 'text-slate-500'}`}>
            Upload SNP87
          </span>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-700" />

        <div className="flex items-center gap-2">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
            step >= 2 ? 'bg-cyan-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-500'
          }`}>2</span>
          <span className={`text-xs sm:text-sm ${step >= 2 ? 'text-slate-100 font-semibold' : 'text-slate-500'}`}>
            Auto-Validate
          </span>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-700" />

        <div className="flex items-center gap-2">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
            step >= 3 ? 'bg-cyan-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-500'
          }`}>3</span>
          <span className={`text-xs sm:text-sm ${step >= 3 ? 'text-slate-100 font-semibold' : 'text-slate-500'}`}>
            Review Exceptions
          </span>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-700" />

        <div className="flex items-center gap-2">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
            step >= 4 ? 'bg-emerald-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-500'
          }`}>4</span>
          <span className={`text-xs sm:text-sm ${step >= 4 ? 'text-emerald-400 font-semibold' : 'text-slate-500'}`}>
            Commit Snapshot
          </span>
        </div>
      </div>

      {/* Global Error Banner */}
      {fileError && (
        <div className="bg-red-950/40 border border-red-800/80 p-4 rounded-xl flex gap-3 items-start max-w-4xl mx-auto">
          <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-bold text-red-300 text-sm">Upload or Validation Failed</h4>
            <p className="text-xs text-slate-300 mt-1">{fileError}</p>
            <button
              onClick={resetUpload}
              className="mt-3 px-3 py-1.5 text-xs bg-red-900/60 hover:bg-red-800 border border-red-700 text-slate-200 rounded font-medium transition-colors"
            >
              Reset & Try Again
            </button>
          </div>
        </div>
      )}

      {/* STEP 1: UPLOAD WEEKLY SNP87 REPORT */}
      {step === 1 && (
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Header Action toolbar with (i) button for specifications slide-in panel */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Standard Weekly SAP SNP87 Planning Ingestion</span>
            <button
              type="button"
              onClick={() => setIsSpecsDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 transition-colors cursor-pointer"
              title="View SNP87 Ingestion Specifications (i)"
            >
              <Info className="w-3.5 h-3.5 text-cyan-400" />
              <span>SNP87 Ingestion Specifications (i)</span>
            </button>
          </div>

          <div
            data-testid="snp87-dropzone"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="border-2 border-dashed border-slate-700 hover:border-cyan-500/80 bg-slate-900/50 hover:bg-slate-900/80 rounded-2xl p-12 text-center transition-all cursor-pointer group"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              data-testid="snp87-file-input"
              type="file"
              ref={fileInputRef}
              onChange={handleInputChange}
              accept=".xlsx,.xls"
              className="hidden"
            />
            <div className="w-16 h-16 rounded-2xl bg-cyan-950/70 border border-cyan-800/70 text-cyan-400 flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform shadow-lg shadow-cyan-950/30">
              <Upload className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-100 mb-1">
              Select or Drop Weekly SNP87 Report
            </h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto mb-4">
              Upload the standard weekly SAP SNP87 Excel export (.xlsx). Validation runs automatically upon upload.
            </p>
            <button
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs transition-colors shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Browse Workbook File
            </button>
          </div>
        </div>
      )}

      {/* Slide-in Right-to-Left SNP87 Ingestion Specifications Drawer (Hidden by default, toggled via (i) button) */}
      <div
        id="snp87-specs-slideover"
        className="fixed inset-0 z-50 overflow-hidden pointer-events-none"
        aria-labelledby="snp87-specs-title"
        role="dialog"
        aria-modal="true"
      >
        <div
          className={`fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity duration-300 ${
            isSpecsDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          onClick={() => setIsSpecsDrawerOpen(false)}
          aria-hidden="true"
        />

        <div
          className={`fixed top-0 right-0 h-full w-full max-w-lg md:max-w-xl bg-slate-950 border-l border-slate-800 shadow-2xl flex flex-col z-50 transform transition-transform duration-300 ease-in-out ${
            isSpecsDrawerOpen ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none'
          }`}
        >
          {/* Drawer Header */}
          <div className="h-16 px-5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/90">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-950/90 border border-cyan-600/40 flex items-center justify-center text-cyan-400">
                <Info className="w-4 h-4" />
              </div>
              <div>
                <h2 id="snp87-specs-title" className="text-sm font-bold text-slate-100 tracking-tight">
                  SNP87 Ingestion Specifications
                </h2>
                <p className="text-[11px] text-slate-400">
                  SAP SNP87 format requirements & parsing behavior
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsSpecsDrawerOpen(false)}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Close Panel (Esc)"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs text-slate-300">
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
              <h4 className="font-semibold text-slate-100 text-sm">Recognised Planning Rows</h4>
              <p className="text-slate-400 leading-relaxed">
                • <strong className="text-sky-400">9ADFCST / Forecast</strong>: Ingested as Forecast quantity across the weekly horizon.<br />
                • <strong className="text-emerald-400">9AFPROD / Production (Confirmed)</strong>: Ingested as Confirmed Production quantity.<br />
                • Other InfoObjects are safely ignored and excluded from production planning calculations.
              </p>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
              <h4 className="font-semibold text-slate-100 text-sm">Expected Columns & Standards</h4>
              <p className="text-slate-400 leading-relaxed">
                • <strong className="text-slate-200">Columns</strong>: Order SKU, Product Number, Product Description, Location, Sort, InfoObject, Row text, Start Date, End Date, Quantity, Base Unit of Measure.<br />
                • <strong className="text-slate-200">Dates</strong>: Formatted as YYYYMMDD (e.g. 20261005).<br />
                • <strong className="text-slate-200">No Resource ID needed</strong>: Line mapping is not required.
              </p>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
              <h4 className="font-semibold text-slate-100 text-sm">Unknown Product Management</h4>
              <p className="text-slate-400 leading-relaxed">
                If an SNP87 report references product codes not yet configured in the Product Master, the import workflow detects them and prompts to create them with pre-populated codes, default Cases Per Pallet, and Default Destination defaulting to Chorley.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* STEP 2: AUTO-VALIDATION PROGRESS */}
      {step === 2 && (
        <div className="flex flex-col items-center justify-center p-20 bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl mx-auto text-center space-y-4">
          <RefreshCw className="w-10 h-10 text-cyan-400 animate-spin" />
          <h3 className="text-lg font-bold text-slate-100">Validating SNP87 Workbook</h3>
          <p className="text-sm text-slate-400 max-w-md">
            Parsing weekly report structure, mapping products against Product Master, validating dates & quantities...
          </p>
        </div>
      )}

      {/* STEP 3: REVIEW EXCEPTIONS & SUMMARY */}
      {step === 3 && parsedSummary && (
        <div className="space-y-6 max-w-5xl mx-auto">
          {/* Success Banner when products are added */}
          {productsAddedBanner && (
            <div className="p-4 bg-emerald-950/50 border border-emerald-700/80 rounded-xl flex items-center justify-between gap-3 text-xs text-emerald-200 shadow-sm animate-in fade-in">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>{productsAddedBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setProductsAddedBanner(null)}
                className="text-emerald-400 hover:text-emerald-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
              <span className="text-[11px] text-slate-400 font-medium block">Total Source</span>
              <span className="text-xl font-bold text-slate-100">{parsedSummary.sourceRowCount}</span>
              <span className="text-[10px] text-slate-500 block">rows in report</span>
            </div>

            <div className="p-3 bg-slate-900 border border-sky-900/50 rounded-xl">
              <span className="text-[11px] text-sky-400 font-medium block">Forecast</span>
              <span className="text-xl font-bold text-sky-300">{parsedSummary.forecastRowCount}</span>
              <span className="text-[10px] text-slate-500 block">{parsedSummary.totalForecastQuantity.toLocaleString()} CS</span>
            </div>

            <div className="p-3 bg-slate-900 border border-emerald-900/50 rounded-xl">
              <span className="text-[11px] text-emerald-400 font-medium block">Confirmed Prod</span>
              <span className="text-xl font-bold text-emerald-300">{parsedSummary.confirmedProductionRowCount}</span>
              <span className="text-[10px] text-slate-500 block">{parsedSummary.totalConfirmedProductionQuantity.toLocaleString()} CS</span>
            </div>

            <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
              <span className="text-[11px] text-slate-400 font-medium block">Ignored</span>
              <span className="text-xl font-bold text-slate-300">{parsedSummary.ignoredRowCount}</span>
              <span className="text-[10px] text-slate-500 block">unrelated rows</span>
            </div>

            <div className={`p-3 bg-slate-900 border rounded-xl ${
              parsedSummary.unknownProductCount > 0 ? 'border-amber-700/80 bg-amber-950/20' : 'border-slate-800'
            }`}>
              <span className={`text-[11px] font-medium block ${
                parsedSummary.unknownProductCount > 0 ? 'text-amber-400 font-bold' : 'text-slate-400'
              }`}>Unknown Products</span>
              <span className={`text-xl font-bold ${
                parsedSummary.unknownProductCount > 0 ? 'text-amber-300' : 'text-slate-100'
              }`}>{parsedSummary.unknownProductCount}</span>
              <span className="text-[10px] text-slate-500 block">unmapped SKUs</span>
            </div>

            <div className={`p-3 bg-slate-900 border rounded-xl ${
              parsedSummary.errorCount > 0 ? 'border-red-700/80 bg-red-950/20' : 'border-slate-800'
            }`}>
              <span className={`text-[11px] font-medium block ${
                parsedSummary.errorCount > 0 ? 'text-red-400 font-bold' : 'text-slate-400'
              }`}>Errors</span>
              <span className={`text-xl font-bold ${
                parsedSummary.errorCount > 0 ? 'text-red-300' : 'text-slate-100'
              }`}>{parsedSummary.errorCount}</span>
              <span className="text-[10px] text-slate-500 block">blocking issues</span>
            </div>

            <div className={`p-3 bg-slate-900 border rounded-xl ${
              parsedSummary.warningCount > 0 ? 'border-yellow-700/80 bg-yellow-950/20' : 'border-slate-800'
            }`}>
              <span className={`text-[11px] font-medium block ${
                parsedSummary.warningCount > 0 ? 'text-yellow-400 font-bold' : 'text-slate-400'
              }`}>Warnings</span>
              <span className={`text-xl font-bold ${
                parsedSummary.warningCount > 0 ? 'text-yellow-300' : 'text-slate-100'
              }`}>{parsedSummary.warningCount}</span>
              <span className="text-[10px] text-slate-500 block">non-blocking</span>
            </div>
          </div>

          {/* Header Missing Warning */}
          {!headerValidation.isValid && (
            <div className="bg-red-950/40 border border-red-800 p-4 rounded-xl flex gap-3 items-start">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-red-300">Missing Required Columns</h4>
                <p className="text-xs text-slate-300 mt-1">
                  The uploaded report is missing expected columns: <span className="font-mono text-red-300 font-semibold">{headerValidation.missingHeaders.join(', ')}</span>.
                </p>
              </div>
            </div>
          )}

          {/* Unknown Products Callout with Action Button */}
          {parsedSummary.unknownProductCount > 0 && (
            <div className="bg-amber-950/30 border border-amber-800/80 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex gap-3 items-start">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-amber-300">
                    {parsedSummary.unknownProductCount} Unknown Product(s) Detected
                  </h4>
                  <p className="text-xs text-slate-300">
                    The following product codes were not found in the Product Master and must not silently become planning records:
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {parsedSummary.diagnostics.unknownProducts.map(up => (
                      <span key={up.productNumber} className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-900/60 border border-amber-700 text-amber-200">
                        {up.productNumber} ({up.rowCount} rows)
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsWizardOpen(true)}
                className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs transition-colors shadow-md shadow-amber-950/40 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add to Product Master ({parsedSummary.unknownProductCount})
              </button>
            </div>
          )}

          {/* Active Supersede Notice */}
          <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-800 text-cyan-400 flex items-center justify-center shrink-0">
                <FileCheck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-200">
                  Target Planning Snapshot: {parsedSummary.sourceReportName}
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {activeSnapshot ? (
                    <>Committing will establish this as the active planning snapshot and <strong className="text-amber-400">supersede</strong> {activeSnapshot.sourceReportName}. Previous imports are preserved in history.</>
                  ) : (
                    <>Committing will establish this as the active weekly planning snapshot.</>
                  )}
                </p>
              </div>
            </div>

            {parsedSummary.importPeriod && (
              <div className="text-right shrink-0">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Period Horizon</span>
                <span className="text-xs font-mono font-semibold text-cyan-400">
                  {parsedSummary.importPeriod.startDate} → {parsedSummary.importPeriod.endDate}
                </span>
              </div>
            )}
          </div>

          {/* Review Filter & Search Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-3 rounded-xl">
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => setReviewFilter('ALL')}
                className={`px-3 py-1.5 rounded font-medium transition-colors ${
                  reviewFilter === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All ({parsedRows.length})
              </button>
              <button
                onClick={() => setReviewFilter('FORECAST')}
                className={`px-3 py-1.5 rounded font-medium transition-colors ${
                  reviewFilter === 'FORECAST' ? 'bg-sky-950 text-sky-300 border border-sky-800' : 'text-slate-400 hover:text-sky-300'
                }`}
              >
                Forecast ({parsedSummary.forecastRowCount})
              </button>
              <button
                onClick={() => setReviewFilter('CONFIRMED_PRODUCTION')}
                className={`px-3 py-1.5 rounded font-medium transition-colors ${
                  reviewFilter === 'CONFIRMED_PRODUCTION' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'text-slate-400 hover:text-emerald-300'
                }`}
              >
                Confirmed Prod ({parsedSummary.confirmedProductionRowCount})
              </button>
              <button
                onClick={() => setReviewFilter('IGNORED')}
                className={`px-3 py-1.5 rounded font-medium transition-colors ${
                  reviewFilter === 'IGNORED' ? 'bg-slate-800 text-slate-300' : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                Ignored ({parsedSummary.ignoredRowCount})
              </button>
              <button
                onClick={() => setReviewFilter('EXCEPTIONS')}
                className={`px-3 py-1.5 rounded font-medium transition-colors ${
                  reviewFilter === 'EXCEPTIONS' ? 'bg-amber-950 text-amber-300 border border-amber-800 font-bold' : 'text-slate-400 hover:text-amber-300'
                }`}
              >
                Exceptions ({parsedSummary.errorCount + parsedSummary.warningCount})
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Filter by product..."
                value={reviewSearch}
                onChange={e => setReviewSearch(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-56"
              />
            </div>
          </div>

          {/* Review Rows Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/90 sticky top-0 text-slate-400 uppercase tracking-wider border-b border-slate-800 text-[11px] font-semibold">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Product Number</th>
                    <th className="px-4 py-3">Product Description</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 text-right">Quantity</th>
                    <th className="px-4 py-3 text-center">Base Unit</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {displayedReviewRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-10 text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <span>No rows matching the current filter ({reviewFilter !== 'ALL' ? reviewFilter : ''}{reviewSearch ? ` matching "${reviewSearch}"` : ''}).</span>
                          {(reviewFilter !== 'ALL' || reviewSearch.trim()) && (
                            <button
                              onClick={() => {
                                setReviewFilter('ALL');
                                setReviewSearch('');
                              }}
                              className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 font-medium text-xs border border-slate-700"
                            >
                              Clear Filters
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    displayedReviewRows.map(row => {
                      const rowType = getNormalizedPlanningType(row);
                      return (
                      <tr 
                        key={row.id} 
                        className={`hover:bg-slate-800/40 transition-colors ${
                          row.validationStatus === 'ERROR' ? 'bg-red-950/20' :
                          row.validationStatus === 'WARNING' ? 'bg-yellow-950/10' :
                          row.validationStatus === 'IGNORED' ? 'opacity-60' : ''
                        }`}
                      >
                        <td className="px-4 py-2.5 text-slate-500 font-mono text-[11px]">{row.rowIndex}</td>
                        <td className="px-4 py-2.5 font-mono font-medium text-slate-200">
                          {row.productNumber || '—'}
                          {!row.productMatched && rowType !== 'IGNORED' && (
                            <button
                              type="button"
                              onClick={() => setIsWizardOpen(true)}
                              className="mt-0.5 block text-[10px] text-amber-400 hover:text-amber-300 font-sans font-semibold underline underline-offset-2"
                              title="Click to add to Product Master"
                            >
                              + Add to Master
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-300 max-w-xs truncate" title={row.productDescription}>
                          {row.productDescription || '—'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-300">
                          {row.planningDate || row.startDateRaw || '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          {rowType === 'FORECAST' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-950 text-sky-400 border border-sky-800">
                              Forecast
                            </span>
                          ) : rowType === 'CONFIRMED_PRODUCTION' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                              Confirmed Production
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-400" title={row.ignoredReason}>
                              Ignored
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-200">
                          {row.quantity.toLocaleString(undefined, { minimumFractionDigits: row.quantity % 1 !== 0 ? 3 : 0 })}
                        </td>
                        <td className="px-4 py-2.5 text-center font-mono text-slate-400">
                          {row.baseUnitOfMeasure || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {row.validationStatus === 'VALID' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                              <CheckCircle2 className="w-3 h-3" />
                              VALID
                            </span>
                          ) : row.validationStatus === 'WARNING' ? (
                            <span 
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-yellow-950 text-yellow-400 border border-yellow-800/60 cursor-help"
                              title={row.validationWarnings.join(' | ')}
                            >
                              <AlertTriangle className="w-3 h-3" />
                              WARN
                            </span>
                          ) : row.validationStatus === 'ERROR' ? (
                            <span 
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-red-950 text-red-400 border border-red-800/60 cursor-help"
                              title={row.validationErrors.join(' | ')}
                            >
                              <XCircle className="w-3 h-3" />
                              ERROR
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400">
                              IGNORED
                            </span>
                          )}
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-2.5 bg-slate-950/80 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
              <span>Showing {displayedReviewRows.length} of {parsedRows.length} rows</span>
              <span className="text-[11px] text-slate-500">
                {parsedSummary.recognisedRowCount} recognised planning entries
              </span>
            </div>
          </div>

          {/* Commit Error Banner */}
          {commitError && (
            <div className="bg-red-950/40 border border-red-800 p-3 rounded-lg text-xs text-red-300">
              {commitError}
            </div>
          )}

          {/* Planner Notes & Action Buttons */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="w-full sm:w-1/2">
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Import / Commit Notes (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Week 41 baseline run from SAP SNP87 export..."
                value={commitNotes}
                onChange={e => setCommitNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={resetUpload}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors"
              >
                Discard & Upload Another
              </button>

              <button
                type="button"
                disabled={isCommitting || !headerValidation.isValid}
                onClick={handleCommit}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold text-xs transition-colors shadow-md shadow-emerald-950/40"
              >
                {isCommitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Committing Snapshot...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Commit SNP87 Planning Snapshot
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: COMMITTED SUCCESS CONFIRMATION */}
      {step === 4 && (
        <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center space-y-4 shadow-lg">
          <div className="w-16 h-16 rounded-2xl bg-emerald-950 border border-emerald-800 text-emerald-400 flex items-center justify-center mx-auto mb-2 shadow-lg shadow-emerald-950/30">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-100">
            SNP87 Planning Snapshot Committed
          </h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            The weekly SAP SNP87 planning snapshot has been committed as the active planning dataset. Any previously active snapshots have been archived as superseded in the audit history.
          </p>

          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 max-w-sm mx-auto text-left text-xs text-slate-300 space-y-1.5 my-4">
            <div className="flex justify-between">
              <span className="text-slate-400">Report:</span>
              <span className="font-semibold text-slate-100">{parsedSummary?.sourceReportName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Forecast Rows:</span>
              <span className="font-semibold text-sky-400">{parsedSummary?.forecastRowCount} ({parsedSummary?.totalForecastQuantity} CS)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Confirmed Prod:</span>
              <span className="font-semibold text-emerald-400">{parsedSummary?.confirmedProductionRowCount} ({parsedSummary?.totalConfirmedProductionQuantity} CS)</span>
            </div>
          </div>

          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={onViewCurrentSnapshot}
              className="px-5 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition-colors shadow-md shadow-cyan-950/30"
            >
              View Current Planning Snapshot
            </button>
            <button
              onClick={onViewHistory}
              className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors"
            >
              View Import History
            </button>
          </div>
        </div>
      )}

      {/* Unknown Products Prompt Modal: Asks if user wants to add them to Product Master */}
      <UnknownProductsPromptModal
        isOpen={isPromptOpen}
        onClose={() => setIsPromptOpen(false)}
        onConfirmAdd={() => {
          setIsPromptOpen(false);
          setIsWizardOpen(true);
        }}
        unknownProducts={unknownProductItems}
      />

      {/* Step-through Create New Product Wizard Modal */}
      <AddUnknownProductsWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        unknownProducts={unknownProductItems}
        categories={categories}
        units={units}
        destinations={destinations}
        tenantId={tenantId}
        siteId={siteId}
        userFullName={userFullName}
        onProductSaved={handleProductSavedInWizard}
        onAllCompleted={handleAllCompleted}
      />
    </div>
  );
};

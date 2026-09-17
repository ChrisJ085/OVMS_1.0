import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Upload, 
  Copy, 
  Check, 
  AlertCircle, 
  CheckCircle2, 
  AlertTriangle, 
  Trash2, 
  RefreshCw, 
  Sparkles,
  ArrowRight,
  Filter,
  Layers
} from 'lucide-react';
import { ProductCategory, UnitOfMeasure, Destination } from '../../../../types/configuration';
import { Product } from '../../../../types/product';
import { useSiteContext } from '../../../../contexts/SiteContext';
import { useAuth } from '../../../auth/context/AuthContext';
import { 
  parsePastedProductText, 
  ParsedProductItem, 
  ParseProductsResult 
} from '../../utils/pasteProductParser';
import { bulkCreateOrUpdateProducts, BulkProductItemInput } from '../../services/productService';

interface BulkProductUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingProducts: Product[];
  categories: ProductCategory[];
  units: UnitOfMeasure[];
  destinations: Destination[];
  onSuccess?: () => void;
}

const SAMPLE_PASTE_DATA = `Material   Material description

3219021    F1 KLX Usoft XL Compact 40sc x16 M
3414219    F1 KLX BOX Collection CUBE 48sc x12
3414254    F1 KLX Ltd Ed Cube Mr Doodle V2 48
3415906    F1 KLX BOX Collection CUBE 48sc x1`;

export const BulkProductUploadModal: React.FC<BulkProductUploadModalProps> = ({
  isOpen,
  onClose,
  existingProducts,
  categories,
  units,
  destinations,
  onSuccess
}) => {
  const { tenantId, siteId } = useSiteContext();
  const { userProfile } = useAuth();
  const userFullName = userProfile?.fullName || 'Production Planner';

  // Active configurations
  const activeCategories = useMemo(() => categories.filter(c => c.status === 'active'), [categories]);
  const activeUnits = useMemo(() => units.filter(u => u.status === 'active'), [units]);
  const activeDestinations = useMemo(() => destinations.filter(d => d.status === 'active'), [destinations]);

  // Paste text state
  const [rawText, setRawText] = useState('');
  
  // Default values for bulk configuration
  const [defaultCategoryId, setDefaultCategoryId] = useState<string>('');
  const [defaultUnitOfMeasureId, setDefaultUnitOfMeasureId] = useState<string>('');
  const [defaultCasesPerPallet, setDefaultCasesPerPallet] = useState<string>('100');
  const [defaultUnitsPerCase, setDefaultUnitsPerCase] = useState<string>('1');
  const [defaultDestinationId, setDefaultDestinationId] = useState<string>('');
  const [defaultOpRelevant, setDefaultOpRelevant] = useState<boolean>(true);
  const [ifExistsAction, setIfExistsAction] = useState<'skip' | 'update'>('update');

  // Parsed and user-editable item state
  const [parsedItems, setParsedItems] = useState<ParsedProductItem[]>([]);
  const [filterTab, setFilterTab] = useState<'all' | 'new' | 'existing' | 'invalid'>('all');
  const [copiedSample, setCopiedSample] = useState(false);

  // Bulk edit dropdown values in grid
  const [batchCat, setBatchCat] = useState('');
  const [batchUom, setBatchUom] = useState('');
  const [batchCases, setBatchCases] = useState('');

  // Execution state
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<{
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    failedCount: number;
    errors: { productCode: string; error: string }[];
  } | null>(null);

  // Initialize default options when modal opens
  useEffect(() => {
    if (isOpen) {
      if (activeCategories.length > 0 && !defaultCategoryId) {
        setDefaultCategoryId(activeCategories[0].id);
      }
      if (activeUnits.length > 0 && !defaultUnitOfMeasureId) {
        // Look for CS or A3 as default, otherwise first
        const csUnit = activeUnits.find(u => u.code?.toUpperCase() === 'CS');
        setDefaultUnitOfMeasureId(csUnit ? csUnit.id : activeUnits[0].id);
      }
      setErrorMsg(null);
      setUploadResult(null);
    }
  }, [isOpen, activeCategories, activeUnits]);

  // Trigger parsing whenever rawText changes, but preserve existing row customizations where possible
  useEffect(() => {
    if (!rawText.trim()) {
      setParsedItems([]);
      return;
    }

    const casesNum = defaultCasesPerPallet ? parseInt(defaultCasesPerPallet, 10) : null;
    const unitsNum = defaultUnitsPerCase ? parseInt(defaultUnitsPerCase, 10) : null;

    const result = parsePastedProductText(rawText, existingProducts, {
      defaultCategoryId,
      defaultUnitOfMeasureId,
      defaultCasesPerPallet: isNaN(casesNum as number) ? null : casesNum,
      defaultUnitsPerCase: isNaN(unitsNum as number) ? null : unitsNum,
      defaultDestinationId: defaultDestinationId || null,
      defaultOperationallyRelevant: defaultOpRelevant
    });

    setParsedItems(result.items);
  }, [rawText, existingProducts, defaultCategoryId, defaultUnitOfMeasureId, defaultCasesPerPallet, defaultUnitsPerCase, defaultDestinationId, defaultOpRelevant]);

  if (!isOpen) return null;

  // Row update helpers
  const updateRow = (index: number, updates: Partial<ParsedProductItem>) => {
    setParsedItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const removeRow = (index: number) => {
    setParsedItems(prev => prev.filter((_, i) => i !== index));
  };

  const applyDefaultsToAll = () => {
    const casesNum = defaultCasesPerPallet ? parseInt(defaultCasesPerPallet, 10) : null;
    const unitsNum = defaultUnitsPerCase ? parseInt(defaultUnitsPerCase, 10) : null;

    setParsedItems(prev => prev.map(item => ({
      ...item,
      categoryId: defaultCategoryId || item.categoryId,
      unitOfMeasureId: defaultUnitOfMeasureId || item.unitOfMeasureId,
      casesPerPallet: !isNaN(casesNum as number) && casesNum !== null ? casesNum : item.casesPerPallet,
      unitsPerCase: !isNaN(unitsNum as number) && unitsNum !== null ? unitsNum : item.unitsPerCase,
      defaultDestinationId: defaultDestinationId || item.defaultDestinationId,
      operationallyRelevant: defaultOpRelevant
    })));
  };

  const applyBatchCategory = () => {
    if (!batchCat) return;
    setParsedItems(prev => prev.map(item => {
      if (filterTab === 'new' && item.isExisting) return item;
      if (filterTab === 'existing' && !item.isExisting) return item;
      return { ...item, categoryId: batchCat };
    }));
  };

  const applyBatchUom = () => {
    if (!batchUom) return;
    setParsedItems(prev => prev.map(item => {
      if (filterTab === 'new' && item.isExisting) return item;
      if (filterTab === 'existing' && !item.isExisting) return item;
      return { ...item, unitOfMeasureId: batchUom };
    }));
  };

  const applyBatchCases = () => {
    const num = parseInt(batchCases, 10);
    if (isNaN(num) || num <= 0) return;
    setParsedItems(prev => prev.map(item => {
      if (filterTab === 'new' && item.isExisting) return item;
      if (filterTab === 'existing' && !item.isExisting) return item;
      return { ...item, casesPerPallet: num };
    }));
  };

  const handleCopySample = () => {
    navigator.clipboard.writeText(SAMPLE_PASTE_DATA);
    setCopiedSample(true);
    setTimeout(() => setCopiedSample(false), 2000);
  };

  const handleLoadSample = () => {
    setRawText(SAMPLE_PASTE_DATA);
    setUploadResult(null);
    setErrorMsg(null);
  };

  const handleClear = () => {
    setRawText('');
    setParsedItems([]);
    setUploadResult(null);
    setErrorMsg(null);
  };

  // Counts
  const totalCount = parsedItems.length;
  const newCount = parsedItems.filter(i => !i.isExisting && i.isValid).length;
  const existingCount = parsedItems.filter(i => i.isExisting && i.isValid).length;
  const invalidCount = parsedItems.filter(i => !i.isValid || !i.productCode.trim() || !i.categoryId || !i.unitOfMeasureId).length;

  const filteredItems = parsedItems.filter(item => {
    if (filterTab === 'new') return !item.isExisting && item.isValid;
    if (filterTab === 'existing') return item.isExisting && item.isValid;
    if (filterTab === 'invalid') return !item.isValid || !item.productCode.trim() || !item.categoryId || !item.unitOfMeasureId;
    return true;
  });

  const handleSubmit = async () => {
    if (parsedItems.length === 0) {
      setErrorMsg('Please paste at least one product to upload.');
      return;
    }

    // Check for missing required fields
    const missingFields = parsedItems.filter(i => !i.productCode.trim() || !i.categoryId || !i.unitOfMeasureId);
    if (missingFields.length > 0) {
      setErrorMsg(`${missingFields.length} item(s) are missing required fields (Product Code, Category, or Unit of Measure). Please fix or remove them before uploading.`);
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const payload: BulkProductItemInput[] = parsedItems.map(item => {
      return {
        productCode: item.productCode.toUpperCase().trim(),
        description: item.description.trim(),
        categoryId: item.categoryId,
        unitOfMeasureId: item.unitOfMeasureId,
        casesPerPallet: item.casesPerPallet && item.casesPerPallet > 0 ? item.casesPerPallet : null,
        unitsPerCase: item.unitsPerCase && item.unitsPerCase > 0 ? item.unitsPerCase : null,
        configurations: [
          {
            unitOfMeasureId: item.unitOfMeasureId,
            casesPerPallet: item.casesPerPallet && item.casesPerPallet > 0 ? item.casesPerPallet : null,
            unitsPerCase: item.unitsPerCase && item.unitsPerCase > 0 ? item.unitsPerCase : null,
          }
        ],
        defaultDestinationId: item.defaultDestinationId || null,
        operationallyRelevant: item.operationallyRelevant,
        notes: item.notes || '',
        action: item.isExisting ? ifExistsAction : 'create'
      };
    });

    const res = await bulkCreateOrUpdateProducts({
      tenantId,
      siteId,
      items: payload,
      ifExistsAction,
      performedBy: userFullName
    });

    setSubmitting(false);

    if (res.success && res.data) {
      setUploadResult(res.data);
      if (onSuccess) {
        onSuccess();
      }
    } else {
      setErrorMsg(res.error || 'Failed to complete bulk upload.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 md:p-6">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-500/10 border border-brand-500/20 rounded-lg text-brand-400">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                Bulk Upload & Configure Products
              </h2>
              <p className="text-xs text-slate-400">
                Paste materials from SAP or spreadsheets, review parsed columns, set configurations, and upload to Master Data.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Success Banner */}
          {uploadResult && (
            <div className="p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-lg text-emerald-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium text-emerald-300">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  Bulk Upload Completed Successfully!
                </div>
                <button
                  onClick={onClose}
                  className="text-xs font-semibold px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors"
                >
                  Done
                </button>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-emerald-300/90 pt-1">
                <span className="font-semibold">Created: {uploadResult.createdCount}</span>
                <span className="font-semibold">Updated: {uploadResult.updatedCount}</span>
                <span className="font-semibold">Skipped: {uploadResult.skippedCount}</span>
                {uploadResult.failedCount > 0 && (
                  <span className="font-semibold text-rose-400">Failed: {uploadResult.failedCount}</span>
                )}
              </div>
              {uploadResult.errors.length > 0 && (
                <div className="mt-2 text-xs bg-slate-900/80 p-2.5 rounded border border-rose-900/50 text-rose-300 space-y-1">
                  <p className="font-medium text-rose-400">Item errors encountered:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {uploadResult.errors.map((e, idx) => (
                      <li key={idx}><strong>{e.productCode}</strong>: {e.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3.5 bg-rose-950/50 border border-rose-800/60 rounded-lg text-rose-200 text-sm flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">{errorMsg}</div>
            </div>
          )}

          {/* Section 1: Paste Input & Default Configuration */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Col: Textarea */}
            <div className="lg:col-span-6 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span>Pasted Material Data</span>
                  <span className="text-slate-500 font-normal lowercase">(Material &amp; Description)</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleLoadSample}
                    className="text-xs text-brand-400 hover:text-brand-300 transition-colors flex items-center gap-1"
                    title="Load the 4 sample products from prompt"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Load Sample Data
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={handleCopySample}
                    className="text-xs text-slate-400 hover:text-slate-300 transition-colors flex items-center gap-1"
                  >
                    {copiedSample ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedSample ? 'Copied' : 'Copy Sample'}
                  </button>
                  {rawText && (
                    <>
                      <span className="text-slate-600">|</span>
                      <button
                        type="button"
                        onClick={handleClear}
                        className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                      >
                        Clear
                      </button>
                    </>
                  )}
                </div>
              </div>

              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={`Paste your materials and descriptions here (tab, space, or table format)...

Example:
Material   Material description

3219021    F1 KLX Usoft XL Compact 40sc x16 M
3414219    F1 KLX BOX Collection CUBE 48sc x12
3414254    F1 KLX Ltd Ed Cube Mr Doodle V2 48
3415906    F1 KLX BOX Collection CUBE 48sc x1`}
                rows={9}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-500 transition-colors resize-y leading-relaxed"
              />
              <p className="text-[11px] text-slate-400">
                Supports SAP exports, Excel copy-paste (tab-delimited), and fixed space-aligned columns.
              </p>
            </div>

            {/* Right Col: Default Configuration Form */}
            <div className="lg:col-span-6 bg-slate-800/40 border border-slate-700/70 rounded-lg p-4 space-y-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-700/60">
                <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-brand-400" />
                  Default Product Attributes &amp; Config
                </span>
                {parsedItems.length > 0 && (
                  <button
                    type="button"
                    onClick={applyDefaultsToAll}
                    className="text-[11px] font-medium text-brand-400 hover:text-brand-300 underline"
                  >
                    Re-apply Defaults to All Rows
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">Default Category *</label>
                  <select
                    value={defaultCategoryId}
                    onChange={(e) => setDefaultCategoryId(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                  >
                    <option value="" disabled>Select category</option>
                    {activeCategories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">Default UoM *</label>
                  <select
                    value={defaultUnitOfMeasureId}
                    onChange={(e) => setDefaultUnitOfMeasureId(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                  >
                    <option value="" disabled>Select UoM</option>
                    {activeUnits.map(u => (
                      <option key={u.id} value={u.id}>{u.code} - {u.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">Cases per Pallet</label>
                  <input
                    type="number"
                    value={defaultCasesPerPallet}
                    onChange={(e) => setDefaultCasesPerPallet(e.target.value)}
                    placeholder="e.g. 100"
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">Units per Case</label>
                  <input
                    type="number"
                    value={defaultUnitsPerCase}
                    onChange={(e) => setDefaultUnitsPerCase(e.target.value)}
                    placeholder="e.g. 1"
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">Default Destination</label>
                  <select
                    value={defaultDestinationId}
                    onChange={(e) => setDefaultDestinationId(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                  >
                    <option value="">None</option>
                    {activeDestinations.map(d => (
                      <option key={d.id} value={d.id}>{d.destinationName}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">If Product Exists</label>
                  <select
                    value={ifExistsAction}
                    onChange={(e) => setIfExistsAction(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                  >
                    <option value="update">Update existing product</option>
                    <option value="skip">Skip existing (do not overwrite)</option>
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={defaultOpRelevant}
                    onChange={(e) => setDefaultOpRelevant(e.target.checked)}
                    className="w-4 h-4 text-brand-500 bg-slate-900 border-slate-700 rounded focus:ring-brand-500"
                  />
                  <span className="text-xs text-slate-300">Operationally Relevant by default</span>
                </label>
              </div>
            </div>
          </div>

          {/* Section 2: Review & Per-Row Configuration Table */}
          {parsedItems.length > 0 && (
            <div className="space-y-3 pt-2">
              
              {/* Summary Bar & Filters */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-800/60 p-3 rounded-lg border border-slate-700">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-slate-300">Review &amp; Configure:</span>
                  
                  <button
                    type="button"
                    onClick={() => setFilterTab('all')}
                    className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                      filterTab === 'all' ? 'bg-slate-700 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All ({totalCount})
                  </button>

                  <button
                    type="button"
                    onClick={() => setFilterTab('new')}
                    className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                      filterTab === 'new' ? 'bg-emerald-500/20 text-emerald-300 font-medium border border-emerald-500/30' : 'text-emerald-400 hover:bg-emerald-950/40'
                    }`}
                  >
                    New ({newCount})
                  </button>

                  {existingCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterTab('existing')}
                      className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                        filterTab === 'existing' ? 'bg-amber-500/20 text-amber-300 font-medium border border-amber-500/30' : 'text-amber-400 hover:bg-amber-950/40'
                      }`}
                    >
                      Existing ({existingCount})
                    </button>
                  )}

                  {invalidCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterTab('invalid')}
                      className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                        filterTab === 'invalid' ? 'bg-rose-500/20 text-rose-300 font-medium border border-rose-500/30' : 'text-rose-400 hover:bg-rose-950/40'
                      }`}
                    >
                      Issues ({invalidCount})
                    </button>
                  )}
                </div>

                {/* Batch apply shortcuts */}
                <div className="flex items-center gap-2 flex-wrap text-xs text-slate-400">
                  <span>Quick apply:</span>
                  <select
                    value={batchCat}
                    onChange={(e) => { setBatchCat(e.target.value); }}
                    className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200"
                  >
                    <option value="">Category...</option>
                    {activeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={applyBatchCategory}
                    disabled={!batchCat}
                    className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded disabled:opacity-40"
                  >
                    Apply
                  </button>

                  <select
                    value={batchUom}
                    onChange={(e) => setBatchUom(e.target.value)}
                    className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200"
                  >
                    <option value="">UoM...</option>
                    {activeUnits.map(u => <option key={u.id} value={u.id}>{u.code}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={applyBatchUom}
                    disabled={!batchUom}
                    className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded disabled:opacity-40"
                  >
                    Apply
                  </button>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-800 rounded-lg overflow-x-auto bg-slate-950/50">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                      <th className="py-2.5 px-3 w-16">Status</th>
                      <th className="py-2.5 px-3 w-32">Material / Code *</th>
                      <th className="py-2.5 px-3 min-w-[200px]">Description *</th>
                      <th className="py-2.5 px-3 w-40">Category *</th>
                      <th className="py-2.5 px-3 w-28">UoM *</th>
                      <th className="py-2.5 px-3 w-24">Cases/Pallet</th>
                      <th className="py-2.5 px-3 w-24">Units/Case</th>
                      <th className="py-2.5 px-3 w-32">Destination</th>
                      <th className="py-2.5 px-3 w-16 text-center">Op Rel</th>
                      <th className="py-2.5 px-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-normal text-slate-200">
                    {filteredItems.map((item) => {
                      const originalIndex = parsedItems.findIndex(p => p.id === item.id);
                      const isRowInvalid = !item.productCode.trim() || !item.categoryId || !item.unitOfMeasureId;

                      return (
                        <tr 
                          key={item.id} 
                          className={`hover:bg-slate-900/40 transition-colors ${
                            isRowInvalid ? 'bg-rose-950/10' : item.isExisting ? 'bg-amber-950/10' : ''
                          }`}
                        >
                          {/* Status */}
                          <td className="py-2 px-3 align-middle">
                            {item.isExisting ? (
                              <span 
                                className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap"
                                title={`Matches existing product: ${item.existingProduct?.description || item.productCode}`}
                              >
                                Existing
                              </span>
                            ) : isRowInvalid ? (
                              <span 
                                className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 whitespace-nowrap"
                                title="Missing required category or code"
                              >
                                Required
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                                New
                              </span>
                            )}
                          </td>

                          {/* Product Code */}
                          <td className="py-2 px-3 align-middle">
                            <input
                              type="text"
                              value={item.productCode}
                              onChange={(e) => updateRow(originalIndex, { productCode: e.target.value.toUpperCase() })}
                              className={`w-full px-2 py-1 bg-slate-900 border rounded text-xs font-mono font-medium text-slate-200 focus:outline-none focus:border-brand-500 ${
                                !item.productCode.trim() ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-700'
                              }`}
                            />
                          </td>

                          {/* Description */}
                          <td className="py-2 px-3 align-middle">
                            <input
                              type="text"
                              value={item.description}
                              onChange={(e) => updateRow(originalIndex, { description: e.target.value })}
                              className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                            />
                          </td>

                          {/* Category */}
                          <td className="py-2 px-3 align-middle">
                            <select
                              value={item.categoryId}
                              onChange={(e) => updateRow(originalIndex, { categoryId: e.target.value })}
                              className={`w-full px-2 py-1 bg-slate-900 border rounded text-xs text-slate-200 focus:outline-none focus:border-brand-500 ${
                                !item.categoryId ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-700'
                              }`}
                            >
                              <option value="" disabled>Select...</option>
                              {activeCategories.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </td>

                          {/* UoM */}
                          <td className="py-2 px-3 align-middle">
                            <select
                              value={item.unitOfMeasureId}
                              onChange={(e) => updateRow(originalIndex, { unitOfMeasureId: e.target.value })}
                              className={`w-full px-2 py-1 bg-slate-900 border rounded text-xs text-slate-200 focus:outline-none focus:border-brand-500 ${
                                !item.unitOfMeasureId ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-700'
                              }`}
                            >
                              <option value="" disabled>Select...</option>
                              {activeUnits.map(u => (
                                <option key={u.id} value={u.id}>{u.code}</option>
                              ))}
                            </select>
                          </td>

                          {/* Cases Per Pallet */}
                          <td className="py-2 px-3 align-middle">
                            <input
                              type="number"
                              value={item.casesPerPallet ?? ''}
                              onChange={(e) => updateRow(originalIndex, { casesPerPallet: e.target.value ? parseInt(e.target.value, 10) : null })}
                              placeholder="e.g. 100"
                              className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                            />
                          </td>

                          {/* Units Per Case */}
                          <td className="py-2 px-3 align-middle">
                            <input
                              type="number"
                              value={item.unitsPerCase ?? ''}
                              onChange={(e) => updateRow(originalIndex, { unitsPerCase: e.target.value ? parseInt(e.target.value, 10) : null })}
                              placeholder="e.g. 1"
                              className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                            />
                          </td>

                          {/* Destination */}
                          <td className="py-2 px-3 align-middle">
                            <select
                              value={item.defaultDestinationId || ''}
                              onChange={(e) => updateRow(originalIndex, { defaultDestinationId: e.target.value || null })}
                              className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                            >
                              <option value="">None</option>
                              {activeDestinations.map(d => (
                                <option key={d.id} value={d.id}>{d.destinationName}</option>
                              ))}
                            </select>
                          </td>

                          {/* Op Relevant */}
                          <td className="py-2 px-3 align-middle text-center">
                            <input
                              type="checkbox"
                              checked={item.operationallyRelevant}
                              onChange={(e) => updateRow(originalIndex, { operationallyRelevant: e.target.checked })}
                              className="w-3.5 h-3.5 text-brand-500 bg-slate-900 border-slate-700 rounded focus:ring-brand-500"
                            />
                          </td>

                          {/* Delete */}
                          <td className="py-2 px-3 align-middle text-right">
                            <button
                              type="button"
                              onClick={() => removeRow(originalIndex)}
                              className="text-slate-500 hover:text-red-400 p-1 rounded transition-colors"
                              title="Remove item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-400">
            {parsedItems.length > 0 && (
              <span>
                Ready to process <strong>{parsedItems.length}</strong> product{parsedItems.length === 1 ? '' : 's'} 
                {existingCount > 0 ? ` (${existingCount} existing will be ${ifExistsAction === 'update' ? 'updated' : 'skipped'})` : ''}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-md hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || parsedItems.length === 0}
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-slate-900 bg-brand-500 hover:bg-brand-400 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Saving {parsedItems.length} Products...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload &amp; Save {parsedItems.length > 0 ? `${parsedItems.length} Products` : 'Products'}
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

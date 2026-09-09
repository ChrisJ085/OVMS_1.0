import React, { useState, useEffect, useMemo } from 'react';
import { X, ClipboardPaste, CheckCircle2, AlertTriangle, Layers, Box, Info, Plus, RefreshCw } from 'lucide-react';
import { Product } from '../../../../types/product';
import { Location } from '../../../../types/inventory';
import { UnitOfMeasure, ProductCategory, Destination } from '../../../../types/configuration';
import { subscribeToLocations } from '../../services/locationService';
import { subscribeToProducts, createProduct } from '../../services/productService';
import { collections } from '../../../configuration/services/configurationService';
import { useSiteContext } from '../../../../contexts/SiteContext';
import { useAuth } from '../../../auth/context/AuthContext';
import { parsePastedInventoryText, ParseResult } from '../../utils/pasteInventoryParser';
import { batchUpdateInventoryFromPastedData } from '../../services/inventoryService';
import { refreshSiteRecommendations } from '../../../planning/services/recommendationService';
import { subscribeToCollection } from '../../../../services/dbService';

interface PasteInventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const SAMPLE_PASTE_DATA = `Material Number    Material description                     Plnt SLoc BUn Crcy     Unrestricte

3215931            F1 KLX BOX Usoft CUBE 48sc x12 ap        3200 0001 CS  EUR            3,000
4310310            F1 Andrex Skin Protect 155sc 4rx6        3200 0001 CS  EUR            1,548
4310500            F1 Andrex Skin Protect 155sc 8rx3        3200 0001 CS  EUR            2,853
4433036            F1 Andrex FSoft Wmelon 170sc 9Rx5 GV     3200 0001 CS  EUR            2,208
4474132            F1 Andrex UQuilts 155sc 9rx4             3200 0001 CS  EUR            2,048
4474155            F1 Andrex UQuilts 155sc 9rx4 £5.49 PMP  3200 0001 CS  EUR               16
4475706            F1 Andrex UQuilts 155sc 16rx1 Cube       3200 0001 CS  EUR            8,904
4475901            F1 Andrex UQuilts155sc 24rx1             3200 0001 CS  EUR            5,040
4826000            F1 Waitrose Ultra Soft BT 240sc 9rx5     3200 0001 CS  EUR                0
4826001            F1 Waitrose Ultra Soft BT 240sc 9rx5 v2  3200 0001 CS  EUR                0
4970178            F1 Andrex ComClean 190sc 9Rx4 S          3200 0001 CS  EUR               64
4978337            F1 Andrex FSoft 170sc 9Rx5 GV            3200 0001 CS  EUR            1,760`;

export const PasteInventoryModal: React.FC<PasteInventoryModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { tenantId, siteId } = useSiteContext();
  const { currentUser } = useAuth();

  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<UnitOfMeasure[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);

  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [rawText, setRawText] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [promptOpen, setPromptOpen] = useState(false);
  const [updatedItemCount, setUpdatedItemCount] = useState(0);
  const [zeroedItemCount, setZeroedItemCount] = useState(0);
  const [regeneratingRecs, setRegeneratingRecs] = useState(false);
  const [regenProgress, setRegenProgress] = useState<{ current: number; total: number; productCode?: string } | null>(null);
  const [regenSuccessMsg, setRegenSuccessMsg] = useState<string | null>(null);

  const [quickAddForm, setQuickAddForm] = useState<{
    productCode: string;
    description: string;
    categoryId: string;
    unitOfMeasureId: string;
    casesPerPallet: string;
    unitsPerCase: string;
    defaultDestinationId: string;
  } | null>(null);
  const [quickAddError, setQuickAddError] = useState<string | null>(null);
  const [quickAddSubmitting, setQuickAddSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setRawText('');
      setFeedback(null);
      return;
    }

    const unsubLocations = subscribeToLocations(tenantId, siteId, (items) => {
      const activeLocs = items.filter(l => l.status === 'active');
      setLocations(activeLocs);
      if (activeLocs.length > 0 && !selectedLocationId) {
        setSelectedLocationId(activeLocs[0].id);
      }
    }, console.error);

    const unsubProducts = subscribeToProducts(tenantId, siteId, setProducts, console.error);

    const unsubUnits = subscribeToCollection<UnitOfMeasure>(
      collections.UNITS_OF_MEASURE,
      [
        { field: 'tenantId', op: '==', value: tenantId },
        { field: 'siteId', op: '==', value: '' }
      ],
      setUnits,
      console.error
    );

    const unsubCategories = subscribeToCollection<ProductCategory>(
      collections.PRODUCT_CATEGORIES,
      [
        { field: 'tenantId', op: '==', value: tenantId },
        { field: 'siteId', op: '==', value: '' }
      ],
      setCategories,
      console.error
    );

    const unsubDestinations = subscribeToCollection<Destination>(
      collections.DESTINATIONS,
      [
        { field: 'tenantId', op: '==', value: tenantId }
      ],
      (items) => {
        const filtered = items
          .filter(d => !d.siteId || d.siteId === '' || d.siteId === siteId)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        setDestinations(filtered);
      },
      console.error
    );

    return () => {
      unsubLocations();
      unsubProducts();
      unsubUnits();
      unsubCategories();
      unsubDestinations();
    };
  }, [isOpen, tenantId, siteId]);

  const parseResult: ParseResult = useMemo(() => {
    if (!rawText.trim()) {
      return {
        items: [],
        totalParsed: 0,
        matchedCount: 0,
        unmatchedCount: 0,
        totalCases: 0,
        totalPallets: 0,
      };
    }
    return parsePastedInventoryText(rawText, products, units);
  }, [rawText, products, units]);

  if (!isOpen) return null;

  const handleApply = async () => {
    if (!selectedLocationId) {
      setFeedback({ type: 'error', message: 'Please select a storage location.' });
      return;
    }

    const matchedItems = parseResult.items.filter(i => i.status === 'MATCHED' && i.matchedProduct);
    if (matchedItems.length === 0) {
      setFeedback({ type: 'error', message: 'No matched products to update.' });
      return;
    }

    const targetLoc = locations.find(l => l.id === selectedLocationId);
    if (!targetLoc) {
      setFeedback({ type: 'error', message: 'Selected location not found.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    const updatePayload = matchedItems.map(item => ({
      productId: item.matchedProduct!.id,
      productCodeSnapshot: item.matchedProduct!.productCode,
      descriptionSnapshot: item.matchedProduct!.description,
      quantity: item.unrestrictedCases,
      unitOfMeasureId: item.unitOfMeasureId || item.matchedProduct!.unitOfMeasureId || '',
    }));

    const result = await batchUpdateInventoryFromPastedData({
      tenantId,
      siteId,
      locationId: targetLoc.id,
      locationCodeSnapshot: targetLoc.locationCode,
      items: updatePayload,
      performedBy: currentUser?.email || 'Planner',
    });

    setSubmitting(false);

    if (result.success) {
      if (onSuccess) onSuccess();
      setUpdatedItemCount(matchedItems.length);
      setZeroedItemCount(result.data?.zeroedCount || 0);
      setPromptOpen(true);
    } else {
      setFeedback({ type: 'error', message: result.error || 'Failed to update stock.' });
    }
  };

  const handleRegenerateRecs = async () => {
    setRegeneratingRecs(true);
    setRegenSuccessMsg(null);
    setRegenProgress({ current: 0, total: 1 });
    try {
      const res = await refreshSiteRecommendations(tenantId, siteId, true, (progress) => {
        setRegenProgress(progress);
      });
      if (res.success) {
        setRegenSuccessMsg(`Successfully regenerated recommendations for ${res.data?.generatedCount || 0} product(s). Updates have been fed to the Recommendation Workspace and TV Dashboard.`);
      } else {
        setRegenSuccessMsg(`Generation failed: ${res.error}`);
      }
    } catch (e: any) {
      setRegenSuccessMsg(`Error: ${e.message}`);
    } finally {
      setRegeneratingRecs(false);
      setRegenProgress(null);
    }
  };

  const handleInsertSample = () => {
    setRawText(SAMPLE_PASTE_DATA);
    setFeedback(null);
  };

  const handleQuickAddClick = (rawCode: string, rawDesc: string) => {
    const activeCategories = categories.filter(c => c.status === 'active');
    const activeUnits = units.filter(u => u.status === 'active');
    const defaultUom = activeUnits.find(u => u.code === 'CS' || u.id === 'CS') || activeUnits[0];

    setQuickAddForm({
      productCode: rawCode.toUpperCase(),
      description: rawDesc || `Product ${rawCode}`,
      categoryId: activeCategories.length > 0 ? activeCategories[0].id : 'default',
      unitOfMeasureId: defaultUom ? defaultUom.id : 'CS',
      casesPerPallet: '100',
      unitsPerCase: '1',
      defaultDestinationId: '',
    });
    setQuickAddError(null);
  };

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddForm) return;

    if (!quickAddForm.productCode.trim() || !quickAddForm.description.trim()) {
      setQuickAddError('Product Code and Description are required.');
      return;
    }

    const casesPerPalletNum = parseInt(quickAddForm.casesPerPallet, 10);
    if (isNaN(casesPerPalletNum) || casesPerPalletNum <= 0) {
      setQuickAddError('Cases per pallet must be a valid number greater than 0.');
      return;
    }

    const unitsPerCaseNum = parseInt(quickAddForm.unitsPerCase, 10);
    if (isNaN(unitsPerCaseNum) || unitsPerCaseNum <= 0) {
      setQuickAddError('Units per case must be a valid number greater than 0.');
      return;
    }

    setQuickAddSubmitting(true);
    setQuickAddError(null);

    try {
      const payload: Omit<Product, 'id' | 'status' | 'createdDate' | 'modifiedDate'> = {
        tenantId,
        siteId,
        productCode: quickAddForm.productCode.toUpperCase().trim(),
        description: quickAddForm.description.trim(),
        categoryId: quickAddForm.categoryId || 'default',
        unitOfMeasureId: quickAddForm.unitOfMeasureId,
        casesPerPallet: casesPerPalletNum,
        unitsPerCase: unitsPerCaseNum,
        configurations: [
          {
            unitOfMeasureId: quickAddForm.unitOfMeasureId,
            casesPerPallet: casesPerPalletNum,
            unitsPerCase: unitsPerCaseNum,
          }
        ],
        defaultDestinationId: quickAddForm.defaultDestinationId || null,
        operationallyRelevant: true,
        notes: 'Added via Paste Inventory Quick Add.',
        createdBy: currentUser?.uid || 'system',
        modifiedBy: currentUser?.uid || 'system',
      };

      const res = await createProduct(payload);
      if (res.success) {
        setQuickAddForm(null);
      } else {
        setQuickAddError(res.error || 'Failed to create product.');
      }
    } catch (err: any) {
      setQuickAddError(err.message || 'An unexpected error occurred.');
    } finally {
      setQuickAddSubmitting(false);
    }
  };

  const selectedLoc = locations.find(l => l.id === selectedLocationId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-500/10 border border-brand-500/20 rounded-lg text-brand-400">
              <ClipboardPaste className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Paste Product Inventory Update</h2>
              <p className="text-xs text-slate-400">
                Batch update stock levels for products within a single storage location.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {feedback && (
            <div className={`p-4 rounded-lg border text-sm flex items-center gap-3 ${
              feedback.type === 'success' 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}>
              {feedback.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
              <div>{feedback.message}</div>
            </div>
          )}

          {/* Location Selector */}
          <div className="bg-slate-800/40 border border-slate-700/80 rounded-lg p-4 space-y-2">
            <label className="block text-sm font-medium text-slate-200">
              Storage Location <span className="text-red-400">*</span>
            </label>
            <div className="flex items-center gap-4">
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                className="flex-1 px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-100 focus:outline-none focus:border-brand-500"
              >
                {locations.length === 0 && <option value="">No active locations found</option>}
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.locationCode} - {loc.locationName}
                  </option>
                ))}
              </select>
              {selectedLoc && (
                <div className="text-xs text-slate-400 bg-slate-900 px-3 py-2 rounded border border-slate-800 shrink-0">
                  Target: <span className="text-brand-300 font-medium">{selectedLoc.locationCode}</span> ({selectedLoc.locationName})
                </div>
              )}
            </div>
          </div>

          {/* Paste Input Area */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-200 flex items-center gap-2">
                <span>Paste Inventory Export Data</span>
                <span className="text-xs font-normal text-slate-400">(Material Number, Description, Plant, SLoc, BUn, Crcy, Unrestricted)</span>
              </label>
              <button
                type="button"
                onClick={handleInsertSample}
                className="text-xs text-brand-400 hover:text-brand-300 underline font-medium transition-colors"
              >
                Load Sample Data
              </button>
            </div>
            <textarea
              rows={6}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={`Material Number    Material description                     Plnt SLoc BUn Crcy     Unrestricte\n\n3215931            F1 KLX BOX Usoft CUBE 48sc x12 ap        3200 0001 CS  EUR            3,000\n4310310            F1 Andrex Skin Protect 155sc 4rx6        3200 0001 CS  EUR            1,548`}
              className="w-full font-mono text-xs p-3 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-500 transition-colors"
            />
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Info className="w-3.5 h-3.5 text-brand-400 shrink-0" />
              <span>Product codes without leading zeros (e.g. 3215931) will automatically match system products (e.g. 03215931). Pallet counts default to the <strong>A3</strong> pallet configuration.</span>
            </div>
          </div>

          {/* Summary KPIs */}
          {parseResult.totalParsed > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-lg flex items-center gap-3">
                <div className="p-2 bg-slate-700/50 rounded text-slate-300">
                  <Box className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">Parsed Lines</div>
                  <div className="text-lg font-bold text-slate-100">{parseResult.totalParsed}</div>
                </div>
              </div>

              <div className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-lg flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">Matched Products</div>
                  <div className="text-lg font-bold text-emerald-400">
                    {parseResult.matchedCount} <span className="text-xs font-normal text-slate-400">/ {parseResult.totalParsed}</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-lg flex items-center gap-3">
                <div className="p-2 bg-brand-500/10 border border-brand-500/20 rounded text-brand-400">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">Total Cases</div>
                  <div className="text-lg font-bold font-mono text-brand-300">
                    {parseResult.totalCases.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-lg flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded text-amber-400">
                  <Box className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">Est. Pallets (A3)</div>
                  <div className="text-lg font-bold font-mono text-amber-300">
                    {parseResult.totalPallets > 0 ? parseResult.totalPallets.toFixed(1) : '-'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Preview Table */}
          {parseResult.items.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-200">Parsed Inventory Preview</h3>
              <div className="border border-slate-700 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-700 sticky top-0 uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="px-3 py-2.5">Pasted Code</th>
                      <th className="px-3 py-2.5">Matched Product</th>
                      <th className="px-3 py-2.5 text-right">Unrestricted Cases</th>
                      <th className="px-3 py-2.5 text-right">CPP (Pallet)</th>
                      <th className="px-3 py-2.5 text-right">Est. Pallets</th>
                      <th className="px-3 py-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-900/50">
                    {parseResult.items.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/50 transition-colors">
                        <td className="px-3 py-2 font-mono text-slate-200 font-medium">
                          {row.rawMaterialNumber}
                        </td>
                        <td className="px-3 py-2">
                          {row.matchedProduct ? (
                            <div>
                              <span className="font-mono text-brand-300 font-semibold">{row.matchedProduct.productCode}</span>
                              <span className="text-slate-400 ml-2 truncate max-w-xs inline-block align-bottom">{row.matchedProduct.description}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-red-400 italic">No matching product found</span>
                              <button
                                type="button"
                                onClick={() => handleQuickAddClick(row.rawMaterialNumber, row.rawDescription || '')}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-500/20 text-brand-300 border border-brand-500/30 hover:bg-brand-500/35 transition-colors shrink-0"
                              >
                                <Plus className="w-3 h-3" /> Quick Add
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-100 font-semibold">
                          {row.unrestrictedCases.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {row.casesPerPallet ? (
                            <span className="font-mono text-slate-300">
                              {row.casesPerPallet} <span className="text-[10px] text-slate-500">({row.palletSource})</span>
                            </span>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-amber-300 font-medium">
                          {row.calculatedPallets !== null ? row.calculatedPallets.toFixed(2) : '-'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.status === 'MATCHED' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              Matched
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/20 text-red-300 border border-red-500/30" title={row.errorDetails}>
                              Unmatched
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {parseResult.matchedCount > 0 ? (
              <span>Ready to update <strong className="text-emerald-400">{parseResult.matchedCount}</strong> product balances at location <strong className="text-brand-300">{selectedLoc?.locationCode || '-'}</strong>.</span>
            ) : (
              <span>Paste inventory text to parse and match products.</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-md hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting || parseResult.matchedCount === 0 || !selectedLocationId}
              onClick={handleApply}
              className="px-5 py-2 text-sm font-medium text-slate-900 bg-brand-500 rounded-md hover:bg-brand-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitting ? 'Applying Update...' : `Apply Stock Update (${parseResult.matchedCount})`}
            </button>
          </div>
        </div>
      </div>

      {quickAddForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <h3 className="text-md font-semibold text-slate-100 flex items-center gap-2">
                <Plus className="w-4 h-4 text-brand-400" />
                Quick Add Product
              </h3>
              <button 
                type="button" 
                onClick={() => setQuickAddForm(null)} 
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form body */}
            <form onSubmit={handleQuickAddSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
              {quickAddError && (
                <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{quickAddError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Product Code *</label>
                <input
                  type="text"
                  required
                  value={quickAddForm.productCode}
                  onChange={(e) => setQuickAddForm(prev => prev ? { ...prev, productCode: e.target.value.toUpperCase() } : null)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Description *</label>
                <input
                  type="text"
                  required
                  value={quickAddForm.description}
                  onChange={(e) => setQuickAddForm(prev => prev ? { ...prev, description: e.target.value } : null)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Category *</label>
                  <select
                    value={quickAddForm.categoryId}
                    onChange={(e) => setQuickAddForm(prev => prev ? { ...prev, categoryId: e.target.value } : null)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-brand-500"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Unit of Measure *</label>
                  <select
                    value={quickAddForm.unitOfMeasureId}
                    onChange={(e) => setQuickAddForm(prev => prev ? { ...prev, unitOfMeasureId: e.target.value } : null)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-brand-500"
                  >
                    {units.map(u => (
                      <option key={u.id} value={u.id}>{u.code} - {u.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Cases per Pallet *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={quickAddForm.casesPerPallet}
                    onChange={(e) => setQuickAddForm(prev => prev ? { ...prev, casesPerPallet: e.target.value } : null)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Units per Case *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={quickAddForm.unitsPerCase}
                    onChange={(e) => setQuickAddForm(prev => prev ? { ...prev, unitsPerCase: e.target.value } : null)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Default Destination (Optional)</label>
                <select
                  value={quickAddForm.defaultDestinationId}
                  onChange={(e) => setQuickAddForm(prev => prev ? { ...prev, defaultDestinationId: e.target.value } : null)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-brand-500"
                >
                  <option value="">None (Select as needed)</option>
                  {destinations.map(d => (
                    <option key={d.id} value={d.id}>{d.destinationCode} - {d.destinationName}</option>
                  ))}
                </select>
              </div>

              {/* Footer */}
              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setQuickAddForm(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-md hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={quickAddSubmitting}
                  className="px-4 py-2 text-xs font-medium text-slate-900 bg-brand-500 rounded-md hover:bg-brand-400 transition-colors disabled:opacity-40"
                >
                  {quickAddSubmitting ? 'Adding...' : 'Add Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {promptOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
              <h3 className="text-lg font-semibold text-slate-100">Stock Balances Updated</h3>
            </div>
            
            <p className="text-sm text-slate-300">
              Successfully updated inventory balances for <span className="font-semibold text-white">{updatedItemCount}</span> product(s).
              {zeroedItemCount > 0 && (
                <span className="text-amber-400 font-medium block mt-1">
                  ({zeroedItemCount} omitted product(s) not in pasted list were set to 0)
                </span>
              )}
            </p>
            
            <p className="text-xs text-slate-400 bg-slate-950 p-3 rounded-lg border border-slate-800">
              Changes in inventory balances affect holding retention calculations and stock position bands. Would you like to run recommendation generation now to update the Recommendation Workspace and TV Dashboard?
            </p>

            {regeneratingRecs && regenProgress && (
              <div className="space-y-2 p-3 bg-slate-950 rounded-lg border border-slate-800 animate-in fade-in duration-200">
                <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="w-3 h-3 text-brand-400 animate-spin" />
                    Evaluating product recommendations...
                  </span>
                  <span className="text-brand-400 font-mono font-semibold">
                    {regenProgress.total > 0 ? Math.round((regenProgress.current / regenProgress.total) * 100) : 0}%
                  </span>
                </div>

                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-brand-500 h-2 rounded-full transition-all duration-300 ease-out"
                    style={{
                      width: `${Math.min(100, Math.max(5, regenProgress.total > 0 ? Math.round((regenProgress.current / regenProgress.total) * 100) : 5))}%`
                    }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Product {regenProgress.current} of {regenProgress.total}</span>
                  {regenProgress.productCode && (
                    <span className="font-mono text-slate-300 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                      {regenProgress.productCode}
                    </span>
                  )}
                </div>
              </div>
            )}

            {regenSuccessMsg && (
              <div className="p-3 bg-brand-500/10 border border-brand-500/30 rounded-lg text-xs text-brand-300">
                {regenSuccessMsg}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPromptOpen(false);
                  onClose();
                }}
                className="px-4 py-2 text-xs font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-md hover:bg-slate-700 transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                disabled={regeneratingRecs}
                onClick={handleRegenerateRecs}
                className="px-4 py-2 text-xs font-medium text-slate-900 bg-brand-500 rounded-md hover:bg-brand-400 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {regeneratingRecs ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    Regenerate Recommendations
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

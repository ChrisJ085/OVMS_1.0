import React, { useState, useEffect, useMemo } from 'react';
import { X, ClipboardPaste, CheckCircle2, AlertTriangle, Layers, Box, Info } from 'lucide-react';
import { Product } from '../../../../types/product';
import { Location } from '../../../../types/inventory';
import { UnitOfMeasure } from '../../../../types/configuration';
import { subscribeToLocations } from '../../services/locationService';
import { subscribeToProducts } from '../../services/productService';
import { subscribeToCollection } from '../../../../services/firestoreBase';
import { collections } from '../../../configuration/services/configurationService';
import { where } from 'firebase/firestore';
import { useSiteContext } from '../../../../contexts/SiteContext';
import { useAuth } from '../../../auth/context/AuthContext';
import { parsePastedInventoryText, ParseResult } from '../../utils/pasteInventoryParser';
import { batchUpdateInventoryFromPastedData } from '../../services/inventoryService';

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

  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [rawText, setRawText] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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
      [where('tenantId', '==', tenantId), where('siteId', '==', '')],
      setUnits,
      console.error
    );

    return () => {
      unsubLocations();
      unsubProducts();
      unsubUnits();
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
      onClose();
    } else {
      setFeedback({ type: 'error', message: result.error || 'Failed to update stock.' });
    }
  };

  const handleInsertSample = () => {
    setRawText(SAMPLE_PASTE_DATA);
    setFeedback(null);
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
                            <span className="text-red-400 italic">No matching product found</span>
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
    </div>
  );
};

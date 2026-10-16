import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, 
  Check, 
  CheckCircle2, 
  ArrowRight, 
  AlertTriangle, 
  X, 
  Building2, 
  Boxes, 
  Layers, 
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { Product } from '../../../../types/product';
import { ProductCategory, UnitOfMeasure, Destination } from '../../../../types/configuration';
import { createProduct } from '../../../inventory/services/productService';
import { logAuditEvent } from '../../../../services/auditService';
import { createDocument } from '../../../../services/dbService';

export interface UnknownProductItem {
  productNumber: string;
  orderSku?: string;
  description: string;
  rowCount?: number;
  baseUnitOfMeasure?: string;
}

interface AddUnknownProductsWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  unknownProducts: UnknownProductItem[];
  categories: ProductCategory[];
  units: UnitOfMeasure[];
  destinations: Destination[];
  tenantId: string;
  siteId: string;
  userFullName: string;
  onProductSaved: (savedProduct: Product, remainingCount: number) => void;
  onAllCompleted: (savedProducts: Product[]) => void;
}

export const AddUnknownProductsWizardModal: React.FC<AddUnknownProductsWizardModalProps> = ({
  isOpen,
  onClose,
  unknownProducts,
  categories,
  units,
  destinations,
  tenantId,
  siteId,
  userFullName,
  onProductSaved,
  onAllCompleted
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [savedProducts, setSavedProducts] = useState<Product[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Chorley destination resolution
  const resolvedDestinations = useMemo(() => {
    const list = [...destinations];
    const hasChorley = list.some(d => 
      (d.destinationName && d.destinationName.toLowerCase().includes('chorley')) ||
      (d.destinationCode && d.destinationCode.toLowerCase() === 'chorley')
    );
    if (!hasChorley) {
      // Add Chorley as default virtual option
      list.unshift({
        id: 'CHORLEY_DEFAULT',
        tenantId,
        destinationCode: 'CHORLEY',
        destinationName: 'Chorley',
        destinationType: 'EXTERNAL_SITE',
        sortOrder: 1,
        status: 'active'
      });
    }
    return list;
  }, [destinations, tenantId]);

  const defaultChorleyId = useMemo(() => {
    const found = resolvedDestinations.find(d => 
      (d.destinationName && d.destinationName.toLowerCase().includes('chorley')) ||
      (d.destinationCode && d.destinationCode.toLowerCase() === 'chorley')
    );
    return found ? found.id : (resolvedDestinations[0]?.id || '');
  }, [resolvedDestinations]);

  // Active units resolution (fallback if none)
  const resolvedUnits = useMemo(() => {
    const active = units.filter(u => u.status === 'active');
    if (active.length > 0) return active;
    if (units.length > 0) return units;
    return [
      { id: 'uom-cs', code: 'CS', name: 'Cases (CS)', quantityPrecision: 0, status: 'active', tenantId },
      { id: 'uom-pal', code: 'PAL', name: 'Pallets (PAL)', quantityPrecision: 2, status: 'active', tenantId },
      { id: 'uom-ea', code: 'EA', name: 'Each (EA)', quantityPrecision: 0, status: 'active', tenantId }
    ] as UnitOfMeasure[];
  }, [units, tenantId]);

  const defaultUnitId = useMemo(() => {
    const csUnit = resolvedUnits.find(u => u.code?.toUpperCase() === 'CS' || u.name?.toLowerCase().includes('case'));
    return csUnit ? csUnit.id : (resolvedUnits[0]?.id || '');
  }, [resolvedUnits]);

  // Form inputs for the currently active unknown product
  const [productCode, setProductCode] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [unitOfMeasureId, setUnitOfMeasureId] = useState('');
  const [casesPerPallet, setCasesPerPallet] = useState<string>('');
  const [unitsPerCase, setUnitsPerCase] = useState<string>('1');
  const [defaultDestinationId, setDefaultDestinationId] = useState('');
  const [operationallyRelevant, setOperationallyRelevant] = useState(true);

  // Current item being configured
  const currentItem = unknownProducts[currentIndex];
  const totalCount = unknownProducts.length;
  const isLastProduct = currentIndex >= totalCount - 1;

  // Initialize or update form when active unknown product changes
  useEffect(() => {
    if (currentItem) {
      setErrorMessage(null);
      setProductCode(currentItem.productNumber || currentItem.orderSku || '');
      setDescription(currentItem.description || '');
      setCategoryId(categories.find(c => c.status === 'active')?.id || categories[0]?.id || '');
      
      // Match UoM from file if provided, otherwise default to CS
      if (currentItem.baseUnitOfMeasure) {
        const matchingUom = resolvedUnits.find(u => 
          u.code?.toUpperCase() === currentItem.baseUnitOfMeasure?.toUpperCase()
        );
        setUnitOfMeasureId(matchingUom ? matchingUom.id : defaultUnitId);
      } else {
        setUnitOfMeasureId(defaultUnitId);
      }

      // Default Cases Per Pallet (empty or default prompt)
      setCasesPerPallet('80');
      setUnitsPerCase('1');

      // ALWAYS DEFAULT TO CHORLEY
      setDefaultDestinationId(defaultChorleyId);
      setOperationallyRelevant(true);
    }
  }, [currentIndex, currentItem, resolvedUnits, defaultUnitId, defaultChorleyId, categories]);

  if (!isOpen || !currentItem) return null;

  const handleSaveAndNext = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedCode = productCode.trim().toUpperCase();
    if (!trimmedCode) {
      setErrorMessage('Product Code is required.');
      return;
    }

    const trimmedDesc = description.trim();
    if (!trimmedDesc) {
      setErrorMessage('Description is required.');
      return;
    }

    if (!unitOfMeasureId) {
      setErrorMessage('Unit of Measure is required.');
      return;
    }

    const cppNum = parseInt(casesPerPallet, 10);
    if (isNaN(cppNum) || cppNum <= 0) {
      setErrorMessage('Cases per pallet must be a positive number greater than 0.');
      return;
    }

    const upcNum = unitsPerCase.trim() ? parseInt(unitsPerCase, 10) : 1;

    setIsSubmitting(true);

    try {
      // 1. Ensure destination exists in database if it was the fallback Chorley
      let finalDestId = defaultDestinationId || null;
      if (defaultDestinationId === 'CHORLEY_DEFAULT') {
        try {
          const newDestId = await createDocument<any>('destinations', {
            tenantId,
            destinationCode: 'CHORLEY',
            destinationName: 'Chorley',
            destinationType: 'EXTERNAL_SITE',
            sortOrder: 1,
            status: 'active',
            createdBy: userFullName,
            modifiedBy: userFullName,
            createdDate: new Date().toISOString(),
            modifiedDate: new Date().toISOString()
          });
          finalDestId = newDestId;
        } catch (destErr) {
          console.warn('Could not persist Chorley destination; proceeding with code', destErr);
          finalDestId = 'CHORLEY';
        }
      }

      // 2. Persist Product to Product Master
      const productPayload: Omit<Product, 'id' | 'status' | 'createdDate' | 'modifiedDate'> = {
        tenantId,
        siteId,
        productCode: trimmedCode,
        description: trimmedDesc,
        categoryId: categoryId || (categories[0]?.id || ''),
        unitOfMeasureId,
        casesPerPallet: cppNum,
        unitsPerCase: upcNum > 0 ? upcNum : 1,
        configurations: [
          {
            unitOfMeasureId,
            casesPerPallet: cppNum,
            unitsPerCase: upcNum > 0 ? upcNum : 1
          }
        ],
        defaultDestinationId: finalDestId,
        operationallyRelevant,
        notes: `Auto-created from SNP87 report by ${userFullName}`,
        createdBy: userFullName,
        modifiedBy: userFullName
      };

      const result = await createProduct(productPayload);

      if (!result.success) {
        setErrorMessage(result.error || 'Failed to save product to Product Master.');
        setIsSubmitting(false);
        return;
      }

      const newProductId = result.data || `prod_${Date.now()}`;
      const savedProductItem: Product = {
        ...productPayload,
        id: newProductId,
        status: 'active',
        createdDate: new Date().toISOString(),
        modifiedDate: new Date().toISOString()
      };

      // 3. Log Audit Event
      try {
        await logAuditEvent({
          tenantId,
          siteId,
          eventType: 'PRODUCT_CREATE',
          entityType: 'Product',
          entityId: newProductId,
          summary: `Created Product ${trimmedCode} (${trimmedDesc}) from SNP87 Import Wizard`,
          newValue: savedProductItem,
          performedBy: userFullName
        });
      } catch (auditErr) {
        console.warn('Could not log audit event for product creation:', auditErr);
      }

      // 4. Update local state
      const updatedSavedList = [...savedProducts, savedProductItem];
      setSavedProducts(updatedSavedList);

      const remainingAfterThis = totalCount - (currentIndex + 1);
      onProductSaved(savedProductItem, remainingAfterThis);

      // 5. Navigate to next product or complete wizard
      if (currentIndex < totalCount - 1) {
        setCurrentIndex(prev => prev + 1);
      } else {
        // All completed!
        onAllCompleted(updatedSavedList);
        onClose();
      }
    } catch (err: any) {
      console.error('Error saving unknown product:', err);
      setErrorMessage(err.message || 'An unexpected error occurred while saving.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkipCurrent = () => {
    if (currentIndex < totalCount - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      if (savedProducts.length > 0) {
        onAllCompleted(savedProducts);
      }
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-750 border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col my-8">
        {/* Wizard Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-400 flex items-center justify-center shrink-0 shadow-sm">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100">
                  Add Unknown Product to Product Master
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Product {currentIndex + 1} of {totalCount}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Pre-populated from weekly SNP87 file. Once saved, this product will stay in the Product Master permanently.
              </p>
            </div>
          </div>

          <button 
            type="button" 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
            title="Exit Wizard"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar & Sequence Chips */}
        <div className="bg-slate-950 px-6 py-2.5 border-b border-slate-800/80 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-md">
            {unknownProducts.map((p, idx) => {
              const isSaved = idx < currentIndex || savedProducts.some(sp => sp.productCode === (p.productNumber || p.orderSku));
              const isCurrent = idx === currentIndex;
              return (
                <div 
                  key={idx}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono shrink-0 transition-colors border ${
                    isCurrent
                      ? 'bg-cyan-950/90 border-cyan-500 text-cyan-200 font-bold'
                      : isSaved
                      ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                      : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}
                >
                  {isSaved ? (
                    <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-full bg-slate-800 text-slate-400 text-[9px] flex items-center justify-center">
                      {idx + 1}
                    </span>
                  )}
                  <span>{p.productNumber || p.orderSku}</span>
                </div>
              );
            })}
          </div>

          <div className="text-right shrink-0">
            <span className="text-[11px] text-slate-400 font-medium">
              Progress: <strong className="text-slate-200">{Math.round(((currentIndex) / totalCount) * 100)}%</strong>
            </span>
          </div>
        </div>

        {/* Error Callout */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-red-950/40 border border-red-800 rounded-xl text-xs text-red-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSaveAndNext} className="p-6 space-y-5 flex-1">
          {/* Pre-populated Notice */}
          <div className="p-3 bg-cyan-950/25 border border-cyan-800/40 rounded-xl flex items-center gap-2.5 text-xs text-cyan-300">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>
              <strong>Pre-populated from SNP87:</strong> Product Code & Description are auto-filled. Complete Unit of Measure, Cases Per Pallet, and Default Destination (defaults to Chorley) to save.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Product Code */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>Product Code</span>
                <span className="text-[10px] text-cyan-400 normal-case font-normal">Pre-populated</span>
              </label>
              <input
                type="text"
                value={productCode}
                onChange={(e) => setProductCode(e.target.value.toUpperCase())}
                required
                className="px-3 py-2 bg-slate-950 border border-cyan-800/60 rounded-lg text-sm font-mono text-cyan-200 focus:outline-none focus:border-cyan-400"
                placeholder="e.g. 4310500"
              />
            </div>

            {/* Product Category */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Category
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="">Select Category (Optional)</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>Description</span>
              <span className="text-[10px] text-cyan-400 normal-case font-normal">Pre-populated</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              className="px-3 py-2 bg-slate-950 border border-cyan-800/60 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
              placeholder="e.g. F1 Andrex Skin Protect 155sc 8rx3"
            />
          </div>

          {/* Configuration Grid: UoM, Cases per Pallet, Units per Case */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
            <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
              <Boxes className="w-4 h-4 text-cyan-400" />
              Packaging & Pallet Configuration
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Unit of Measure */}
              <div className="flex flex-col gap-1">
                <label htmlFor="unit-of-measure-select" className="text-[11px] font-medium text-slate-400">
                  Unit of Measure <span className="text-rose-400">*</span>
                </label>
                <select
                  id="unit-of-measure-select"
                  aria-label="Unit of Measure"
                  value={unitOfMeasureId}
                  onChange={(e) => setUnitOfMeasureId(e.target.value)}
                  required
                  className="px-2.5 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  {resolvedUnits.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.code} ({u.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Cases Per Pallet */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
                  <span>Cases Per Pallet <span className="text-rose-400">*</span></span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={casesPerPallet}
                  onChange={(e) => setCasesPerPallet(e.target.value)}
                  required
                  placeholder="e.g. 80"
                  className="px-2.5 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Units Per Case */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-slate-400">
                  Units Per Case
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={unitsPerCase}
                  onChange={(e) => setUnitsPerCase(e.target.value)}
                  placeholder="e.g. 1"
                  className="px-2.5 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Default Destination & Operational Flag */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Default Destination (Defaults to Chorley) */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="default-destination-select" className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                  Default Destination
                </span>
                <span className="text-[10px] text-emerald-400 normal-case font-medium">Default: Chorley</span>
              </label>
              <select
                id="default-destination-select"
                aria-label="Default Destination"
                value={defaultDestinationId}
                onChange={(e) => setDefaultDestinationId(e.target.value)}
                className="px-3 py-2 bg-slate-950 border border-emerald-700/60 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-emerald-400"
              >
                {resolvedDestinations.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.destinationName} {d.destinationCode ? `(${d.destinationCode})` : ''}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500">
                Pre-selected to Chorley as required for distribution routing.
              </p>
            </div>

            {/* Operationally Relevant */}
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-3 p-3 border border-slate-800 rounded-xl bg-slate-950/60 cursor-pointer hover:bg-slate-950 transition-colors">
                <input
                  type="checkbox"
                  checked={operationallyRelevant}
                  onChange={(e) => setOperationallyRelevant(e.target.checked)}
                  className="w-4 h-4 text-cyan-500 rounded bg-slate-900 border-slate-700 focus:ring-cyan-500 shrink-0"
                />
                <div>
                  <span className="text-xs font-semibold text-slate-200 block">Operationally Relevant</span>
                  <span className="text-[10px] text-slate-400 block">Included in decision engine and planning views.</span>
                </div>
              </label>
            </div>
          </div>

          {/* Modal Footer Controls */}
          <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
              >
                Exit Wizard
              </button>
              {totalCount > 1 && (
                <button
                  type="button"
                  onClick={handleSkipCurrent}
                  className="px-3.5 py-2 text-xs font-medium text-slate-400 hover:text-amber-300 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Skip this Product
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold text-xs transition-colors shadow-md shadow-emerald-950/40"
              >
                {isSubmitting ? (
                  <>Saving to Master...</>
                ) : isLastProduct ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Save & Finish ({totalCount} of {totalCount})
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Save & Next Product ({currentIndex + 1} of {totalCount})
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

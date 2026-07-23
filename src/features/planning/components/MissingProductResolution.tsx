import React, { useState } from 'react';
import { Product } from '../../../types/product';
import { checkDuplicateProductCode, createProductFromImport, CreateProductMasterInput } from '../services/productMappingService';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

interface MissingProductResolutionProps {
  productCode: string;
  sapDescription: string;
  affectedRows: {
    productionLineCode: string;
    productionLineName: string;
    productionDate: any;
    plannedQuantity: number;
    sourceUnitOfMeasure: string;
  }[];
  existingProducts: Product[];
  tenantId: string;
  siteId: string;
  userProfileName: string;
  onClose: () => void;
  onResolved: () => void;
}

export const MissingProductResolution: React.FC<MissingProductResolutionProps> = ({
  productCode,
  sapDescription,
  affectedRows,
  existingProducts,
  tenantId,
  siteId,
  userProfileName,
  onClose,
  onResolved
}) => {
  const [code, setCode] = useState(productCode);
  const [description, setDescription] = useState(sapDescription);
  const [unitOfMeasureId, setUnitOfMeasureId] = useState('CS');
  const [casesPerPallet, setCasesPerPallet] = useState<string>(''); // Blank by default, NO pre-filled 100!
  const [unitsPerCase, setUnitsPerCase] = useState<string>('');
  const [categoryId, setCategoryId] = useState('general');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [operationallyRelevant, setOperationallyRelevant] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Check duplicate on code change
  const duplicateMatch = checkDuplicateProductCode(code, existingProducts);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!code.trim()) {
      setError('Product code is required.');
      return;
    }
    if (!description.trim()) {
      setError('Product description is required.');
      return;
    }
    const cpp = parseFloat(casesPerPallet);
    if (isNaN(cpp) || cpp <= 0) {
      setError('Cases per pallet is required and must be a number greater than 0.');
      return;
    }

    if (duplicateMatch) {
      setError(`Cannot create product: Code "${code}" conflicts with existing Product Master record ${duplicateMatch.productCode} (${duplicateMatch.description}).`);
      return;
    }

    setSubmitting(true);

    const input: CreateProductMasterInput = {
      productCode: code.trim(),
      description: description.trim(),
      categoryId,
      unitOfMeasureId,
      casesPerPallet: cpp,
      unitsPerCase: unitsPerCase ? parseFloat(unitsPerCase) : null,
      operationallyRelevant,
      status
    };

    const res = await createProductFromImport(input, tenantId, siteId, userProfileName, existingProducts);
    setSubmitting(false);

    if (res.success) {
      onResolved();
    } else {
      setError(res.error || 'Failed to create product.');
    }
  };

  const totalCasesAffected = affectedRows.reduce((acc, r) => acc + (r.plannedQuantity || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-6 shadow-2xl text-slate-100 my-8">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Controlled Product Master Creation</h3>
            <p className="text-xs text-slate-400">
              Register unknown SAP product code into local Product Master to enable import calculations.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Impact Warning Banner */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-4 text-xs text-amber-300">
          <div className="font-semibold mb-1 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            Impact on Current Production Plan Import
          </div>
          <div>
            This product code impacts <strong>{affectedRows.length} import rows</strong> with total planned volume of{' '}
            <strong>{totalCasesAffected.toLocaleString()} cases</strong>.
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Product Code <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                required
              />
              {duplicateMatch && (
                <p className="text-xs text-red-400 mt-1">
                  ⚠️ Code matches existing SKU {duplicateMatch.productCode} ({duplicateMatch.description})
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Unit of Measure <span className="text-red-400">*</span>
              </label>
              <select
                value={unitOfMeasureId}
                onChange={e => setUnitOfMeasureId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="CS">CS (Cases)</option>
                <option value="EA">EA (Each / Units)</option>
                <option value="KG">KG (Kilograms)</option>
                <option value="PAL">PAL (Pallets)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Product Description <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
              placeholder="Full Product Description"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-amber-300 mb-1">
                Cases Per Pallet (CS/Pallet) <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={casesPerPallet}
                onChange={e => setCasesPerPallet(e.target.value)}
                placeholder="Enter verified rate e.g. 80"
                className="w-full bg-slate-800 border border-amber-500/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                required
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Must be verified. Unverified defaults are forbidden.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Units Per Case (Optional)
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={unitsPerCase}
                onChange={e => setUnitsPerCase(e.target.value)}
                placeholder="e.g. 12"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Product Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as any)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Category</label>
              <input
                type="text"
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="opRel"
              checked={operationallyRelevant}
              onChange={e => setOperationallyRelevant(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-cyan-500"
            />
            <label htmlFor="opRel" className="text-xs text-slate-300 cursor-pointer">
              Mark as Operationally Relevant for Warehouse & Scheduling
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !!duplicateMatch}
              className="px-4 py-2 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              {submitting ? 'Creating Product...' : 'Create Product & Revalidate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

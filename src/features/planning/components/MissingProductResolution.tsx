import React, { useState, useEffect } from 'react';
import { Product, ProductConfiguration } from '../../../types/product';
import { checkDuplicateProductCode, createProductFromImport, CreateProductMasterInput } from '../services/productMappingService';
import { AlertCircle, CheckCircle2, X, Plus, Trash2 } from 'lucide-react';
import { collections } from '../../configuration/services/configurationService';
import { ProductCategory, UnitOfMeasure } from '../../../types/configuration';
import { subscribeToCollection, where } from '../../../services/dbService';

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
  const [categoryId, setCategoryId] = useState('general');
  const [configurations, setConfigurations] = useState<ProductConfiguration[]>([
    { unitOfMeasureId: 'CS', casesPerPallet: null, unitsPerCase: null }
  ]);
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [operationallyRelevant, setOperationallyRelevant] = useState(true);

  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [units, setUnits] = useState<UnitOfMeasure[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsubCategories = subscribeToCollection<ProductCategory>(
      collections.PRODUCT_CATEGORIES,
      [where('tenantId', '==', tenantId), where('siteId', '==', '')],
      (items) => {
        setCategories(items);
        const active = items.filter(c => c.status === 'active');
        if (active.length > 0 && categoryId === 'general') {
          setCategoryId(active[0].id);
        }
      },
      console.error
    );

    const unsubUnits = subscribeToCollection<UnitOfMeasure>(
      collections.UNITS_OF_MEASURE,
      [where('tenantId', '==', tenantId), where('siteId', '==', '')],
      (items) => {
        setUnits(items);
        const active = items.filter(u => u.status === 'active');
        if (active.length > 0) {
          setConfigurations(prev => prev.map(config => {
            if (config.unitOfMeasureId === 'CS' && !active.find(u => u.id === 'CS')) {
              return { ...config, unitOfMeasureId: active[0].id };
            }
            return config;
          }));
        }
      },
      console.error
    );

    return () => {
      unsubCategories();
      unsubUnits();
    };
  }, [tenantId]);

  const handleConfigChange = (index: number, field: keyof ProductConfiguration, value: any) => {
    const newConfigs = [...configurations];
    newConfigs[index] = { ...newConfigs[index], [field]: value };
    setConfigurations(newConfigs);
  };

  const addConfiguration = () => {
    const activeUnits = units.filter(u => u.status === 'active');
    const initialUomId = activeUnits.length > 0 ? activeUnits[0].id : 'CS';
    setConfigurations([...configurations, { unitOfMeasureId: initialUomId, casesPerPallet: null, unitsPerCase: null }]);
  };

  const removeConfiguration = (index: number) => {
    if (configurations.length <= 1) return;
    const newConfigs = [...configurations];
    newConfigs.splice(index, 1);
    setConfigurations(newConfigs);
  };

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
    
    // Validate all configurations
    for (const config of configurations) {
      if (config.casesPerPallet === null || config.casesPerPallet <= 0) {
        setError('Cases per pallet is required for all configurations and must be greater than 0.');
        return;
      }
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
      configurations,
      // Legacy fields for mapping service compatibility (will use first config)
      unitOfMeasureId: configurations[0].unitOfMeasureId,
      casesPerPallet: configurations[0].casesPerPallet as number,
      unitsPerCase: configurations[0].unitsPerCase,
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
              <label className="block text-xs font-medium text-slate-300 mb-1">Category <span className="text-red-400">*</span></label>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                required
              >
                <option value="" disabled>Select category</option>
                {categories.filter(c => c.status === 'active' || c.id === categoryId).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
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

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">Product Configurations (UoM & Pallets) <span className="text-red-400">*</span></label>
              <button
                type="button"
                onClick={addConfiguration}
                className="text-[10px] flex items-center gap-1 text-cyan-400 hover:text-cyan-300 transition-colors uppercase tracking-wider font-bold"
              >
                <Plus className="w-3 h-3" />
                Add Config
              </button>
            </div>
            
            <div className="space-y-2">
              {configurations.map((config, index) => (
                <div key={index} className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg space-y-3 relative group">
                  {configurations.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeConfiguration(index)}
                      className="absolute top-2 right-2 text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pr-4">
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-1 uppercase tracking-wider">Unit of Measure</label>
                      <select
                        value={config.unitOfMeasureId}
                        onChange={e => handleConfigChange(index, 'unitOfMeasureId', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                        required
                      >
                        {units.filter(u => u.status === 'active' || u.id === config.unitOfMeasureId).map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-1 uppercase tracking-wider">Cases / Pallet</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={config.casesPerPallet ?? ''}
                        onChange={e => handleConfigChange(index, 'casesPerPallet', e.target.value ? parseFloat(e.target.value) : null)}
                        placeholder="e.g. 80"
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-1 uppercase tracking-wider">Units / Case</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={config.unitsPerCase ?? ''}
                        onChange={e => handleConfigChange(index, 'unitsPerCase', e.target.value ? parseFloat(e.target.value) : null)}
                        placeholder="Optional"
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
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

            <div className="flex items-center gap-2 h-full pt-6">
              <input
                type="checkbox"
                id="opRel"
                checked={operationallyRelevant}
                onChange={e => setOperationallyRelevant(e.target.checked)}
                className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-cyan-500"
              />
              <label htmlFor="opRel" className="text-xs text-slate-300 cursor-pointer">
                Operationally Relevant
              </label>
            </div>
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

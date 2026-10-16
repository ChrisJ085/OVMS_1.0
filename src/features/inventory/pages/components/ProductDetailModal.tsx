import React, { useState, useEffect } from 'react';
import { X, Package, Info, Check } from 'lucide-react';
import { Product } from '../../../../types/product';
import { StatusBadge } from '../../../../components/ui/StatusBadge';
import { ProductInventoryPanel } from './ProductInventoryPanel';
import { ProductPlanningRulesPanel } from '../../../planning/components/ProductPlanningRulesPanel';
import { ProductProductionContextPanel } from '../../../planning/components/ProductProductionContextPanel';
import { ProductPromotionsPanel } from '../../../planning/components/ProductPromotionsPanel';
import { updateProduct } from '../../services/productService';
import { useSiteContext } from '../../../../contexts/SiteContext';

interface ProductDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  item?: Product;
  getCategoryName: (id: string) => string;
  getUnitName: (id: string) => string;
  getDestinationName: (id: string | null) => string;
  onProductUpdated?: (updated: Product) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ 
  isOpen,
  onClose,
  item,
  getCategoryName,
  getUnitName,
  getDestinationName,
  onProductUpdated
}) => {
  const { tenantId } = useSiteContext();
  const [currentProduct, setCurrentProduct] = useState<Product | undefined>(item);
  const [isUpdatingRelevance, setIsUpdatingRelevance] = useState(false);

  useEffect(() => {
    setCurrentProduct(item);
  }, [item]);

  if (!isOpen || !currentProduct) return null;

  const renderDate = (dateVal: any) => {
    if (!dateVal) return '-';
    if (dateVal.toDate) return dateVal.toDate().toLocaleString();
    return new Date(dateVal).toLocaleString();
  };

  const handleToggleOperationalRelevance = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentProduct.id) return;
    const newVal = e.target.checked;
    setIsUpdatingRelevance(true);

    const updatedProduct = {
      ...currentProduct,
      operationallyRelevant: newVal,
      modifiedDate: new Date().toISOString()
    };
    setCurrentProduct(updatedProduct);

    try {
      const res = await updateProduct(currentProduct.id, { operationallyRelevant: newVal }, tenantId);
      if (res.success) {
        onProductUpdated?.(updatedProduct);
      } else {
        // Revert on error
        setCurrentProduct(currentProduct);
      }
    } catch (err) {
      console.error('Failed to update operational relevance:', err);
      setCurrentProduct(currentProduct);
    } finally {
      setIsUpdatingRelevance(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-5xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-900/50">
          <div>
            <h2 className="text-xl font-semibold text-slate-100 flex items-center gap-3">
              <Package className="w-5 h-5 text-brand-400" />
              {currentProduct.productCode}
            </h2>
            <p className="text-sm text-slate-400 mt-1">{currentProduct.description}</p>
          </div>
          <div className="flex items-center gap-4">
            {currentProduct.status === 'active' 
              ? <StatusBadge variant="completed" label="Active" />
              : <StatusBadge variant="blocked" label="Inactive" />
            }
            <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors bg-slate-800 p-1.5 rounded-md hover:bg-slate-700">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 bg-slate-900">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Core Attributes */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  Core Attributes
                </h3>
                <dl className="space-y-4">
                  <div>
                    <dt className="text-xs text-slate-500 mb-1">Category</dt>
                    <dd className="text-sm text-slate-200 font-medium">{getCategoryName(currentProduct.categoryId)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500 mb-2">Configurations (UoM / Pallet / Case)</dt>
                    <dd className="space-y-2">
                      {currentProduct.configurations?.map((config, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-slate-900/50 border border-slate-700/50 rounded text-sm">
                          <span className="text-slate-200 font-medium">{getUnitName(config.unitOfMeasureId)}</span>
                          <div className="flex items-center gap-3 text-xs text-slate-400">
                            <span>{config.casesPerPallet ?? '-'} CS/Pal</span>
                            {config.unitsPerCase && <span>{config.unitsPerCase} Units/CS</span>}
                          </div>
                        </div>
                      )) || (
                        <div className="flex items-center justify-between p-2 bg-slate-900/50 border border-slate-700/50 rounded text-sm text-slate-400 italic">
                          Legacy: {getUnitName(currentProduct.unitOfMeasureId)} ({currentProduct.casesPerPallet ?? '-'} CS/Pal)
                        </div>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500 mb-1">Default Destination</dt>
                    <dd className="text-sm text-slate-200 font-medium">{getDestinationName(currentProduct.defaultDestinationId)}</dd>
                  </div>

                  {/* Interactive Operational Relevance Checkbox */}
                  <div>
                    <dt className="text-xs text-slate-500 mb-1.5">Operational Relevance</dt>
                    <dd className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/50">
                      <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                        <input
                          type="checkbox"
                          checked={!!currentProduct.operationallyRelevant}
                          onChange={handleToggleOperationalRelevance}
                          disabled={isUpdatingRelevance}
                          className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-brand-500 focus:ring-brand-500/20 focus:ring-offset-0 focus:outline-none transition cursor-pointer"
                        />
                        <span className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">
                          {currentProduct.operationallyRelevant ? 'Operationally Relevant' : 'Not Relevant'}
                        </span>
                        {isUpdatingRelevance && (
                          <span className="text-[10px] text-brand-400 animate-pulse ml-auto">Saving...</span>
                        )}
                      </label>
                    </dd>
                  </div>

                  {currentProduct.notes && (
                    <div>
                      <dt className="text-xs text-slate-500 mb-1">Notes</dt>
                      <dd className="text-sm text-slate-300 bg-slate-900/50 p-2 rounded border border-slate-700/50 mt-1 whitespace-pre-wrap">{currentProduct.notes}</dd>
                    </div>
                  )}
                </dl>

                <div className="mt-6 pt-4 border-t border-slate-700/50">
                  <dl className="space-y-2">
                    <div className="flex justify-between">
                      <dt className="text-xs text-slate-500">Last Modified</dt>
                      <dd className="text-xs text-slate-300">{renderDate(currentProduct.modifiedDate)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-xs text-slate-500">Modified By</dt>
                      <dd className="text-xs text-slate-300">{currentProduct.modifiedBy || '-'}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>

            {/* Operational & Planning Panels */}
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              <ProductInventoryPanel
                productId={currentProduct.id!}
                productCode={currentProduct.productCode}
              />
              <ProductPlanningRulesPanel
                productId={currentProduct.id!}
                productCode={currentProduct.productCode}
                productDescription={currentProduct.description}
              />
              <ProductProductionContextPanel productId={currentProduct.id!} />
              <ProductPromotionsPanel
                productId={currentProduct.id!}
                productCode={currentProduct.productCode}
                productDescription={currentProduct.description}
              />

            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

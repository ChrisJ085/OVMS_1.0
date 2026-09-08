import React from 'react';
import { X, Package, Ruler, Archive, CheckCircle, Info } from 'lucide-react';
import { Product } from '../../../../types/product';
import { StatusBadge } from '../../../../components/ui/StatusBadge';
import { ProductProductionContextPanel } from '../../../planning/components/ProductProductionContextPanel';
import { ProductPromotionsPanel } from '../../../planning/components/ProductPromotionsPanel';
import { Timestamp } from '../../../../services/firestoreBase';

interface ProductDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  item?: Product;
  getCategoryName: (id: string) => string;
  getUnitName: (id: string) => string;
  getDestinationName: (id: string | null) => string;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ 
  isOpen, onClose, item, getCategoryName, getUnitName, getDestinationName
}) => {
  if (!isOpen || !item) return null;

  const renderDate = (dateVal: any) => {
    if (!dateVal) return '-';
    if (dateVal.toDate) return dateVal.toDate().toLocaleString();
    return new Date(dateVal).toLocaleString();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-900/50">
          <div>
            <h2 className="text-xl font-semibold text-slate-100 flex items-center gap-3">
              <Package className="w-5 h-5 text-brand-400" />
              {item.productCode}
            </h2>
            <p className="text-sm text-slate-400 mt-1">{item.description}</p>
          </div>
          <div className="flex items-center gap-4">
            {item.status === 'active' 
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
                    <dd className="text-sm text-slate-200 font-medium">{getCategoryName(item.categoryId)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500 mb-2">Configurations (UoM / Pallet / Case)</dt>
                    <dd className="space-y-2">
                      {item.configurations?.map((config, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-slate-900/50 border border-slate-700/50 rounded text-sm">
                          <span className="text-slate-200 font-medium">{getUnitName(config.unitOfMeasureId)}</span>
                          <div className="flex items-center gap-3 text-xs text-slate-400">
                            <span>{config.casesPerPallet ?? '-'} CS/Pal</span>
                            {config.unitsPerCase && <span>{config.unitsPerCase} Units/CS</span>}
                          </div>
                        </div>
                      )) || (
                        <div className="flex items-center justify-between p-2 bg-slate-900/50 border border-slate-700/50 rounded text-sm text-slate-400 italic">
                          Legacy: {getUnitName(item.unitOfMeasureId)} ({item.casesPerPallet ?? '-'} CS/Pal)
                        </div>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500 mb-1">Default Destination</dt>
                    <dd className="text-sm text-slate-200 font-medium">{getDestinationName(item.defaultDestinationId)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500 mb-1">Operational Relevance</dt>
                    <dd className="text-sm text-slate-200 font-medium flex items-center gap-2">
                      {item.operationallyRelevant ? (
                        <><CheckCircle className="w-3.5 h-3.5 text-brand-400" /> Yes</>
                      ) : (
                        <><X className="w-3.5 h-3.5 text-slate-500" /> No</>
                      )}
                    </dd>
                  </div>
                  {item.notes && (
                    <div>
                      <dt className="text-xs text-slate-500 mb-1">Notes</dt>
                      <dd className="text-sm text-slate-300 bg-slate-900/50 p-2 rounded border border-slate-700/50 mt-1 whitespace-pre-wrap">{item.notes}</dd>
                    </div>
                  )}
                </dl>

                <div className="mt-6 pt-4 border-t border-slate-700/50">
                  <dl className="space-y-2">
                    <div className="flex justify-between">
                      <dt className="text-xs text-slate-500">Last Modified</dt>
                      <dd className="text-xs text-slate-300">{renderDate(item.modifiedDate)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-xs text-slate-500">Modified By</dt>
                      <dd className="text-xs text-slate-300">{item.modifiedBy}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>

            {/* Functional Placeholders */}
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              <div className="bg-slate-800/30 border border-slate-700/50 border-dashed rounded-lg p-5 flex flex-col justify-center items-center text-center">
                <Archive className="w-8 h-8 text-slate-600 mb-3" />
                <h4 className="text-sm font-medium text-slate-300 mb-1">Inventory Balances</h4>
                <p className="text-xs text-slate-500">Real-time stock levels across all sites will appear here in the Inventory phase.</p>
              </div>

              <div className="bg-slate-800/30 border border-slate-700/50 border-dashed rounded-lg p-5 flex flex-col justify-center items-center text-center">
                <Ruler className="w-8 h-8 text-slate-600 mb-3" />
                <h4 className="text-sm font-medium text-slate-300 mb-1">Planning Rules</h4>
                <p className="text-xs text-slate-500">Target stock levels, SS thresholds, and replenishment parameters will appear here.</p>
              </div>

              <ProductProductionContextPanel productId={item.id!} />
              <ProductPromotionsPanel productId={item.id!} />

              <div className="bg-slate-800/30 border border-slate-700/50 border-dashed rounded-lg p-5 flex flex-col justify-center items-center text-center">
                <Info className="w-8 h-8 text-slate-600 mb-3" />
                <h4 className="text-sm font-medium text-slate-300 mb-1">Promotions</h4>
                <p className="text-xs text-slate-500">Active and upcoming promotional plans for this product will appear here.</p>
              </div>

            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

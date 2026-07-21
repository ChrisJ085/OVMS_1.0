import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { FormField } from '../../../../components/ui/FormField';
import { Product } from '../../../../types/product';
import { ProductCategory, UnitOfMeasure, Destination } from '../../../../types/configuration';
import { useDevelopmentContext } from '../../../../contexts/DevelopmentContext';
import { createProduct, updateProduct } from '../../services/productService';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  item?: Product;
  categories: ProductCategory[];
  units: UnitOfMeasure[];
  destinations: Destination[];
}

export const ProductModal: React.FC<ProductModalProps> = ({ 
  isOpen, onClose, item, categories, units, destinations 
}) => {
  const { tenantId } = useDevelopmentContext();
  const [formData, setFormData] = useState<Partial<Product>>({
    operationallyRelevant: true
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (item) {
        setFormData({ ...item });
      } else {
        const activeCategories = categories.filter(c => c.status === 'active');
        const activeUnits = units.filter(u => u.status === 'active');
        setFormData({
          productCode: '',
          description: '',
          categoryId: activeCategories.length > 0 ? activeCategories[0].id : '',
          unitOfMeasureId: activeUnits.length > 0 ? activeUnits[0].id : '',
          casesPerPallet: null,
          unitsPerCase: null,
          defaultDestinationId: null,
          operationallyRelevant: true,
          notes: ''
        });
      }
    }
  }, [isOpen, item, categories, units]);

  if (!isOpen) return null;

  const handleChange = (field: keyof Product, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    let result;
    if (item?.id) {
      result = await updateProduct(item.id, formData, tenantId);
    } else {
      result = await createProduct({
        ...formData,
        tenantId,
      } as Omit<Product, 'id' | 'status' | 'createdDate' | 'modifiedDate'>);
    }
    
    setSubmitting(false);
    if (result.success) {
      onClose();
    } else {
      alert(result.error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-lg font-medium text-slate-100">
            {item ? 'Edit Product' : 'Create Product'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="p-5 space-y-4 overflow-y-auto">
            <FormField 
              label="Product Code" 
              value={formData.productCode || ''} 
              onChange={(e) => handleChange('productCode', e.target.value.toUpperCase())} 
              required 
            />
            
            <FormField 
              label="Description" 
              value={formData.description || ''} 
              onChange={(e) => handleChange('description', e.target.value)} 
              required 
            />
            
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-300">Category *</label>
              <select 
                value={formData.categoryId || ''} 
                onChange={(e) => handleChange('categoryId', e.target.value)}
                className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
                required
              >
                <option value="" disabled>Select a category</option>
                {categories
                  .filter(c => c.status === 'active' || c.id === formData.categoryId)
                  .map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-300">Unit of Measure *</label>
              <select 
                value={formData.unitOfMeasureId || ''} 
                onChange={(e) => handleChange('unitOfMeasureId', e.target.value)}
                className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
                required
              >
                <option value="" disabled>Select a unit</option>
                {units
                  .filter(u => u.status === 'active' || u.id === formData.unitOfMeasureId)
                  .map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <FormField 
                label="Cases per Pallet" 
                type="number"
                value={formData.casesPerPallet ?? ''} 
                onChange={(e) => handleChange('casesPerPallet', e.target.value ? parseInt(e.target.value) : null)} 
              />
              <FormField 
                label="Units per Case" 
                type="number"
                value={formData.unitsPerCase ?? ''} 
                onChange={(e) => handleChange('unitsPerCase', e.target.value ? parseInt(e.target.value) : null)} 
              />
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-300">Default Destination</label>
              <select 
                value={formData.defaultDestinationId || ''} 
                onChange={(e) => handleChange('defaultDestinationId', e.target.value || null)}
                className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
              >
                <option value="">None</option>
                {destinations
                  .filter(d => d.status === 'active' || d.id === formData.defaultDestinationId)
                  .map(d => (
                  <option key={d.id} value={d.id}>{d.destinationName}</option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-3 p-3 border border-slate-700 rounded-md bg-slate-800/50 cursor-pointer hover:bg-slate-800 transition-colors">
              <div className="flex items-center h-5">
                <input
                  type="checkbox"
                  checked={formData.operationallyRelevant || false}
                  onChange={(e) => handleChange('operationallyRelevant', e.target.checked)}
                  className="w-4 h-4 text-brand-500 bg-slate-900 border-slate-600 rounded focus:ring-brand-500 focus:ring-offset-slate-900"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-slate-200">Operationally Relevant</span>
                <span className="text-xs text-slate-400">Appears by default in active planning views.</span>
              </div>
            </label>

            <FormField 
              label="Notes" 
              value={formData.notes || ''} 
              onChange={(e) => handleChange('notes', e.target.value)} 
            />
          </div>
          
          <div className="px-5 py-4 bg-slate-800/50 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 border border-slate-600 rounded-md hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-slate-900 bg-brand-500 rounded-md hover:bg-brand-400 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

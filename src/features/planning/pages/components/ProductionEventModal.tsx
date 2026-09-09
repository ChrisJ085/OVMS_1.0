import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { FormField } from '../../../../components/ui/FormField';
import { ProductionEvent } from '../../../../types/production';
import { ProductionLine, UnitOfMeasure } from '../../../../types/configuration';
import { createProductionEvent, updateProductionEvent } from '../../services/productionService';
import { ProductLookup } from '../../../inventory/components/ProductLookup';
import { useSiteContext } from '../../../../contexts/SiteContext';

interface ProductionEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  item?: ProductionEvent;
  lines: ProductionLine[];
  uoms: UnitOfMeasure[];
}

export const ProductionEventModal: React.FC<ProductionEventModalProps> = ({ 
  isOpen, onClose, item, lines, uoms 
}) => {
  const { tenantId, siteId } = useSiteContext();
  const [formData, setFormData] = useState<Partial<ProductionEvent>>({});
  const [submitting, setSubmitting] = useState(false);
  const [plannedStartInput, setPlannedStartInput] = useState('');
  const [plannedFinishInput, setPlannedFinishInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (item) {
        setFormData({ ...item });
        const start = (item.plannedStart as any).toDate ? (item.plannedStart as any).toDate() : new Date(item.plannedStart as any);
        const finish = (item.plannedFinish as any).toDate ? (item.plannedFinish as any).toDate() : new Date(item.plannedFinish as any);
        
        setPlannedStartInput(start.toISOString().slice(0, 16));
        setPlannedFinishInput(finish.toISOString().slice(0, 16));
      } else {
        const activeLines = lines.filter(l => l.status === 'active');
        const activeUoms = uoms.filter(u => u.status === 'active');
        
        setFormData({
          productId: '',
          productCodeSnapshot: '',
          descriptionSnapshot: '',
          productionLineId: activeLines.length > 0 ? activeLines[0].id : '',
          productionStatus: 'PLANNED',
          plannedQuantity: null,
          actualQuantity: null,
          unitOfMeasureId: activeUoms.length > 0 ? activeUoms[0].id : '',
          delayReason: null,
          actualStart: null,
          actualFinish: null,
          notes: ''
        });
        
        const start = new Date();
        const finish = new Date(start.getTime() + 2 * 60 * 60 * 1000); // default 2 hours duration
        setPlannedStartInput(start.toISOString().slice(0, 16));
        setPlannedFinishInput(finish.toISOString().slice(0, 16));
      }
    }
  }, [isOpen, item, lines, uoms]);

  if (!isOpen) return null;

  const handleChange = (field: keyof ProductionEvent, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    const start = new Date(plannedStartInput);
    const finish = new Date(plannedFinishInput);
    
    const payload = {
      ...formData,
      plannedStart: start.toISOString(),
      plannedFinish: finish.toISOString(),
    };

    if (payload.plannedQuantity !== null && payload.plannedQuantity !== undefined && payload.plannedQuantity !== '') {
      payload.plannedQuantity = Number(payload.plannedQuantity);
    } else {
      payload.plannedQuantity = null;
    }
    
    let result;
    if (item?.id) {
      result = await updateProductionEvent(item.id, payload, tenantId, siteId);
    } else {
      result = await createProductionEvent({
        ...payload,
        tenantId,
        siteId,
      } as Omit<ProductionEvent, 'id' | 'status' | 'createdDate' | 'modifiedDate'>);
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
            {item ? 'Edit Planned Event' : 'Plan Production Event'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="p-5 space-y-4 overflow-y-auto">
            
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-300">Product *</label>
              <ProductLookup 
                value={formData.productId}
                onChange={(product) => {
                  handleChange('productId', product.id);
                  handleChange('productCodeSnapshot', product.productCode);
                  handleChange('descriptionSnapshot', product.description);
                }}
                disabled={!!item && item.productionStatus !== 'PLANNED'}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-300">Production Line *</label>
              <select 
                value={formData.productionLineId || ''} 
                onChange={(e) => handleChange('productionLineId', e.target.value)}
                className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
                required
                disabled={!!item && item.productionStatus !== 'PLANNED'}
              >
                <option value="" disabled>Select a line</option>
                {lines
                  .filter(l => l.status === 'active' || l.id === formData.productionLineId)
                  .map(l => (
                  <option key={l.id} value={l.id}>{l.lineName}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-300">Planned Start *</label>
                <input 
                  type="datetime-local" 
                  value={plannedStartInput}
                  onChange={(e) => setPlannedStartInput(e.target.value)}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-300">Planned Finish *</label>
                <input 
                  type="datetime-local" 
                  value={plannedFinishInput}
                  onChange={(e) => setPlannedFinishInput(e.target.value)}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField 
                label="Planned Quantity" 
                type="number"
                value={formData.plannedQuantity ?? ''} 
                onChange={(e) => handleChange('plannedQuantity', e.target.value)} 
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-300">Unit of Measure *</label>
                <select 
                  value={formData.unitOfMeasureId || ''} 
                  onChange={(e) => handleChange('unitOfMeasureId', e.target.value)}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
                  required
                >
                  <option value="" disabled>Select UOM</option>
                  {uoms
                    .filter(u => u.status === 'active' || u.id === formData.unitOfMeasureId)
                    .map(u => (
                    <option key={u.id} value={u.id}>{u.code}</option>
                  ))}
                </select>
              </div>
            </div>

            <FormField 
              label="Notes" 
              value={formData.notes || ''} 
              onChange={(e) => handleChange('notes', e.target.value)} 
              isTextArea
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
              {submitting ? 'Saving...' : 'Save Plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

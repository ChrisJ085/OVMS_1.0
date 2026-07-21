import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { FormField } from '../../../../components/ui/FormField';
import { PromotionProductRule } from '../../../../types/promotion';
import { Destination, ActionType } from '../../../../types/configuration';
import { useDevelopmentContext } from '../../../../contexts/DevelopmentContext';
import { createPromotionRule, updatePromotionRule } from '../../services/promotionService';
import { ProductLookup } from '../../../inventory/components/ProductLookup';

interface PromotionRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  promotionId: string;
  item?: PromotionProductRule;
  destinations: Destination[];
  actionTypes: ActionType[];
}

export const PromotionRuleModal: React.FC<PromotionRuleModalProps> = ({ 
  isOpen, onClose, promotionId, item, destinations, actionTypes
}) => {
  const { tenantId, siteId } = useDevelopmentContext();
  const [formData, setFormData] = useState<Partial<PromotionProductRule>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (item) {
        setFormData({ ...item });
      } else {
        setFormData({
          promotionId,
          productId: '',
          productCodeSnapshot: '',
          descriptionSnapshot: '',
          expectedVolumeUpliftQuantity: null,
          expectedVolumeUpliftPercent: null,
          retentionUpliftQuantity: null,
          promotionMinimumOverride: null,
          promotionTargetOverride: null,
          promotionMaximumOverride: null,
          destinationOverrideId: null,
          priorityWeightUplift: 0,
          actionTypeOverrideId: null,
          notes: ''
        });
      }
    }
  }, [isOpen, item, promotionId]);

  if (!isOpen) return null;

  const handleChange = (field: keyof PromotionProductRule, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNumberChange = (field: keyof PromotionProductRule, value: string) => {
    if (value === '') {
      handleChange(field, null);
    } else {
      handleChange(field, Number(value));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    let result;
    if (item?.id) {
      result = await updatePromotionRule(item.id, formData);
    } else {
      result = await createPromotionRule({
        ...formData,
        tenantId,
        siteId,
      } as Omit<PromotionProductRule, 'id' | 'status' | 'createdDate' | 'modifiedDate'>);
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
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-lg font-medium text-slate-100">
            {item ? 'Edit Product Impact' : 'Add Product Impact'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="p-5 space-y-6 overflow-y-auto">
            
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-300">Product *</label>
              <ProductLookup 
                value={formData.productId}
                onChange={(id, code, desc) => {
                  handleChange('productId', id);
                  handleChange('productCodeSnapshot', code);
                  handleChange('descriptionSnapshot', desc);
                }}
                disabled={!!item}
              />
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-brand-400 border-b border-slate-800 pb-2">Volume & Retention Impacts</h3>
              <div className="grid grid-cols-3 gap-4">
                <FormField 
                  label="Vol. Uplift (Qty)" 
                  type="number"
                  value={formData.expectedVolumeUpliftQuantity ?? ''} 
                  onChange={(e) => handleNumberChange('expectedVolumeUpliftQuantity', e.target.value)} 
                />
                <FormField 
                  label="Vol. Uplift (%)" 
                  type="number"
                  value={formData.expectedVolumeUpliftPercent ?? ''} 
                  onChange={(e) => handleNumberChange('expectedVolumeUpliftPercent', e.target.value)} 
                />
                <FormField 
                  label="Retention Uplift (Qty)" 
                  type="number"
                  value={formData.retentionUpliftQuantity ?? ''} 
                  onChange={(e) => handleNumberChange('retentionUpliftQuantity', e.target.value)} 
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-brand-400 border-b border-slate-800 pb-2">Threshold Overrides</h3>
              <p className="text-xs text-slate-500 mb-2">Overrides base product planning rule thresholds. Leave blank to inherit.</p>
              <div className="grid grid-cols-3 gap-4">
                <FormField 
                  label="Min Override" 
                  type="number"
                  value={formData.promotionMinimumOverride ?? ''} 
                  onChange={(e) => handleNumberChange('promotionMinimumOverride', e.target.value)} 
                />
                <FormField 
                  label="Target Override" 
                  type="number"
                  value={formData.promotionTargetOverride ?? ''} 
                  onChange={(e) => handleNumberChange('promotionTargetOverride', e.target.value)} 
                />
                <FormField 
                  label="Max Override" 
                  type="number"
                  value={formData.promotionMaximumOverride ?? ''} 
                  onChange={(e) => handleNumberChange('promotionMaximumOverride', e.target.value)} 
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-brand-400 border-b border-slate-800 pb-2">Behavior Overrides</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-300">Destination Override</label>
                  <select 
                    value={formData.destinationOverrideId || ''} 
                    onChange={(e) => handleChange('destinationOverrideId', e.target.value || null)}
                    className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
                  >
                    <option value="">None</option>
                    {destinations.filter(d => d.status === 'active').map(d => (
                      <option key={d.id} value={d.id}>{d.destinationName}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-300">Action Type Override</label>
                  <select 
                    value={formData.actionTypeOverrideId || ''} 
                    onChange={(e) => handleChange('actionTypeOverrideId', e.target.value || null)}
                    className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
                  >
                    <option value="">None</option>
                    {actionTypes.filter(a => a.status === 'active').map(a => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <FormField 
                label="Priority Weight Uplift (0-100)" 
                type="number"
                value={formData.priorityWeightUplift ?? 0} 
                onChange={(e) => handleNumberChange('priorityWeightUplift', e.target.value)} 
              />
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
              {submitting ? 'Saving...' : 'Save Impact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

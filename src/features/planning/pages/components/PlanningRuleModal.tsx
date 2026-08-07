import React, { useState, useEffect } from 'react';
import { X, CheckCircle } from 'lucide-react';
import { FormField } from '../../../../components/ui/FormField';
import { ProductPlanningRule, ControllingThresholdMode } from '../../../../types/planning';
import { Destination } from '../../../../types/configuration';
import { createPlanningRule, updatePlanningRule } from '../../services/planningRuleService';
import { generateRecommendationForProduct } from '../../services/recommendationService';
import { ProductLookup } from '../../../inventory/components/ProductLookup';
import { Timestamp } from 'firebase/firestore';
import { useSiteContext } from '../../../../contexts/SiteContext';

interface PlanningRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  item?: ProductPlanningRule;
  destinations: Destination[];
  onSaveSuccess?: (message: string) => void;
}

export const PlanningRuleModal: React.FC<PlanningRuleModalProps> = ({ 
  isOpen, onClose, item, destinations, onSaveSuccess
}) => {
  const { tenantId, siteId } = useSiteContext();
  const [formData, setFormData] = useState<Partial<ProductPlanningRule>>({});
  const [submitting, setSubmitting] = useState(false);
  const [effectiveFromInput, setEffectiveFromInput] = useState('');
  const [effectiveToInput, setEffectiveToInput] = useState('');
  const [untilSwitchedOff, setUntilSwitchedOff] = useState(true);

  useEffect(() => {
    if (isOpen) {
      if (item) {
        setFormData({ ...item });
        const fromDate = item.effectiveFrom ? (item.effectiveFrom as any).toDate ? (item.effectiveFrom as any).toDate() : new Date(item.effectiveFrom as any) : new Date();
        setEffectiveFromInput(fromDate.toISOString().slice(0, 16));
        
        if (item.effectiveTo && !item.untilSwitchedOff) {
          const toDate = (item.effectiveTo as any).toDate ? (item.effectiveTo as any).toDate() : new Date(item.effectiveTo as any);
          setEffectiveToInput(toDate.toISOString().slice(0, 16));
          setUntilSwitchedOff(false);
        } else {
          setEffectiveToInput('');
          setUntilSwitchedOff(true);
        }
      } else {
        const activeDest = destinations.filter(d => d.status === 'active');
        setFormData({
          productId: '',
          productCodeSnapshot: '',
          descriptionSnapshot: '',
          minimumQuantity: 0,
          targetQuantity: 0,
          maximumQuantity: 0,
          ddxmRetentionQuantity: 0,
          controllingThresholdMode: 'HIGHEST_MANDATORY',
          customControllingRetentionQuantity: null,
          preferredDestinationId: activeDest.length > 0 ? activeDest[0].id : '',
          secondaryDestinationId: null,
          defaultActionTypeId: '',
          defaultPriorityLevelId: '',
          allowQuantityOverride: true,
          allowDestinationOverride: true,
          overrideRequiresReason: true,
          notes: ''
        });
        
        // Default to today
        const now = new Date();
        setEffectiveFromInput(now.toISOString().slice(0, 16));
        setEffectiveToInput('');
        setUntilSwitchedOff(true);
      }
    }
  }, [isOpen, item]);

  useEffect(() => {
    if (isOpen && !item && !formData.preferredDestinationId && destinations.length > 0) {
      const activeDest = destinations.filter(d => d.status === 'active');
      if (activeDest.length > 0) {
        setFormData(prev => ({ ...prev, preferredDestinationId: activeDest[0].id }));
      }
    }
  }, [isOpen, item, destinations, formData.preferredDestinationId]);

  if (!isOpen) return null;

  const selectedPrefDest = destinations.find(d => d.id === formData.preferredDestinationId || d.destinationCode === formData.preferredDestinationId);
  const currentPrefVal = selectedPrefDest ? selectedPrefDest.id : (formData.preferredDestinationId || '');

  const selectedSecDest = destinations.find(d => d.id === formData.secondaryDestinationId || d.destinationCode === formData.secondaryDestinationId);
  const currentSecVal = selectedSecDest ? selectedSecDest.id : (formData.secondaryDestinationId || '');

  const handleChange = (field: keyof ProductPlanningRule, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    // Parse dates
    const fromDate = new Date(effectiveFromInput);
    const toDate = (!untilSwitchedOff && effectiveToInput) ? new Date(effectiveToInput) : null;
    
    const payload = {
      ...formData,
      effectiveFrom: Timestamp.fromDate(fromDate),
      effectiveTo: toDate ? Timestamp.fromDate(toDate) : null,
      untilSwitchedOff: untilSwitchedOff,
    };

    // Data casting for numbers
    payload.minimumQuantity = Number(payload.minimumQuantity) || 0;
    payload.targetQuantity = Number(payload.targetQuantity) || 0;
    payload.maximumQuantity = Number(payload.maximumQuantity) || 0;
    payload.ddxmRetentionQuantity = Number(payload.ddxmRetentionQuantity) || 0;
    if (payload.customControllingRetentionQuantity !== null && payload.customControllingRetentionQuantity !== undefined) {
      payload.customControllingRetentionQuantity = Number(payload.customControllingRetentionQuantity);
    }
    
    let result;
    if (item?.id) {
      result = await updatePlanningRule(item.id, payload, tenantId, siteId);
    } else {
      result = await createPlanningRule({
        ...payload,
        tenantId,
        siteId,
      } as Omit<ProductPlanningRule, 'id' | 'status' | 'createdDate' | 'modifiedDate'>);
    }
    
    if (result.success && payload.productId) {
      // Re-evaluate recommendation for this single product with forceReevaluate=true
      try {
        await generateRecommendationForProduct(tenantId, siteId, payload.productId, true);
      } catch (err) {
        console.error('Failed to auto-generate recommendation on rule save:', err);
      }
    }

    setSubmitting(false);
    if (result.success) {
      const msg = `Planning rule saved for ${formData.productCode || 'product'}. Recommendation was automatically re-evaluated and updated across Recommendation Workspace and TV Dashboard.`;
      if (onSaveSuccess) {
        onSaveSuccess(msg);
      }
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
            {item ? 'Edit Planning Rule' : 'Create Planning Rule'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="p-5 space-y-6 overflow-y-auto">
            
            {/* Product Selection */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-brand-400 border-b border-slate-800 pb-2">Product</h3>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-300">Product *</label>
                <ProductLookup 
                  value={formData.productId}
                  onChange={(product) => {
                    handleChange('productId', product.id);
                    handleChange('productCodeSnapshot', product.productCode);
                    handleChange('descriptionSnapshot', product.description);
                  }}
                  disabled={!!item}
                />
              </div>
            </div>

            {/* Thresholds */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-brand-400 border-b border-slate-800 pb-2">Thresholds</h3>
              <div className="grid grid-cols-3 gap-4">
                <FormField 
                  label="Minimum Quantity" 
                  type="number"
                  value={formData.minimumQuantity ?? 0} 
                  onChange={(e) => handleChange('minimumQuantity', e.target.value)} 
                  required 
                />
                <FormField 
                  label="Target Quantity" 
                  type="number"
                  value={formData.targetQuantity ?? 0} 
                  onChange={(e) => handleChange('targetQuantity', e.target.value)} 
                  required 
                />
                <FormField 
                  label="Maximum Quantity" 
                  type="number"
                  value={formData.maximumQuantity ?? 0} 
                  onChange={(e) => handleChange('maximumQuantity', e.target.value)} 
                  required 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField 
                  label="DDXM Retention Quantity" 
                  type="number"
                  value={formData.ddxmRetentionQuantity ?? 0} 
                  onChange={(e) => handleChange('ddxmRetentionQuantity', e.target.value)} 
                  required 
                />
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-300">Controlling Mode *</label>
                  <select 
                    value={formData.controllingThresholdMode || 'HIGHEST_MANDATORY'} 
                    onChange={(e) => handleChange('controllingThresholdMode', e.target.value as ControllingThresholdMode)}
                    className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
                    required
                  >
                    <option value="HIGHEST_MANDATORY">Highest Mandatory (Min or DDXM)</option>
                    <option value="MINIMUM_ONLY">Minimum Only</option>
                    <option value="DDXM_ONLY">DDXM Only</option>
                    <option value="CUSTOM">Custom</option>
                  </select>
                </div>
              </div>
              
              {formData.controllingThresholdMode === 'CUSTOM' && (
                <FormField 
                  label="Custom Controlling Retention" 
                  type="number"
                  value={formData.customControllingRetentionQuantity ?? ''} 
                  onChange={(e) => handleChange('customControllingRetentionQuantity', e.target.value)} 
                  required 
                />
              )}
            </div>

            {/* Destinations & Overrides */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-brand-400 border-b border-slate-800 pb-2">Actions & Defaults</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-300">Preferred Destination *</label>
                  <select 
                    value={currentPrefVal} 
                    onChange={(e) => handleChange('preferredDestinationId', e.target.value)}
                    className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
                    required
                  >
                    <option value="" disabled>Select a destination</option>
                    {destinations
                      .filter(d => d.status === 'active' || d.id === currentPrefVal || d.destinationCode === currentPrefVal)
                      .map(d => (
                      <option key={d.id} value={d.id}>
                        {d.destinationName}{d.destinationCode ? ` (${d.destinationCode})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-300">Secondary Destination</label>
                  <select 
                    value={currentSecVal} 
                    onChange={(e) => handleChange('secondaryDestinationId', e.target.value || null)}
                    className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
                  >
                    <option value="">None</option>
                    {destinations
                      .filter(d => d.status === 'active' || d.id === currentSecVal || d.destinationCode === currentSecVal)
                      .map(d => (
                      <option key={d.id} value={d.id}>
                        {d.destinationName}{d.destinationCode ? ` (${d.destinationCode})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-6 mt-4">
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input 
                    type="checkbox" 
                    checked={formData.allowQuantityOverride ?? true}
                    onChange={(e) => handleChange('allowQuantityOverride', e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-brand-500 focus:ring-brand-500"
                  />
                  Allow Qty Override
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input 
                    type="checkbox" 
                    checked={formData.allowDestinationOverride ?? true}
                    onChange={(e) => handleChange('allowDestinationOverride', e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-brand-500 focus:ring-brand-500"
                  />
                  Allow Dest Override
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input 
                    type="checkbox" 
                    checked={formData.overrideRequiresReason ?? true}
                    onChange={(e) => handleChange('overrideRequiresReason', e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-brand-500 focus:ring-brand-500"
                  />
                  Override Requires Reason
                </label>
              </div>
            </div>

            {/* Effective Dates */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-brand-400 border-b border-slate-800 pb-2">Effective Duration</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-300">Effective From *</label>
                  <input 
                    type="datetime-local" 
                    value={effectiveFromInput}
                    onChange={(e) => setEffectiveFromInput(e.target.value)}
                    className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-300">Duration Option *</label>
                  <div className="flex items-center gap-4 py-2">
                    <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                      <input 
                        type="radio" 
                        name="effectiveToMode"
                        checked={untilSwitchedOff}
                        onChange={() => {
                          setUntilSwitchedOff(true);
                          setEffectiveToInput('');
                        }}
                        className="text-brand-500 focus:ring-brand-500 accent-brand-500"
                      />
                      <span className="font-medium">Until Switched Off</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                      <input 
                        type="radio" 
                        name="effectiveToMode"
                        checked={!untilSwitchedOff}
                        onChange={() => setUntilSwitchedOff(false)}
                        className="text-brand-500 focus:ring-brand-500 accent-brand-500"
                      />
                      <span>Specific End Date</span>
                    </label>
                  </div>
                </div>
              </div>

              {!untilSwitchedOff ? (
                <div className="flex flex-col gap-1.5 max-w-sm">
                  <label className="text-sm font-medium text-slate-300">Effective To *</label>
                  <input 
                    type="datetime-local" 
                    value={effectiveToInput}
                    onChange={(e) => setEffectiveToInput(e.target.value)}
                    className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
                    required={!untilSwitchedOff}
                  />
                </div>
              ) : (
                <div className="p-3 bg-slate-800/40 border border-slate-700/60 rounded-md text-xs text-slate-300 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <span>Rule will remain active continuously from the Effective From date until it is manually deactivated or switched off.</span>
                </div>
              )}
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
              {submitting ? 'Saving...' : 'Save Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

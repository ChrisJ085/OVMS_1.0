import React, { useState, useEffect } from 'react';
import { X, Trash2, Tag, Percent, ArrowUpRight, ShieldAlert, Check } from 'lucide-react';
import { FormField } from '../../../components/ui/FormField';
import { PromotionProductRule, PromotionWithPhase } from '../../../types/promotion';
import { Destination, ActionType } from '../../../types/configuration';
import { createPromotionRule, updatePromotionRule, subscribeToPromotions } from '../services/promotionService';
import { collections } from '../../configuration/services/configurationService';
import { useSiteContext } from '../../../contexts/SiteContext';
import { subscribeToCollection, deactivateDocument, where } from '../../../services/dbService';
import { generateRecommendationForProduct } from '../services/recommendationService';

interface ProductPromotionModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productCode?: string;
  productDescription?: string;
  item?: PromotionProductRule | null;
  selectedPromotionId?: string;
}

export const ProductPromotionModal: React.FC<ProductPromotionModalProps> = ({
  isOpen,
  onClose,
  productId,
  productCode,
  productDescription,
  item,
  selectedPromotionId
}) => {
  const { tenantId, siteId } = useSiteContext();
  const [promotions, setPromotions] = useState<PromotionWithPhase[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [actionTypes, setActionTypes] = useState<ActionType[]>([]);
  const [formData, setFormData] = useState<Partial<PromotionProductRule>>({});
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const unsubPromos = subscribeToPromotions(
      tenantId,
      (items) => {
        // Only active/upcoming promotions
        const active = items.filter(
          p => p.promotionStatus !== 'CANCELLED' && p.promotionStatus !== 'COMPLETED'
        );
        setPromotions(active);
      },
      console.error
    );

    const unsubDests = subscribeToCollection<Destination>(
      collections.DESTINATIONS,
      [where('tenantId', '==', tenantId), where('siteId', '==', siteId)],
      setDestinations,
      console.error
    );

    const unsubActions = subscribeToCollection<ActionType>(
      collections.ACTION_TYPES,
      [where('tenantId', '==', tenantId), where('siteId', '==', siteId)],
      setActionTypes,
      console.error
    );

    return () => {
      unsubPromos();
      unsubDests();
      unsubActions();
    };
  }, [isOpen, tenantId, siteId]);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      if (item) {
        setFormData({ ...item });
      } else {
        setFormData({
          promotionId: selectedPromotionId || '',
          productId,
          productCodeSnapshot: productCode || '',
          descriptionSnapshot: productDescription || '',
          expectedVolumeUpliftQuantity: null,
          expectedVolumeUpliftPercent: null,
          retentionUpliftQuantity: null,
          retentionUpliftPercentage: null,
          promotionMinimumOverride: null,
          promotionTargetOverride: null,
          promotionMaximumOverride: null,
          destinationOverrideId: null,
          actionTypeOverrideId: null,
          priorityWeightUplift: 0,
          notes: ''
        });
      }
    }
  }, [isOpen, item, selectedPromotionId, productId, productCode, productDescription]);

  if (!isOpen) return null;

  const handleChange = (field: keyof PromotionProductRule, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNumberChange = (field: keyof PromotionProductRule, value: string) => {
    if (value === '' || isNaN(Number(value))) {
      handleChange(field, null);
    } else {
      handleChange(field, Number(value));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.promotionId) {
      setError('Please select a promotion.');
      return;
    }

    setSubmitting(true);
    try {
      let result;
      if (item?.id) {
        result = await updatePromotionRule(item.id, formData);
      } else {
        result = await createPromotionRule({
          ...formData,
          productId,
          productCodeSnapshot: productCode || formData.productCodeSnapshot || '',
          descriptionSnapshot: productDescription || formData.descriptionSnapshot || '',
          tenantId,
          siteId
        } as Omit<PromotionProductRule, 'id' | 'status' | 'createdDate' | 'modifiedDate'>);
      }

      if (result.success) {
        // Trigger recommendation update for this product
        generateRecommendationForProduct(tenantId, siteId, productId, true).catch(console.error);
        onClose();
      } else {
        setError(result.error || 'Failed to save promotion rule.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!item?.id) return;
    if (!confirm('Are you sure you want to remove this promotion impact from the product?')) return;

    setDeleting(true);
    try {
      await deactivateDocument('promotionProductRules', item.id);
      generateRecommendationForProduct(tenantId, siteId, productId, true).catch(console.error);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to remove promotion impact.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <Tag className="w-5 h-5 text-brand-400" />
            <h2 className="text-lg font-semibold text-slate-100">
              {item ? 'Edit Promotion Impact' : 'Add Product to Promotion'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors bg-slate-800 p-1.5 rounded-md hover:bg-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-400">
              {error}
            </div>
          )}

          {/* Promotion Selection */}
          <FormField label="Target Promotion" required>
            <select
              value={formData.promotionId || ''}
              onChange={(e) => handleChange('promotionId', e.target.value)}
              disabled={!!item}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-brand-500 disabled:opacity-60"
            >
              <option value="">-- Select Active Promotion --</option>
              {promotions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.promotionCode} - {p.promotionName} ({p.phase || 'SCHEDULED'})
                </option>
              ))}
            </select>
          </FormField>

          {/* Uplift Parameters */}
          <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700/60 space-y-4">
            <h4 className="text-xs font-semibold text-brand-400 uppercase tracking-wider flex items-center gap-1.5">
              <ArrowUpRight className="w-4 h-4" />
              Volume & Retention Uplifts
            </h4>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Expected Volume Uplift (Qty)">
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 500"
                  value={formData.expectedVolumeUpliftQuantity ?? ''}
                  onChange={(e) => handleNumberChange('expectedVolumeUpliftQuantity', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-brand-500"
                />
              </FormField>
              <FormField label="Expected Volume Uplift (%)">
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 25"
                  value={formData.expectedVolumeUpliftPercent ?? ''}
                  onChange={(e) => handleNumberChange('expectedVolumeUpliftPercent', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-brand-500"
                />
              </FormField>

              <FormField label="Storage Ramp-up Uplift (Qty)">
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 200"
                  value={formData.retentionUpliftQuantity ?? ''}
                  onChange={(e) => handleNumberChange('retentionUpliftQuantity', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-brand-500"
                />
              </FormField>
              <FormField label="Storage Ramp-up Uplift (%)">
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 15"
                  value={formData.retentionUpliftPercentage ?? ''}
                  onChange={(e) => handleNumberChange('retentionUpliftPercentage', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-brand-500"
                />
              </FormField>
            </div>
          </div>

          {/* Threshold Overrides */}
          <div className="bg-slate-800/40 p-4 rounded-lg border border-slate-700/60 space-y-4">
            <h4 className="text-xs font-semibold text-brand-400 uppercase tracking-wider">
              Promotional Threshold Overrides (Optional)
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Min (SS) Override">
                <input
                  type="number"
                  min="0"
                  placeholder="Default"
                  value={formData.promotionMinimumOverride ?? ''}
                  onChange={(e) => handleNumberChange('promotionMinimumOverride', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-brand-500"
                />
              </FormField>
              <FormField label="Target Override">
                <input
                  type="number"
                  min="0"
                  placeholder="Default"
                  value={formData.promotionTargetOverride ?? ''}
                  onChange={(e) => handleNumberChange('promotionTargetOverride', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-brand-500"
                />
              </FormField>
              <FormField label="Max Override">
                <input
                  type="number"
                  min="0"
                  placeholder="Default"
                  value={formData.promotionMaximumOverride ?? ''}
                  onChange={(e) => handleNumberChange('promotionMaximumOverride', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-brand-500"
                />
              </FormField>
            </div>
          </div>

          {/* Policy Overrides & Uplifts */}
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Priority Uplift">
              <input
                type="number"
                min="0"
                placeholder="e.g. 10"
                value={formData.priorityWeightUplift ?? 0}
                onChange={(e) => handleNumberChange('priorityWeightUplift', e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-brand-500"
              />
            </FormField>

            <FormField label="Destination Override">
              <select
                value={formData.destinationOverrideId || ''}
                onChange={(e) => handleChange('destinationOverrideId', e.target.value || null)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-brand-500"
              >
                <option value="">-- No Override --</option>
                {destinations.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Action Type Override">
              <select
                value={formData.actionTypeOverrideId || ''}
                onChange={(e) => handleChange('actionTypeOverrideId', e.target.value || null)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-brand-500"
              >
                <option value="">-- No Override --</option>
                {actionTypes.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="Notes">
            <textarea
              rows={2}
              value={formData.notes || ''}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Campaign instructions or special handling notes..."
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-brand-500"
            />
          </FormField>

          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            {item ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || submitting}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {deleting ? 'Removing...' : 'Remove from Promotion'}
              </button>
            ) : <div />}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting || deleting}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || deleting}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-md text-sm font-medium shadow-sm transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                {submitting ? 'Saving...' : 'Save Promotion Impact'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { subscribeToProductPromotions, detectOverlappingPromotions } from '../services/promotionService';
import { PromotionProductRule, PromotionWithPhase } from '../../../types/promotion';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { Tag, AlertTriangle, ChevronRight, Plus, Edit2, Trash2 } from 'lucide-react';
import { LoadingState } from '../../../components/ui/States';
import { useNavigate } from 'react-router-dom';
import { useSiteContext } from '../../../contexts/SiteContext';
import { ProductPromotionModal } from './ProductPromotionModal';

interface ProductPromotionsPanelProps {
  productId: string;
  productCode?: string;
  productDescription?: string;
}

export const ProductPromotionsPanel: React.FC<ProductPromotionsPanelProps> = ({
  productId,
  productCode,
  productDescription
}) => {
  const { tenantId, siteId } = useSiteContext();
  const navigate = useNavigate();
  const [rules, setRules] = useState<PromotionProductRule[]>([]);
  const [promotions, setPromotions] = useState<Record<string, PromotionWithPhase>>({});
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PromotionProductRule | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToProductPromotions(
      tenantId,
      siteId,
      productId,
      (newRules, newPromos) => {
        setRules(newRules);
        setPromotions(newPromos);
        setLoading(false);
      },
      (err) => {
        console.error('Failed to load product promotions:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [tenantId, siteId, productId]);

  if (loading) {
    return (
      <div className="bg-slate-800/30 rounded-lg p-5 border border-slate-800 h-48 flex items-center justify-center">
        <LoadingState message="Checking promotions..." />
      </div>
    );
  }

  // Filter rules to only those tied to active/upcoming promotions
  const activeRules = rules.filter(r => {
    const promo = promotions[r.promotionId];
    if (!promo) return false;
    return promo.promotionStatus !== 'CANCELLED' && promo.promotionStatus !== 'COMPLETED' && promo.phase !== 'INACTIVE';
  });

  const hasOverlap = detectOverlappingPromotions(activeRules, promotions);

  const getPhaseBadge = (phase: string) => {
    switch(phase) {
      case 'PRE_BUILD': return <StatusBadge variant="warning" label="Pre-Build" />;
      case 'ACTIVE': return <StatusBadge variant="completed" label="Active" />;
      case 'RUN_DOWN': return <StatusBadge variant="warning" label="Run Down" />;
      default: return null;
    }
  };

  const handleOpenAdd = () => {
    setEditingRule(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (rule: PromotionProductRule, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRule(rule);
    setIsModalOpen(true);
  };

  return (
    <>
      <div className="bg-slate-800/30 rounded-lg p-5 border border-slate-800 flex flex-col justify-between relative overflow-hidden">
        <div>
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
            <h3 className="text-sm font-medium text-brand-400 flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Promotions
            </h3>
            <div className="flex items-center gap-2">
              {hasOverlap && (
                <div className="flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-900/30 px-1.5 py-0.5 rounded border border-amber-800/50">
                  <AlertTriangle className="w-3 h-3" />
                  Overlap
                </div>
              )}
              <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                {activeRules.length} Active
              </span>
              <button
                type="button"
                onClick={handleOpenAdd}
                className="text-[11px] font-medium px-2 py-0.5 rounded bg-brand-600/20 text-brand-400 hover:bg-brand-600/30 border border-brand-500/30 flex items-center gap-1 transition-colors"
                title="Add product to a promotion"
              >
                <Plus className="w-3 h-3" />
                Add
              </button>
            </div>
          </div>

          {activeRules.length === 0 ? (
            <div className="p-4 rounded-lg bg-slate-900/40 border border-dashed border-slate-700/60 text-center flex flex-col items-center">
              <Tag className="w-7 h-7 text-slate-600 mb-2" />
              <p className="text-xs font-medium text-slate-300 mb-1">No Active Promotions</p>
              <p className="text-[11px] text-slate-500 mb-3">
                This product is not currently included in any active or upcoming promotional campaigns.
              </p>
              <button
                type="button"
                onClick={handleOpenAdd}
                className="text-xs text-brand-400 hover:text-brand-300 font-medium inline-flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Promotional Impact
              </button>
            </div>
          ) : (
            <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
              {activeRules.map(rule => {
                const promo = promotions[rule.promotionId];
                if (!promo) return null;

                return (
                  <div
                    key={rule.id}
                    className="bg-slate-900/60 rounded-lg p-3 border border-slate-700/60 hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-slate-200 text-xs flex items-center gap-2">
                        <span>{promo.promotionCode}</span>
                        {getPhaseBadge(promo.phase)}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => handleOpenEdit(rule, e)}
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                          title="Edit promotional impact"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/planning/promotions/${promo.id}`)}
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                          title="View promotion details"
                        >
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                      {rule.expectedVolumeUpliftQuantity !== null && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">Vol Uplift (Qty):</span>
                          <span className="text-brand-400 font-medium">+{rule.expectedVolumeUpliftQuantity}</span>
                        </div>
                      )}
                      {rule.expectedVolumeUpliftPercent !== null && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">Vol Uplift (%):</span>
                          <span className="text-indigo-400 font-medium">+{rule.expectedVolumeUpliftPercent}%</span>
                        </div>
                      )}
                      {rule.retentionUpliftPercentage !== null && rule.retentionUpliftPercentage !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">Ramp-up (%):</span>
                          <span className="text-brand-400 font-medium">+{rule.retentionUpliftPercentage}%</span>
                        </div>
                      )}
                      {rule.retentionUpliftQuantity !== null && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">Ret. Qty:</span>
                          <span className="text-brand-400 font-medium">+{rule.retentionUpliftQuantity}</span>
                        </div>
                      )}
                      {(rule.promotionMinimumOverride !== null || rule.promotionTargetOverride !== null || rule.promotionMaximumOverride !== null) && (
                        <div className="col-span-2 flex justify-between pt-1 border-t border-slate-800/80">
                          <span className="text-slate-400">Min/Tgt/Max Overrides:</span>
                          <span className="text-slate-200 font-medium">
                            {rule.promotionMinimumOverride ?? '-'}/{rule.promotionTargetOverride ?? '-'}/{rule.promotionMaximumOverride ?? '-'}
                          </span>
                        </div>
                      )}
                      {rule.priorityWeightUplift > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">Prio Uplift:</span>
                          <span className="text-amber-400 font-medium">+{rule.priorityWeightUplift}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="pt-2 mt-2 border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={() => navigate('/planning/promotions')}
            className="text-[11px] text-brand-400 hover:text-brand-300 inline-flex items-center gap-1 font-medium transition-colors"
          >
            Manage All Promotions
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      <ProductPromotionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        productId={productId}
        productCode={productCode}
        productDescription={productDescription}
        item={editingRule}
      />
    </>
  );
};

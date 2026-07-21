import React, { useEffect, useState } from 'react';
import { useDevelopmentContext } from '../../../contexts/DevelopmentContext';
import { subscribeToProductPromotions, detectOverlappingPromotions } from '../services/promotionService';
import { PromotionProductRule, PromotionWithPhase } from '../../../types/promotion';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { Tag, AlertTriangle, ChevronRight } from 'lucide-react';
import { LoadingState } from '../../../components/ui/States';
import { useNavigate } from 'react-router-dom';

interface ProductPromotionsPanelProps {
  productId: string;
}

export const ProductPromotionsPanel: React.FC<ProductPromotionsPanelProps> = ({ productId }) => {
  const { tenantId, siteId } = useDevelopmentContext();
  const navigate = useNavigate();
  const [rules, setRules] = useState<PromotionProductRule[]>([]);
  const [promotions, setPromotions] = useState<Record<string, PromotionWithPhase>>({});
  const [loading, setLoading] = useState(true);

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
    return <div className="h-24"><LoadingState message="Checking promotions..." /></div>;
  }

  // Filter rules to only those tied to active/upcoming promotions
  const activeRules = rules.filter(r => {
    const promo = promotions[r.promotionId];
    if (!promo) return false;
    return promo.promotionStatus !== 'CANCELLED' && promo.promotionStatus !== 'COMPLETED' && promo.phase !== 'INACTIVE';
  });

  if (activeRules.length === 0) {
    return null;
  }

  const hasOverlap = detectOverlappingPromotions(activeRules, promotions);

  const getPhaseBadge = (phase: string) => {
    switch(phase) {
      case 'PRE_BUILD': return <StatusBadge variant="warning" label="Pre-Build" />;
      case 'ACTIVE': return <StatusBadge variant="completed" label="Active" />;
      case 'RUN_DOWN': return <StatusBadge variant="warning" label="Run Down" />;
      default: return null;
    }
  };

  return (
    <div className="bg-slate-800/30 rounded-lg p-5 border border-brand-500/30 shadow-sm shadow-brand-500/5 relative overflow-hidden">
      {/* Decorative gradient */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/10 blur-2xl rounded-full -mr-16 -mt-16 pointer-events-none"></div>

      <div className="flex items-center justify-between mb-4 border-b border-slate-700/50 pb-2">
        <h3 className="text-sm font-medium text-brand-400 flex items-center gap-2">
          <Tag className="w-4 h-4" />
          Active Promotions Context
        </h3>
        {hasOverlap && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-900/20 px-2 py-1 rounded">
            <AlertTriangle className="w-3.5 h-3.5" />
            Overlapping Impacts
          </div>
        )}
      </div>
      
      <div className="space-y-4">
        {activeRules.map(rule => {
          const promo = promotions[rule.promotionId];
          if (!promo) return null;

          return (
            <div key={rule.id} className="bg-slate-900/50 rounded p-3 border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer group" onClick={() => navigate(`/planning/promotions/${promo.id}`)}>
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium text-slate-200 text-sm flex items-center gap-2">
                  {promo.promotionCode}
                  {getPhaseBadge(promo.phase)}
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-brand-400 transition-colors" />
              </div>
              
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
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
                {rule.retentionUpliftQuantity !== null && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Ret. Uplift (Qty):</span>
                    <span className="text-brand-400 font-medium">+{rule.retentionUpliftQuantity}</span>
                  </div>
                )}
                {(rule.promotionMinimumOverride !== null || rule.promotionTargetOverride !== null || rule.promotionMaximumOverride !== null) && (
                  <div className="col-span-2 flex justify-between pt-1 mt-1 border-t border-slate-800">
                    <span className="text-slate-400">Threshold Overrides (Min/Tgt/Max):</span>
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
    </div>
  );
};

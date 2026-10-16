import React, { useEffect, useState } from 'react';
import { Ruler, ArrowRight, Settings2, Edit2, Plus } from 'lucide-react';
import { ProductPlanningRule } from '../../../types/planning';
import { Destination, ActionType, PriorityLevel } from '../../../types/configuration';
import { subscribeToPlanningRules } from '../services/planningRuleService';
import { collections } from '../../configuration/services/configurationService';
import { useSiteContext } from '../../../contexts/SiteContext';
import { subscribeToCollection, where } from '../../../services/dbService';
import { LoadingState } from '../../../components/ui/States';
import { useNavigate } from 'react-router-dom';
import { PlanningRuleModal } from '../pages/components/PlanningRuleModal';

interface ProductPlanningRulesPanelProps {
  productId: string;
  productCode?: string;
  productDescription?: string;
}

export const ProductPlanningRulesPanel: React.FC<ProductPlanningRulesPanelProps> = ({
  productId,
  productCode,
  productDescription
}) => {
  const { tenantId, siteId } = useSiteContext();
  const navigate = useNavigate();
  const [rule, setRule] = useState<ProductPlanningRule | null>(null);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [actionTypes, setActionTypes] = useState<ActionType[]>([]);
  const [priorityLevels, setPriorityLevels] = useState<PriorityLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (!productId) return;
    setLoading(true);

    const unsubRules = subscribeToPlanningRules(
      tenantId,
      siteId,
      (allRules) => {
        const matching = allRules.filter(
          r => r.productId === productId && r.status === 'active'
        );
        // Prioritize rule currently valid or newest
        if (matching.length > 0) {
          setRule(matching[0]);
        } else {
          setRule(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Failed to subscribe to planning rules:', err);
        setLoading(false);
      }
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

    const unsubPrios = subscribeToCollection<PriorityLevel>(
      collections.PRIORITY_LEVELS,
      [where('tenantId', '==', tenantId)],
      setPriorityLevels,
      console.error
    );

    return () => {
      unsubRules();
      unsubDests();
      unsubActions();
      unsubPrios();
    };
  }, [tenantId, siteId, productId]);

  if (loading) {
    return (
      <div className="bg-slate-800/30 rounded-lg p-5 border border-slate-800 h-48 flex items-center justify-center">
        <LoadingState message="Loading planning rules..." />
      </div>
    );
  }

  const handleOpenEdit = () => {
    setIsModalOpen(true);
  };

  const getDestName = (id: string | null) => {
    if (!id) return '-';
    return destinations.find(d => d.id === id || d.code === id)?.name || id;
  };

  const getActionName = (id: string | null) => {
    if (!id) return '-';
    return actionTypes.find(a => a.id === id || a.code === id)?.name || id;
  };

  const formatMode = (mode: string) => {
    switch (mode) {
      case 'HIGHEST_MANDATORY': return 'Highest Mandatory';
      case 'MINIMUM_ONLY': return 'Minimum Only';
      case 'DDXM_ONLY': return 'DDXM Only';
      case 'CUSTOM': return 'Custom Retention';
      default: return mode;
    }
  };

  const formatBehavior = (b?: string) => {
    switch (b) {
      case 'HOLD_UNTIL_TARGET': return 'Hold Until Target';
      case 'RELEASE_ABOVE_CONTROL': return 'Release Above Control';
      case 'AS_PER_SCHEDULE': return 'As Per Schedule';
      case 'PLANNER_REVIEW': return 'Planner Review';
      default: return b || 'Standard';
    }
  };

  return (
    <>
      <div className="bg-slate-800/30 rounded-lg p-5 border border-slate-800 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
            <h3 className="text-sm font-medium text-brand-400 flex items-center gap-2">
              <Ruler className="w-4 h-4" />
              Planning Rules
            </h3>
            <div className="flex items-center gap-2">
              {rule && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20">
                  {formatMode(rule.controllingThresholdMode)}
                </span>
              )}
              <button
                type="button"
                onClick={handleOpenEdit}
                className="text-[11px] font-medium px-2 py-0.5 rounded bg-brand-600/20 text-brand-400 hover:bg-brand-600/30 border border-brand-500/30 flex items-center gap-1 transition-colors"
                title={rule ? 'Edit planning rule' : 'Add planning rule'}
              >
                {rule ? <><Edit2 className="w-3 h-3" /> Edit</> : <><Plus className="w-3 h-3" /> Add Rule</>}
              </button>
            </div>
          </div>

          {!rule ? (
            <div className="p-4 rounded-lg bg-slate-900/40 border border-dashed border-slate-700/60 text-center flex flex-col items-center">
              <Settings2 className="w-7 h-7 text-slate-600 mb-2" />
              <p className="text-xs font-medium text-slate-300 mb-1">No Active Planning Rule</p>
              <p className="text-[11px] text-slate-500 mb-3">
                Stock thresholds and replenishment policies have not been configured for this product.
              </p>
              <button
                type="button"
                onClick={handleOpenEdit}
                className="text-xs text-brand-400 hover:text-brand-300 font-medium inline-flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Configure Planning Rule
              </button>
            </div>
          ) : (
            <>
              {/* Thresholds Grid */}
              <div className="grid grid-cols-4 gap-2 mb-3 text-center">
                <div className="p-2 rounded bg-slate-900/60 border border-slate-700/50">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">Min (SS)</div>
                  <div className="text-sm font-bold text-slate-100 mt-0.5">{rule.minimumQuantity ?? 0}</div>
                </div>
                <div className="p-2 rounded bg-slate-900/60 border border-slate-700/50">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">Target</div>
                  <div className="text-sm font-bold text-brand-400 mt-0.5">{rule.targetQuantity ?? 0}</div>
                </div>
                <div className="p-2 rounded bg-slate-900/60 border border-slate-700/50">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">Max</div>
                  <div className="text-sm font-bold text-slate-100 mt-0.5">{rule.maximumQuantity ?? 0}</div>
                </div>
                <div className="p-2 rounded bg-slate-900/60 border border-slate-700/50">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">DDXM</div>
                  <div className="text-sm font-bold text-amber-400 mt-0.5">{rule.ddxmRetentionQuantity ?? 0}</div>
                </div>
              </div>

              {/* Operational Policies */}
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between py-1 px-2 rounded bg-slate-800/40">
                  <span className="text-slate-400">Below-Target Policy:</span>
                  <span className="text-slate-200 font-medium">{formatBehavior(rule.belowTargetBehavior)}</span>
                </div>
                <div className="flex justify-between py-1 px-2 rounded bg-slate-800/40">
                  <span className="text-slate-400">Preferred Destination:</span>
                  <span className="text-slate-200 font-medium">{getDestName(rule.preferredDestinationId)}</span>
                </div>
                <div className="flex justify-between py-1 px-2 rounded bg-slate-800/40">
                  <span className="text-slate-400">Default Action:</span>
                  <span className="text-slate-200 font-medium">{getActionName(rule.defaultActionTypeId)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="pt-2 mt-2 border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={() => navigate('/planning/rules')}
            className="text-[11px] text-brand-400 hover:text-brand-300 inline-flex items-center gap-1 font-medium transition-colors"
          >
            Manage All Planning Rules
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      <PlanningRuleModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        item={rule || {
          productId,
          productCodeSnapshot: productCode,
          descriptionSnapshot: productDescription,
          minimumQuantity: 0,
          targetQuantity: 0,
          maximumQuantity: 0,
          ddxmRetentionQuantity: 0,
          controllingThresholdMode: 'HIGHEST_MANDATORY',
          preferredDestinationId: destinations.length > 0 ? destinations[0].id : '',
          allowQuantityOverride: true,
          allowDestinationOverride: true,
          overrideRequiresReason: true
        } as any}
        destinations={destinations}
      />
    </>
  );
};

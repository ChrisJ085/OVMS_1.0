import React, { useMemo } from 'react';
import { X, Target, Info } from 'lucide-react';
import { ProductPlanningRule, PlanningBandStatus } from '../../../../types/planning';
import { Destination } from '../../../../types/configuration';
import { calculatePlanningMetrics } from '../../services/planningRuleService';
import { StatusBadge } from '../../../../components/ui/StatusBadge';
import { ProductProductionContextPanel } from '../../components/ProductProductionContextPanel';
import { ProductPromotionsPanel } from '../../components/ProductPromotionsPanel';

interface PlanningRuleDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  rule: ProductPlanningRule;
  qoh: number;
  destinations: Destination[];
}

export const PlanningRuleDetailModal: React.FC<PlanningRuleDetailModalProps> = ({ 
  isOpen, onClose, rule, qoh, destinations 
}) => {
  if (!isOpen) return null;

  const metrics = useMemo(() => calculatePlanningMetrics(rule, qoh), [rule, qoh]);

  const getDestName = (id?: string | null) => {
    if (!id) return '-';
    const dest = destinations.find(d => d.id === id || d.destinationCode === id);
    if (!dest) return id;
    return dest.destinationName ? `${dest.destinationName}${dest.destinationCode ? ` (${dest.destinationCode})` : ''}` : dest.destinationCode;
  };

  const renderDate = (dateVal: any) => {
    if (!dateVal) return '-';
    if (dateVal.toDate) return dateVal.toDate().toLocaleString();
    return new Date(dateVal).toLocaleString();
  };

  const getBandBadge = (status: PlanningBandStatus) => {
    switch(status) {
      case 'BELOW_CONTROL': return <StatusBadge variant="blocked" label="Below Control" />;
      case 'AT_CONTROL': return <StatusBadge variant="warning" label="At Control" />;
      case 'BELOW_TARGET': return <StatusBadge variant="warning" label="Below Target" />;
      case 'AT_TARGET': return <StatusBadge variant="completed" label="At Target" />;
      case 'ABOVE_TARGET': return <StatusBadge variant="completed" label="Above Target" />;
      case 'ABOVE_MAXIMUM': return <StatusBadge variant="default" label="Above Max" />;
      default: return <span className="text-slate-400">{status}</span>;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-900/50">
          <div>
            <h2 className="text-xl font-semibold text-slate-100 flex items-center gap-3">
              <Target className="w-5 h-5 text-brand-400" />
              {rule.productCodeSnapshot} Planning Rule
            </h2>
            <p className="text-sm text-slate-400 mt-1">{rule.descriptionSnapshot}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors bg-slate-800 p-1.5 rounded-md hover:bg-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 bg-slate-900">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Left Column: Current State & Rule Config */}
            <div className="space-y-8">
              <div className="bg-slate-800/30 rounded-lg p-5 border border-slate-800">
                <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">Current Status</h3>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-slate-300">Total QOH</span>
                  <span className="text-2xl font-semibold text-slate-100">{qoh}</span>
                </div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-slate-300">Band Status</span>
                  {getBandBadge(metrics.status)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Available to Release</span>
                  <span className="text-xl font-semibold text-indigo-400">{metrics.availableToRelease}</span>
                </div>
                {metrics.shortfall > 0 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700/50">
                    <span className="text-red-400">Shortfall to Control</span>
                    <span className="text-lg font-semibold text-red-400">{metrics.shortfall}</span>
                  </div>
                )}
              </div>
              
              <ProductProductionContextPanel productId={rule.productId} />
              <ProductPromotionsPanel productId={rule.productId} />

              <div>
                <h3 className="text-sm font-medium text-brand-400 border-b border-slate-800 pb-2 mb-4">Thresholds</h3>
                <dl className="grid grid-cols-2 gap-y-4 text-sm">
                  <dt className="text-slate-400">Minimum Quantity</dt>
                  <dd className="text-slate-100 font-medium text-right">{rule.minimumQuantity}</dd>
                  
                  <dt className="text-slate-400">Target Quantity</dt>
                  <dd className="text-slate-100 font-medium text-right">{rule.targetQuantity}</dd>
                  
                  <dt className="text-slate-400">Maximum Quantity</dt>
                  <dd className="text-slate-100 font-medium text-right">{rule.maximumQuantity}</dd>
                  
                  <dt className="text-slate-400">DDXM Retention</dt>
                  <dd className="text-slate-100 font-medium text-right">{rule.ddxmRetentionQuantity}</dd>
                </dl>
              </div>
            </div>

            {/* Right Column: Calculations & Routing */}
            <div className="space-y-8">
              <div>
                <h3 className="text-sm font-medium text-brand-400 border-b border-slate-800 pb-2 mb-4 flex items-center justify-between">
                  Calculated Gaps
                  <Info className="w-4 h-4 text-slate-500" />
                </h3>
                <dl className="grid grid-cols-2 gap-y-4 text-sm">
                  <dt className="text-slate-400">Controlling Mode</dt>
                  <dd className="text-slate-200 text-right text-xs bg-slate-800 px-2 py-1 rounded inline-block justify-self-end">{rule.controllingThresholdMode}</dd>
                  
                  <dt className="text-slate-400 font-medium">Controlling Retention</dt>
                  <dd className="text-brand-400 font-semibold text-right">{metrics.controllingRetention}</dd>

                  <dt className="text-slate-400 pt-2 border-t border-slate-800">Gap to Target</dt>
                  <dd className="text-slate-100 text-right pt-2 border-t border-slate-800">{metrics.gapToTarget}</dd>

                  <dt className="text-slate-400">Headroom to Max</dt>
                  <dd className="text-slate-100 text-right">{metrics.headroomToMax}</dd>

                  <dt className="text-slate-400">Available above Min</dt>
                  <dd className="text-slate-100 text-right">{metrics.availableAboveMin}</dd>

                  <dt className="text-slate-400">Available above DDXM</dt>
                  <dd className="text-slate-100 text-right">{metrics.availableAboveDDXM}</dd>
                </dl>
              </div>

              <div>
                <h3 className="text-sm font-medium text-brand-400 border-b border-slate-800 pb-2 mb-4">Destinations & Policy</h3>
                <dl className="grid grid-cols-2 gap-y-3 text-sm">
                  <dt className="text-slate-400">Preferred Dest.</dt>
                  <dd className="text-slate-100 text-right truncate">{getDestName(rule.preferredDestinationId)}</dd>
                  
                  <dt className="text-slate-400">Secondary Dest.</dt>
                  <dd className="text-slate-100 text-right truncate">{getDestName(rule.secondaryDestinationId)}</dd>
                  
                  <dt className="text-slate-400 pt-2">Allow Qty Override</dt>
                  <dd className="text-slate-100 text-right pt-2">{rule.allowQuantityOverride ? 'Yes' : 'No'}</dd>
                  
                  <dt className="text-slate-400">Allow Dest Override</dt>
                  <dd className="text-slate-100 text-right">{rule.allowDestinationOverride ? 'Yes' : 'No'}</dd>
                  
                  <dt className="text-slate-400">Requires Reason</dt>
                  <dd className="text-slate-100 text-right">{rule.overrideRequiresReason ? 'Yes' : 'No'}</dd>
                </dl>
              </div>
            </div>

          </div>

          <div className="mt-8 pt-6 border-t border-slate-800 flex justify-between text-xs text-slate-500">
            <div>
              <p>
                Effective: {renderDate(rule.effectiveFrom)}{' '}
                {rule.untilSwitchedOff || !rule.effectiveTo ? (
                  <span className="text-emerald-400 font-medium ml-1">
                    - Until Switched Off
                  </span>
                ) : (
                  `- ${renderDate(rule.effectiveTo)}`
                )}
              </p>
              {rule.notes && <p className="mt-2 text-slate-400 italic">"{rule.notes}"</p>}
            </div>
            <div className="text-right">
              <p>Created: {renderDate(rule.createdDate)} by {rule.createdBy}</p>
              <p>Modified: {renderDate(rule.modifiedDate)} by {rule.modifiedBy}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

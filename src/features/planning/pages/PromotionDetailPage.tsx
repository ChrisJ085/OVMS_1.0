import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { DataTable } from '../../../components/ui/DataTable';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { LoadingState, ErrorState } from '../../../components/ui/States';
import { Plus, Search, CalendarDays, ArrowLeft, Trash2, Edit2, AlertTriangle } from 'lucide-react';
import { subscribeToPromotion, subscribeToPromotionRules, updatePromotion, updatePromotionRule } from '../services/promotionService';
import { PromotionWithPhase, PromotionProductRule } from '../../../types/promotion';
import { collections } from '../../configuration/services/configurationService';
import { Destination, ActionType } from '../../../types/configuration';
import { PromotionRuleModal } from './components/PromotionRuleModal';
import { PromotionModal } from './components/PromotionModal';
import { ConfirmationDialog } from '../../../components/ui/ConfirmationDialog';
import { useSiteContext } from '../../../contexts/SiteContext';
import { subscribeToCollection, where } from '../../../services/supabaseBase';

export const PromotionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenantId, siteId } = useSiteContext();
  
  const [promotion, setPromotion] = useState<PromotionWithPhase | null>(null);
  const [rules, setRules] = useState<PromotionProductRule[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [actionTypes, setActionTypes] = useState<ActionType[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [ruleModalState, setRuleModalState] = useState<{isOpen: boolean, item?: PromotionProductRule}>({ isOpen: false });
  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const [confirmDeleteRule, setConfirmDeleteRule] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    
    setLoading(true);
    
    const unsubPromo = subscribeToPromotion(id, (p) => {
      setPromotion(p);
      setLoading(false);
    }, setError);

    const unsubRules = subscribeToPromotionRules(tenantId, id, setRules, console.error);

    const unsubDest = subscribeToCollection<Destination>(
      collections.DESTINATIONS,
      [where('tenantId', '==', tenantId)],
      (items) => {
        const filtered = items
          .filter(d => !d.siteId || d.siteId === '' || d.siteId === siteId)
          .sort((a, b) => {
            if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
            if (a.sortOrder !== undefined && b.sortOrder !== undefined) return a.sortOrder - b.sortOrder;
            return (a.destinationName || '').localeCompare(b.destinationName || '');
          });
        setDestinations(filtered);
      },
      console.error
    );

    const unsubActions = subscribeToCollection<ActionType>(
      collections.ACTION_TYPES,
      [where('tenantId', '==', tenantId)],
      setActionTypes,
      console.error
    );

    return () => {
      unsubPromo();
      unsubRules();
      unsubDest();
      unsubActions();
    };
  }, [id, tenantId, siteId]);

  const handleDeleteRule = async () => {
    if (!confirmDeleteRule) return;
    try {
      await updatePromotionRule(confirmDeleteRule, { status: 'inactive' } as Partial<PromotionProductRule>);
    } catch (err: any) {
      alert(err.message || 'Failed to remove product');
    } finally {
      setConfirmDeleteRule(null);
    }
  };

  if (loading) return <div className="p-8"><LoadingState message="Loading promotion details..." /></div>;
  if (error) return <div className="p-8"><ErrorState message={error.message} /></div>;
  if (!promotion) return <div className="p-8"><ErrorState message="Promotion not found." /></div>;

  const renderDate = (dateVal: any) => {
    if (!dateVal) return '-';
    if (dateVal.toDate) return dateVal.toDate().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return new Date(dateVal).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getPhaseBadge = (phase: string) => {
    switch(phase) {
      case 'PRE_BUILD': return <StatusBadge variant="warning" label="Pre-Build" />;
      case 'ACTIVE': return <StatusBadge variant="completed" label="Active Phase" />;
      case 'RUN_DOWN': return <StatusBadge variant="warning" label="Run Down" />;
      case 'INACTIVE': return <StatusBadge variant="default" label="Inactive" />;
      default: return <span className="text-slate-400">{phase}</span>;
    }
  };

  const filteredRules = rules.filter(r => r.status === 'active' && (
    r.productCodeSnapshot.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.descriptionSnapshot.toLowerCase().includes(searchTerm.toLowerCase())
  ));

  const columns = [
    { header: 'Product', accessor: (row: any) => (
      <div>
        <div className="font-medium text-slate-200">{row.productCodeSnapshot}</div>
        <div className="text-xs text-slate-400 truncate max-w-[150px]">{row.descriptionSnapshot}</div>
      </div>
    )},
    { header: 'Uplift (Vol)', accessor: (row: any) => (
      <div className="text-sm">
        {row.expectedVolumeUpliftQuantity !== null ? <span className="text-brand-400">+{row.expectedVolumeUpliftQuantity}</span> : null}
        {row.expectedVolumeUpliftQuantity !== null && row.expectedVolumeUpliftPercent !== null ? ' / ' : ''}
        {row.expectedVolumeUpliftPercent !== null ? <span className="text-indigo-400">+{row.expectedVolumeUpliftPercent}%</span> : null}
        {row.expectedVolumeUpliftQuantity === null && row.expectedVolumeUpliftPercent === null ? '-' : ''}
      </div>
    )},
    { header: 'Uplift (Ret)', accessor: (row: any) => row.retentionUpliftQuantity !== null ? <span className="text-brand-400">+{row.retentionUpliftQuantity}</span> : '-' },
    { header: 'Overrides (Min/Tgt/Max)', accessor: (row: any) => (
      <div className="text-sm text-slate-300">
        {row.promotionMinimumOverride ?? '-'}/{row.promotionTargetOverride ?? '-'}/{row.promotionMaximumOverride ?? '-'}
      </div>
    )},
    { header: 'Prio Uplift', accessor: (row: any) => row.priorityWeightUplift > 0 ? <span className="text-amber-400">+{row.priorityWeightUplift}</span> : '-' },
    { header: 'Dest/Action', accessor: (row: any) => (
      <div className="text-xs text-slate-400">
        {row.destinationOverrideId ? <div>Dest: {destinations.find(d => d.id === row.destinationOverrideId)?.destinationName || 'Yes'}</div> : null}
        {row.actionTypeOverrideId ? <div>Action: {actionTypes.find(a => a.id === row.actionTypeOverrideId)?.label || 'Yes'}</div> : null}
        {!row.destinationOverrideId && !row.actionTypeOverrideId ? '-' : null}
      </div>
    )},
    {
      header: 'Actions',
      accessor: (row: any) => (
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setRuleModalState({ isOpen: true, item: row })}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Edit Impact"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setConfirmDeleteRule(row.id)}
            className="p-1.5 text-red-400 hover:text-red-300 hover:bg-slate-800 rounded transition-colors"
            title="Remove Product"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="pb-12">
      <div className="flex items-center gap-4 mb-6">
        <button 
          onClick={() => navigate('/planning/promotions')}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-slate-100 tracking-tight flex items-center gap-3">
            {promotion.promotionCode}
            <span className={`text-xs font-medium px-2 py-1 rounded ${
              promotion.importance === 'CRITICAL' ? 'bg-red-500/20 text-red-400' :
              promotion.importance === 'NATIONAL' ? 'bg-indigo-500/20 text-indigo-400' :
              promotion.importance === 'HIGH' ? 'bg-amber-500/20 text-amber-400' :
              'bg-slate-800 text-slate-300'
            }`}>
              {promotion.importance}
            </span>
            <StatusBadge variant={promotion.promotionStatus === 'ACTIVE' ? 'completed' : 'default'} label={promotion.promotionStatus} />
          </h1>
          <p className="text-slate-400 mt-1">{promotion.promotionName}</p>
        </div>
        <button 
          onClick={() => setPromoModalOpen(true)}
          className="flex items-center gap-2 text-sm font-medium text-slate-300 bg-slate-800 px-3 py-1.5 rounded-md hover:bg-slate-700 transition-colors border border-slate-700"
        >
          <Edit2 className="w-4 h-4" />
          Edit Promotion
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-5 col-span-2">
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">Timeline & Phase</h3>
          
          <div className="flex items-center justify-between mb-6">
            <div className="flex flex-col">
              <span className="text-slate-500 text-xs mb-1">Current Phase</span>
              {getPhaseBadge(promotion.phase)}
            </div>
            
            {['ACTIVE', 'PRE_BUILD', 'RUN_DOWN'].includes(promotion.phase) && (
              <div className="flex items-center gap-2 text-brand-400 text-sm font-medium bg-brand-900/20 px-3 py-1.5 rounded-full border border-brand-500/20">
                <CalendarDays className="w-4 h-4" />
                Promotion is live
              </div>
            )}
          </div>

          <div className="grid grid-cols-4 gap-4 text-sm relative">
            <div className="absolute top-1/2 left-0 right-0 h-px bg-slate-700 -z-10"></div>
            
            <div className="bg-slate-900 p-2 border border-slate-700 rounded shadow-sm text-center">
              <div className="text-slate-500 text-xs mb-1">Pre-Build</div>
              <div className="text-slate-200">{renderDate(promotion.preBuildStartDate)}</div>
            </div>
            <div className="bg-slate-900 p-2 border border-brand-500/50 rounded shadow-sm text-center relative shadow-brand-500/10">
              <div className="text-brand-400 text-xs mb-1 font-medium">Start Date</div>
              <div className="text-slate-200">{renderDate(promotion.startDate)}</div>
            </div>
            <div className="bg-slate-900 p-2 border border-brand-500/50 rounded shadow-sm text-center relative shadow-brand-500/10">
              <div className="text-brand-400 text-xs mb-1 font-medium">End Date</div>
              <div className="text-slate-200">{renderDate(promotion.endDate)}</div>
            </div>
            <div className="bg-slate-900 p-2 border border-slate-700 rounded shadow-sm text-center">
              <div className="text-slate-500 text-xs mb-1">Run Down</div>
              <div className="text-slate-200">{renderDate(promotion.runDownEndDate)}</div>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-5">
           <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">Details</h3>
           <p className="text-sm text-slate-300 mb-4">{promotion.description || 'No description provided.'}</p>
           {promotion.notes && (
             <div className="text-xs text-slate-400 bg-slate-900/50 p-3 rounded border border-slate-700/50 italic">
               {promotion.notes}
             </div>
           )}
           <div className="mt-4 text-xs text-slate-500 pt-4 border-t border-slate-700/50">
             <p>Created: {renderDate(promotion.createdDate)}</p>
             <p>Modified: {renderDate(promotion.modifiedDate)}</p>
           </div>
        </div>
      </div>

      <SectionCard 
        title="Product Impacts"
        actions={
          <button 
            onClick={() => setRuleModalState({ isOpen: true })}
            className="flex items-center gap-2 text-sm font-medium text-slate-900 bg-brand-500 px-3 py-1.5 rounded-md hover:bg-brand-400 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Product
          </button>
        }
      >
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-500" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-slate-700 rounded-md leading-5 bg-slate-900 text-slate-200 placeholder-slate-500 focus:outline-none focus:bg-slate-800 focus:border-brand-500 sm:text-sm transition-colors"
              placeholder="Search products in this promotion..."
            />
          </div>
        </div>

        {filteredRules.length > 0 ? (
          <DataTable
            columns={columns}
            data={filteredRules}
            keyExtractor={(row) => row.id as string}
          />
        ) : (
          <div className="text-center py-12 bg-slate-900/50 rounded-lg border border-slate-800 border-dashed">
             <AlertTriangle className="w-8 h-8 text-slate-600 mx-auto mb-3" />
             <h4 className="text-sm font-medium text-slate-300 mb-1">No Product Impacts</h4>
             <p className="text-xs text-slate-500 mb-4 max-w-md mx-auto">This promotion currently has no configured product impacts. Add products to define volume uplifts, threshold overrides, and priority changes during the promotional period.</p>
             <button 
                onClick={() => setRuleModalState({ isOpen: true })}
                className="text-sm font-medium text-brand-400 hover:text-brand-300 transition-colors"
              >
                + Add First Product
              </button>
          </div>
        )}
      </SectionCard>

      <PromotionModal
        isOpen={promoModalOpen}
        onClose={() => setPromoModalOpen(false)}
        item={promotion}
      />

      <PromotionRuleModal
        isOpen={ruleModalState.isOpen}
        onClose={() => setRuleModalState({ isOpen: false, item: undefined })}
        promotionId={promotion.id!}
        item={ruleModalState.item}
        destinations={destinations}
        actionTypes={actionTypes}
      />

      <ConfirmationDialog
        isOpen={!!confirmDeleteRule}
        title="Remove Product"
        message="Are you sure you want to remove this product from the promotion? This will disable its specific impacts."
        confirmLabel="Remove"
        isDestructive={true}
        onConfirm={handleDeleteRule}
        onCancel={() => setConfirmDeleteRule(null)}
      />
    </div>
  );
};

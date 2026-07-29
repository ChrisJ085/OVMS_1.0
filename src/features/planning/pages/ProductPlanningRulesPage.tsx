import React, { useState, useEffect } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { DataTable } from '../../../components/ui/DataTable';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { LoadingState, ErrorState } from '../../../components/ui/States';
import { ConfirmationDialog } from '../../../components/ui/ConfirmationDialog';
import { Plus, Search } from 'lucide-react';
import { subscribeToPlanningRules, setPlanningRuleStatus, calculatePlanningMetrics } from '../services/planningRuleService';
import { ProductPlanningRule } from '../../../types/planning';
import { subscribeToCollection } from '../../../services/firestoreBase';
import { collections } from '../../configuration/services/configurationService';
import { Destination } from '../../../types/configuration';
import { subscribeToBalances } from '../../inventory/services/inventoryService';
import { InventoryBalance } from '../../../types/inventory';
import { where } from 'firebase/firestore';
import { PlanningRuleModal } from './components/PlanningRuleModal';
import { PlanningRuleDetailModal } from './components/PlanningRuleDetailModal';
import { useSiteContext } from '../../../contexts/SiteContext';

export const ProductPlanningRulesPage: React.FC = () => {
  const { tenantId, siteId } = useSiteContext();
  const [rules, setRules] = useState<ProductPlanningRule[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [destFilter, setDestFilter] = useState<string>('all');
  const [bandFilter, setBandFilter] = useState<string>('all');

  const [modalState, setModalState] = useState<{isOpen: boolean, item?: ProductPlanningRule}>({ isOpen: false });
  const [detailModalState, setDetailModalState] = useState<{isOpen: boolean, rule?: ProductPlanningRule, qoh?: number}>({ isOpen: false });
  const [actionItem, setActionItem] = useState<{item: ProductPlanningRule, action: 'deactivate' | 'reactivate'} | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsubRules = subscribeToPlanningRules(
      tenantId,
      siteId,
      (items) => {
        setRules(items);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

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
    
    const unsubBal = subscribeToBalances(
      tenantId, 
      siteId, 
      setBalances, 
      console.error
    );

    return () => {
      unsubRules();
      unsubDest();
      unsubBal();
    };
  }, [tenantId, siteId]);

  const confirmAction = async () => {
    if (!actionItem || !actionItem.item.id) return;
    try {
      await setPlanningRuleStatus(actionItem.item.id, actionItem.action === 'reactivate');
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setActionItem(null);
    }
  };

  const enrichedRules = rules.map(rule => {
    const qoh = balances.filter(b => b.productId === rule.productId).reduce((sum, b) => sum + b.quantity, 0);
    const metrics = calculatePlanningMetrics(rule, qoh);
    return { ...rule, qoh, metrics };
  });

  const filteredRules = enrichedRules.filter(rule => {
    const matchesSearch = rule.productCodeSnapshot.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          rule.descriptionSnapshot.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? rule.status === 'active' : rule.status !== 'active');
    const matchesDest = destFilter === 'all' || rule.preferredDestinationId === destFilter || destinations.find(d => d.id === destFilter)?.destinationCode === rule.preferredDestinationId;
    const matchesBand = bandFilter === 'all' || rule.metrics.status === bandFilter;
    return matchesSearch && matchesStatus && matchesDest && matchesBand;
  });

  const getDestName = (id?: string | null) => {
    if (!id) return '-';
    const dest = destinations.find(d => d.id === id || d.destinationCode === id);
    if (!dest) return id;
    return dest.destinationName ? `${dest.destinationName}${dest.destinationCode ? ` (${dest.destinationCode})` : ''}` : dest.destinationCode;
  };

  const renderDate = (dateVal: any) => {
    if (!dateVal) return null;
    if (dateVal.toDate) return dateVal.toDate().toLocaleDateString();
    return new Date(dateVal).toLocaleDateString();
  };
  
  const getBandBadge = (status: string) => {
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

  const columns = [
    { header: 'Product', accessor: (row: any) => (
      <div>
        <div className="font-medium text-slate-200">{row.productCodeSnapshot}</div>
        <div className="text-xs text-slate-400 truncate max-w-[200px]">{row.descriptionSnapshot}</div>
      </div>
    )},
    { header: 'QOH', accessor: (row: any) => <span className="font-semibold text-slate-100">{row.qoh}</span> },
    { header: 'Min', accessor: 'minimumQuantity' as const },
    { header: 'Target', accessor: 'targetQuantity' as const },
    { header: 'Max', accessor: 'maximumQuantity' as const },
    { header: 'DDXM', accessor: 'ddxmRetentionQuantity' as const },
    { header: 'Controlling', accessor: (row: any) => <span className="font-medium text-brand-400">{row.metrics.controllingRetention}</span> },
    { header: 'Available', accessor: (row: any) => <span className="font-medium text-indigo-400">{row.metrics.availableToRelease}</span> },
    { header: 'Preferred Dest', accessor: (row: any) => getDestName(row.preferredDestinationId) },
    { header: 'Band Status', accessor: (row: any) => getBandBadge(row.metrics.status) },
    { header: 'Effective', accessor: (row: any) => (
      <div className="text-xs text-slate-400">
        <div>From {renderDate(row.effectiveFrom) || '-'}</div>
        <div>
          {row.untilSwitchedOff || !row.effectiveTo ? (
            <span className="inline-block mt-0.5 text-[10px] font-medium text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded">
              Until Switched Off
            </span>
          ) : (
            `to ${renderDate(row.effectiveTo)}`
          )}
        </div>
      </div>
    )},
    {
      header: 'Status',
      accessor: (row: any) => (
        row.status === 'active' 
          ? <StatusBadge variant="completed" label="Active" />
          : <StatusBadge variant="blocked" label="Inactive" />
      )
    },
    {
      header: 'Actions',
      accessor: (row: any) => (
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setDetailModalState({ isOpen: true, rule: row, qoh: row.qoh })}
            className="text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors"
          >
            Details
          </button>
          <button 
            onClick={() => setModalState({ isOpen: true, item: row })}
            className="text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            Edit
          </button>
          {row.status === 'active' ? (
            <button 
              onClick={() => setActionItem({ item: row, action: 'deactivate'})}
              className="text-xs font-medium text-red-400 hover:text-red-300 transition-colors"
            >
              Deactivate
            </button>
          ) : (
            <button 
              onClick={() => setActionItem({ item: row, action: 'reactivate'})}
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Reactivate
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div>
      <PageHeader 
        title="Product Planning Rules" 
        description="Define threshold policies, destinations and retention levels."
      />

      <SectionCard 
        title="Planning Rules"
        actions={
          <button 
            onClick={() => setModalState({ isOpen: true })}
            className="flex items-center gap-2 text-sm font-medium text-slate-900 bg-brand-500 px-3 py-1.5 rounded-md hover:bg-brand-400 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Rule
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
              placeholder="Search by product..."
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            value={destFilter}
            onChange={(e) => setDestFilter(e.target.value)}
            className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
          >
            <option value="all">All Destinations</option>
            {destinations.map(d => (
              <option key={d.id} value={d.id}>
                {d.destinationName}{d.destinationCode ? ` (${d.destinationCode})` : ''}
              </option>
            ))}
          </select>
          <select
            value={bandFilter}
            onChange={(e) => setBandFilter(e.target.value)}
            className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
          >
            <option value="all">All Bands</option>
            <option value="BELOW_CONTROL">Below Control</option>
            <option value="AT_CONTROL">At Control</option>
            <option value="BELOW_TARGET">Below Target</option>
            <option value="AT_TARGET">At Target</option>
            <option value="ABOVE_TARGET">Above Target</option>
            <option value="ABOVE_MAXIMUM">Above Max</option>
          </select>
        </div>

        {loading ? (
          <LoadingState message="Loading rules..." />
        ) : error ? (
          <ErrorState message={error.message} />
        ) : (
          <DataTable
            columns={columns}
            data={filteredRules}
            keyExtractor={(row) => row.id as string}
            emptyMessage="No rules match the selected filters."
          />
        )}
      </SectionCard>

      <ConfirmationDialog
        isOpen={!!actionItem}
        title={actionItem?.action === 'deactivate' ? 'Deactivate Rule' : 'Reactivate Rule'}
        message={`Are you sure you want to ${actionItem?.action} this rule?`}
        confirmLabel={actionItem?.action === 'deactivate' ? 'Deactivate' : 'Reactivate'}
        isDestructive={actionItem?.action === 'deactivate'}
        onConfirm={confirmAction}
        onCancel={() => setActionItem(null)}
      />

      <PlanningRuleModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false })}
        item={modalState.item}
        destinations={destinations}
      />
      
      {detailModalState.rule && (
        <PlanningRuleDetailModal
          isOpen={detailModalState.isOpen}
          onClose={() => setDetailModalState({ isOpen: false, rule: undefined })}
          rule={detailModalState.rule}
          qoh={detailModalState.qoh || 0}
          destinations={destinations}
        />
      )}
    </div>
  );
};

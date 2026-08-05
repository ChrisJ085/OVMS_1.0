import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { SectionCard } from '../components/ui/SectionCard';
import { DataTable } from '../components/ui/DataTable';
import { StatusBadge } from '../components/ui/StatusBadge';
import { LoadingState, ErrorState } from '../components/ui/States';
import { ConfirmationDialog } from '../components/ui/ConfirmationDialog';
import { Settings, Plus, RotateCcw, Building2, Filter, Sparkles } from 'lucide-react';
import { 
  collections, 
  seedDevelopmentConfiguration,
  deactivateConfigItem,
  reactivateConfigItem,
  createConfigItem,
  updateConfigItem
} from '../features/configuration/services/configurationService';
import { subscribeToCollection } from '../services/firestoreBase';
import { where, collection, getDocs, QueryConstraint } from 'firebase/firestore';
import { ConfigItemModal } from '../features/configuration/components/ConfigItemModal';
import { useSiteContext } from '../contexts/SiteContext';
import { useSiteOnboarding } from '../hooks/useSiteOnboarding';
import { reopenSiteOnboarding } from '../features/configuration/services/siteOnboardingService';
import { useAuth } from '../features/auth/context/AuthContext';
import { db } from '../config/firebase';

const TABS = [
  { id: 'sites', label: 'Sites', collection: collections.SITES, codeField: 'siteCode' },
  { id: 'destinations', label: 'Destinations', collection: collections.DESTINATIONS, codeField: 'destinationCode' },
  { id: 'units', label: 'Units', collection: collections.UNITS_OF_MEASURE, codeField: 'code' },
  { id: 'categories', label: 'Product Categories', collection: collections.PRODUCT_CATEGORIES, codeField: 'code' },
  { id: 'areas', label: 'Storage Areas', collection: collections.STORAGE_AREAS, siteScoped: true, codeField: 'areaCode' },
  { id: 'lines', label: 'Production Lines', collection: collections.PRODUCTION_LINES, siteScoped: true, codeField: 'lineCode' },
  { id: 'actions', label: 'Action Types', collection: collections.ACTION_TYPES, codeField: 'code' },
  { id: 'priorities', label: 'Priority Levels', collection: collections.PRIORITY_LEVELS, codeField: 'code' },
];

export const ConfigurationPage: React.FC = () => {
  const { tenantId, siteId, availableSites } = useSiteContext();
  const { userProfile } = useAuth();
  const isSuperUser = userProfile?.role === 'PLATFORM_SUPERUSER';
  const { onboarding, canComplete, isComplete, canModifyConfig } = useSiteOnboarding();
  const { handleOpenOnboardingWizard } = useOutletContext<{ handleOpenOnboardingWizard: () => void }>() || {};

  const developmentMode = import.meta.env.DEV || import.meta.env.VITE_DEV_MODE === 'true';
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [seeding, setSeeding] = useState(false);
  
  // Super User tenant selection state
  const [tenantsList, setTenantsList] = useState<{ id: string; name: string }[]>([]);
  const [selectedTenantFilter, setSelectedTenantFilter] = useState<string>('ALL');

  const [actionItem, setActionItem] = useState<{item: any, action: 'deactivate' | 'reactivate'} | null>(null);
  const [modalState, setModalState] = useState<{isOpen: boolean, item?: any}>({ isOpen: false });

  // Fetch tenant list for Super Users
  useEffect(() => {
    if (!isSuperUser || !db) return;

    async function loadTenants() {
      try {
        const snap = await getDocs(collection(db!, 'tenants'));
        const map = new Map<string, string>();

        snap.forEach((d) => {
          const data = d.data();
          map.set(d.id, data.tenantName || data.name || d.id);
        });

        // Add any tenants present in availableSites
        availableSites.forEach((s) => {
          if (s.tenantId && !map.has(s.tenantId)) {
            map.set(s.tenantId, s.tenantName || s.tenantId);
          }
        });

        if (tenantId && !map.has(tenantId)) {
          map.set(tenantId, tenantId);
        }

        const list = Array.from(map.entries()).map(([id, name]) => ({ id, name }));
        list.sort((a, b) => a.name.localeCompare(b.name));
        setTenantsList(list);
      } catch (e) {
        console.error('Failed to load tenants for configuration:', e);
      }
    }

    loadTenants();
  }, [isSuperUser, availableSites, tenantId]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setData([]);

    const constraints: QueryConstraint[] = [];

    // Filter by tenantId
    if (isSuperUser) {
      if (selectedTenantFilter !== 'ALL') {
        constraints.push(where('tenantId', '==', selectedTenantFilter));
      }
    } else {
      constraints.push(where('tenantId', '==', tenantId));
    }

    // Filter by siteId for site-scoped tabs
    if (activeTab.siteScoped) {
      if (siteId) {
        constraints.push(where('siteId', '==', siteId));
      }
    } else {
      constraints.push(where('siteId', '==', ''));
    }

    const unsubscribe = subscribeToCollection<any>(
      activeTab.collection,
      constraints,
      (items) => {
        const sorted = [...items].sort((a, b) => {
           if (a.status !== b.status) {
             return a.status === 'active' ? -1 : 1;
           }
           if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
             return a.sortOrder - b.sortOrder;
           }
           const aName = a.name || a.label || a.siteName || a.destinationName || a.areaName || a.lineName || a.code || '';
           const bName = b.name || b.label || b.siteName || b.destinationName || b.areaName || b.lineName || b.code || '';
           return aName.localeCompare(bName);
        });
        setData(sorted);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [tenantId, siteId, activeTab, isSuperUser, selectedTenantFilter]);

  const handleSeed = async () => {
    setSeeding(true);
    const targetTenant = (isSuperUser && selectedTenantFilter !== 'ALL') ? selectedTenantFilter : tenantId;
    const result = await seedDevelopmentConfiguration(targetTenant, siteId);
    setSeeding(false);
    if (!result.success) {
      alert(result.error);
    }
  };

  const confirmAction = async () => {
    if (!actionItem) return;
    try {
      if (actionItem.action === 'deactivate') {
        await deactivateConfigItem(activeTab.collection, actionItem.item.id);
      } else {
        await reactivateConfigItem(activeTab.collection, actionItem.item.id);
      }
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setActionItem(null);
    }
  };

  const handleSaveModal = async (formData: any) => {
    const effectiveTenantId = formData.tenantId || (isSuperUser && selectedTenantFilter !== 'ALL' ? selectedTenantFilter : tenantId);

    const payload = {
      ...formData,
      tenantId: effectiveTenantId,
      siteId: activeTab.siteScoped ? siteId : '',
    };
    
    let result;
    if (modalState.item) {
      result = await updateConfigItem(
        activeTab.collection,
        modalState.item.id,
        payload,
        activeTab.codeField,
        formData[activeTab.codeField],
        effectiveTenantId,
        activeTab.siteScoped ? siteId : ''
      );
    } else {
      result = await createConfigItem(
        activeTab.collection,
        payload,
        activeTab.codeField,
        formData[activeTab.codeField]
      );
    }
    
    if (result.success) {
      setModalState({ isOpen: false });
    } else {
      alert(result.error);
    }
  };

  const getColumns = () => {
    const cols = [];
    
    if (isSuperUser) {
      cols.push({
        header: 'Tenant ID',
        accessor: (row: any) => (
          <span className="font-mono text-xs text-brand-400 bg-brand-950/40 px-2 py-0.5 rounded border border-brand-800/40">
            {row.tenantId || 'Global'}
          </span>
        )
      });
    }

    // Determine dynamic columns based on collection
    if (activeTab.id === 'sites') {
      cols.push({ header: 'Code', accessor: 'siteCode' as const });
      cols.push({ header: 'Name', accessor: 'siteName' as const });
      cols.push({ header: 'Timezone', accessor: 'timezone' as const });
    } else if (activeTab.id === 'destinations') {
      cols.push({ header: 'Code', accessor: 'destinationCode' as const });
      cols.push({ header: 'Name', accessor: 'destinationName' as const });
      cols.push({ header: 'Type', accessor: 'destinationType' as const });
    } else if (activeTab.id === 'units' || activeTab.id === 'categories') {
      cols.push({ header: 'Code', accessor: 'code' as const });
      cols.push({ header: 'Name', accessor: 'name' as const });
    } else if (activeTab.id === 'areas') {
      cols.push({ header: 'Code', accessor: 'areaCode' as const });
      cols.push({ header: 'Name', accessor: 'areaName' as const });
      cols.push({ header: 'Type', accessor: 'areaType' as const });
    } else if (activeTab.id === 'lines') {
      cols.push({ header: 'Code', accessor: 'lineCode' as const });
      cols.push({ header: 'Name', accessor: 'lineName' as const });
      cols.push({ header: 'SAP Resource Code', accessor: (row: any) => row.sapResourceCode || <span className="text-slate-500 italic">Not set</span> });
      cols.push({ header: 'SAP Aliases', accessor: (row: any) => Array.isArray(row.sapResourceAliases) && row.sapResourceAliases.length > 0 ? row.sapResourceAliases.join(', ') : <span className="text-slate-500 italic">None</span> });
    } else if (activeTab.id === 'actions') {
      cols.push({ header: 'Code', accessor: 'code' as const });
      cols.push({ header: 'Label', accessor: 'label' as const });
      cols.push({ header: 'Meaning', accessor: 'meaning' as const });
    } else if (activeTab.id === 'priorities') {
      cols.push({ header: 'Code', accessor: 'code' as const });
      cols.push({ header: 'Label', accessor: 'label' as const });
      cols.push({ header: 'Weight', accessor: 'numericWeight' as const });
    }

    cols.push({
      header: 'Status',
      accessor: (row: any) => (
        row.status === 'active' 
          ? <StatusBadge variant="completed" label="Active" />
          : <StatusBadge variant="blocked" label="Inactive" />
      )
    });
    
    cols.push({
      header: 'Actions',
      accessor: (row: any) => (
        <div className="flex items-center gap-3">
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
              className="text-xs font-medium text-brand-500 hover:text-brand-400 transition-colors"
            >
              Reactivate
            </button>
          )}
        </div>
      )
    });
    
    return cols;
  };

  return (
    <div>
      <PageHeader 
        title="Configuration" 
        description="Master reference data used throughout the application."
        actions={
          <div className="flex items-center gap-2">
            {onboarding && !isComplete && canComplete && handleOpenOnboardingWizard && (
              <button
                onClick={handleOpenOnboardingWizard}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-600 border border-transparent rounded-lg transition-colors shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Resume Site Onboarding
              </button>
            )}
            {onboarding && isComplete && canComplete && (
              <button
                onClick={async () => {
                  if (window.confirm('Are you absolutely sure you want to reopen onboarding for this site? This will change the site status back to ONBOARDING.')) {
                    await reopenSiteOnboarding(tenantId, siteId, userProfile?.uid || 'system');
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700 hover:bg-slate-850 rounded-lg transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reopen Site Onboarding
              </button>
            )}
            {developmentMode && (
              <button
                onClick={handleSeed}
                disabled={seeding}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-900 bg-brand-500 hover:bg-brand-400 border border-transparent rounded-md transition-colors disabled:opacity-50"
              >
                {seeding ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
                Load Development Configuration
              </button>
            )}
          </div>
        }
      />

      {isSuperUser && (
        <div className="mb-6 p-4 bg-slate-800/60 border border-slate-700/80 rounded-lg flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-500/10 text-brand-400 rounded-md border border-brand-500/20">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Super User Tenant Scope</h3>
              <p className="text-xs text-slate-400">Filter configuration data by tenant, or view all tenants globally.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5" />
              Tenant Filter:
            </label>
            <select
              value={selectedTenantFilter}
              onChange={(e) => setSelectedTenantFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-900 border border-slate-600 rounded-md text-sm font-medium text-slate-200 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            >
              <option value="ALL">All Tenants (Global)</option>
              {tenantsList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.id})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="mb-6 border-b border-slate-700">
        <nav className="-mb-px flex space-x-6 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab.id === tab.id
                  ? 'border-brand-500 text-brand-500'
                  : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-500'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <SectionCard 
        title={activeTab.label}
        actions={
          <button 
            onClick={() => setModalState({ isOpen: true })}
            className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors bg-slate-800 border border-slate-600 px-3 py-1.5 rounded-md hover:bg-slate-700"
          >
            <Plus className="w-4 h-4" />
            Add {activeTab?.label ? activeTab.label.split(' ')[0] : ''}
          </button>
        }
      >
        {loading ? (
          <LoadingState message={`Loading ${activeTab.label}...`} />
        ) : error ? (
          <ErrorState message={error.message} />
        ) : (
          <DataTable
            columns={getColumns()}
            data={data}
            keyExtractor={(row: any) => row.id}
            emptyMessage={`No ${activeTab.label.toLowerCase()} found for this scope.`}
          />
        )}
      </SectionCard>

      <ConfirmationDialog
        isOpen={!!actionItem}
        title={actionItem?.action === 'deactivate' ? 'Deactivate Record' : 'Reactivate Record'}
        message={`Are you sure you want to ${actionItem?.action} this record? It will ${actionItem?.action === 'deactivate' ? 'no longer' : 'now'} be available for new selections.`}
        confirmLabel={actionItem?.action === 'deactivate' ? 'Deactivate' : 'Reactivate'}
        isDestructive={actionItem?.action === 'deactivate'}
        onConfirm={confirmAction}
        onCancel={() => setActionItem(null)}
      />
      
      <ConfigItemModal 
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false })}
        onSave={handleSaveModal}
        item={modalState.item}
        tabId={activeTab.id}
        isSuperUser={isSuperUser}
        tenantsList={tenantsList}
        defaultTenantId={selectedTenantFilter !== 'ALL' ? selectedTenantFilter : tenantId}
      />
    </div>
  );
};

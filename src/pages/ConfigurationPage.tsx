import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { SectionCard } from '../components/ui/SectionCard';
import { DataTable } from '../components/ui/DataTable';
import { StatusBadge } from '../components/ui/StatusBadge';
import { LoadingState, ErrorState } from '../components/ui/States';
import { ConfirmationDialog } from '../components/ui/ConfirmationDialog';
import { Settings, Plus, RotateCcw } from 'lucide-react';
import { 
  collections, 
  seedDevelopmentConfiguration,
  deactivateConfigItem,
  reactivateConfigItem,
  createConfigItem,
  updateConfigItem
} from '../features/configuration/services/configurationService';
import { subscribeToCollection } from '../services/firestoreBase';
import { where } from 'firebase/firestore';
import { ConfigItemModal } from '../features/configuration/components/ConfigItemModal';
import { useSiteContext } from '../contexts/SiteContext';

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
  const { tenantId, siteId } = useSiteContext();
  const developmentMode = import.meta.env.DEV || import.meta.env.VITE_DEV_MODE === 'true';
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [seeding, setSeeding] = useState(false);
  
  const [actionItem, setActionItem] = useState<{item: any, action: 'deactivate' | 'reactivate'} | null>(null);
  
  const [modalState, setModalState] = useState<{isOpen: boolean, item?: any}>({ isOpen: false });

  useEffect(() => {
    setLoading(true);
    setError(null);
    setData([]);

    const constraints = [where('tenantId', '==', tenantId)];
    if (activeTab.siteScoped) {
      constraints.push(where('siteId', '==', siteId));
    } else {
      constraints.push(where('siteId', '==', ''));
    }

    const unsubscribe = subscribeToCollection<any>(
      activeTab.collection,
      constraints,
      (items) => {
        // Sort items conceptually, maybe by sortOrder or status then name
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
  }, [tenantId, siteId, activeTab]);

  const handleSeed = async () => {
    setSeeding(true);
    const result = await seedDevelopmentConfiguration(tenantId, siteId);
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
    const payload = {
      ...formData,
      tenantId,
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
        tenantId,
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
          developmentMode ? (
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-900 bg-brand-500 hover:bg-brand-400 border border-transparent rounded-md transition-colors disabled:opacity-50"
            >
              {seeding ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
              Load Development Configuration
            </button>
          ) : undefined
        }
      />

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
      />
    </div>
  );
};

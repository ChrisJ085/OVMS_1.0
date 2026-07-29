import React, { useState, useEffect } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { DataTable } from '../../../components/ui/DataTable';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { LoadingState, ErrorState } from '../../../components/ui/States';
import { ConfirmationDialog } from '../../../components/ui/ConfirmationDialog';
import { Plus, Search, ClipboardPaste } from 'lucide-react';
import { subscribeToLocations, setLocationStatus } from '../services/locationService';
import { Location } from '../../../types/inventory';
import { subscribeToCollection } from '../../../services/firestoreBase';
import { collections } from '../../configuration/services/configurationService';
import { StorageArea } from '../../../types/configuration';
import { where } from 'firebase/firestore';
import { LocationModal } from './components/LocationModal';
import { PasteInventoryModal } from './components/PasteInventoryModal';
import { useSiteContext } from '../../../contexts/SiteContext';

export const LocationsPage: React.FC = () => {
  const { tenantId, siteId } = useSiteContext();
  const [locations, setLocations] = useState<Location[]>([]);
  const [storageAreas, setStorageAreas] = useState<StorageArea[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [areaFilter, setAreaFilter] = useState<string>('all');

  const [modalState, setModalState] = useState<{isOpen: boolean, item?: Location}>({ isOpen: false });
  const [actionItem, setActionItem] = useState<{item: Location, action: 'deactivate' | 'reactivate'} | null>(null);
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    const unsubLocations = subscribeToLocations(
      tenantId,
      siteId,
      (items) => {
        setLocations(items);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    const unsubAreas = subscribeToCollection<StorageArea>(
      collections.STORAGE_AREAS,
      [where('tenantId', '==', tenantId), where('siteId', '==', siteId)],
      setStorageAreas,
      console.error
    );

    return () => {
      unsubLocations();
      unsubAreas();
    };
  }, [tenantId, siteId]);

  const confirmAction = async () => {
    if (!actionItem || !actionItem.item.id) return;
    try {
      await setLocationStatus(actionItem.item.id, actionItem.action === 'reactivate');
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setActionItem(null);
    }
  };

  const getAreaName = (id: string) => storageAreas.find(a => a.id === id)?.areaName || id;

  const filteredLocations = locations.filter(loc => {
    const matchesSearch = loc.locationCode.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          loc.locationName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? loc.status === 'active' : loc.status !== 'active');
    const matchesArea = areaFilter === 'all' || loc.storageAreaId === areaFilter;
    return matchesSearch && matchesStatus && matchesArea;
  });

  const columns = [
    { header: 'Location Code', accessor: 'locationCode' as const },
    { header: 'Location Name', accessor: 'locationName' as const },
    { header: 'Storage Area', accessor: (row: Location) => getAreaName(row.storageAreaId) },
    {
      header: 'Status',
      accessor: (row: Location) => (
        row.status === 'active' 
          ? <StatusBadge variant="completed" label="Active" />
          : <StatusBadge variant="blocked" label="Inactive" />
      )
    },
    {
      header: 'Actions',
      accessor: (row: Location) => (
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
    }
  ];

  return (
    <div>
      <PageHeader 
        title="Storage Locations" 
        description="Physical storage bins, slots, and areas for inventory."
      />

      <SectionCard 
        title="Locations"
        actions={
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsPasteModalOpen(true)}
              className="flex items-center gap-2 text-sm font-medium text-slate-200 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-md hover:bg-slate-700 transition-colors"
            >
              <ClipboardPaste className="w-4 h-4 text-brand-400" />
              Paste Stock Update
            </button>
            <button 
              onClick={() => setModalState({ isOpen: true })}
              className="flex items-center gap-2 text-sm font-medium text-slate-900 bg-brand-500 px-3 py-1.5 rounded-md hover:bg-brand-400 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Location
            </button>
          </div>
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
              placeholder="Search by code or name..."
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
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
            className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
          >
            <option value="all">All Storage Areas</option>
            {storageAreas.map(a => (
              <option key={a.id} value={a.id}>{a.areaName}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <LoadingState message="Loading locations..." />
        ) : error ? (
          <ErrorState message={error.message} />
        ) : (
          <DataTable
            columns={columns}
            data={filteredLocations}
            keyExtractor={(row) => row.id as string}
            emptyMessage="No locations match the selected filters."
          />
        )}
      </SectionCard>

      <ConfirmationDialog
        isOpen={!!actionItem}
        title={actionItem?.action === 'deactivate' ? 'Deactivate Location' : 'Reactivate Location'}
        message={`Are you sure you want to ${actionItem?.action} this location?`}
        confirmLabel={actionItem?.action === 'deactivate' ? 'Deactivate' : 'Reactivate'}
        isDestructive={actionItem?.action === 'deactivate'}
        onConfirm={confirmAction}
        onCancel={() => setActionItem(null)}
      />

      <PasteInventoryModal
        isOpen={isPasteModalOpen}
        onClose={() => setIsPasteModalOpen(false)}
      />

      <LocationModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false })}
        item={modalState.item}
        storageAreas={storageAreas}
      />
    </div>
  );
};

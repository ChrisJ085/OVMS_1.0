import React, { useState, useEffect } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { DataTable } from '../../../components/ui/DataTable';
import { LoadingState, ErrorState } from '../../../components/ui/States';
import { Search } from 'lucide-react';
import { useDevelopmentContext } from '../../../contexts/DevelopmentContext';
import { subscribeToMovements } from '../services/inventoryService';
import { InventoryMovement } from '../../../types/inventory';
import { subscribeToCollection } from '../../../services/firestoreBase';
import { Location } from '../../../types/inventory';
import { where } from 'firebase/firestore';

export const InventoryMovementsPage: React.FC = () => {
  const { tenantId, siteId } = useDevelopmentContext();
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  useEffect(() => {
    setLoading(true);
    
    const unsubMovements = subscribeToMovements(
      tenantId,
      siteId,
      (items) => {
        setMovements(items);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    const unsubLocs = subscribeToCollection<Location>(
      'locations',
      [where('tenantId', '==', tenantId), where('siteId', '==', siteId)],
      setLocations,
      console.error
    );

    return () => {
      unsubMovements();
      unsubLocs();
    };
  }, [tenantId, siteId]);

  const filteredMovements = movements.filter(m => {
    const matchesSearch = m.productCodeSnapshot.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          m.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          m.reference.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || m.movementType === typeFilter;
    return matchesSearch && matchesType;
  });

  const renderDate = (dateVal: any) => {
    if (!dateVal) return '-';
    if (dateVal.toDate) return dateVal.toDate().toLocaleString();
    return new Date(dateVal).toLocaleString();
  };

  const columns = [
    { header: 'Time', accessor: (row: InventoryMovement) => renderDate(row.timestamp) },
    { header: 'Product Code', accessor: 'productCodeSnapshot' as const },
    { header: 'Type', accessor: 'movementType' as const },
    { header: 'From', accessor: (row: InventoryMovement) => locations.find(l => l.id === row.fromLocationId)?.locationCode || '-' },
    { header: 'To', accessor: (row: InventoryMovement) => locations.find(l => l.id === row.toLocationId)?.locationCode || '-' },
    { header: 'Quantity', accessor: (row: InventoryMovement) => <span className="font-medium text-slate-200">{row.quantity}</span> },
    { header: 'Reason', accessor: 'reason' as const },
    { header: 'Reference', accessor: 'reference' as const },
    { header: 'User', accessor: 'performedBy' as const },
  ];

  return (
    <div>
      <PageHeader 
        title="Inventory Movements" 
        description="Immutable ledger of all stock adjustments, transfers, and corrections."
      />

      <SectionCard title="Movement History">
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
              placeholder="Search by product code, reason, or reference..."
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
          >
            <option value="all">All Types</option>
            <option value="INCREASE">Increase</option>
            <option value="DECREASE">Decrease</option>
            <option value="TRANSFER_IN">Transfer In</option>
            <option value="TRANSFER_OUT">Transfer Out</option>
            <option value="INITIAL_LOAD">Initial Load</option>
            <option value="CORRECTION">Correction</option>
          </select>
        </div>

        {loading ? (
          <LoadingState message="Loading movement history..." />
        ) : error ? (
          <ErrorState message={error.message} />
        ) : (
          <DataTable
            columns={columns}
            data={filteredMovements}
            keyExtractor={(row) => row.id as string}
            emptyMessage="No movements match the selected filters."
          />
        )}
      </SectionCard>
    </div>
  );
};

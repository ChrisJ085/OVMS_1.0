import React, { useState, useEffect } from 'react';
import { X, History, Archive, AlertTriangle } from 'lucide-react';
import { InventoryBalance, InventoryMovement } from '../../../../types/inventory';
import { subscribeToBalances, subscribeToMovements } from '../../services/inventoryService';
import { collections } from '../../../configuration/services/configurationService';
import { StorageArea, UnitOfMeasure } from '../../../../types/configuration';
import { Location } from '../../../../types/inventory';
import { DataTable } from '../../../../components/ui/DataTable';
import { useSiteContext } from '../../../../contexts/SiteContext';
import { subscribeToCollection, where } from '../../../../services/firestoreBase';

interface InventoryDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId?: string;
  productCode?: string;
  productDesc?: string;
}

export const InventoryDetailModal: React.FC<InventoryDetailModalProps> = ({ 
  isOpen, onClose, productId, productCode, productDesc
}) => {
  const { tenantId, siteId } = useSiteContext();
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [areas, setAreas] = useState<StorageArea[]>([]);
  const [units, setUnits] = useState<UnitOfMeasure[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !productId) return;
    setLoading(true);

    const unsubBalances = subscribeToBalances(tenantId, siteId, (items) => {
      setBalances(items);
      setLoading(false);
    }, console.error, productId);

    const unsubMovements = subscribeToMovements(tenantId, siteId, setMovements, console.error, productId);

    const unsubLocs = subscribeToCollection<Location>(
      'locations',
      [where('tenantId', '==', tenantId), where('siteId', '==', siteId)],
      setLocations,
      console.error
    );

    const unsubAreas = subscribeToCollection<StorageArea>(
      collections.STORAGE_AREAS,
      [where('tenantId', '==', tenantId), where('siteId', '==', siteId)],
      setAreas,
      console.error
    );

    const unsubUnits = subscribeToCollection<UnitOfMeasure>(
      collections.UNITS_OF_MEASURE,
      [where('tenantId', '==', tenantId), where('siteId', '==', '')],
      setUnits,
      console.error
    );

    return () => {
      unsubBalances();
      unsubMovements();
      unsubLocs();
      unsubAreas();
      unsubUnits();
    };
  }, [isOpen, productId, tenantId, siteId]);

  if (!isOpen || !productId) return null;

  const totalQoh = balances.reduce((sum, b) => sum + b.quantity, 0);

  const getAreaName = (locId: string) => {
    const loc = locations.find(l => l.id === locId);
    if (!loc) return '-';
    return areas.find(a => a.id === loc.storageAreaId)?.areaName || '-';
  };

  const getUnitName = (id: string) => units.find(u => u.id === id)?.name || id;

  const renderDate = (dateVal: any) => {
    if (!dateVal) return '-';
    if (dateVal.toDate) return dateVal.toDate().toLocaleString();
    return new Date(dateVal).toLocaleString();
  };

  const balanceCols = [
    { header: 'Location', accessor: 'locationCodeSnapshot' as const },
    { header: 'Storage Area', accessor: (row: InventoryBalance) => getAreaName(row.locationId) },
    { header: 'Quantity', accessor: 'quantity' as const },
    { header: 'Unit', accessor: (row: InventoryBalance) => getUnitName(row.unitOfMeasureId) },
    { header: 'Last Updated', accessor: (row: InventoryBalance) => renderDate(row.sourceUpdatedAt) },
  ];

  const movementCols = [
    { header: 'Time', accessor: (row: InventoryMovement) => renderDate(row.timestamp) },
    { header: 'Type', accessor: 'movementType' as const },
    { header: 'From', accessor: (row: InventoryMovement) => locations.find(l => l.id === row.fromLocationId)?.locationCode || '-' },
    { header: 'To', accessor: (row: InventoryMovement) => locations.find(l => l.id === row.toLocationId)?.locationCode || '-' },
    { header: 'Quantity', accessor: 'quantity' as const },
    { header: 'Reason', accessor: 'reason' as const },
    { header: 'User', accessor: 'performedBy' as const },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-5xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-900/50">
          <div>
            <h2 className="text-xl font-semibold text-slate-100 flex items-center gap-3">
              <Archive className="w-5 h-5 text-brand-400" />
              {productCode}
            </h2>
            <p className="text-sm text-slate-400 mt-1">{productDesc}</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-xs text-slate-500 uppercase tracking-wider">Total Quantity</p>
              <p className="text-2xl font-semibold text-brand-400">{totalQoh.toLocaleString()}</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors bg-slate-800 p-1.5 rounded-md hover:bg-slate-700">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 bg-slate-900">
          {loading ? (
            <div className="py-12 flex justify-center text-slate-400">Loading details...</div>
          ) : (
            <div className="space-y-8">
              <div>
                <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider mb-4">Location Balances</h3>
                <DataTable
                  columns={balanceCols}
                  data={balances.filter(b => b.quantity > 0)}
                  keyExtractor={(row) => row.id as string}
                  emptyMessage="No active stock found in any location."
                />
              </div>

              <div>
                <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Recent Movements
                </h3>
                <DataTable
                  columns={movementCols}
                  data={movements.slice(0, 10)}
                  keyExtractor={(row) => row.id as string}
                  emptyMessage="No recent movements found."
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

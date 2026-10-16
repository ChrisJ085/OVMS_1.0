import React, { useEffect, useState } from 'react';
import { Archive, MapPin, Layers, RefreshCw } from 'lucide-react';
import { InventoryBalance, Location } from '../../../../types/inventory';
import { StorageArea, UnitOfMeasure } from '../../../../types/configuration';
import { subscribeToBalances } from '../../services/inventoryService';
import { collections } from '../../../configuration/services/configurationService';
import { useSiteContext } from '../../../../contexts/SiteContext';
import { subscribeToCollection, where } from '../../../../services/dbService';
import { LoadingState } from '../../../../components/ui/States';

interface ProductInventoryPanelProps {
  productId: string;
  productCode?: string;
}

export const ProductInventoryPanel: React.FC<ProductInventoryPanelProps> = ({ productId, productCode }) => {
  const { tenantId, siteId } = useSiteContext();
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [areas, setAreas] = useState<StorageArea[]>([]);
  const [units, setUnits] = useState<UnitOfMeasure[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!productId) return;
    setLoading(true);

    const unsubBalances = subscribeToBalances(
      tenantId,
      siteId,
      (items) => {
        // Also handle fallback if balance items match productCode
        const filtered = items.filter(
          b => b.productId === productId || (productCode && b.productCodeSnapshot === productCode)
        );
        setBalances(filtered);
        setLoading(false);
      },
      (err) => {
        console.error('Failed to subscribe to product inventory balances:', err);
        setLoading(false);
      },
      productId
    );

    const unsubLocs = subscribeToCollection<Location>(
      'locations',
      [
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId)
      ],
      setLocations,
      console.error
    );

    const unsubAreas = subscribeToCollection<StorageArea>(
      collections.STORAGE_AREAS,
      [
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId)
      ],
      setAreas,
      console.error
    );

    const unsubUnits = subscribeToCollection<UnitOfMeasure>(
      collections.UNITS_OF_MEASURE,
      [where('tenantId', '==', tenantId)],
      setUnits,
      console.error
    );

    return () => {
      unsubBalances();
      unsubLocs();
      unsubAreas();
      unsubUnits();
    };
  }, [tenantId, siteId, productId, productCode]);

  if (loading) {
    return (
      <div className="bg-slate-800/30 rounded-lg p-5 border border-slate-800 h-48 flex items-center justify-center">
        <LoadingState message="Loading inventory balances..." />
      </div>
    );
  }

  const totalQuantity = balances.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
  const activeBalances = balances.filter(b => (b.quantity || 0) > 0);

  const getAreaName = (locId: string) => {
    const loc = locations.find(l => l.id === locId);
    if (!loc) return null;
    return areas.find(a => a.id === loc.storageAreaId)?.areaName || null;
  };

  const getUnitName = (uomId: string) => {
    return units.find(u => u.id === uomId)?.code || units.find(u => u.id === uomId)?.name || 'Pallets';
  };

  return (
    <div className="bg-slate-800/30 rounded-lg p-5 border border-slate-800 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-4">
          <h3 className="text-sm font-medium text-brand-400 flex items-center gap-2">
            <Archive className="w-4 h-4" />
            Inventory Balances
          </h3>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            {activeBalances.length} {activeBalances.length === 1 ? 'Location' : 'Locations'}
          </span>
        </div>

        {/* Total Stock Highlight */}
        <div className="flex items-baseline justify-between p-3 bg-slate-900/60 rounded-lg border border-slate-700/50 mb-3">
          <span className="text-xs text-slate-400 font-medium">Total On-Hand Stock</span>
          <div className="text-right">
            <span className="text-2xl font-bold text-slate-100">{totalQuantity.toLocaleString()}</span>
            <span className="text-xs text-slate-400 ml-1.5 font-medium">
              {balances.length > 0 && balances[0].unitOfMeasureId ? getUnitName(balances[0].unitOfMeasureId) : 'Pallets'}
            </span>
          </div>
        </div>

        {/* Location Breakdown */}
        {activeBalances.length > 0 ? (
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {activeBalances.map((b) => {
              const areaName = getAreaName(b.locationId);
              return (
                <div
                  key={b.id}
                  className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded bg-slate-800/50 border border-slate-700/40"
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <div>
                      <span className="font-medium text-slate-200">{b.locationCodeSnapshot || 'Default Loc'}</span>
                      {areaName && <span className="text-slate-500 ml-1.5 text-[11px]">({areaName})</span>}
                    </div>
                  </div>
                  <div className="font-semibold text-slate-200">
                    {b.quantity?.toLocaleString() || 0}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-3 text-center rounded bg-slate-900/30 border border-slate-800 text-xs text-slate-500">
            No stock currently recorded on-hand across warehouse locations.
          </div>
        )}
      </div>

      {balances.length > 0 && balances[0].sourceUpdatedAt && (
        <div className="text-[11px] text-slate-500 pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <RefreshCw className="w-3 h-3 text-slate-600" />
            Source: {balances[0].source || 'Live Balance'}
          </span>
          <span>
            Updated: {new Date(balances[0].sourceUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}
    </div>
  );
};

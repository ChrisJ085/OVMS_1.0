import React, { useState, useEffect } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { DataTable } from '../../../components/ui/DataTable';
import { LoadingState, ErrorState } from '../../../components/ui/States';
import { Plus, Search, Archive, AlertTriangle, ClipboardPaste } from 'lucide-react';
import { subscribeToBalances, COLLECTIONS } from '../services/inventoryService';
import { subscribeToProducts } from '../services/productService';
import { InventoryBalance } from '../../../types/inventory';
import { Product } from '../../../types/product';
import { AdjustmentModal, AdjustmentType } from './components/AdjustmentModal';
import { InventoryDetailModal } from './components/InventoryDetailModal';
import { PasteInventoryModal } from './components/PasteInventoryModal';
import { collections } from '../../configuration/services/configurationService';
import { UnitOfMeasure } from '../../../types/configuration';
import { useSiteContext } from '../../../contexts/SiteContext';
import { subscribeToCollection, where } from '../../../services/supabaseBase';

export const InventoryBalancesPage: React.FC = () => {
  const { tenantId, siteId } = useSiteContext();
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<UnitOfMeasure[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');

  const [adjModalState, setAdjModalState] = useState<{
    isOpen: boolean, 
    type?: AdjustmentType, 
    productId?: string, 
    productCode?: string, 
    productDesc?: string
  }>({ isOpen: false });
  
  const [detailModalState, setDetailModalState] = useState<{
    isOpen: boolean, 
    productId?: string, 
    productCode?: string, 
    productDesc?: string
  }>({ isOpen: false });

  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    
    const unsubBalances = subscribeToBalances(
      tenantId,
      siteId,
      (items) => {
        setBalances(items);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    const unsubProducts = subscribeToProducts(tenantId, siteId, setProducts, console.error);

    const unsubUnits = subscribeToCollection<UnitOfMeasure>(
      collections.UNITS_OF_MEASURE,
      [where('tenantId', '==', tenantId), where('siteId', '==', '')],
      setUnits,
      console.error
    );

    return () => {
      unsubBalances();
      unsubProducts();
      unsubUnits();
    };
  }, [tenantId, siteId]);

  // Aggregate balances by product
  const productAggregates = products.map(product => {
    const prodBalances = balances.filter(b => b.productId === product.id && b.quantity > 0);
    const totalQoh = prodBalances.reduce((sum, b) => sum + b.quantity, 0);
    const numLocations = prodBalances.length;
    
    // Find the most recent update across all balances for this product
    const latestUpdate = prodBalances.reduce((latest, b) => {
      if (!b.sourceUpdatedAt) return latest;
      const t = (b.sourceUpdatedAt as any).toDate ? (b.sourceUpdatedAt as any).toDate() : new Date(b.sourceUpdatedAt as any);
      if (!latest) return t;
      return t > latest ? t : latest;
    }, null as Date | null);

    // Calculate freshness
    let isStale = false;
    let isAging = false;
    if (latestUpdate) {
      const hoursSinceUpdate = (new Date().getTime() - latestUpdate.getTime()) / (1000 * 60 * 60);
      if (hoursSinceUpdate > 24) isStale = true;
      else if (hoursSinceUpdate > 12) isAging = true;
    }

    return {
      product,
      totalQoh,
      numLocations,
      latestUpdate,
      isStale,
      isAging,
      hasBalances: prodBalances.length > 0
    };
  });

  const filteredAggregates = productAggregates.filter(agg => {
    if (!agg.hasBalances && agg.totalQoh === 0) return false; // Only show products with inventory or historical balances (if we didn't filter out 0s)
    
    const searchLower = searchTerm.toLowerCase();
    return agg.product.productCode.toLowerCase().includes(searchLower) || 
           agg.product.description.toLowerCase().includes(searchLower);
  });

  const getUnitName = (id: string) => units.find(u => u.id === id)?.name || id;

  const columns = [
    { header: 'Product Code', accessor: (row: any) => row.product.productCode },
    { header: 'Description', accessor: (row: any) => row.product.description },
    { header: 'Unit', accessor: (row: any) => getUnitName(row.product.unitOfMeasureId) },
    { header: 'CPP', accessor: (row: any) => row.product.casesPerPallet ?? '-' },
    { 
      header: 'Total QOH', 
      accessor: (row: any) => (
        <span className="font-semibold text-slate-100">{row.totalQoh.toLocaleString()}</span>
      )
    },
    { header: 'Locations', accessor: 'numLocations' as const },
    { 
      header: 'Last Update', 
      accessor: (row: any) => row.latestUpdate ? row.latestUpdate.toLocaleString() : '-'
    },
    {
      header: 'Freshness',
      accessor: (row: any) => {
        if (!row.latestUpdate) return <span className="text-slate-500">-</span>;
        if (row.isStale) return <span className="text-xs font-medium text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Stale</span>;
        if (row.isAging) return <span className="text-xs font-medium text-amber-400">Aging</span>;
        return <span className="text-xs font-medium text-brand-400">Fresh</span>;
      }
    },
    {
      header: 'Actions',
      accessor: (row: any) => (
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setDetailModalState({ 
              isOpen: true, 
              productId: row.product.id,
              productCode: row.product.productCode,
              productDesc: row.product.description
            })}
            className="text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors"
          >
            Details
          </button>
          <button 
            onClick={() => setAdjModalState({ 
              isOpen: true, 
              type: 'TRANSFER',
              productId: row.product.id,
              productCode: row.product.productCode,
              productDesc: row.product.description
            })}
            className="text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            Transfer
          </button>
        </div>
      )
    }
  ];

  return (
    <div>
      <PageHeader 
        title="Inventory Balances" 
        description="Real-time stock levels across all storage locations."
      />

      <SectionCard 
        title="Product Inventory"
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
              onClick={() => setAdjModalState({ isOpen: true, type: 'INCREASE' })}
              className="flex items-center gap-2 text-sm font-medium text-slate-900 bg-brand-500 px-3 py-1.5 rounded-md hover:bg-brand-400 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Stock Adjustment
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
              placeholder="Search by code or description..."
            />
          </div>
        </div>

        {loading ? (
          <LoadingState message="Loading inventory balances..." />
        ) : error ? (
          <ErrorState message={error.message} />
        ) : (
          <DataTable
            columns={columns}
            data={filteredAggregates}
            keyExtractor={(row) => row.product.id as string}
            emptyMessage="No active inventory found for any product."
          />
        )}
      </SectionCard>

      <AdjustmentModal
        isOpen={adjModalState.isOpen}
        onClose={() => setAdjModalState({ isOpen: false })}
        defaultType={adjModalState.type}
        defaultProductId={adjModalState.productId}
        defaultProductCode={adjModalState.productCode}
        defaultProductDesc={adjModalState.productDesc}
        units={units}
      />

      <InventoryDetailModal
        isOpen={detailModalState.isOpen}
        onClose={() => setDetailModalState({ isOpen: false })}
        productId={detailModalState.productId}
        productCode={detailModalState.productCode}
        productDesc={detailModalState.productDesc}
      />

      <PasteInventoryModal
        isOpen={isPasteModalOpen}
        onClose={() => setIsPasteModalOpen(false)}
      />
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { DataTable } from '../../../components/ui/DataTable';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { LoadingState, ErrorState } from '../../../components/ui/States';
import { ConfirmationDialog } from '../../../components/ui/ConfirmationDialog';
import { Plus, Search } from 'lucide-react';
import { subscribeToProducts, setProductStatus } from '../services/productService';
import { Product } from '../../../types/product';
import { collections } from '../../configuration/services/configurationService';
import { ProductCategory, UnitOfMeasure, Destination } from '../../../types/configuration';
import { ProductModal } from './components/ProductModal';
import { ProductDetailModal } from './components/ProductDetailModal';
import { useSiteContext } from '../../../contexts/SiteContext';
import { subscribeToCollection } from '../../../services/dbService';

export const ProductsPage: React.FC = () => {
  const { tenantId, siteId } = useSiteContext();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [units, setUnits] = useState<UnitOfMeasure[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [relevanceFilter, setRelevanceFilter] = useState<'all' | 'relevant' | 'not_relevant'>('all');

  const [modalState, setModalState] = useState<{isOpen: boolean, item?: Product}>({ isOpen: false });
  const [detailModalState, setDetailModalState] = useState<{isOpen: boolean, item?: Product}>({ isOpen: false });
  const [actionItem, setActionItem] = useState<{item: Product, action: 'deactivate' | 'reactivate'} | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsubProducts = subscribeToProducts(
      tenantId,
      siteId,
      (items) => {
        setProducts(items);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    const unsubCategories = subscribeToCollection<ProductCategory>(
      collections.PRODUCT_CATEGORIES,
      [
        { field: 'tenantId', op: '==', value: tenantId },
        { field: 'siteId', op: '==', value: '' }
      ],
      setCategories,
      console.error
    );

    const unsubUnits = subscribeToCollection<UnitOfMeasure>(
      collections.UNITS_OF_MEASURE,
      [
        { field: 'tenantId', op: '==', value: tenantId },
        { field: 'siteId', op: '==', value: '' }
      ],
      setUnits,
      console.error
    );

    const unsubDestinations = subscribeToCollection<Destination>(
      collections.DESTINATIONS,
      [
        { field: 'tenantId', op: '==', value: tenantId },
        { field: 'siteId', op: '==', value: '' }
      ],
      setDestinations,
      console.error
    );

    return () => {
      unsubProducts();
      unsubCategories();
      unsubUnits();
      unsubDestinations();
    };
  }, [tenantId, siteId]);

  const confirmAction = async () => {
    if (!actionItem || !actionItem.item.id) return;
    try {
      await setProductStatus(actionItem.item.id, actionItem.action === 'reactivate');
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setActionItem(null);
    }
  };

  const getCategoryName = (id: string) => categories.find(c => c.id === id)?.name || id;
  const getUnitName = (id: string) => units.find(u => u.id === id)?.name || id;
  const getDestinationName = (id: string | null) => {
    if (!id) return '-';
    return destinations.find(d => d.id === id)?.destinationName || id;
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.productCode.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? p.status === 'active' : p.status !== 'active');
    const matchesCategory = categoryFilter === 'all' || p.categoryId === categoryFilter;
    const matchesRelevance = relevanceFilter === 'all' || 
                             (relevanceFilter === 'relevant' ? p.operationallyRelevant : !p.operationallyRelevant);
    return matchesSearch && matchesStatus && matchesCategory && matchesRelevance;
  });

  const columns = [
    { header: 'Product Code', accessor: 'productCode' as const },
    { header: 'Description', accessor: 'description' as const },
    { header: 'Category', accessor: (row: Product) => getCategoryName(row.categoryId) },
    { 
      header: 'Configurations', 
      accessor: (row: Product) => (
        <div className="flex flex-wrap gap-1">
          {row.configurations?.map((c, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-300">
              {getUnitName(c.unitOfMeasureId)} ({c.casesPerPallet ?? '-'})
            </span>
          )) || (
            <span className="text-xs text-slate-500">
              {getUnitName(row.unitOfMeasureId)} ({row.casesPerPallet ?? '-'})
            </span>
          )}
        </div>
      )
    },
    { header: 'Default Destination', accessor: (row: Product) => getDestinationName(row.defaultDestinationId) },
    { 
      header: 'Op Relevant', 
      accessor: (row: Product) => (
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${row.operationallyRelevant ? 'bg-indigo-500/10 text-indigo-400' : 'bg-slate-700 text-slate-400'}`}>
          {row.operationallyRelevant ? 'Yes' : 'No'}
        </span>
      )
    },
    {
      header: 'Status',
      accessor: (row: Product) => (
        row.status === 'active' 
          ? <StatusBadge variant="completed" label="Active" />
          : <StatusBadge variant="blocked" label="Inactive" />
      )
    },
    { 
      header: 'Modified Date', 
      accessor: (row: Product) => {
        if (!row.modifiedDate) return '-';
        // handle firestore timestamp
        const date = (row.modifiedDate as any).toDate ? (row.modifiedDate as any).toDate() : new Date();
        return date.toLocaleDateString();
      }
    },
    {
      header: 'Actions',
      accessor: (row: Product) => (
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setDetailModalState({ isOpen: true, item: row })}
            className="text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            View
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
        title="Products Master Data" 
        description="The trusted product identity across inventory, planning, and operations."
      />

      <SectionCard 
        title="Products"
        actions={
          <button 
            onClick={() => setModalState({ isOpen: true })}
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
              placeholder="Search by code or description..."
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
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
          >
            <option value="all">All Categories</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={relevanceFilter}
            onChange={(e) => setRelevanceFilter(e.target.value as any)}
            className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
          >
            <option value="all">Any Relevance</option>
            <option value="relevant">Operationally Relevant</option>
            <option value="not_relevant">Not Relevant</option>
          </select>
        </div>

        {loading ? (
          <LoadingState message="Loading products..." />
        ) : error ? (
          <ErrorState message={error.message} />
        ) : (
          <DataTable
            columns={columns}
            data={filteredProducts}
            keyExtractor={(row) => row.id as string}
            emptyMessage="No products match the selected filters."
          />
        )}
      </SectionCard>

      <ConfirmationDialog
        isOpen={!!actionItem}
        title={actionItem?.action === 'deactivate' ? 'Deactivate Product' : 'Reactivate Product'}
        message={`Are you sure you want to ${actionItem?.action} this product? ${actionItem?.action === 'deactivate' ? 'It will remain visible in historical records but cannot be used for new operations.' : 'It will be available for new operations.'}`}
        confirmLabel={actionItem?.action === 'deactivate' ? 'Deactivate' : 'Reactivate'}
        isDestructive={actionItem?.action === 'deactivate'}
        onConfirm={confirmAction}
        onCancel={() => setActionItem(null)}
      />

      <ProductModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false })}
        item={modalState.item}
        categories={categories}
        units={units}
        destinations={destinations}
      />

      <ProductDetailModal
        isOpen={detailModalState.isOpen}
        onClose={() => setDetailModalState({ isOpen: false })}
        item={detailModalState.item}
        getCategoryName={getCategoryName}
        getUnitName={getUnitName}
        getDestinationName={getDestinationName}
      />
    </div>
  );
};

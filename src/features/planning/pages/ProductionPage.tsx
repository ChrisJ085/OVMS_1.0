import React, { useState, useEffect } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { DataTable } from '../../../components/ui/DataTable';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { LoadingState, ErrorState } from '../../../components/ui/States';
import { ConfirmationDialog } from '../../../components/ui/ConfirmationDialog';
import { Plus, Search, Calendar, CheckCircle2, XCircle, Play, Pause, Square, AlertCircle, Clock } from 'lucide-react';
import { subscribeToProductionEvents, updateProductionEvent } from '../services/productionService';
import { ProductionEvent } from '../../../types/production';
import { collections } from '../../configuration/services/configurationService';
import { ProductionLine, UnitOfMeasure } from '../../../types/configuration';
import { ProductionEventModal } from './components/ProductionEventModal';
import { ProductionActionModal } from './components/ProductionActionModal';
import { useSiteContext } from '../../../contexts/SiteContext';
import { Timestamp, subscribeToCollection, where } from '../../../services/supabaseBase';

export const ProductionPage: React.FC = () => {
  const { tenantId, siteId } = useSiteContext();
  const [events, setEvents] = useState<ProductionEvent[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [uoms, setUoms] = useState<UnitOfMeasure[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [viewFilter, setViewFilter] = useState<'current' | 'upcoming' | 'completed' | 'all'>('current');

  const [modalState, setModalState] = useState<{isOpen: boolean, item?: ProductionEvent}>({ isOpen: false });
  const [actionModalState, setActionModalState] = useState<{isOpen: boolean, item?: ProductionEvent, actionType?: string}>({ isOpen: false });
  const [confirmItem, setConfirmItem] = useState<{item: ProductionEvent, action: 'cancel' | 'delete'} | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsubEvents = subscribeToProductionEvents(
      tenantId,
      siteId,
      (items) => {
        setEvents(items);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    const unsubLines = subscribeToCollection<ProductionLine>(
      collections.PRODUCTION_LINES,
      [where('tenantId', '==', tenantId), where('siteId', '==', siteId)],
      setLines,
      console.error
    );

    const unsubUoms = subscribeToCollection<UnitOfMeasure>(
      collections.UNITS_OF_MEASURE,
      [where('tenantId', '==', tenantId)],
      setUoms,
      console.error
    );

    return () => {
      unsubEvents();
      unsubLines();
      unsubUoms();
    };
  }, [tenantId, siteId]);

  const confirmAction = async () => {
    if (!confirmItem || !confirmItem.item.id) return;
    try {
      if (confirmItem.action === 'cancel') {
        await updateProductionEvent(confirmItem.item.id, { productionStatus: 'CANCELLED' } as Partial<ProductionEvent>, tenantId, siteId);
      } else {
        await updateProductionEvent(confirmItem.item.id, { status: 'inactive' } as Partial<ProductionEvent>, tenantId, siteId);
      }
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setConfirmItem(null);
    }
  };

  const filteredEvents = events.filter(event => {
    if (event.status !== 'active') return false;
    
    const matchesSearch = event.productCodeSnapshot.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          event.descriptionSnapshot.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    switch (viewFilter) {
      case 'current':
        return ['RUNNING', 'ENDING', 'DELAYED', 'STOPPED'].includes(event.productionStatus);
      case 'upcoming':
        return event.productionStatus === 'PLANNED';
      case 'completed':
        return ['COMPLETE', 'CANCELLED'].includes(event.productionStatus);
      default:
        return true;
    }
  }).sort((a, b) => {
    const aTime = (a.plannedStart as any).toDate().getTime();
    const bTime = (b.plannedStart as any).toDate().getTime();
    return aTime - bTime;
  });

  const getLineName = (id: string) => lines.find(l => l.id === id)?.lineName || id;
  const getUomName = (id: string) => uoms.find(u => u.id === id)?.code || id;

  const renderDate = (dateVal: any) => {
    if (!dateVal) return '-';
    if (dateVal.toDate) return dateVal.toDate().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return new Date(dateVal).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  
  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'PLANNED': return <StatusBadge variant="default" label="Planned" />;
      case 'RUNNING': return <StatusBadge variant="completed" label="Running" />;
      case 'ENDING': return <StatusBadge variant="warning" label="Ending" />;
      case 'COMPLETE': return <StatusBadge variant="completed" label="Complete" />;
      case 'DELAYED': return <StatusBadge variant="warning" label="Delayed" />;
      case 'STOPPED': return <StatusBadge variant="blocked" label="Stopped" />;
      case 'CANCELLED': return <StatusBadge variant="blocked" label="Cancelled" />;
      default: return <span className="text-slate-400">{status}</span>;
    }
  };

  const columns = [
    { header: 'Product', accessor: (row: any) => (
      <div>
        <div className="font-medium text-slate-200">{row.productCodeSnapshot}</div>
        <div className="text-xs text-slate-400 truncate max-w-[200px]">{row.descriptionSnapshot}</div>
      </div>
    )},
    { header: 'Line', accessor: (row: any) => getLineName(row.productionLineId) },
    { header: 'Status', accessor: (row: any) => getStatusBadge(row.productionStatus) },
    { header: 'Planned Period', accessor: (row: any) => (
      <div className="text-xs text-slate-400">
        <div>{renderDate(row.plannedStart)}</div>
        <div>to {renderDate(row.plannedFinish)}</div>
      </div>
    )},
    { header: 'Planned Qty', accessor: (row: any) => row.plannedQuantity !== null ? `${row.plannedQuantity} ${getUomName(row.unitOfMeasureId)}` : '-' },
    { header: 'Actual Qty', accessor: (row: any) => row.actualQuantity !== null ? `${row.actualQuantity} ${getUomName(row.unitOfMeasureId)}` : '-' },
    {
      header: 'Actions',
      accessor: (row: any) => (
        <div className="flex items-center gap-2 flex-wrap max-w-[200px]">
          {row.productionStatus === 'PLANNED' && (
            <>
              <button onClick={() => setActionModalState({ isOpen: true, item: row, actionType: 'START' })} className="p-1 text-brand-400 hover:bg-slate-800 rounded" title="Start"><Play className="w-4 h-4" /></button>
              <button onClick={() => setModalState({ isOpen: true, item: row })} className="p-1 text-slate-400 hover:bg-slate-800 rounded" title="Edit">Edit</button>
              <button onClick={() => setConfirmItem({ item: row, action: 'cancel' })} className="p-1 text-red-400 hover:bg-slate-800 rounded" title="Cancel"><XCircle className="w-4 h-4" /></button>
            </>
          )}
          {['RUNNING', 'DELAYED'].includes(row.productionStatus) && (
            <>
              <button onClick={() => setActionModalState({ isOpen: true, item: row, actionType: 'UPDATE_QTY' })} className="p-1 text-slate-400 hover:bg-slate-800 rounded text-xs">Update Qty</button>
              <button onClick={() => setActionModalState({ isOpen: true, item: row, actionType: 'MARK_ENDING' })} className="p-1 text-amber-400 hover:bg-slate-800 rounded text-xs">Mark Ending</button>
              {row.productionStatus !== 'DELAYED' && <button onClick={() => setActionModalState({ isOpen: true, item: row, actionType: 'DELAY' })} className="p-1 text-amber-400 hover:bg-slate-800 rounded" title="Delay"><Clock className="w-4 h-4" /></button>}
              <button onClick={() => setActionModalState({ isOpen: true, item: row, actionType: 'STOP' })} className="p-1 text-red-400 hover:bg-slate-800 rounded" title="Stop"><Square className="w-4 h-4" /></button>
              <button onClick={() => setActionModalState({ isOpen: true, item: row, actionType: 'COMPLETE' })} className="p-1 text-brand-400 hover:bg-slate-800 rounded" title="Complete"><CheckCircle2 className="w-4 h-4" /></button>
            </>
          )}
          {row.productionStatus === 'ENDING' && (
            <>
              <button onClick={() => setActionModalState({ isOpen: true, item: row, actionType: 'UPDATE_QTY' })} className="p-1 text-slate-400 hover:bg-slate-800 rounded text-xs">Update Qty</button>
              <button onClick={() => setActionModalState({ isOpen: true, item: row, actionType: 'COMPLETE' })} className="p-1 text-brand-400 hover:bg-slate-800 rounded" title="Complete"><CheckCircle2 className="w-4 h-4" /></button>
              <button onClick={() => setActionModalState({ isOpen: true, item: row, actionType: 'STOP' })} className="p-1 text-red-400 hover:bg-slate-800 rounded" title="Stop"><Square className="w-4 h-4" /></button>
            </>
          )}
          {row.productionStatus === 'STOPPED' && (
            <>
              <button onClick={() => setActionModalState({ isOpen: true, item: row, actionType: 'START' })} className="p-1 text-brand-400 hover:bg-slate-800 rounded" title="Resume"><Play className="w-4 h-4" /></button>
              <button onClick={() => setActionModalState({ isOpen: true, item: row, actionType: 'COMPLETE' })} className="p-1 text-brand-400 hover:bg-slate-800 rounded" title="Complete"><CheckCircle2 className="w-4 h-4" /></button>
            </>
          )}
        </div>
      )
    }
  ];

  return (
    <div>
      <PageHeader 
        title="Production Calendar" 
        description="Manage planned and current production runs."
      />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <button 
          onClick={() => setViewFilter('current')}
          className={`p-4 rounded-lg border text-left transition-colors ${viewFilter === 'current' ? 'bg-brand-900/20 border-brand-500' : 'bg-slate-900 border-slate-700 hover:border-slate-600'}`}
        >
          <div className="text-sm font-medium text-slate-400 mb-1">Current Runs</div>
          <div className="text-2xl font-semibold text-slate-100">{events.filter(e => ['RUNNING', 'ENDING', 'DELAYED', 'STOPPED'].includes(e.productionStatus)).length}</div>
        </button>
        <button 
          onClick={() => setViewFilter('upcoming')}
          className={`p-4 rounded-lg border text-left transition-colors ${viewFilter === 'upcoming' ? 'bg-brand-900/20 border-brand-500' : 'bg-slate-900 border-slate-700 hover:border-slate-600'}`}
        >
          <div className="text-sm font-medium text-slate-400 mb-1">Upcoming</div>
          <div className="text-2xl font-semibold text-slate-100">{events.filter(e => e.productionStatus === 'PLANNED').length}</div>
        </button>
        <button 
          onClick={() => setViewFilter('completed')}
          className={`p-4 rounded-lg border text-left transition-colors ${viewFilter === 'completed' ? 'bg-brand-900/20 border-brand-500' : 'bg-slate-900 border-slate-700 hover:border-slate-600'}`}
        >
          <div className="text-sm font-medium text-slate-400 mb-1">Completed / Cancelled</div>
          <div className="text-2xl font-semibold text-slate-100">{events.filter(e => ['COMPLETE', 'CANCELLED'].includes(e.productionStatus)).length}</div>
        </button>
        <button 
          onClick={() => setViewFilter('all')}
          className={`p-4 rounded-lg border text-left transition-colors ${viewFilter === 'all' ? 'bg-brand-900/20 border-brand-500' : 'bg-slate-900 border-slate-700 hover:border-slate-600'}`}
        >
          <div className="text-sm font-medium text-slate-400 mb-1">All Events</div>
          <div className="text-2xl font-semibold text-slate-100">{events.length}</div>
        </button>
      </div>

      <SectionCard 
        title={`${viewFilter.charAt(0).toUpperCase() + viewFilter.slice(1)} Events`}
        actions={
          <button 
            onClick={() => setModalState({ isOpen: true })}
            className="flex items-center gap-2 text-sm font-medium text-slate-900 bg-brand-500 px-3 py-1.5 rounded-md hover:bg-brand-400 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Plan Event
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
        </div>

        {loading ? (
          <LoadingState message="Loading events..." />
        ) : error ? (
          <ErrorState message={error.message} />
        ) : (
          <DataTable
            columns={columns}
            data={filteredEvents}
            keyExtractor={(row) => row.id as string}
            emptyMessage="No events match the selected filters."
          />
        )}
      </SectionCard>

      <ConfirmationDialog
        isOpen={!!confirmItem}
        title={confirmItem?.action === 'cancel' ? 'Cancel Event' : 'Delete Event'}
        message={`Are you sure you want to ${confirmItem?.action} this event?`}
        confirmLabel={confirmItem?.action === 'cancel' ? 'Cancel Event' : 'Delete'}
        isDestructive={true}
        onConfirm={confirmAction}
        onCancel={() => setConfirmItem(null)}
      />

      <ProductionEventModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false })}
        item={modalState.item}
        lines={lines}
        uoms={uoms}
      />

      <ProductionActionModal
        isOpen={actionModalState.isOpen}
        onClose={() => setActionModalState({ isOpen: false, item: undefined, actionType: undefined })}
        item={actionModalState.item}
        actionType={actionModalState.actionType}
        uoms={uoms}
      />

    </div>
  );
};

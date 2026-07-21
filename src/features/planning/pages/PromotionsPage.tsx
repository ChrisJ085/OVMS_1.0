import React, { useState, useEffect } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { DataTable } from '../../../components/ui/DataTable';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { LoadingState, ErrorState } from '../../../components/ui/States';
import { Plus, Search, CalendarDays } from 'lucide-react';
import { useDevelopmentContext } from '../../../contexts/DevelopmentContext';
import { subscribeToPromotions } from '../services/promotionService';
import { PromotionWithPhase } from '../../../types/promotion';
import { PromotionModal } from './components/PromotionModal';
import { useNavigate } from 'react-router-dom';

export const PromotionsPage: React.FC = () => {
  const { tenantId } = useDevelopmentContext();
  const navigate = useNavigate();
  const [promotions, setPromotions] = useState<PromotionWithPhase[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('active');

  const [modalState, setModalState] = useState<{isOpen: boolean, item?: PromotionWithPhase}>({ isOpen: false });

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToPromotions(
      tenantId,
      (items) => {
        setPromotions(items);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return () => {
      unsub();
    };
  }, [tenantId]);

  const filteredPromotions = promotions.filter(promo => {
    if (promo.status !== 'active') return false;
    
    const matchesSearch = promo.promotionCode.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          promo.promotionName.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (statusFilter === 'active') {
      return ['DRAFT', 'SCHEDULED', 'ACTIVE'].includes(promo.promotionStatus);
    } else if (statusFilter === 'completed') {
      return ['COMPLETED', 'CANCELLED'].includes(promo.promotionStatus);
    }
    
    return true;
  }).sort((a, b) => {
    const aTime = (a.startDate as any).toDate().getTime();
    const bTime = (b.startDate as any).toDate().getTime();
    return bTime - aTime; // descending start date
  });

  const renderDate = (dateVal: any) => {
    if (!dateVal) return '-';
    if (dateVal.toDate) return dateVal.toDate().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    return new Date(dateVal).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };
  
  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'DRAFT': return <StatusBadge variant="default" label="Draft" />;
      case 'SCHEDULED': return <StatusBadge variant="default" label="Scheduled" />;
      case 'ACTIVE': return <StatusBadge variant="completed" label="Active" />;
      case 'COMPLETED': return <StatusBadge variant="default" label="Completed" />;
      case 'CANCELLED': return <StatusBadge variant="blocked" label="Cancelled" />;
      default: return <span className="text-slate-400">{status}</span>;
    }
  };

  const getPhaseBadge = (phase: string) => {
    switch(phase) {
      case 'PRE_BUILD': return <StatusBadge variant="warning" label="Pre-Build" />;
      case 'ACTIVE': return <StatusBadge variant="completed" label="Active Phase" />;
      case 'RUN_DOWN': return <StatusBadge variant="warning" label="Run Down" />;
      case 'INACTIVE': return <StatusBadge variant="default" label="Inactive" />;
      default: return <span className="text-slate-400">{phase}</span>;
    }
  };

  const columns = [
    { header: 'Promotion', accessor: (row: any) => (
      <div>
        <div className="font-medium text-slate-200 hover:text-brand-400 cursor-pointer transition-colors" onClick={() => navigate(`/planning/promotions/${row.id}`)}>{row.promotionCode} - {row.promotionName}</div>
        <div className="text-xs text-slate-400 truncate max-w-[200px]">{row.description}</div>
      </div>
    )},
    { header: 'Status', accessor: (row: any) => getStatusBadge(row.promotionStatus) },
    { header: 'Current Phase', accessor: (row: any) => getPhaseBadge(row.phase) },
    { header: 'Importance', accessor: (row: any) => (
      <span className={`text-xs font-medium px-2 py-1 rounded ${
        row.importance === 'CRITICAL' ? 'bg-red-500/20 text-red-400' :
        row.importance === 'NATIONAL' ? 'bg-indigo-500/20 text-indigo-400' :
        row.importance === 'HIGH' ? 'bg-amber-500/20 text-amber-400' :
        'bg-slate-800 text-slate-300'
      }`}>
        {row.importance}
      </span>
    )},
    { header: 'Active Period', accessor: (row: any) => (
      <div className="text-xs text-slate-300 flex items-center gap-1.5">
        <CalendarDays className="w-3.5 h-3.5 text-slate-500" />
        {renderDate(row.startDate)} to {renderDate(row.endDate)}
      </div>
    )},
    {
      header: 'Actions',
      accessor: (row: any) => (
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(`/planning/promotions/${row.id}`)}
            className="text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors"
          >
            Manage
          </button>
          <button 
            onClick={() => setModalState({ isOpen: true, item: row })}
            className="text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            Edit
          </button>
        </div>
      )
    }
  ];

  return (
    <div>
      <PageHeader 
        title="Promotions Planning" 
        description="Manage marketing promotions, pre-builds, and product impacts."
      />

      <SectionCard 
        title="Promotions List"
        actions={
          <button 
            onClick={() => setModalState({ isOpen: true })}
            className="flex items-center gap-2 text-sm font-medium text-slate-900 bg-brand-500 px-3 py-1.5 rounded-md hover:bg-brand-400 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Promotion
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
              placeholder="Search by code or name..."
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-slate-200 focus:outline-none focus:border-slate-600"
          >
            <option value="all">All Promotions</option>
            <option value="active">Active & Upcoming</option>
            <option value="completed">Completed & Cancelled</option>
          </select>
        </div>

        {loading ? (
          <LoadingState message="Loading promotions..." />
        ) : error ? (
          <ErrorState message={error.message} />
        ) : (
          <DataTable
            columns={columns}
            data={filteredPromotions}
            keyExtractor={(row) => row.id as string}
            emptyMessage="No promotions match the selected filters."
          />
        )}
      </SectionCard>

      <PromotionModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false })}
        item={modalState.item}
      />
    </div>
  );
};

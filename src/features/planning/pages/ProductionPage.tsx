import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { DataTable } from '../../../components/ui/DataTable';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { LoadingState, ErrorState } from '../../../components/ui/States';
import { ConfirmationDialog } from '../../../components/ui/ConfirmationDialog';
import { 
  Plus, 
  Search, 
  Calendar as CalendarIcon, 
  CheckCircle2, 
  XCircle, 
  Play, 
  Pause, 
  AlertCircle, 
  Clock, 
  RefreshCw, 
  SlidersHorizontal,
  Table as TableIcon,
  Activity,
  Layers,
  ArrowRight,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Factory,
  BarChart3,
  CalendarCheck
} from 'lucide-react';
import { subscribeToProductionEvents, updateProductionEvent } from '../services/productionService';
import { subscribeToProducts } from '../../inventory/services/productService';
import { collections } from '../../configuration/services/configurationService';
import { ProductionLine, UnitOfMeasure } from '../../../types/configuration';
import { Product } from '../../../types/product';
import { ProductionEvent } from '../../../types/production';
import { ProductionEventModal } from './components/ProductionEventModal';
import { ProductionActionModal } from './components/ProductionActionModal';
import { ProductionCalendarGrid } from '../components/production-calendar/ProductionCalendarGrid';
import { ProductionTimelineView } from '../components/production-calendar/ProductionTimelineView';
import { ProductionLiveExecutionView } from '../components/production-calendar/ProductionLiveExecutionView';
import { ProductionRunDetailModal } from '../components/production-calendar/ProductionRunDetailModal';
import { 
  syncEventsFromPlanEntries, 
  seedSampleProductionSchedule, 
  toUTCMidnight 
} from '../services/productionScheduleService';
import { useSiteContext } from '../../../contexts/SiteContext';
import { subscribeToCollection, where } from '../../../services/dbService';
import { toEpochMillis, toSafeDate } from '../../../utils/timeFormatters';

export const ProductionPage: React.FC = () => {
  const { tenantId, siteId } = useSiteContext();
  
  // Data States
  const [events, setEvents] = useState<ProductionEvent[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [uoms, setUoms] = useState<UnitOfMeasure[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // View States
  const [activeTab, setActiveTab] = useState<'calendar' | 'timeline' | 'execution' | 'table'>('calendar');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLineId, setSelectedLineId] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Week Management (Defaults to current week Monday)
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const today = new Date();
    const day = today.getDay(); // 0 is Sunday
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(Date.UTC(today.getFullYear(), today.getMonth(), diff, 0, 0, 0, 0));
  });

  // Timeline Day State
  const [timelineDate, setTimelineDate] = useState<Date>(new Date());

  // Modal States
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    item?: ProductionEvent;
    initialLineId?: string;
    initialDate?: Date;
  }>({ isOpen: false });

  const [detailModalState, setDetailModalState] = useState<{
    isOpen: boolean;
    item?: ProductionEvent;
  }>({ isOpen: false });

  const [actionModalState, setActionModalState] = useState<{
    isOpen: boolean;
    item?: ProductionEvent;
    actionType?: string;
  }>({ isOpen: false });

  const [confirmItem, setConfirmItem] = useState<{
    item: ProductionEvent;
    action: 'cancel' | 'delete';
  } | null>(null);

  // Sync / Seed Toast Notifications
  const [actionNotice, setActionNotice] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  // Grid Dates for the selected 7 days
  const gridDates = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(currentWeekStart);
      d.setUTCDate(currentWeekStart.getUTCDate() + i);
      return d;
    });
  }, [currentWeekStart]);

  // Subscriptions
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

    const unsubProducts = subscribeToProducts(
      tenantId,
      siteId,
      setProducts,
      console.error
    );

    return () => {
      unsubEvents();
      unsubLines();
      unsubUoms();
      unsubProducts();
    };
  }, [tenantId, siteId]);

  // Notice auto-dismiss
  useEffect(() => {
    if (actionNotice) {
      const timer = setTimeout(() => setActionNotice(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [actionNotice]);

  // Week Navigation handlers
  const handlePrevWeek = () => {
    const d = new Date(currentWeekStart);
    d.setUTCDate(d.getUTCDate() - 7);
    setCurrentWeekStart(d);
  };

  const handleNextWeek = () => {
    const d = new Date(currentWeekStart);
    d.setUTCDate(d.getUTCDate() + 7);
    setCurrentWeekStart(d);
  };

  const handleResetToCurrentWeek = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    setCurrentWeekStart(new Date(Date.UTC(today.getFullYear(), today.getMonth(), diff, 0, 0, 0, 0)));
  };

  // Sync with SAP Plan
  const handleSyncFromPlan = async () => {
    setIsSyncing(true);
    setActionNotice(null);
    try {
      const res = await syncEventsFromPlanEntries(
        tenantId,
        siteId,
        currentWeekStart,
        lines,
        products,
        uoms
      );

      if (res.syncedCount > 0) {
        setActionNotice({
          type: 'success',
          message: `Synced ${res.syncedCount} run(s) from Production Plan for this week.`
        });
      } else if (res.skippedCount > 0) {
        setActionNotice({
          type: 'info',
          message: `All ${res.skippedCount} run(s) for this week are already on the calendar.`
        });
      } else {
        setActionNotice({
          type: 'info',
          message: 'No SAP production plan entries found for this week. Use "Load Sample Schedule" to generate test runs.'
        });
      }
    } catch (err: any) {
      setActionNotice({
        type: 'error',
        message: err.message || 'Failed to sync with production plan'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Seed Sample Schedule
  const handleSeedSampleSchedule = async () => {
    setIsSeeding(true);
    setActionNotice(null);
    try {
      const res = await seedSampleProductionSchedule(
        tenantId,
        siteId,
        lines,
        products,
        uoms
      );

      if (res.createdCount > 0) {
        setActionNotice({
          type: 'success',
          message: `Generated ${res.createdCount} realistic production runs across your active lines!`
        });
      } else {
        setActionNotice({
          type: 'error',
          message: res.errors.join(', ') || 'Failed to seed sample schedule.'
        });
      }
    } catch (err: any) {
      setActionNotice({
        type: 'error',
        message: err.message || 'Failed to generate schedule'
      });
    } finally {
      setIsSeeding(false);
    }
  };

  // Action Confirmation
  const confirmAction = async () => {
    if (!confirmItem || !confirmItem.item.id) return;
    try {
      if (confirmItem.action === 'cancel') {
        await updateProductionEvent(
          confirmItem.item.id,
          { productionStatus: 'CANCELLED' } as Partial<ProductionEvent>,
          tenantId,
          siteId
        );
      } else {
        await updateProductionEvent(
          confirmItem.item.id,
          { status: 'inactive' } as Partial<ProductionEvent>,
          tenantId,
          siteId
        );
      }
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setConfirmItem(null);
    }
  };

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      if (event.status !== 'active') return false;

      if (selectedLineId !== 'ALL' && event.productionLineId !== selectedLineId) {
        return false;
      }

      if (statusFilter !== 'ALL') {
        if (statusFilter === 'ACTIVE' && !['RUNNING', 'ENDING', 'DELAYED', 'STOPPED'].includes(event.productionStatus)) {
          return false;
        }
        if (statusFilter === 'PLANNED' && event.productionStatus !== 'PLANNED') {
          return false;
        }
        if (statusFilter === 'DELAYED' && !['DELAYED', 'STOPPED'].includes(event.productionStatus)) {
          return false;
        }
        if (statusFilter === 'COMPLETE' && event.productionStatus !== 'COMPLETE') {
          return false;
        }
      }

      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesSku = event.productCodeSnapshot?.toLowerCase().includes(query);
        const matchesDesc = event.descriptionSnapshot?.toLowerCase().includes(query);
        const line = lines.find(l => l.id === event.productionLineId);
        const matchesLine = line?.lineName.toLowerCase().includes(query);
        if (!matchesSku && !matchesDesc && !matchesLine) {
          return false;
        }
      }

      return true;
    });
  }, [events, selectedLineId, statusFilter, searchTerm, lines]);

  // Metrics Calculations
  const activeRunsCount = useMemo(() => {
    return events.filter(e => e.status === 'active' && ['RUNNING', 'ENDING'].includes(e.productionStatus)).length;
  }, [events]);

  const delayedRunsCount = useMemo(() => {
    return events.filter(e => e.status === 'active' && ['DELAYED', 'STOPPED'].includes(e.productionStatus)).length;
  }, [events]);

  const totalRunsThisWeek = useMemo(() => {
    const startMs = currentWeekStart.getTime();
    const endMs = startMs + 7 * 24 * 60 * 60 * 1000;
    return events.filter(e => {
      if (e.status !== 'active') return false;
      const t = toEpochMillis(e.plannedStart);
      return t !== null && t >= startMs && t < endMs;
    }).length;
  }, [events, currentWeekStart]);

  const totalPlannedVolume = useMemo(() => {
    const startMs = currentWeekStart.getTime();
    const endMs = startMs + 7 * 24 * 60 * 60 * 1000;
    return events.reduce((sum, e) => {
      if (e.status !== 'active') return sum;
      const t = toEpochMillis(e.plannedStart);
      if (t !== null && t >= startMs && t < endMs) {
        return sum + (e.plannedQuantity || 0);
      }
      return sum;
    }, 0);
  }, [events, currentWeekStart]);

  const getLineName = (id: string) => lines.find(l => l.id === id)?.lineName || id;
  const getUomName = (id: string) => uoms.find(u => u.id === id)?.code || 'CS';

  const formatWeekRange = (start: Date) => {
    const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${start.getUTCDate()} ${months[start.getUTCMonth()]} – ${end.getUTCDate()} ${months[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
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

  // Table Columns
  const tableColumns = [
    { 
      header: 'Product', 
      accessor: (row: ProductionEvent) => (
        <div>
          <div className="font-mono font-bold text-slate-100">{row.productCodeSnapshot}</div>
          <div className="text-xs text-slate-400 truncate max-w-[220px]" title={row.descriptionSnapshot}>
            {row.descriptionSnapshot}
          </div>
        </div>
      )
    },
    { 
      header: 'Line', 
      accessor: (row: ProductionEvent) => (
        <span className="font-medium text-slate-200">{getLineName(row.productionLineId)}</span>
      )
    },
    { 
      header: 'Status', 
      accessor: (row: ProductionEvent) => getStatusBadge(row.productionStatus) 
    },
    { 
      header: 'Scheduled Window', 
      accessor: (row: ProductionEvent) => (
        <div className="text-xs text-slate-300">
          <div>Start: {toSafeDate(row.plannedStart).toLocaleDateString([], { month: 'short', day: 'numeric' })} {toSafeDate(row.plannedStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
          <div className="text-slate-400">Finish: {toSafeDate(row.plannedFinish).toLocaleDateString([], { month: 'short', day: 'numeric' })} {toSafeDate(row.plannedFinish).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
        </div>
      )
    },
    { 
      header: 'Target Output', 
      accessor: (row: ProductionEvent) => {
        const uom = getUomName(row.unitOfMeasureId);
        const planned = row.plannedQuantity || 0;
        const actual = row.actualQuantity || 0;
        return (
          <div className="text-xs">
            <span className="font-semibold text-slate-200">{planned.toLocaleString()} {uom}</span>
            {actual > 0 && (
              <div className="text-emerald-400 font-medium">Actual: {actual.toLocaleString()} {uom}</div>
            )}
          </div>
        );
      }
    },
    {
      header: 'Delay / Notes',
      accessor: (row: ProductionEvent) => {
        if (row.delayReason) {
          return (
            <span className="text-xs text-amber-300 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate max-w-[150px]">{row.delayReason}</span>
            </span>
          );
        }
        return <span className="text-xs text-slate-500 truncate max-w-[150px] block">{row.notes || '-'}</span>;
      }
    },
    {
      header: 'Actions',
      accessor: (row: ProductionEvent) => (
        <div className="flex items-center gap-1.5 justify-end">
          <button
            onClick={() => setDetailModalState({ isOpen: true, item: row })}
            className="px-2 py-1 text-xs text-brand-400 hover:text-brand-300 font-medium"
          >
            Details
          </button>

          {row.productionStatus === 'PLANNED' && (
            <button
              onClick={() => setActionModalState({ isOpen: true, item: row, actionType: 'START' })}
              className="p-1.5 text-emerald-400 hover:bg-slate-800 rounded transition-colors"
              title="Start Run"
            >
              <Play className="w-4 h-4" />
            </button>
          )}

          {['RUNNING', 'DELAYED'].includes(row.productionStatus) && (
            <>
              <button
                onClick={() => setActionModalState({ isOpen: true, item: row, actionType: 'UPDATE_QTY' })}
                className="p-1.5 text-slate-300 hover:bg-slate-800 rounded transition-colors"
                title="Update Actual Output"
              >
                <BarChart3 className="w-4 h-4" />
              </button>
              {row.productionStatus !== 'DELAYED' && (
                <button
                  onClick={() => setActionModalState({ isOpen: true, item: row, actionType: 'DELAY' })}
                  className="p-1.5 text-amber-400 hover:bg-slate-800 rounded transition-colors"
                  title="Log Delay"
                >
                  <Clock className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setActionModalState({ isOpen: true, item: row, actionType: 'COMPLETE' })}
                className="p-1.5 text-emerald-400 hover:bg-slate-800 rounded transition-colors"
                title="Complete Run"
              >
                <CheckCircle2 className="w-4 h-4" />
              </button>
            </>
          )}

          <button
            onClick={() => setModalState({ isOpen: true, item: row })}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded transition-colors"
            title="Edit Details"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      )
    }
  ];

  if (loading && events.length === 0) {
    return <LoadingState message="Loading Production Calendar & Schedules..." />;
  }

  if (error) {
    return <ErrorState message={error.message} />;
  }

  return (
    <div className="space-y-6">
      {/* Page Header with Breadcrumb and Macro Plan Link */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <span>Planning & Execution</span>
            <span>/</span>
            <span className="text-slate-200 font-semibold">Production Calendar</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
            Production Calendar & Execution
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-500/10 text-brand-400 font-semibold border border-brand-500/30">
              Visual Management
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Operational line calendar, shop floor batch execution, shift timeline, and real-time output tracking
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to="/planning/production-plan"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors shadow-sm"
            title="Open Weekly SAP Matrix & Ingestion"
          >
            <Layers className="w-4 h-4 text-cyan-400" />
            <span>Weekly SAP Matrix</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          </Link>

          <button
            onClick={handleSyncFromPlan}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors shadow-sm disabled:opacity-50"
            title="Import/Sync scheduled runs from Production Plan for this week"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-brand-400 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync SAP Plan'}</span>
          </button>

          <button
            onClick={() => setModalState({ isOpen: true })}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-brand-500 hover:bg-brand-400 text-slate-950 transition-colors shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>Plan Event</span>
          </button>
        </div>
      </div>

      {/* Action Notification Toast */}
      {actionNotice && (
        <div className={`p-3.5 rounded-xl border text-xs flex items-center justify-between transition-all animate-in fade-in duration-200 ${
          actionNotice.type === 'success' 
            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' 
            : actionNotice.type === 'info'
            ? 'bg-sky-950/40 border-sky-500/40 text-sky-300'
            : 'bg-red-950/40 border-red-500/40 text-red-300'
        }`}>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>{actionNotice.message}</span>
          </div>
          <button 
            onClick={() => setActionNotice(null)}
            className="p-1 hover:opacity-75 transition-opacity"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Stats Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase text-slate-400 tracking-wider">Active Running Lines</span>
            <div className="text-xl font-bold text-slate-100 mt-1 flex items-center gap-2">
              <span>{activeRunsCount}</span>
              <span className="text-xs font-normal text-slate-400">/ {lines.length} lines</span>
            </div>
          </div>
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase text-slate-400 tracking-wider">Runs Scheduled</span>
            <div className="text-xl font-bold text-cyan-400 mt-1">
              {totalRunsThisWeek} <span className="text-xs font-normal text-slate-400">this week</span>
            </div>
          </div>
          <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <CalendarCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase text-slate-400 tracking-wider">Planned Target Volume</span>
            <div className="text-xl font-bold text-slate-100 mt-1">
              {totalPlannedVolume.toLocaleString()} <span className="text-xs font-normal text-slate-400">cases</span>
            </div>
          </div>
          <div className="p-2 rounded-lg bg-brand-500/10 text-brand-400 border border-brand-500/20">
            <BarChart3 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase text-slate-400 tracking-wider">Line Stoppages / Delays</span>
            <div className="text-xl font-bold mt-1">
              {delayedRunsCount > 0 ? (
                <span className="text-amber-400">{delayedRunsCount} delayed</span>
              ) : (
                <span className="text-emerald-400 text-sm">Nominal (0)</span>
              )}
            </div>
          </div>
          <div className={`p-2 rounded-lg border ${delayedRunsCount > 0 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Primary Navigation & View Controls Bar */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* View Mode Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-lg border border-slate-800 shrink-0">
            <button
              onClick={() => setActiveTab('calendar')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'calendar'
                  ? 'bg-brand-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Weekly Calendar</span>
            </button>

            <button
              onClick={() => setActiveTab('timeline')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'timeline'
                  ? 'bg-brand-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Shift Timeline (24h)</span>
            </button>

            <button
              onClick={() => setActiveTab('execution')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'execution'
                  ? 'bg-brand-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Live Execution Board</span>
            </button>

            <button
              onClick={() => setActiveTab('table')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'table'
                  ? 'bg-brand-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>All Events List</span>
            </button>
          </div>

          {/* Calendar Week Navigation (visible for calendar view) */}
          {activeTab === 'calendar' && (
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevWeek}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                title="Previous Week"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="px-3.5 py-1.5 bg-slate-950 rounded-lg border border-slate-800 text-xs font-semibold text-slate-100 flex items-center gap-2">
                <CalendarIcon className="w-3.5 h-3.5 text-brand-400" />
                <span>{formatWeekRange(currentWeekStart)}</span>
              </div>

              <button
                onClick={handleNextWeek}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                title="Next Week"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={handleResetToCurrentWeek}
                className="text-xs font-medium text-brand-400 hover:text-brand-300 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 transition-colors ml-1"
              >
                Current Week
              </button>
            </div>
          )}
        </div>

        {/* Filters Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search SKU or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500"
              />
            </div>

            {/* Line Filter */}
            <select
              value={selectedLineId}
              onChange={(e) => setSelectedLineId(e.target.value)}
              className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500"
            >
              <option value="ALL">All Production Lines ({lines.length})</option>
              {lines.map(line => (
                <option key={line.id} value={line.id}>
                  {line.lineName} ({line.lineCode})
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Currently Running / Active</option>
              <option value="PLANNED">Planned Runs</option>
              <option value="DELAYED">Delayed / Stopped</option>
              <option value="COMPLETE">Completed</option>
            </select>
          </div>

          <div className="text-xs text-slate-400 font-medium">
            Showing <strong className="text-slate-200">{filteredEvents.length}</strong> events
          </div>
        </div>
      </div>

      {/* Main View Area */}
      {events.length === 0 ? (
        /* Empty State with Immediate Setup Guides */
        <div className="p-10 rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 text-center">
          <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center mx-auto mb-4">
            <CalendarIcon className="w-8 h-8" />
          </div>

          <h3 className="text-lg font-bold text-slate-100">
            No Production Events Scheduled Yet
          </h3>
          <p className="text-xs text-slate-400 max-w-lg mx-auto mt-1.5 mb-6">
            There are currently no active production runs for this site. You can generate calendar runs directly from your SAP Production Plan, generate a sample multi-line schedule to explore the system, or manually schedule a run.
          </p>

          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={handleSyncFromPlan}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-semibold transition-all shadow-md"
            >
              <RefreshCw className={`w-4 h-4 text-brand-400 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync from SAP Plan'}</span>
            </button>

            <button
              onClick={handleSeedSampleSchedule}
              disabled={isSeeding}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-slate-950 text-xs font-bold transition-all shadow-lg"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isSeeding ? 'Generating...' : 'Load Sample Schedule'}</span>
            </button>

            <button
              onClick={() => setModalState({ isOpen: true })}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Plan First Event</span>
            </button>
          </div>
        </div>
      ) : (
        <div>
          {/* Weekly Calendar Grid View */}
          {activeTab === 'calendar' && (
            <ProductionCalendarGrid
              gridDates={gridDates}
              lines={selectedLineId === 'ALL' ? lines : lines.filter(l => l.id === selectedLineId)}
              events={filteredEvents}
              uoms={uoms}
              onOpenDetails={(evt) => setDetailModalState({ isOpen: true, item: evt })}
              onTriggerAction={(evt, action) => setActionModalState({ isOpen: true, item: evt, actionType: action })}
              onPlanForSlot={(lineId, date) => setModalState({ isOpen: true, initialLineId: lineId, initialDate: date })}
            />
          )}

          {/* 24-Hour Shift Timeline View */}
          {activeTab === 'timeline' && (
            <ProductionTimelineView
              selectedDate={timelineDate}
              onChangeDate={setTimelineDate}
              lines={selectedLineId === 'ALL' ? lines : lines.filter(l => l.id === selectedLineId)}
              events={filteredEvents}
              uoms={uoms}
              onOpenDetails={(evt) => setDetailModalState({ isOpen: true, item: evt })}
              onTriggerAction={(evt, action) => setActionModalState({ isOpen: true, item: evt, actionType: action })}
              onPlanForSlot={(lineId, date) => setModalState({ isOpen: true, initialLineId: lineId, initialDate: date })}
            />
          )}

          {/* Live Shop Floor Execution Board */}
          {activeTab === 'execution' && (
            <ProductionLiveExecutionView
              events={filteredEvents}
              lines={lines}
              uoms={uoms}
              onOpenDetails={(evt) => setDetailModalState({ isOpen: true, item: evt })}
              onTriggerAction={(evt, action) => setActionModalState({ isOpen: true, item: evt, actionType: action })}
              onPlanNew={() => setModalState({ isOpen: true })}
            />
          )}

          {/* Tabular List View */}
          {activeTab === 'table' && (
            <SectionCard title="Production Events Directory">
              <DataTable
                columns={tableColumns}
                data={filteredEvents}
                keyExtractor={(row) => row.id || ''}
                emptyMessage="No production events match the active search or filters."
              />
            </SectionCard>
          )}
        </div>
      )}

      {/* Modals */}
      <ProductionEventModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false })}
        item={modalState.item}
        lines={lines}
        uoms={uoms}
        initialLineId={modalState.initialLineId}
        initialDate={modalState.initialDate}
      />

      <ProductionActionModal
        isOpen={actionModalState.isOpen}
        onClose={() => setActionModalState({ isOpen: false })}
        item={actionModalState.item}
        actionType={actionModalState.actionType}
        uoms={uoms}
      />

      <ProductionRunDetailModal
        isOpen={detailModalState.isOpen}
        onClose={() => setDetailModalState({ isOpen: false })}
        event={detailModalState.item}
        lines={lines}
        uoms={uoms}
        onTriggerAction={(evt, action) => setActionModalState({ isOpen: true, item: evt, actionType: action })}
        onEdit={(evt) => setModalState({ isOpen: true, item: evt })}
      />

      <ConfirmationDialog
        isOpen={!!confirmItem}
        title={confirmItem?.action === 'cancel' ? 'Cancel Production Event' : 'Delete Production Event'}
        message={
          confirmItem?.action === 'cancel'
            ? 'Are you sure you want to mark this production event as cancelled?'
            : 'Are you sure you want to remove this production event from the schedule?'
        }
        confirmLabel={confirmItem?.action === 'cancel' ? 'Cancel Event' : 'Delete'}
        confirmVariant={confirmItem?.action === 'cancel' ? 'warning' : 'danger'}
        onConfirm={confirmAction}
        onCancel={() => setConfirmItem(null)}
      />
    </div>
  );
};

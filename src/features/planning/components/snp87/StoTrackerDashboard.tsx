import React, { useState, useEffect, useMemo } from 'react';
import { 
  Truck, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  Search, 
  Calendar, 
  Package, 
  Filter, 
  ShieldCheck, 
  Edit2,
  Sliders,
  CheckSquare,
  Square,
  Info,
  Layers,
  ArrowUpRight,
  X,
  Repeat
} from 'lucide-react';
import { NorthfleetStoRequirement, ProductionPlanEntry } from '../../../../types/production';
import { Product } from '../../../../types/product';
import { 
  StoFeasibility, 
  updateStoDispatchControl, 
  updateNorthfleetStoRequirement, 
  substituteStoProduct,
  getEligibleSubstituteProducts,
  EligibleSubstituteProduct
} from '../../services/northfleetStoService';
import { getDocuments, where } from '../../../../services/dbService';
import { useDataFreshness } from '../../context/DataFreshnessContext';

interface StoTrackerDashboardProps {
  requirements: NorthfleetStoRequirement[];
  feasibilityMap: Map<string, StoFeasibility>;
  tenantId: string;
  siteId: string;
  userId: string;
  onRefresh: () => void;
}

export const StoTrackerDashboard: React.FC<StoTrackerDashboardProps> = ({
  requirements,
  feasibilityMap,
  tenantId,
  siteId,
  userId,
  onRefresh
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<'ALL' | 'AUTOMATIC' | 'MANUAL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'DESPATCHED' | 'HOLD' | 'GREEN' | 'AMBER' | 'RED' | 'SUBSTITUTED'>('ALL');
  const [weekFilter, setWeekFilter] = useState<string>('ALL');
  const [dateFilterMode, setDateFilterMode] = useState<'ALL' | 'TODAY' | 'THIS_WEEK'>('ALL');

  // Date override modal state
  const [editingDateSto, setEditingDateSto] = useState<NorthfleetStoRequirement | null>(null);
  const [overrideDeliveryDate, setOverrideDeliveryDate] = useState<string>('');

  // Product substitution modal state
  const [substitutingSto, setSubstitutingSto] = useState<NorthfleetStoRequirement | null>(null);
  const [eligibleSubstituteProducts, setEligibleSubstituteProducts] = useState<EligibleSubstituteProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState<boolean>(false);
  const [substituteSearch, setSubstituteSearch] = useState<string>('');
  const [selectedSubstituteId, setSelectedSubstituteId] = useState<string>('');
  const [retainBacklog, setRetainBacklog] = useState<boolean>(true);
  const [isSubmittingSubstitute, setIsSubmittingSubstitute] = useState<boolean>(false);
  const [substitutionError, setSubstitutionError] = useState<string | null>(null);

  // Product summary modal state (when clicking or hovering product code)
  const [selectedProductSummary, setSelectedProductSummary] = useState<{
    productCode: string;
    description?: string;
    productId?: string;
  } | null>(null);

  // Production plan entries for product summary
  const [productionEntries, setProductionEntries] = useState<ProductionPlanEntry[]>([]);
  const [isLoadingProduction, setIsLoadingProduction] = useState<boolean>(false);

  // Fetch production plan entries for summary
  useEffect(() => {
    const fetchProdEntries = async () => {
      if (!tenantId || !siteId) return;
      setIsLoadingProduction(true);
      try {
        const entries = await getDocuments<ProductionPlanEntry>('productionPlanEntries', [
          where('tenantId', '==', tenantId),
          where('siteId', '==', siteId)
        ]);
        setProductionEntries(entries);
      } catch (err) {
        console.error('Failed to load production plan entries for STO tracker:', err);
      } finally {
        setIsLoadingProduction(false);
      }
    };
    fetchProdEntries();
  }, [tenantId, siteId]);

  // Format date helper
  const formatDate = (dateVal: any) => {
    if (!dateVal) return 'N/A';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return String(dateVal);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return String(dateVal);
    }
  };

  // Helper to check if date is today
  const isToday = (dateVal: any) => {
    if (!dateVal) return false;
    try {
      const d = new Date(dateVal);
      const today = new Date();
      return d.getFullYear() === today.getFullYear() &&
             d.getMonth() === today.getMonth() &&
             d.getDate() === today.getDate();
    } catch {
      return false;
    }
  };

  // Helper to get week key for filtering & grouping
  const getWeekKey = (dateVal: any) => {
    if (!dateVal) return '';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return '';
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d);
      monday.setDate(diff);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const fmt = (dt: Date) => dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      return `Week of ${fmt(monday)} - ${fmt(sunday)} (${monday.getFullYear()})`;
    } catch {
      return '';
    }
  };

  // Extract unique weeks for filter dropdown (based on Barrow Collection)
  const availableWeeks = useMemo(() => {
    const weeksSet = new Set<string>();
    requirements.forEach(req => {
      const wkCol = getWeekKey(req.barrowCollectionDate);
      if (wkCol) weeksSet.add(wkCol);
    });
    return Array.from(weeksSet).sort();
  }, [requirements]);

  // Metrics summary
  const metrics = useMemo(() => {
    const total = requirements.length;
    let pending = 0;
    let dispatched = 0;
    let manualCount = 0;
    let shipReady = 0;

    requirements.forEach(req => {
      const isManual = req.dispatchMode === 'MANUAL';
      if (isManual) manualCount++;

      const manualSt = req.manualStatus || 'PENDING';
      if (isManual && manualSt === 'DESPATCHED') {
        dispatched++;
      } else if (!isManual && req.status === 'ASSUMED_DISPATCHED') {
        dispatched++;
      } else {
        pending++;
      }

      const feas = feasibilityMap.get(req.id);
      if (feas && feas.feasibilityStatus === 'GREEN' && !feas.isDespatched) {
        shipReady++;
      }
    });

    return { total, pending, dispatched, manualCount, shipReady };
  }, [requirements, feasibilityMap]);

  // Filtered requirements
  const filteredRequirements = useMemo(() => {
    return requirements.filter(req => {
      // Search query
      const matchesSearch = 
        req.stoNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.productCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (req.productDescriptionSnapshot && req.productDescriptionSnapshot.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      // Mode filter
      if (modeFilter !== 'ALL' && (req.dispatchMode || 'AUTOMATIC') !== modeFilter) {
        return false;
      }

      // Status filter
      if (statusFilter !== 'ALL') {
        const manualSt = req.manualStatus || 'PENDING';
        const feas = feasibilityMap.get(req.id);

        if (statusFilter === 'PENDING' && (manualSt === 'DESPATCHED' || req.status === 'ASSUMED_DISPATCHED')) return false;
        if (statusFilter === 'DESPATCHED' && !(manualSt === 'DESPATCHED' || req.status === 'ASSUMED_DISPATCHED')) return false;
        if (statusFilter === 'HOLD' && manualSt !== 'HOLD') return false;
        if (statusFilter === 'GREEN' && (feas?.feasibilityStatus !== 'GREEN' || feas?.isDespatched)) return false;
        if (statusFilter === 'AMBER' && feas?.feasibilityStatus !== 'AMBER') return false;
        if (statusFilter === 'RED' && feas?.feasibilityStatus !== 'RED') return false;
        if (statusFilter === 'SUBSTITUTED' && !(req.substitutedProductCode || (req.originalProductCode && req.originalProductCode !== req.productCode))) return false;
      }

      // Date / Week filter mode (based on Barrow Collection date)
      if (dateFilterMode === 'TODAY') {
        if (!isToday(req.barrowCollectionDate)) return false;
      } else if (dateFilterMode === 'THIS_WEEK') {
        const currentWeekKey = getWeekKey(new Date());
        const wkCol = getWeekKey(req.barrowCollectionDate);
        if (wkCol !== currentWeekKey) {
          return false;
        }
      } else if (weekFilter !== 'ALL') {
        const wkCol = getWeekKey(req.barrowCollectionDate);
        if (wkCol !== weekFilter) {
          return false;
        }
      }

      return true;
    });
  }, [requirements, feasibilityMap, searchQuery, modeFilter, statusFilter, weekFilter, dateFilterMode]);

  // Handle Mode Toggle
  const handleToggleMode = async (req: NorthfleetStoRequirement) => {
    const newMode = req.dispatchMode === 'MANUAL' ? 'AUTOMATIC' : 'MANUAL';
    const newStatus = newMode === 'MANUAL' ? (req.manualStatus || 'PENDING') : undefined;
    const res = await updateStoDispatchControl(tenantId, siteId, req.id, newMode, newStatus, userId);
    if (res.success) {
      onRefresh();
    } else {
      alert(`Failed to update mode: ${res.error}`);
    }
  };

  // Handle Status Change
  const handleStatusChange = async (req: NorthfleetStoRequirement, manualStatus: 'PENDING' | 'DESPATCHED' | 'HOLD') => {
    const res = await updateStoDispatchControl(tenantId, siteId, req.id, 'MANUAL', manualStatus, userId);
    if (res.success) {
      onRefresh();
    } else {
      alert(`Failed to update status: ${res.error}`);
    }
  };

  // Handle Date Override Save
  const handleSaveDateOverride = async () => {
    if (!editingDateSto || !overrideDeliveryDate) return;
    const newDelDate = new Date(overrideDeliveryDate);
    const newCollDate = new Date(newDelDate.getTime() - 24 * 60 * 60 * 1000);

    const res = await updateNorthfleetStoRequirement(
      tenantId,
      siteId,
      editingDateSto.id,
      {
        northfleetDeliveryDate: newDelDate.toISOString(),
        barrowCollectionDate: newCollDate.toISOString()
      },
      userId
    );

    if (res.success) {
      setEditingDateSto(null);
      setOverrideDeliveryDate('');
      onRefresh();
    } else {
      alert(`Failed to override date: ${res.error}`);
    }
  };

  // Handle Open Substitute Modal
  const handleOpenSubstitute = async (sto: NorthfleetStoRequirement) => {
    setSubstitutingSto(sto);
    setSelectedSubstituteId('');
    setSubstituteSearch('');
    setRetainBacklog(true);
    setSubstitutionError(null);
    setIsLoadingProducts(true);
    try {
      const candidates = await getEligibleSubstituteProducts(tenantId, siteId, sto);
      setEligibleSubstituteProducts(candidates);
    } catch (err: any) {
      console.error('Failed to load eligible products for substitution:', err);
      setSubstitutionError('Failed to load eligible products: ' + (err.message || 'Unknown error'));
    } finally {
      setIsLoadingProducts(false);
    }
  };

  // Handle Confirm Substitution
  const handleConfirmSubstitution = async () => {
    if (!substitutingSto || !selectedSubstituteId) return;
    const targetItem = eligibleSubstituteProducts.find(item => item.product.id === selectedSubstituteId);
    if (!targetItem) return;

    if (!targetItem.isEligible) {
      setSubstitutionError(targetItem.ineligibilityReason || 'Selected product does not meet the 52 available pallets rule or would breach protected reserves.');
      return;
    }

    setIsSubmittingSubstitute(true);
    setSubstitutionError(null);

    const res = await substituteStoProduct({
      tenantId,
      siteId,
      stoId: substitutingSto.id,
      newProductId: targetItem.product.id,
      newProductCode: targetItem.product.productCode,
      newProductDescription: targetItem.product.description,
      newCasesPerPallet: targetItem.casesPerPallet,
      retainOriginalBacklog: retainBacklog,
      userId
    });

    setIsSubmittingSubstitute(false);
    if (res.success) {
      setSubstitutingSto(null);
      onRefresh();
    } else {
      setSubstitutionError(res.error || 'Failed to substitute product');
    }
  };

  // Matching production entries for selected product summary (Current / Today and Next / Future runs only, no historical)
  const matchingProductionEntries = useMemo(() => {
    if (!selectedProductSummary) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return productionEntries.filter(e => {
      if (!e.productionDate) return false;
      const d = new Date(e.productionDate);
      if (isNaN(d.getTime())) return false;
      d.setHours(0, 0, 0, 0);
      // Exclude historical / past production dates
      return d.getTime() >= today.getTime() && (
        e.productId === selectedProductSummary.productId || 
        e.productCodeSnapshot?.toLowerCase() === selectedProductSummary.productCode.toLowerCase()
      );
    }).sort((a, b) => new Date(a.productionDate || 0).getTime() - new Date(b.productionDate || 0).getTime());
  }, [productionEntries, selectedProductSummary]);

  const { summary } = useDataFreshness();

  // Check if STO (Thursday) or Production Plan (Monday) have been updated this week
  const recentMondayEpoch = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    let diff = 1 - day;
    if (diff > 0) diff -= 7;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const recentThursdayEpoch = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    let diff = 4 - day;
    if (diff > 0) diff -= 7;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const planUpdatedThisWeek = summary?.items?.productionPlan?.updatedAtMillis && summary.items.productionPlan.updatedAtMillis >= recentMondayEpoch;
  const stoUpdatedThisWeek = summary?.items?.sto?.updatedAtMillis && summary.items.sto.updatedAtMillis >= recentThursdayEpoch;

  return (
    <div className="space-y-6">
      {/* Weekly Update Schedule Notice Banner */}
      {(!planUpdatedThisWeek || !stoUpdatedThisWeek) && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3 text-amber-200 shadow-sm">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs sm:text-sm">
            <p className="font-semibold text-amber-300">Weekly Update Schedule Notice</p>
            <p className="mt-0.5 text-amber-200/90">
              {!planUpdatedThisWeek && !stoUpdatedThisWeek
                ? 'Both the Production Plan (scheduled Monday) and STO Requirements (scheduled Thursday) have not been updated for the current weekly schedule.'
                : !planUpdatedThisWeek
                ? 'The Production Plan (scheduled weekly on Monday) has not been refreshed for this week.'
                : 'The STO Requirements (scheduled weekly on Thursday) has not been refreshed for this week.'}
            </p>
          </div>
        </div>
      )}

      {/* Header & Dashboard Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Total STOs</p>
            <h3 className="text-2xl font-bold text-slate-100 mt-1">{metrics.total}</h3>
          </div>
          <div className="p-3 bg-indigo-950 text-indigo-400 rounded-lg border border-indigo-900">
            <Truck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Pending / Upcoming</p>
            <h3 className="text-2xl font-bold text-amber-400 mt-1">{metrics.pending}</h3>
          </div>
          <div className="p-3 bg-amber-950 text-amber-400 rounded-lg border border-amber-900">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Dispatched / Sent</p>
            <h3 className="text-2xl font-bold text-emerald-400 mt-1">{metrics.dispatched}</h3>
          </div>
          <div className="p-3 bg-emerald-950 text-emerald-400 rounded-lg border border-emerald-900">
            <CheckCircle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Manual Tracking</p>
            <h3 className="text-2xl font-bold text-purple-400 mt-1">{metrics.manualCount}</h3>
          </div>
          <div className="p-3 bg-purple-950 text-purple-400 rounded-lg border border-purple-900">
            <Sliders className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Ship-Ready (Stock OK)</p>
            <h3 className="text-2xl font-bold text-teal-400 mt-1">{metrics.shipReady}</h3>
          </div>
          <div className="p-3 bg-teal-950 text-teal-400 rounded-lg border border-teal-900">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search STO # or Product Code..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-lg pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Quick Date Filters */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 p-1 rounded-lg">
            <button
              onClick={() => setDateFilterMode('ALL')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${dateFilterMode === 'ALL' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              All
            </button>
            <button
              onClick={() => setDateFilterMode('TODAY')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${dateFilterMode === 'TODAY' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Today
            </button>
            <button
              onClick={() => setDateFilterMode('THIS_WEEK')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${dateFilterMode === 'THIS_WEEK' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              This Week
            </button>
          </div>

          {/* Week Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase text-slate-400">Week:</span>
            <select
              value={weekFilter}
              onChange={e => setWeekFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 font-medium focus:ring-2 focus:ring-indigo-500 max-w-[200px] truncate"
            >
              <option value="ALL">All Weeks</option>
              {availableWeeks.map(wk => (
                <option key={wk} value={wk}>{wk}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase text-slate-400">Mode:</span>
            <select
              value={modeFilter}
              onChange={e => setModeFilter(e.target.value as any)}
              className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 font-medium focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Modes</option>
              <option value="AUTOMATIC">Automatic</option>
              <option value="MANUAL">Manual Override</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase text-slate-400">Status:</span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 font-medium focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="DESPATCHED">Despatched</option>
              <option value="HOLD">On Hold</option>
              <option value="GREEN">Ship-Ready (Green)</option>
              <option value="AMBER">Partial Stock (Amber)</option>
              <option value="RED">Out of Stock (Red)</option>
              <option value="SUBSTITUTED">Substituted STOs</option>
            </select>
          </div>

          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-semibold transition-colors border border-slate-600"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* STO Tracker Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-900/60">
          <div>
            <h3 className="text-base font-bold text-slate-100">Northfleet STO Execution Tracker</h3>
            <p className="text-xs text-slate-400">
              Manage dispatch status, override delivery dates, and monitor stock feasibility. Click product codes for production summaries.
            </p>
          </div>
          <span className="text-xs px-3 py-1 bg-indigo-950 text-indigo-300 border border-indigo-800 rounded-full font-semibold">
            Showing {filteredRequirements.length} of {requirements.length} STOs
          </span>
        </div>

        {filteredRequirements.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Truck className="w-10 h-10 mx-auto text-slate-500 mb-2" />
            <p className="font-semibold text-slate-200">No STOs match your filter criteria.</p>
            <p className="text-xs text-slate-500 mt-1">Try resetting search, week, or filter options.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-300">
              <thead className="bg-slate-900/90 border-b border-slate-700 text-xs uppercase font-semibold text-slate-300">
                <tr>
                  <th className="px-4 py-3">STO #</th>
                  <th className="px-4 py-3">Product (Click for Plan)</th>
                  <th className="px-4 py-3">Barrow Collection</th>
                  <th className="px-4 py-3">Northfleet Delivery</th>
                  <th className="px-4 py-3 text-right">Cases</th>
                  <th className="px-4 py-3 text-right">Pallets</th>
                  <th className="px-4 py-3">Control Mode</th>
                  <th className="px-4 py-3">Dispatch Status</th>
                  <th className="px-4 py-3">Ship-Ready Feasibility</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {filteredRequirements.map(req => {
                  const isManual = req.dispatchMode === 'MANUAL';
                  const manualSt = req.manualStatus || 'PENDING';
                  const feas = feasibilityMap.get(req.id);
                  const isSubstituted = Boolean(req.substitutedProductCode || (req.originalProductCode && req.originalProductCode !== req.productCode));

                  return (
                    <tr key={req.id} className="hover:bg-slate-700/50 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-slate-100">
                        {req.stoNumber}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedProductSummary({
                            productCode: req.productCode,
                            description: req.productDescriptionSnapshot,
                            productId: req.productId
                          })}
                          className="group text-left focus:outline-none"
                          title="Click to view production schedule & replenishment summary"
                        >
                          <div className="font-semibold text-indigo-400 group-hover:text-indigo-300 underline underline-offset-2 flex items-center gap-1">
                            {req.productCode}
                            <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <div className="text-xs text-slate-400 truncate max-w-xs">
                            {req.productDescriptionSnapshot || 'Product'}
                          </div>
                        </button>
                        {isSubstituted && (
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            <span 
                              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-950/90 text-purple-300 border border-purple-700/80 shadow-sm"
                              title={`Substituted from ${req.originalProductCode || 'Original SKU'}${req.substitutionDate ? ` on ${formatDate(req.substitutionDate)}` : ''}${req.isBacklogRetained ? ' • Original demand kept on backlog' : ''}`}
                            >
                              <Repeat className="w-2.5 h-2.5 text-purple-400" />
                              Substituted (Orig: {req.originalProductCode || 'N/A'})
                            </span>
                            {req.isBacklogRetained && (
                              <span 
                                className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-950/80 text-indigo-300 border border-indigo-700/60"
                                title="Original product demand remains active on deferred backlog for future production/stock"
                              >
                                Backlog Retained
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-200 font-medium">
                        {formatDate(req.barrowCollectionDate)}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {formatDate(req.northfleetDeliveryDate)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-100">
                        {req.cases.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-300">
                        {req.pallets.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggleMode(req)}
                          className={`px-2.5 py-1 rounded text-xs font-semibold border transition-colors ${
                            isManual
                              ? 'bg-purple-950 text-purple-300 border-purple-800'
                              : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
                          }`}
                          title="Switch between Automatic date projection and Manual shop-floor tracking"
                        >
                          {isManual ? 'Manual Override' : 'Automatic'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {isManual ? (
                          <select
                            value={manualSt}
                            onChange={e => handleStatusChange(req, e.target.value as any)}
                            className={`text-xs font-semibold rounded px-2.5 py-1 border focus:ring-1 focus:ring-indigo-500 ${
                              manualSt === 'DESPATCHED'
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                : manualSt === 'HOLD'
                                ? 'bg-rose-950 text-rose-300 border-rose-800'
                                : 'bg-amber-950 text-amber-300 border-amber-800'
                            }`}
                          >
                            <option value="PENDING">Pending Dispatch</option>
                            <option value="DESPATCHED">Despatched (Checked)</option>
                            <option value="HOLD">On Hold</option>
                          </select>
                        ) : (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
                            req.status === 'ASSUMED_DISPATCHED'
                              ? 'bg-slate-700 text-slate-300 border-slate-600'
                              : req.status === 'DUE_FOR_COLLECTION'
                              ? 'bg-amber-950 text-amber-300 border-amber-800'
                              : 'bg-blue-950 text-blue-300 border-blue-800'
                          }`}>
                            {req.status === 'ASSUMED_DISPATCHED' ? 'Assumed Sent' : req.status === 'DUE_FOR_COLLECTION' ? 'Due Today' : 'Upcoming'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {feas ? (
                          feas.isDespatched ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700" title="Already despatched or assumed sent (does not consume pending on-hand stock)">
                              <CheckCircle className="w-3.5 h-3.5 text-slate-400" />
                              Despatched
                            </span>
                          ) : feas.feasibilityStatus === 'GREEN' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60" title={`Allocated: ${feas.allocatedCases ?? feas.requiredCases} cases (Initial Stock: ${feas.availableStockCases} c)`}>
                              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                              Ready ({feas.allocatedCases ?? feas.requiredCases} c)
                            </span>
                          ) : feas.feasibilityStatus === 'AMBER' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/60" title={`Partial stock: ${feas.allocatedCases ?? 0} of ${feas.requiredCases} cases available (Shortfall: ${feas.shortfallCases ?? 0} c)`}>
                              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                              Partial ({feas.allocatedCases ?? 0} / {feas.requiredCases} c)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-950/80 text-red-300 border border-red-800/60" title={`Out of stock: shortfall of ${feas.shortfallCases ?? feas.requiredCases} cases (Initial Stock: ${feas.availableStockCases} c)`}>
                              <span className="w-2 h-2 rounded-full bg-red-400"></span>
                              Out of Stock {feas.shortfallCases ? `(-${feas.shortfallCases} c)` : ''}
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-slate-500">Checking...</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => {
                              setEditingDateSto(req);
                              if (req.northfleetDeliveryDate) {
                                const d = new Date(req.northfleetDeliveryDate);
                                setOverrideDeliveryDate(d.toISOString().split('T')[0]);
                              }
                            }}
                            className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-700 rounded transition-colors inline-flex items-center gap-1 text-xs"
                            title="Manually override automated Delivery date assumption"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span className="hidden lg:inline">Date</span>
                          </button>
                          <button
                            onClick={() => handleOpenSubstitute(req)}
                            className="p-1.5 text-slate-400 hover:text-purple-400 hover:bg-slate-700 rounded transition-colors inline-flex items-center gap-1 text-xs"
                            title="Substitute with alternative product if original is unavailable"
                          >
                            <Repeat className="w-3.5 h-3.5" />
                            <span className="hidden lg:inline">Substitute</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Date Override Modal */}
      {editingDateSto && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 text-slate-100">
            <h3 className="text-lg font-bold text-slate-100">
              Override Delivery Date: STO {editingDateSto.stoNumber}
            </h3>
            <p className="text-sm text-slate-400">
              Product: <span className="font-semibold text-slate-200">{editingDateSto.productCode}</span>
            </p>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  New Northfleet Delivery Date
                </label>
                <input
                  type="date"
                  value={overrideDeliveryDate}
                  onChange={e => setOverrideDeliveryDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Barrow Collection Date will be automatically set to 1 day prior to Northfleet Delivery.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
              <button
                onClick={() => setEditingDateSto(null)}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDateOverride}
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
              >
                Save Date Override
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Substitution Modal */}
      {substitutingSto && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4 text-slate-100 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-950 text-purple-400 border border-purple-800 rounded-lg">
                  <Repeat className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    Substitute Product: STO {substitutingSto.stoNumber}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Assign alternative product when original SKU is unavailable
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSubstitutingSto(null)}
                className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto flex-1 pr-1">
              {/* Current / Original Product Card */}
              <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-3.5 space-y-1">
                <p className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Current Scheduled Product</p>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-mono font-bold text-sm text-indigo-400">{substitutingSto.productCode}</span>
                    <p className="text-xs text-slate-300">{substitutingSto.productDescriptionSnapshot || 'Product'}</p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-bold text-slate-200">{substitutingSto.cases.toLocaleString()} cases</p>
                    <p className="text-slate-400">{substitutingSto.pallets} pallets</p>
                  </div>
                </div>
                {substitutingSto.originalProductCode && substitutingSto.originalProductCode !== substitutingSto.productCode && (
                  <p className="text-[11px] text-purple-300 pt-1">
                    Originally requested as: <span className="font-mono font-bold">{substitutingSto.originalProductCode}</span>
                  </p>
                )}
              </div>

              {/* Alternative Product Selection with 52-pallet & Protected Reserve Guard */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Select Substitute Product
                  </label>
                  {!isLoadingProducts && (
                    <span className="text-[11px] text-emerald-400 font-medium">
                      {eligibleSubstituteProducts.filter(p => p.isEligible).length} product(s) meet ≥ 52 plts criteria
                    </span>
                  )}
                </div>

                {/* Protection Safeguard Policy Banner */}
                <div className="p-2.5 bg-slate-900/90 border border-slate-700/80 rounded-lg text-xs flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold text-slate-200 text-xs">Protected Inventory Safeguard Active</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Only showing products with <span className="font-semibold text-emerald-400">≥ 52 pallets available</span> that will <span className="font-semibold text-slate-200">not take away</span> from <span className="font-semibold text-amber-400">DDXM</span> or other protected <span className="font-semibold text-indigo-400">Northfleet STOs</span>.
                    </p>
                  </div>
                </div>
                
                {/* Search Bar for products */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search eligible substitutes by SKU or description..."
                    value={substituteSearch}
                    onChange={e => setSubstituteSearch(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-lg pl-9 pr-3 py-2 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>

                {isLoadingProducts ? (
                  <div className="p-6 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2 bg-slate-900/60 rounded-lg border border-slate-800">
                    <RefreshCw className="w-5 h-5 animate-spin text-purple-400" />
                    <span>Evaluating stock on hand against DDXM & STO protected reserves...</span>
                  </div>
                ) : (
                  (() => {
                    const eligibleList = eligibleSubstituteProducts.filter(item => item.isEligible);
                    const filteredList = eligibleList.filter(item => {
                      if (!substituteSearch.trim()) return true;
                      const q = substituteSearch.toLowerCase();
                      return item.product.productCode.toLowerCase().includes(q) || 
                        (item.product.description && item.product.description.toLowerCase().includes(q));
                    });

                    if (filteredList.length === 0) {
                      return (
                        <div className="p-6 text-center text-xs space-y-2 bg-slate-900/70 border border-slate-700/80 rounded-xl">
                          <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto" />
                          <p className="font-semibold text-slate-200">No Eligible Substitute Products Available</p>
                          <p className="text-[11px] text-slate-400 max-w-sm mx-auto leading-relaxed">
                            {eligibleList.length === 0
                              ? `None of the ${eligibleSubstituteProducts.length} alternative products currently have ≥ 52 available pallets without infringing on DDXM retention or other protected STO commitments.`
                              : `No products matching "${substituteSearch}" have ≥ 52 available pallets.`}
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div className="max-h-56 overflow-y-auto space-y-2 border border-slate-700/80 rounded-lg p-2 bg-slate-900/60">
                        {filteredList.map(item => {
                          const isSelected = selectedSubstituteId === item.product.id;
                          return (
                            <div
                              key={item.product.id}
                              onClick={() => setSelectedSubstituteId(item.product.id)}
                              className={`p-3 rounded-lg text-xs cursor-pointer transition-all border ${
                                isSelected
                                  ? 'bg-purple-950/70 border-purple-500 shadow-sm shadow-purple-950'
                                  : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800 hover:border-slate-600'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1 max-w-[70%]">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-sm text-slate-100">{item.product.productCode}</span>
                                    <span className="text-[10px] text-slate-400 font-mono">({item.casesPerPallet} c/plt)</span>
                                  </div>
                                  <p className="text-xs text-slate-300 line-clamp-1">{item.product.description}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-950 border border-emerald-600 text-emerald-300">
                                    <CheckCircle className="w-3 h-3 text-emerald-400" />
                                    {item.availablePallets} plts available
                                  </span>
                                  <p className="text-[10px] text-slate-400 mt-0.5">
                                    {item.availableCases.toLocaleString()} cases free
                                  </p>
                                </div>
                              </div>

                              {/* Stock and Protection Breakdown */}
                              <div className="mt-2.5 pt-2 border-t border-slate-700/60 grid grid-cols-3 gap-2 text-[11px] text-slate-400">
                                <div>
                                  <span className="text-slate-500 block text-[10px] uppercase">Physical On Hand</span>
                                  <span className="text-slate-200 font-mono font-medium">{item.totalOnHandCases.toLocaleString()} c</span>
                                  <span className="text-slate-500 text-[10px]"> ({item.totalOnHandPallets} plts)</span>
                                </div>
                                <div>
                                  <span className="text-amber-400/80 block text-[10px] uppercase font-semibold">Protected DDXM</span>
                                  <span className="text-amber-300 font-mono font-medium">{item.ddxmRetentionCases.toLocaleString()} c</span>
                                </div>
                                <div>
                                  <span className="text-indigo-400/80 block text-[10px] uppercase font-semibold">Protected STOs</span>
                                  <span className="text-indigo-300 font-mono font-medium">{item.otherStoProtectedCases.toLocaleString()} c</span>
                                </div>
                              </div>

                              {/* Selection Preview */}
                              {isSelected && (
                                <div className="mt-2.5 pt-2 border-t border-purple-800/60 text-[11px] text-purple-200 flex items-center justify-between">
                                  <span>
                                    Allocates <strong>{item.stoRequiredPallets} plts ({item.stoRequiredCases.toLocaleString()} c)</strong>
                                  </span>
                                  <span className="font-semibold text-emerald-300">
                                    Leaves {item.remainingPalletsAfterSub} plts unreserved
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()
                )}
              </div>

              {/* Deferred Backlog Retention Option */}
              <div className="bg-indigo-950/40 border border-indigo-900/60 rounded-xl p-3.5 space-y-1.5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={retainBacklog}
                    onChange={e => setRetainBacklog(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-xs font-semibold text-indigo-200 block">
                      Retain original product demand as Deferred Backlog
                    </span>
                    <span className="text-[11px] text-indigo-300/80 leading-normal block mt-0.5">
                      Northfleet originally ordered this product for a reason. Keep the demand active so it can be fulfilled to Northfleet once future production or stock is available.
                    </span>
                  </div>
                </label>
              </div>

              {substitutionError && (
                <div className="p-3 bg-rose-950/70 border border-rose-800 rounded-lg text-xs text-rose-300">
                  {substitutionError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-700">
              <button
                type="button"
                onClick={() => setSubstitutingSto(null)}
                className="px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedSubstituteId || isSubmittingSubstitute}
                onClick={handleConfirmSubstitution}
                className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              >
                {isSubmittingSubstitute ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Substituting...
                  </>
                ) : (
                  <>
                    <Repeat className="w-3.5 h-3.5" />
                    Confirm Substitution
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Production & Schedule Summary Modal */}
      {selectedProductSummary && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full p-6 space-y-5 text-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-700 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 bg-indigo-950 text-indigo-300 border border-indigo-800 rounded text-xs font-mono font-bold">
                    {selectedProductSummary.productCode}
                  </span>
                  <h3 className="text-lg font-bold text-slate-100">Product Production & Replenishment Summary</h3>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {selectedProductSummary.description || 'Detailed production schedule and expected availability for shop-floor decision making.'}
                </p>
              </div>
              <button
                onClick={() => setSelectedProductSummary(null)}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="space-y-4">
              <div className="bg-slate-900/80 border border-slate-700 rounded-lg p-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  Scheduled Production Runs (When to Expect & How Much)
                </h4>

                {isLoadingProduction ? (
                  <div className="py-6 text-center text-xs text-slate-400">Loading production schedule...</div>
                ) : matchingProductionEntries.length === 0 ? (
                  <div className="py-6 text-center text-slate-400 text-xs">
                    No scheduled production runs found for this product in the current plan.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {matchingProductionEntries.map((entry, idx) => (
                      <div key={entry.id || idx} className="bg-slate-800 border border-slate-700 rounded-lg p-3 flex items-center justify-between">
                        <div className="space-y-0.5">
                          <div className="text-xs font-semibold text-indigo-300 flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5" />
                            Production Date: {formatDate(entry.productionDate)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-emerald-400">
                            {(entry.plannedCases || 0).toLocaleString()} cases
                          </div>
                          <div className="text-xs text-slate-400">
                            ({(entry.plannedPallets || 0).toLocaleString()} pallets)
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Summary note */}
              <div className="bg-indigo-950/40 border border-indigo-900/60 rounded-lg p-3.5 text-xs text-indigo-300 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-indigo-200">Shop Floor Decision Support:</span> Use this production timing and expected quantity when managing out-of-sequence STOs or verifying stock readiness for Northfleet.
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-700">
              <button
                onClick={() => setSelectedProductSummary(null)}
                className="px-4 py-2 text-sm font-semibold text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                Close Summary
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

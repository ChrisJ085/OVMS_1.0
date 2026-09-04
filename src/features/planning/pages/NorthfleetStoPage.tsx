import React, { useState, useEffect, useMemo } from 'react';
import { 
  Truck, 
  Upload, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  Search, 
  Calendar, 
  Package, 
  Filter, 
  ShieldCheck, 
  Info, 
  ArrowRight,
  Clock,
  Trash2,
  Edit2,
  AlertCircle
} from 'lucide-react';
import { useSiteContext } from '../../../contexts/SiteContext';
import { useAuth } from '../../auth/context/AuthContext';
import { 
  parseNorthfleetStoPaste, 
  validateNorthfleetStoRows, 
  commitNorthfleetStoRequirements, 
  getNorthfleetStoRequirements, 
  cancelNorthfleetStoRequirement,
  updateNorthfleetStoRequirement,
  ValidatedStoRow 
} from '../services/northfleetStoService';
import { NorthfleetStoRequirement, NorthfleetStoStatus } from '../../../types/production';

export const NorthfleetStoPage: React.FC = () => {
  const { site, tenantId, siteId: ctxSiteId } = useSiteContext();
  const { user } = useAuth();
  const siteId = ctxSiteId || site?.id || 'site-1';

  // State
  const [pasteText, setPasteText] = useState('');
  const [activeYear, setActiveYear] = useState(new Date().getFullYear());
  const [validatedRows, setValidatedRows] = useState<ValidatedStoRow[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitSuccess, setCommitSuccess] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [importNotes, setImportNotes] = useState('');

  // Active requirements list state
  const [requirements, setRequirements] = useState<NorthfleetStoRequirement[]>([]);
  const [isLoadingRequirements, setIsLoadingRequirements] = useState(true);
  const [requirementsError, setRequirementsError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'REQUIREMENTS' | 'PASTE_IMPORT' | 'PRODUCT_SUMMARY'>('REQUIREMENTS');

  // Edit modal state
  const [editingSto, setEditingSto] = useState<NorthfleetStoRequirement | null>(null);
  const [editCases, setEditCases] = useState<number>(0);
  const [editPallets, setEditPallets] = useState<number>(0);

  // Load requirements on mount or site change
  const fetchRequirements = async () => {
    setIsLoadingRequirements(true);
    setRequirementsError(null);
    try {
      const data = await getNorthfleetStoRequirements(tenantId, siteId);
      setRequirements(data);
    } catch (err: any) {
      console.error('Failed to load Northfleet STO requirements:', err);
      setRequirementsError(err?.message || 'Unable to load Northfleet STO requirements');
    } finally {
      setIsLoadingRequirements(false);
    }
  };

  useEffect(() => {
    fetchRequirements();
  }, [tenantId, siteId]);

  // Handle parse & validate paste
  const handleValidate = async () => {
    if (!pasteText.trim()) return;
    setIsValidating(true);
    setCommitSuccess(null);
    setCommitError(null);

    const parsed = parseNorthfleetStoPaste(pasteText, activeYear);
    const validated = await validateNorthfleetStoRows(parsed, tenantId, siteId);
    setValidatedRows(validated);
    setIsValidating(false);
  };

  // Handle commit
  const handleCommit = async () => {
    if (validatedRows.length === 0) return;
    setIsCommitting(true);
    setCommitSuccess(null);
    setCommitError(null);

    const res = await commitNorthfleetStoRequirements(
      tenantId,
      siteId,
      validatedRows,
      user?.email || 'planner-user',
      importNotes
    );

    setIsCommitting(false);

    if (res.success && res.data) {
      setCommitSuccess(`Successfully committed STO requirements! (${res.data.committedCount} added, ${res.data.updatedCount} updated)`);
      setPasteText('');
      setValidatedRows([]);
      setImportNotes('');
      fetchRequirements();
      setActiveTab('REQUIREMENTS');
    } else {
      setCommitError(res.error || 'Failed to commit STO requirements.');
    }
  };

  // Handle Cancel STO
  const handleCancelSto = async (stoId: string) => {
    if (!window.confirm('Are you sure you want to cancel this STO requirement? Stock protection for this STO will be removed.')) {
      return;
    }
    const res = await cancelNorthfleetStoRequirement(tenantId, siteId, stoId, user?.email || 'planner-user');
    if (res.success) {
      fetchRequirements();
    } else {
      alert(`Error cancelling STO: ${res.error}`);
    }
  };

  // Handle Update STO
  const handleSaveEdit = async () => {
    if (!editingSto) return;
    const res = await updateNorthfleetStoRequirement(
      tenantId,
      siteId,
      editingSto.id,
      { cases: editCases, pallets: editPallets },
      user?.email || 'planner-user'
    );
    if (res.success) {
      setEditingSto(null);
      fetchRequirements();
    } else {
      alert(`Error updating STO: ${res.error}`);
    }
  };

  // Validation stats
  const validationStats = useMemo(() => {
    const total = validatedRows.length;
    const valid = validatedRows.filter(r => r.validationStatus === 'VALID' || r.validationStatus === 'WARNING' || r.validationStatus === 'DUPLICATE_STO' || r.validationStatus === 'EXISTING_STO_CHANGED').length;
    const warnings = validatedRows.filter(r => r.validationStatus === 'WARNING').length;
    const blocking = validatedRows.filter(r => r.validationStatus === 'UNKNOWN_PRODUCT' || r.validationStatus === 'INVALID_DATE' || r.validationStatus === 'INVALID_QUANTITY').length;
    return { total, valid, warnings, blocking };
  }, [validatedRows]);

  // Overall metrics from active requirements
  const metrics = useMemo(() => {
    const activeList = requirements.filter(r => r.status === 'UPCOMING' || r.status === 'DUE_FOR_COLLECTION');
    const totalCases = activeList.reduce((sum, r) => sum + (r.cases || 0), 0);
    const totalPallets = activeList.reduce((sum, r) => sum + (r.pallets || 0), 0);
    const affectedProducts = new Set(activeList.map(r => r.productCode)).size;

    // Earliest upcoming collection date
    let nextCollection: Date | null = null;
    activeList.forEach(r => {
      const d = (r.barrowCollectionDate as any)?.toDate ? (r.barrowCollectionDate as any).toDate() : new Date(r.barrowCollectionDate as any);
      if (!nextCollection || d < nextCollection) nextCollection = d;
    });

    return {
      count: activeList.length,
      affectedProducts,
      totalPallets,
      totalCases,
      nextCollection
    };
  }, [requirements]);

  // Filtered requirements
  const filteredRequirements = useMemo(() => {
    return requirements.filter(r => {
      const matchesSearch =
        r.stoNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.productCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.productDescriptionSnapshot && r.productDescriptionSnapshot.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [requirements, searchQuery, statusFilter]);

  // Product Summary Grouping
  const productSummaries = useMemo(() => {
    const map = new Map<string, { productCode: string; description: string; count: number; totalCases: number; totalPallets: number; upcomingCases: number; dueTodayCases: number }>();

    requirements.forEach(r => {
      if (r.status === 'CANCELLED' || r.status === 'ASSUMED_DISPATCHED') return;

      const key = r.productCode;
      const existing = map.get(key) || {
        productCode: r.productCode,
        description: r.productDescriptionSnapshot || r.productCode,
        count: 0,
        totalCases: 0,
        totalPallets: 0,
        upcomingCases: 0,
        dueTodayCases: 0
      };

      existing.count += 1;
      existing.totalCases += r.cases;
      existing.totalPallets += r.pallets;
      if (r.status === 'UPCOMING') existing.upcomingCases += r.cases;
      if (r.status === 'DUE_FOR_COLLECTION') existing.dueTodayCases += r.cases;

      map.set(key, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.totalCases - a.totalCases);
  }, [requirements]);

  const formatDate = (val: any): string => {
    if (!val) return 'N/A';
    const date = val?.toDate ? val.toDate() : new Date(val);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      {/* Header & Business Purpose */}
      <div className="bg-slate-800 rounded-xl shadow-sm border border-slate-700 p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2.5 bg-indigo-950/80 text-indigo-400 border border-indigo-800/60 rounded-lg">
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-100">Northfleet STO Requirements</h1>
                <p className="text-sm text-slate-400">
                  Committed dated demand logic protecting Barrow stock from incorrect overflow recommendations
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchRequirements}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-200 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Data
            </button>
            <button
              onClick={() => setActiveTab('PASTE_IMPORT')}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-sm"
            >
              <Upload className="w-4 h-4" />
              Import STO Data
            </button>
          </div>
        </div>

        {/* Business Logic Explanatory Banner */}
        <div className="mt-4 p-4 bg-indigo-950/50 border border-indigo-800/60 rounded-lg text-sm text-indigo-200">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-indigo-300">Core Recommendation Business Purpose:</p>
              <p>
                Northfleet STOs are <strong>committed dated demand</strong> that must be protected at Barrow warehouse.
                The OVMS recommendation engine calculates <span className="font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-indigo-700/80 text-indigo-200 font-bold">Total Protected Stock = Base Retention + Northfleet STO Demand + Promotions</span>.
                Only stock above Total Protected Stock is recommended to the product's configured overflow destination (e.g. Chorley). Northfleet STOs are <strong>never</strong> set as the overflow destination.
              </p>
            </div>
          </div>
        </div>

        {/* STO Read Failure Alert */}
        {requirementsError && (
          <div className="mt-4 p-4 bg-rose-950/70 border border-rose-800/80 rounded-lg text-sm text-rose-200 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-200">Unable to load Northfleet STO requirements</p>
                <p className="text-xs text-rose-300/90 mt-0.5">{requirementsError}</p>
                <p className="text-xs text-rose-300/70 mt-1">
                  Stock protection and STO commitment figures cannot be determined until database connectivity is restored.
                </p>
              </div>
            </div>
            <button
              onClick={fetchRequirements}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-rose-800 hover:bg-rose-700 text-rose-100 rounded-md transition-colors shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Active STOs</span>
            <Truck className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">{requirementsError ? '—' : metrics.count}</div>
          <div className="text-xs text-slate-400 mt-1">Outstanding commitments</div>
        </div>

        <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Affected Products</span>
            <Package className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">{requirementsError ? '—' : metrics.affectedProducts}</div>
          <div className="text-xs text-slate-400 mt-1">SKUs with STO protection</div>
        </div>

        <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Protected Cases</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">{requirementsError ? '—' : metrics.totalCases.toLocaleString()}</div>
          <div className="text-xs text-slate-400 mt-1">Cases held at Barrow</div>
        </div>

        <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Protected Pallets</span>
            <Package className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">{requirementsError ? '—' : metrics.totalPallets.toLocaleString()}</div>
          <div className="text-xs text-slate-400 mt-1">Pallets reserved</div>
        </div>

        <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Next Collection</span>
            <Calendar className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-lg font-bold text-slate-100">
            {requirementsError ? '—' : (metrics.nextCollection ? formatDate(metrics.nextCollection) : 'None')}
          </div>
          <div className="text-xs text-slate-400 mt-1">Barrow collection date</div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-slate-700 flex gap-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab('REQUIREMENTS')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'REQUIREMENTS'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Truck className="w-4 h-4" />
          Active STO Requirements {requirementsError ? '(!)' : `(${requirements.length})`}
        </button>
        <button
          onClick={() => setActiveTab('PASTE_IMPORT')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'PASTE_IMPORT'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Upload className="w-4 h-4" />
          Paste & Import STO Data
          {validatedRows.length > 0 && (
            <span className="ml-1 px-2 py-0.5 text-xs bg-indigo-950 text-indigo-300 border border-indigo-800/80 rounded-full font-bold">
              {validatedRows.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('PRODUCT_SUMMARY')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'PRODUCT_SUMMARY'
              ? 'border-indigo-500 text-indigo-400 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Product Protection Summary ({productSummaries.length})
        </button>
      </div>

      {/* TAB 1: ACTIVE REQUIREMENTS LIST */}
      {activeTab === 'REQUIREMENTS' && (
        <div className="bg-slate-800 rounded-xl shadow-sm border border-slate-700 overflow-hidden space-y-4 p-6">
          {/* Controls bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="relative flex-1 max-w-md w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search STO Number, Product Code, Description..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 text-slate-200 placeholder-slate-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <span className="text-sm text-slate-300 font-medium">Status:</span>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="border border-slate-700 rounded-lg text-sm px-3 py-2 bg-slate-900 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="UPCOMING">Upcoming</option>
                <option value="DUE_FOR_COLLECTION">Due For Collection Today</option>
                <option value="ASSUMED_DISPATCHED">Assumed Dispatched</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Table */}
          {isLoadingRequirements ? (
            <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
              <span>Loading Northfleet STO requirements...</span>
            </div>
          ) : requirementsError ? (
            <div className="p-12 text-center text-rose-300 bg-rose-950/40 rounded-xl border border-rose-800/80 space-y-3">
              <AlertCircle className="w-10 h-10 mx-auto text-rose-400" />
              <p className="font-semibold text-lg text-rose-200">Unable to load Northfleet STO requirements</p>
              <p className="text-sm text-rose-300/80 max-w-md mx-auto">
                {requirementsError}
              </p>
              <button
                onClick={fetchRequirements}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-rose-700 hover:bg-rose-600 rounded-lg transition-colors shadow-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Retry Loading
              </button>
            </div>
          ) : filteredRequirements.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-slate-900/50 rounded-xl border border-dashed border-slate-700">
              <Truck className="w-10 h-10 mx-auto text-slate-400 mb-2" />
              <p className="font-semibold text-slate-200">No STO Requirements Found</p>
              <p className="text-sm text-slate-400 mt-1">
                {requirements.length === 0
                  ? 'Paste and import Northfleet STO requirements using the "Paste & Import STO Data" tab.'
                  : 'No STO requirements match your current search and filter settings.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-700 rounded-lg">
              <table className="w-full text-sm text-left text-slate-300">
                <thead className="bg-slate-900/90 border-b border-slate-700 text-xs uppercase font-semibold text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Barrow Collection Date</th>
                    <th className="px-4 py-3">Northfleet Delivery Date</th>
                    <th className="px-4 py-3">STO Number</th>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3 text-right">Pallets</th>
                    <th className="px-4 py-3 text-right">Cases</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {filteredRequirements.map(req => {
                    return (
                      <tr key={req.id} className="hover:bg-slate-700/50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-100">
                          {formatDate(req.barrowCollectionDate)}
                          <span className="block text-xs text-slate-400 font-normal">
                            Delivery Date - 1 day
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-300">
                          {formatDate(req.northfleetDeliveryDate)}
                        </td>
                        <td className="px-4 py-3 font-mono font-medium text-slate-200">
                          {req.stoNumber}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-100">{req.productCode}</div>
                          <div className="text-xs text-slate-400 truncate max-w-xs">
                            {req.productDescriptionSnapshot || 'Product'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-300">
                          {req.pallets.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-100">
                          {req.cases.toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          {req.status === 'UPCOMING' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-950/80 text-blue-300 border border-blue-800/60">
                              <Clock className="w-3.5 h-3.5" />
                              Upcoming
                            </span>
                          )}
                          {req.status === 'DUE_FOR_COLLECTION' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/60">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Due Today
                            </span>
                          )}
                          {req.status === 'ASSUMED_DISPATCHED' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-700/80 text-slate-300 border border-slate-600">
                              <CheckCircle className="w-3.5 h-3.5" />
                              Dispatched
                            </span>
                          )}
                          {req.status === 'CANCELLED' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-950/80 text-red-300 border border-red-800/60">
                              <XCircle className="w-3.5 h-3.5" />
                              Cancelled
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {req.status !== 'CANCELLED' && (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => {
                                  setEditingSto(req);
                                  setEditCases(req.cases);
                                  setEditPallets(req.pallets);
                                }}
                                className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-700 rounded transition-colors"
                                title="Edit STO Quantity"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleCancelSto(req.id)}
                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-950/50 rounded transition-colors"
                                title="Cancel STO Requirement"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PASTE & IMPORT STO DATA */}
      {activeTab === 'PASTE_IMPORT' && (
        <div className="space-y-6">
          <div className="bg-slate-800 rounded-xl shadow-sm border border-slate-700 p-6 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-100">Paste Northfleet STO Requirements</h2>
                <p className="text-sm text-slate-400">
                  Copy and paste tab-delimited columns directly from Excel or SAP export.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-300">Active Planning Year:</span>
                <select
                  value={activeYear}
                  onChange={e => setActiveYear(parseInt(e.target.value, 10))}
                  className="border border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-slate-900 text-slate-200 font-medium focus:ring-2 focus:ring-indigo-500"
                >
                  <option value={2026}>2026</option>
                  <option value={2025}>2025</option>
                  <option value={2027}>2027</option>
                </select>
              </div>
            </div>

            {/* Structure Instructions */}
            <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-700 text-xs text-slate-300 font-mono">
              <strong className="text-slate-200">Required 6-Column Order:</strong> Delivery Date | STO Number | Product Code | Pallets | Cases | Cases/Pallet
              <br />
              <em className="text-slate-400">Example:</em> 14-Aug-2026 &nbsp;&nbsp; 4505115590 &nbsp;&nbsp; 3414254 &nbsp;&nbsp; 52 &nbsp;&nbsp; 3900 &nbsp;&nbsp; 75
            </div>

            {/* Paste box */}
            <textarea
              rows={8}
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder="Paste tab-delimited data here..."
              className="w-full p-4 font-mono text-xs bg-slate-900 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />

            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => {
                  setPasteText('');
                  setValidatedRows([]);
                  setCommitSuccess(null);
                  setCommitError(null);
                }}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg transition-colors"
              >
                Clear Box
              </button>

              <button
                onClick={handleValidate}
                disabled={!pasteText.trim() || isValidating}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition-colors shadow-sm"
              >
                {isValidating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Validate & Preview STO Data
              </button>
            </div>
          </div>

          {/* Messages */}
          {commitSuccess && (
            <div className="p-4 bg-emerald-950/80 border border-emerald-800/80 rounded-xl text-emerald-200 text-sm flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <span>{commitSuccess}</span>
            </div>
          )}

          {commitError && (
            <div className="p-4 bg-red-950/80 border border-red-800/80 rounded-xl text-red-200 text-sm flex items-center gap-3">
              <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <span>{commitError}</span>
            </div>
          )}

          {/* Validation Preview Section */}
          {validatedRows.length > 0 && (
            <div className="bg-slate-800 rounded-xl shadow-sm border border-slate-700 p-6 space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-100">Validation & Import Preview</h3>
                  <p className="text-sm text-slate-400">
                    Review row validation before committing STO requirements into OVMS
                  </p>
                </div>

                {/* Validation summary badges */}
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-slate-700 text-slate-200 border border-slate-600 rounded-full text-xs font-semibold">
                    Total: {validationStats.total}
                  </span>
                  <span className="px-3 py-1 bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 rounded-full text-xs font-semibold">
                    Valid: {validationStats.valid}
                  </span>
                  {validationStats.warnings > 0 && (
                    <span className="px-3 py-1 bg-amber-950/80 text-amber-300 border border-amber-800/60 rounded-full text-xs font-semibold">
                      Warnings: {validationStats.warnings}
                    </span>
                  )}
                  {validationStats.blocking > 0 && (
                    <span className="px-3 py-1 bg-red-950/80 text-red-300 border border-red-800/60 rounded-full text-xs font-semibold">
                      Blocking Errors: {validationStats.blocking}
                    </span>
                  )}
                </div>
              </div>

              {/* Preview Table */}
              <div className="overflow-x-auto border border-slate-700 rounded-lg">
                <table className="w-full text-sm text-left text-slate-300">
                  <thead className="bg-slate-900/90 border-b border-slate-700 text-xs uppercase font-semibold text-slate-300">
                    <tr>
                      <th className="px-3 py-2.5">Row</th>
                      <th className="px-3 py-2.5">Northfleet Del Date</th>
                      <th className="px-3 py-2.5">Barrow Coll Date</th>
                      <th className="px-3 py-2.5">STO Number</th>
                      <th className="px-3 py-2.5">Product Code & Description</th>
                      <th className="px-3 py-2.5 text-right">Pallets</th>
                      <th className="px-3 py-2.5 text-right">Cases</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Validation Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60 text-xs">
                    {validatedRows.map(row => {
                      return (
                        <tr
                          key={row.rowIndex}
                          className={
                            row.validationStatus === 'UNKNOWN_PRODUCT' || row.validationStatus === 'INVALID_DATE' || row.validationStatus === 'INVALID_QUANTITY'
                              ? 'bg-red-950/30 text-red-200'
                              : row.validationStatus === 'WARNING'
                              ? 'bg-amber-950/30 text-amber-200'
                              : row.validationStatus === 'EXISTING_STO_CHANGED'
                              ? 'bg-blue-950/30 text-blue-200'
                              : 'hover:bg-slate-700/50 text-slate-300'
                          }
                        >
                          <td className="px-3 py-2.5 font-mono text-slate-400">{row.rowIndex}</td>
                          <td className="px-3 py-2.5 font-medium text-slate-200">
                            {row.northfleetDeliveryDate ? formatDate(row.northfleetDeliveryDate) : row.deliveryDateStr}
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-slate-100">
                            {row.barrowCollectionDate ? formatDate(row.barrowCollectionDate) : 'N/A'}
                          </td>
                          <td className="px-3 py-2.5 font-mono font-medium text-slate-200">{row.stoNumber}</td>
                          <td className="px-3 py-2.5">
                            <div className="font-semibold text-slate-100">{row.productCode}</div>
                            <div className="text-slate-400 truncate max-w-xs">
                              {row.matchedProductDescription || (row.validationStatus === 'UNKNOWN_PRODUCT' ? 'Not Found in Product Master' : '')}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right text-slate-200">{row.pallets}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-slate-100">{row.cases}</td>
                          <td className="px-3 py-2.5">
                            {row.validationStatus === 'VALID' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                                Valid
                              </span>
                            )}
                            {row.validationStatus === 'WARNING' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/60">
                                Warning
                              </span>
                            )}
                            {row.validationStatus === 'DUPLICATE_STO' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-slate-700/80 text-slate-300 border border-slate-600">
                                Duplicate (Unchanged)
                              </span>
                            )}
                            {row.validationStatus === 'EXISTING_STO_CHANGED' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-blue-950/80 text-blue-300 border border-blue-800/60">
                                Update Existing
                              </span>
                            )}
                            {row.validationStatus === 'UNKNOWN_PRODUCT' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-950/80 text-red-300 border border-red-800/60">
                                Unknown SKU
                              </span>
                            )}
                            {(row.validationStatus === 'INVALID_DATE' || row.validationStatus === 'INVALID_QUANTITY') && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-950/80 text-red-300 border border-red-800/60">
                                Invalid Data
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-slate-400">
                            {row.validationMessages.join(' | ')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Import Notes & Commit Button */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-4 border-t border-slate-700">
                <input
                  type="text"
                  placeholder="Optional import notes (e.g., Week 33 SAP STO Batch)..."
                  value={importNotes}
                  onChange={e => setImportNotes(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                />

                <button
                  onClick={handleCommit}
                  disabled={isCommitting || validationStats.valid === 0 || validationStats.blocking > 0}
                  className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg transition-colors shadow-sm"
                >
                  {isCommitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Commit STO Requirements ({validationStats.valid} Valid Rows)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PRODUCT PROTECTION SUMMARY */}
      {activeTab === 'PRODUCT_SUMMARY' && (
        <div className="bg-slate-800 rounded-xl shadow-sm border border-slate-700 p-6 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Product Protection Summary</h2>
            <p className="text-sm text-slate-400">
              Active Northfleet STO protection per Product SKU calculated by the recommendation engine
            </p>
          </div>

          {isLoadingRequirements ? (
            <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
              <span>Loading Northfleet STO requirements...</span>
            </div>
          ) : requirementsError ? (
            <div className="p-12 text-center text-rose-300 bg-rose-950/40 rounded-xl border border-rose-800/80 space-y-3">
              <AlertCircle className="w-10 h-10 mx-auto text-rose-400" />
              <p className="font-semibold text-lg text-rose-200">Unable to load Northfleet STO requirements</p>
              <p className="text-sm text-rose-300/80 max-w-md mx-auto">{requirementsError}</p>
              <button
                onClick={fetchRequirements}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-rose-700 hover:bg-rose-600 rounded-lg transition-colors shadow-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Retry Loading
              </button>
            </div>
          ) : productSummaries.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              No active STO requirements loaded.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-700 rounded-lg">
              <table className="w-full text-sm text-left text-slate-300">
                <thead className="bg-slate-900/90 border-b border-slate-700 text-xs uppercase font-semibold text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Product Code</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Active STO Commitments</th>
                    <th className="px-4 py-3 text-right">Protected Cases</th>
                    <th className="px-4 py-3 text-right">Protected Pallets</th>
                    <th className="px-4 py-3 text-right">Due Today Cases</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {productSummaries.map(p => (
                    <tr key={p.productCode} className="hover:bg-slate-700/50">
                      <td className="px-4 py-3 font-mono font-bold text-slate-100">{p.productCode}</td>
                      <td className="px-4 py-3 font-medium text-slate-200">{p.description}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-300">{p.count}</td>
                      <td className="px-4 py-3 text-right font-bold text-indigo-300 bg-indigo-950/50">
                        {p.totalCases.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-200">{p.totalPallets.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-semibold text-amber-300">
                        {p.dueTodayCases.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editingSto && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 text-slate-100">
            <h3 className="text-lg font-bold text-slate-100">
              Edit STO Requirement: {editingSto.stoNumber}
            </h3>
            <p className="text-sm text-slate-400">
              Product: <span className="font-semibold text-slate-200">{editingSto.productCode}</span> ({editingSto.productDescriptionSnapshot})
            </p>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Cases Demand
                </label>
                <input
                  type="number"
                  value={editCases}
                  onChange={e => setEditCases(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Pallets
                </label>
                <input
                  type="number"
                  value={editPallets}
                  onChange={e => setEditPallets(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
              <button
                onClick={() => setEditingSto(null)}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

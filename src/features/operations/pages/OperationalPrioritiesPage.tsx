import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Priority } from '../../../types/priority';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { CheckCircle, Clock, AlertTriangle, Plus, Activity, Archive, CalendarDays, Ban, Edit2, ShieldAlert, ArrowRight, Trash2 } from 'lucide-react';
import { updatePriorityStatus, detectPriorityConflicts, deletePriority } from '../services/priorityService';
import { useAuth } from '../../auth/context/AuthContext';
import { useSiteContext } from '../../../contexts/SiteContext';
import { collections } from '../../configuration/services/configurationService';
import { Destination, ActionType, PriorityLevel } from '../../../types/configuration';
import { getActionTypeLabel, getDestinationLabel, getPriorityLevelLabel, formatQuantityInPallets } from '../utils/priorityFormatters';
import { PriorityConflict } from '../../../types/priority';
import { PriorityConflictModal } from '../components/PriorityConflictModal';
import { Product } from '../../../types/product';
import { subscribeToProducts } from '../../inventory/services/productService';
import { Timestamp, collection, db, onSnapshot, orderBy, query, subscribeToCollection, where } from '../../../services/firestoreBase';

const SUMMARY_TILES = [
  { id: 'active', label: 'Active', icon: <Activity className="w-5 h-5 mb-2 text-blue-400"/>, color: 'bg-blue-900/30 text-blue-200 border-blue-800' },
  { id: 'scheduled', label: 'Scheduled', icon: <CalendarDays className="w-5 h-5 mb-2 text-purple-400"/>, color: 'bg-purple-900/30 text-purple-200 border-purple-800' },
  { id: 'draft', label: 'Draft', icon: <Clock className="w-5 h-5 mb-2 text-slate-400"/>, color: 'bg-slate-800 text-slate-300 border-slate-700' },
  { id: 'completed', label: 'Completed', icon: <CheckCircle className="w-5 h-5 mb-2 text-green-400"/>, color: 'bg-green-900/30 text-green-200 border-green-800' },
  { id: 'cancelled-expired', label: 'Cancelled/Expired', icon: <Ban className="w-5 h-5 mb-2 text-red-400"/>, color: 'bg-red-900/30 text-red-200 border-red-800' },
  { id: 'all', label: 'All History', icon: <Archive className="w-5 h-5 mb-2 text-slate-400"/>, color: 'bg-slate-900 text-slate-300 border-slate-800' },
];

export const OperationalPrioritiesPage: React.FC = () => {
  const { tenantId, siteId } = useSiteContext();
  const { userProfile, currentUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [loading, setLoading] = useState(true);

  // Dynamic config collections
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [actionTypes, setActionTypes] = useState<ActionType[]>([]);
  const [priorityLevels, setPriorityLevels] = useState<PriorityLevel[]>([]);
  const [conflicts, setConflicts] = useState<PriorityConflict[]>([]);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);

  // Confirmation states
  const [confirmingAction, setConfirmingAction] = useState<{
    type: 'complete' | 'delete';
    priorityId: string;
    productCode: string;
    isActiveStatus?: boolean;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPartiallyCompleted, setIsPartiallyCompleted] = useState(false);
  const [partialQty, setPartialQty] = useState<number | ''>('');

  useEffect(() => {
    if (!confirmingAction) {
      setIsPartiallyCompleted(false);
      setPartialQty('');
    }
  }, [confirmingAction]);

  useEffect(() => {
    if (!tenantId || !siteId) return;
    detectPriorityConflicts(tenantId, siteId).then(setConflicts).catch(console.error);
  }, [tenantId, siteId, priorities]);

  useEffect(() => {
    if (!tenantId || !siteId) return;
    const unsubProducts = subscribeToProducts(tenantId, siteId, setProducts, console.error);
    return () => unsubProducts();
  }, [tenantId, siteId]);
  
  const initialFilter = searchParams.get('filter') || 'active';
  const [activeFilter, setActiveFilter] = useState(initialFilter);

  useEffect(() => {
    if (!tenantId) return;

    const unsubDest = subscribeToCollection<Destination>(
      collections.DESTINATIONS,
      [where('tenantId', '==', tenantId)],
      setDestinations,
      console.error
    );

    const unsubActions = subscribeToCollection<ActionType>(
      collections.ACTION_TYPES,
      [where('tenantId', '==', tenantId)],
      setActionTypes,
      console.error
    );

    const unsubPriorities = subscribeToCollection<PriorityLevel>(
      collections.PRIORITY_LEVELS,
      [where('tenantId', '==', tenantId)],
      setPriorityLevels,
      console.error
    );

    return () => {
      unsubDest();
      unsubActions();
      unsubPriorities();
    };
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || !siteId) return;

    const fetchPriorities = () => {
      setLoading(true);
      const q = query(
        collection(db, 'priorities'),
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId)
      );
      
      const unsubscribe = onSnapshot(q, (snap) => {
        const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as Priority));
        
        // Sort client-side by createdDate desc
        fetched.sort((a, b) => {
          const tA = (a.createdDate as any)?.toMillis?.() || (a.createdDate ? new Date(a.createdDate as any).getTime() : 0);
          const tB = (b.createdDate as any)?.toMillis?.() || (b.createdDate ? new Date(b.createdDate as any).getTime() : 0);
          return tB - tA;
        });

        // Compute EXPIRED state for active/scheduled items whose expireAt has passed
        const now = new Date();
        const updated = fetched.map(p => {
          if ((p.priorityStatus === 'ACTIVE' || p.priorityStatus === 'SCHEDULED' || p.priorityStatus === 'DRAFT') && p.expireAt && !p.untilSwitchedOff) {
            const exp = (p.expireAt as any)?.toDate?.() || new Date(p.expireAt as unknown as string);
            if (exp < now) {
               return { ...p, priorityStatus: 'EXPIRED' as any };
            }
          }
          if (p.priorityStatus === 'SCHEDULED' && p.startAt) {
            const start = (p.startAt as any)?.toDate?.() || new Date(p.startAt as unknown as string);
            if (start <= now) {
               return { ...p, priorityStatus: 'ACTIVE' as any };
            }
          }
          return p;
        });

        setPriorities(updated);
        setLoading(false);
      }, (e) => {
        console.error('Error fetching priorities:', e);
        setLoading(false);
      });

      return unsubscribe;
    };

    const unsubscribe = fetchPriorities();
    return () => unsubscribe();
  }, [tenantId, siteId]);

  const filteredPriorities = priorities.filter(p => {
    if (activeFilter === 'active') return ['ACTIVE', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'PARTIALLY_COMPLETE'].includes(p.priorityStatus);
    if (activeFilter === 'scheduled') return p.priorityStatus === 'SCHEDULED';
    if (activeFilter === 'draft') return p.priorityStatus === 'DRAFT';
    if (activeFilter === 'completed') return p.priorityStatus === 'COMPLETED';
    if (activeFilter === 'cancelled-expired') return ['CANCELLED', 'EXPIRED'].includes(p.priorityStatus);
    return true; // all
  });

  const getTileCount = (id: string) => {
    if (id === 'active') return priorities.filter(p => ['ACTIVE', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'PARTIALLY_COMPLETE'].includes(p.priorityStatus)).length;
    if (id === 'scheduled') return priorities.filter(p => p.priorityStatus === 'SCHEDULED').length;
    if (id === 'draft') return priorities.filter(p => p.priorityStatus === 'DRAFT').length;
    if (id === 'completed') return priorities.filter(p => p.priorityStatus === 'COMPLETED').length;
    if (id === 'cancelled-expired') return priorities.filter(p => ['CANCELLED', 'EXPIRED'].includes(p.priorityStatus)).length;
    return priorities.length;
  };

  const handleExecuteAction = async () => {
    if (!confirmingAction) return;
    setActionLoading(true);
    setActionError(null);

    const userName = userProfile?.displayName || userProfile?.email || currentUser || 'Planner';

    try {
      if (confirmingAction.type === 'complete') {
        const res = await updatePriorityStatus(confirmingAction.priorityId, 'COMPLETED', userName, 'Completed from priorities list');
        if (res.success) {
          setConfirmingAction(null);
        } else {
          setActionError(res.error || 'Failed to complete priority.');
        }
      } else if (confirmingAction.type === 'delete') {
        const qty = isPartiallyCompleted && typeof partialQty === 'number' && partialQty > 0 ? partialQty : undefined;
        const res = await deletePriority(confirmingAction.priorityId, userName, qty);
        if (res.success) {
          setConfirmingAction(null);
        } else {
          setActionError(res.error || 'Failed to delete priority.');
        }
      }
    } catch (err: any) {
      console.error(err);
      setActionError(err.message || 'An unexpected error occurred.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <PageHeader 
          title="Operational Priorities" 
          description="Manage warehouse instructions and exception resolutions."
        />
        <div>
          <button 
            onClick={() => navigate('/operations/priorities/new')}
            className="flex items-center gap-2 text-sm font-medium text-slate-900 bg-brand-500 px-4 py-2 rounded-md hover:bg-brand-400 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Priority
          </button>
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="bg-amber-950/80 border border-amber-800/90 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-200">
                {conflicts.length} Operational Priority Conflict{conflicts.length > 1 ? 's' : ''} Identified
              </h4>
              <p className="text-xs text-amber-300/80 mt-0.5">
                System driven recommendations match active manually created operational priorities. Choose whether to replace manual priorities or keep them.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsConflictModalOpen(true)}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg shadow transition-colors shrink-0 flex items-center gap-1.5"
          >
            <span>Resolve Conflicts</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {SUMMARY_TILES.map(tile => (
          <div 
            key={tile.id} 
            className={`cursor-pointer rounded-lg border p-4 flex flex-col items-center justify-center text-center transition-colors ${activeFilter === tile.id ? `ring-2 ring-brand-500 ${tile.color}` : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}
            onClick={() => setActiveFilter(tile.id)}
          >
            {tile.icon}
            <span className={`text-2xl font-bold mb-1 ${activeFilter === tile.id ? '' : 'text-slate-100'}`}>{getTileCount(tile.id)}</span>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${activeFilter === tile.id ? 'bg-black/20' : tile.color}`}>
              {tile.label}
            </span>
          </div>
        ))}
      </div>

      <SectionCard title={`${SUMMARY_TILES.find(t => t.id === activeFilter)?.label} Priorities`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-300">
            <thead className="text-xs uppercase bg-slate-800 text-slate-400 border-b border-slate-700">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Destination</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3">Timing</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">Loading priorities...</td>
                </tr>
              ) : filteredPriorities.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">No priorities found for this filter.</td>
                </tr>
              ) : (
                 filteredPriorities.map(p => {
                  const actionLabel = getActionTypeLabel(p.actionTypeId, actionTypes, p.actionTypeLabel);
                  const destLabel = getDestinationLabel(p.destinationId, destinations, p.destinationLabel);
                  const overflowLabel = p.overflowDestinationId ? getDestinationLabel(p.overflowDestinationId, destinations, p.overflowDestinationLabel) : null;
                  const levelLabel = getPriorityLevelLabel(p.priorityLevelId, priorityLevels, p.priorityLevelLabel);

                  const productMatch = products.find(prod => 
                    (p.productId && prod.id === p.productId) || 
                    (prod.productCode === p.productCodeSnapshot)
                  );
                  const cpp = productMatch?.casesPerPallet || 
                    productMatch?.configurations?.[0]?.casesPerPallet || 
                    100;

                  return (
                    <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-100">{p.productCodeSnapshot}</div>
                        <div className="text-xs text-slate-400">{p.descriptionSnapshot}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-brand-300">{actionLabel}</div>
                        <div className="text-xs text-slate-400">
                          Qty: <span className="font-mono text-slate-300">{p.requestedQuantity || 'N/A'} cases</span>
                        </div>
                        {p.requestedQuantity && (
                          <div className="text-[10px] text-amber-500 font-semibold mt-0.5">
                            {formatQuantityInPallets(p.requestedQuantity, cpp)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        <div>{destLabel}</div>
                        {overflowLabel && (
                          <div className="text-xs text-amber-400 mt-0.5" title="Overflow Destination">
                            Overflow: {overflowLabel}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge 
                          variant={
                            p.priorityStatus === 'COMPLETED' ? 'completed' : 
                            p.priorityStatus === 'EXPIRED' || p.priorityStatus === 'CANCELLED' ? 'blocked' :
                            p.priorityStatus === 'DRAFT' ? 'draft' : 'in-progress'
                          } 
                          label={p.priorityStatus.replace(/_/g, ' ')} 
                        />
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">{levelLabel}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="w-24 bg-slate-800 rounded-full h-2 mb-1">
                          <div className="bg-brand-500 h-2 rounded-full" style={{ width: `${p.progressPercent}%` }}></div>
                        </div>
                        <div className="text-xs text-slate-400">
                          {p.progressPercent}% ({p.progressQuantity}/{p.requestedQuantity || '-'})
                        </div>
                        {p.requestedQuantity && (
                          <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                            ({formatQuantityInPallets(p.progressQuantity, cpp)} / {formatQuantityInPallets(p.requestedQuantity, cpp)})
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        <div>Start: {p.startAt ? new Date((p.startAt as any)?.toDate?.() || p.startAt).toLocaleString() : '-'}</div>
                        <div className={p.priorityStatus === 'EXPIRED' ? 'text-red-400 font-medium' : ''}>
                          Exp: {p.untilSwitchedOff || !p.expireAt ? 'Until Switched Off' : new Date((p.expireAt as any)?.toDate?.() || p.expireAt).toLocaleString()}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {p.sourceType === 'RECOMMENDATION' ? (
                          <div className="inline-flex items-center text-xs px-2 py-1 bg-indigo-900/30 text-indigo-300 rounded border border-indigo-800">
                            System Rec
                          </div>
                        ) : (
                          <div className="inline-flex items-center text-xs px-2 py-1 bg-slate-800 text-slate-300 rounded border border-slate-700">
                            Manual
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => navigate(`/operations/priorities/edit/${p.id}`)}
                            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700 rounded border border-slate-700 transition-colors"
                            title="Edit Priority"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-brand-400" />
                            Edit
                          </button>

                          {!['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(p.priorityStatus) && (
                            <button
                              onClick={() => {
                                setActionError(null);
                                setConfirmingAction({
                                  type: 'complete',
                                  priorityId: p.id,
                                  productCode: p.productCodeSnapshot
                                });
                              }}
                              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-emerald-950/40 text-emerald-300 hover:text-white hover:bg-emerald-900/60 rounded border border-emerald-800/80 transition-colors"
                              title="Complete Priority"
                            >
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                              Complete
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setActionError(null);
                              setConfirmingAction({
                                type: 'delete',
                                priorityId: p.id,
                                productCode: p.productCodeSnapshot,
                                isActiveStatus: ['ACTIVE', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'PARTIALLY_COMPLETE'].includes(p.priorityStatus)
                              });
                            }}
                            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-red-950/40 text-red-300 hover:text-white hover:bg-red-900/60 rounded border border-red-800/80 transition-colors"
                            title="Delete Priority"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <PriorityConflictModal
        isOpen={isConflictModalOpen}
        tenantId={tenantId || ''}
        siteId={siteId || ''}
        conflicts={conflicts}
        actionTypes={actionTypes}
        destinations={destinations}
        priorityLevels={priorityLevels}
        onClose={() => setIsConflictModalOpen(false)}
        onResolved={() => {
          if (tenantId && siteId) {
            detectPriorityConflicts(tenantId, siteId).then(setConflicts);
          }
        }}
      />

      {confirmingAction && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              {confirmingAction.type === 'complete' ? (
                <>
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  <span>Complete Priority?</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                  <span>Delete Priority?</span>
                </>
              )}
            </h3>

            <p className="text-sm text-slate-400 mt-3">
              Are you sure you want to {confirmingAction.type === 'complete' ? 'complete' : 'delete'} the priority for product{' '}
              <strong className="text-slate-200">{confirmingAction.productCode}</strong>? This action cannot be undone.
            </p>

            {confirmingAction.type === 'delete' && confirmingAction.isActiveStatus && (
              <div className="mt-4 p-4 bg-slate-800/50 border border-slate-700/60 rounded-lg space-y-3">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isPartiallyCompleted}
                    onChange={(e) => {
                      setIsPartiallyCompleted(e.target.checked);
                      if (!e.target.checked) setPartialQty('');
                    }}
                    className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-800 text-brand-500 focus:ring-brand-500 focus:ring-offset-slate-900"
                  />
                  <div className="text-sm">
                    <span className="font-medium text-slate-200">I have partially completed this priority</span>
                    <p className="text-xs text-slate-400 mt-0.5">Record completed stock before deletion to adjust the product's QOH.</p>
                  </div>
                </label>

                {isPartiallyCompleted && (
                  <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                    <label className="block text-xs font-medium text-slate-300">
                      Completed Quantity (cases)
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="Enter quantity in cases"
                      value={partialQty}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') setPartialQty('');
                        else {
                          const num = parseInt(val, 10);
                          setPartialQty(isNaN(num) ? '' : Math.max(1, num));
                        }
                      }}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                    />
                  </div>
                )}
              </div>
            )}

            {actionError && (
              <div className="mt-4 p-3 bg-red-950/40 border border-red-900/60 rounded-lg text-xs text-red-200">
                {actionError}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setConfirmingAction(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleExecuteAction}
                className={`px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5 ${
                  confirmingAction.type === 'complete'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-red-600 hover:bg-red-500'
                }`}
              >
                {actionLoading ? 'Processing...' : confirmingAction.type === 'complete' ? 'Complete' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

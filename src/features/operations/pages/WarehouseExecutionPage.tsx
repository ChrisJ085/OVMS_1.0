import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Priority, PriorityStatus } from '../../../types/priority';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { CheckCircle, Clock, AlertTriangle, Activity, Package, ArrowRight, Play, Check, Pause, Ban, Edit2 } from 'lucide-react';
import { executePriorityUpdate } from '../services/priorityService';
import { useSiteContext } from '../../../contexts/SiteContext';
import { collections } from '../../configuration/services/configurationService';
import { Destination, ActionType, PriorityLevel } from '../../../types/configuration';
import { getActionTypeLabel, getDestinationLabel, getPriorityLevelLabel } from '../utils/priorityFormatters';
import { useAuth } from '../../auth/context/AuthContext';
import { hasPermission } from '../../../config/rolePermissions';
import { collection, db, onSnapshot, orderBy, query, subscribeToCollection, where } from '../../../services/supabaseBase';

const DEV_OPERATOR_KEY = 'ovms_dev_operator_name';

const TABS = [
  { id: 'new', label: 'New / Unacknowledged' },
  { id: 'acknowledged', label: 'Acknowledged' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'waiting_blocked', label: 'Waiting / Blocked' },
  { id: 'partially_complete', label: 'Partially Complete' },
  { id: 'completed', label: 'Completed Today' },
];

export const WarehouseExecutionPage: React.FC = () => {
  const navigate = useNavigate();
  const { tenantId, siteId } = useSiteContext();
  const { userProfile } = useAuth();
  const canUpdate = hasPermission(userProfile?.role, 'UPDATE_WAREHOUSE_EXECUTION');
  const canManagePriorities = hasPermission(userProfile?.role, 'MANAGE_PRIORITIES');

  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('new');
  const [operatorName, setOperatorName] = useState(() => localStorage.getItem(DEV_OPERATOR_KEY) || 'Dev Operator');

  // Dynamic config collections
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [actionTypes, setActionTypes] = useState<ActionType[]>([]);
  const [priorityLevels, setPriorityLevels] = useState<PriorityLevel[]>([]);

  // Modal State
  const [selectedPriority, setSelectedPriority] = useState<Priority | null>(null);
  const [actionType, setActionType] = useState<PriorityStatus | 'UPDATE_PROGRESS' | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [actionQty, setActionQty] = useState<number | ''>('');
  const [varianceReason, setVarianceReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    localStorage.setItem(DEV_OPERATOR_KEY, operatorName);
  }, [operatorName]);

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

    // We fetch all non-archived priorities and filter client-side for simplicity in this dev preview
    const q = query(
      collection(db, 'priorities'),
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as Priority));
      // Update expired status
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
      
      // Sort by creation date desc
      updated.sort((a, b) => {
        const da = (a.createdDate as any)?.toDate?.() || new Date(a.createdDate as any);
        const db = (b.createdDate as any)?.toDate?.() || new Date(b.createdDate as any);
        return db.getTime() - da.getTime();
      });

      setPriorities(updated);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [tenantId, siteId]);

  const filteredPriorities = priorities.filter(p => {
    switch (activeTab) {
      case 'new': return p.priorityStatus === 'ACTIVE';
      case 'acknowledged': return p.priorityStatus === 'ACKNOWLEDGED';
      case 'in_progress': return p.priorityStatus === 'IN_PROGRESS';
      case 'waiting_blocked': return p.priorityStatus === 'WAITING' || p.priorityStatus === 'BLOCKED';
      case 'partially_complete': return p.priorityStatus === 'PARTIALLY_COMPLETE';
      case 'completed': {
        if (p.priorityStatus !== 'COMPLETED') return false;
        if (!p.completedAt) return false;
        const comp = (p.completedAt as any)?.toDate?.() || new Date(p.completedAt as any);
        const today = new Date();
        today.setHours(0,0,0,0);
        return comp >= today;
      }
      default: return false;
    }
  });

  const handleActionClick = (p: Priority, type: PriorityStatus | 'UPDATE_PROGRESS') => {
    setSelectedPriority(p);
    setActionType(type);
    setActionNote('');
    setActionQty(p.progressQuantity);
    setVarianceReason('');
  };

  const submitAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPriority || !actionType) return;
    
    setSubmitting(true);
    try {
      const isStatusChange = actionType !== 'UPDATE_PROGRESS';
      
      await executePriorityUpdate({
        priorityId: selectedPriority.id,
        userId: operatorName,
        newStatus: isStatusChange ? (actionType as PriorityStatus) : undefined,
        progressQuantity: actionQty !== '' ? Number(actionQty) : undefined,
        note: actionNote,
        varianceReason: varianceReason
      });
      
      setSelectedPriority(null);
      setActionType(null);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <PageHeader 
          title="Warehouse Execution" 
          description="Execute and update operational priorities."
        />
        <div className="flex items-center gap-4">
          {!canUpdate && (
            <div id="readonly-indicator" className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 text-sm font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              Read-only View
            </div>
          )}
          <div className="flex items-center gap-2 text-sm bg-slate-900 p-2 rounded-lg border border-slate-700">
            <span className="text-slate-400">Dev Operator:</span>
            <input 
              type="text" 
              value={operatorName}
              onChange={(e) => setOperatorName(e.target.value)}
              disabled={!canUpdate}
              className="bg-transparent border-none text-brand-300 focus:ring-0 w-32 px-1 disabled:opacity-50"
            />
          </div>
        </div>
      </div>

      <div className="flex space-x-2 border-b border-slate-700">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id 
                ? 'border-brand-500 text-brand-400' 
                : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
           <div className="col-span-full text-center text-slate-500 py-12">Loading priorities...</div>
        ) : filteredPriorities.length === 0 ? (
           <div className="col-span-full text-center text-slate-500 py-12">No tasks in this view.</div>
        ) : (
          filteredPriorities.map(p => {
            const actionLabel = getActionTypeLabel(p.actionTypeId, actionTypes, p.actionTypeLabel);
            const destLabel = getDestinationLabel(p.destinationId, destinations, p.destinationLabel);
            const overflowLabel = p.overflowDestinationId ? getDestinationLabel(p.overflowDestinationId, destinations, p.overflowDestinationLabel) : null;

            return (
              <div key={p.id} className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden flex flex-col shadow-sm">
                <div className="p-4 border-b border-slate-700/50 flex justify-between items-start">
                  <div>
                    <div className="text-sm font-bold text-slate-100 font-mono mb-1">{p.productCodeSnapshot}</div>
                    <div className="text-xs text-slate-400 line-clamp-1">{p.descriptionSnapshot}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge 
                      variant={p.priorityStatus === 'COMPLETED' ? 'completed' : p.priorityStatus === 'BLOCKED' ? 'blocked' : 'in-progress'} 
                      label={p.priorityStatus.replace(/_/g, ' ')} 
                    />
                    {canManagePriorities && (
                      <button
                        onClick={() => navigate(`/operations/priorities/edit/${p.id}`)}
                        className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                        title="Edit Priority"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-brand-400" />
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="p-4 flex-1 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Action</div>
                      <div className="text-sm font-medium text-brand-300">{actionLabel}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Requested Qty</div>
                      <div className="text-sm font-medium text-slate-200 font-mono">{p.requestedQuantity || 'N/A'}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Destination</div>
                      <div className="text-sm font-medium text-slate-300">
                        {destLabel}
                        {overflowLabel && (
                          <span className="text-xs text-amber-400 ml-2 font-normal" title="Overflow Destination">
                            (Overflow: {overflowLabel})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                <div className="bg-slate-800/50 p-3 rounded border border-slate-700/50">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Planner Instruction</div>
                  <div className="text-sm text-slate-200 font-medium">{p.instruction}</div>
                  <div className="text-xs text-slate-400 mt-2 italic">{p.plannerReason}</div>
                </div>

                {p.requestedQuantity ? (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">Progress</span>
                      <span className="font-mono text-slate-300">{p.progressPercent}% ({p.progressQuantity}/{p.requestedQuantity})</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5">
                      <div className="bg-brand-500 h-1.5 rounded-full" style={{ width: `${p.progressPercent}%` }}></div>
                    </div>
                    {p.latestProgressNote && (
                      <div className="text-xs text-slate-500 mt-2 flex items-start gap-1">
                        <ArrowRight className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span>{p.latestProgressNote}</span>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              {canUpdate ? (
                <div className="p-3 bg-slate-800/80 border-t border-slate-700 flex flex-wrap gap-2">
                  {p.priorityStatus === 'ACTIVE' && (
                    <button onClick={() => handleActionClick(p, 'ACKNOWLEDGED')} className="flex-1 px-3 py-2 bg-brand-500/10 text-brand-400 border border-brand-500/30 rounded text-xs font-medium hover:bg-brand-500/20 transition-colors flex items-center justify-center">
                      <Check className="w-3 h-3 mr-1" /> Acknowledge
                    </button>
                  )}
                  {['ACTIVE', 'ACKNOWLEDGED', 'WAITING', 'BLOCKED', 'PARTIALLY_COMPLETE'].includes(p.priorityStatus) && (
                    <button onClick={() => handleActionClick(p, 'IN_PROGRESS')} className="flex-1 px-3 py-2 bg-brand-500 text-slate-900 rounded text-xs font-medium hover:bg-brand-400 transition-colors flex items-center justify-center">
                      <Play className="w-3 h-3 mr-1" /> Start Work
                    </button>
                  )}
                  {p.priorityStatus === 'IN_PROGRESS' && (
                    <>
                      <button onClick={() => handleActionClick(p, 'UPDATE_PROGRESS')} className="flex-1 px-3 py-2 bg-slate-700 text-slate-200 border border-slate-600 rounded text-xs font-medium hover:bg-slate-600 transition-colors">
                        Update Progress
                      </button>
                      <button onClick={() => handleActionClick(p, 'PARTIALLY_COMPLETE')} className="px-3 py-2 bg-indigo-900/30 text-indigo-400 border border-indigo-800/50 rounded text-xs font-medium hover:bg-indigo-900/50 transition-colors">
                        Partial Complete
                      </button>
                    </>
                  )}
                  {['IN_PROGRESS', 'WAITING'].includes(p.priorityStatus) && (
                    <button onClick={() => handleActionClick(p, 'COMPLETED')} className="px-3 py-2 bg-green-900/30 text-green-400 border border-green-800/50 rounded text-xs font-medium hover:bg-green-900/50 transition-colors flex items-center justify-center">
                      <CheckCircle className="w-3 h-3 mr-1" /> Complete
                    </button>
                  )}
                  {['ACTIVE', 'ACKNOWLEDGED', 'IN_PROGRESS'].includes(p.priorityStatus) && (
                    <div className="w-full flex gap-2">
                      <button onClick={() => handleActionClick(p, 'WAITING')} className="flex-1 px-3 py-2 bg-amber-900/20 text-amber-400 border border-amber-900/50 rounded text-xs font-medium hover:bg-amber-900/40 transition-colors flex items-center justify-center">
                        <Pause className="w-3 h-3 mr-1" /> Wait
                      </button>
                      <button onClick={() => handleActionClick(p, 'BLOCKED')} className="flex-1 px-3 py-2 bg-red-900/20 text-red-400 border border-red-900/50 rounded text-xs font-medium hover:bg-red-900/40 transition-colors flex items-center justify-center">
                        <Ban className="w-3 h-3 mr-1" /> Block
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-slate-900/50 border-t border-slate-800 text-center text-xs text-slate-500">
                  Execution controls disabled in read-only mode
                </div>
              )}
            </div>
          );
        })
      )}
      </div>

      {/* Action Modal */}
      {selectedPriority && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                {actionType === 'UPDATE_PROGRESS' ? 'Update Progress' : `Change to ${actionType.replace(/_/g, ' ')}`}
              </h2>
            </div>
            
            <form onSubmit={submitAction} className="p-6 space-y-4">
              <div className="bg-slate-800/50 p-3 rounded border border-slate-700/50">
                <div className="text-xs text-slate-400">{selectedPriority.productCodeSnapshot}</div>
                <div className="font-medium text-slate-200">{getActionTypeLabel(selectedPriority.actionTypeId, actionTypes, selectedPriority.actionTypeLabel)}</div>
                <div className="text-xs text-slate-500 mt-1">Requested: {selectedPriority.requestedQuantity || 'N/A'}</div>
              </div>

              {['UPDATE_PROGRESS', 'PARTIALLY_COMPLETE', 'COMPLETED'].includes(actionType) && selectedPriority.requestedQuantity && (
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">
                    Completed Quantity
                  </label>
                  <input 
                    type="number"
                    required
                    min="0"
                    value={actionQty}
                    onChange={e => setActionQty(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-slate-950 border-slate-700 rounded-md text-slate-200 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
              )}

              {actionType === 'COMPLETED' && selectedPriority.requestedQuantity && typeof actionQty === 'number' && actionQty !== selectedPriority.requestedQuantity && (
                <div>
                  <label className="block text-sm font-medium text-red-400 mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" /> Variance Reason Required
                  </label>
                  <textarea 
                    required
                    rows={2}
                    value={varianceReason}
                    onChange={e => setVarianceReason(e.target.value)}
                    placeholder={`Quantity doesn't match requested (${selectedPriority.requestedQuantity}). Explain why...`}
                    className="w-full bg-slate-950 border-red-900/50 rounded-md text-slate-200 focus:ring-red-500 focus:border-red-500"
                  />
                </div>
              )}

              {['WAITING', 'BLOCKED', 'UPDATE_PROGRESS', 'PARTIALLY_COMPLETE'].includes(actionType) && (
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">
                    {actionType === 'BLOCKED' ? 'Reason (Required)' : actionType === 'WAITING' ? 'Note (Required)' : 'Note (Optional)'}
                  </label>
                  <textarea 
                    required={['BLOCKED', 'WAITING'].includes(actionType)}
                    rows={2}
                    value={actionNote}
                    onChange={e => setActionNote(e.target.value)}
                    placeholder="Add operational comment..."
                    className="w-full bg-slate-950 border-slate-700 rounded-md text-slate-200 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
              )}

              {actionType === 'ACKNOWLEDGED' && (
                 <p className="text-sm text-slate-300">Acknowledge this priority to move it to the execution queue.</p>
              )}
              {actionType === 'IN_PROGRESS' && (
                 <p className="text-sm text-slate-300">Start work on this priority. The planner will see it is actively being worked on.</p>
              )}

              <div className="flex justify-end pt-4 gap-3">
                <button 
                  type="button"
                  onClick={() => { setSelectedPriority(null); setActionType(null); }}
                  className="px-4 py-2 border border-slate-700 rounded-md text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-brand-500 rounded-md text-sm font-medium text-slate-900 hover:bg-brand-400 transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

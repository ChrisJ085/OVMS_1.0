import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { OperationalException, ExceptionStatus } from '../../../types/exception';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { updateExceptionStatus, runExceptionEvaluation } from '../services/exceptionService';
import { AlertTriangle, Clock, CheckCircle, Search, Filter, MessageSquare, Ban, Play } from 'lucide-react';
import { useSiteContext } from '../../../contexts/SiteContext';

const DEV_OPERATOR_KEY = 'ovms_dev_operator_name';

export const ExceptionCentrePage: React.FC = () => {
  const { tenantId, siteId } = useSiteContext();
  const [exceptions, setExceptions] = useState<OperationalException[]>([]);
  const [loading, setLoading] = useState(true);
  const [operatorName, setOperatorName] = useState(() => localStorage.getItem(DEV_OPERATOR_KEY) || 'Dev Operator');

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'RESOLVED'>('ACTIVE');
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedException, setSelectedException] = useState<OperationalException | null>(null);
  const [actionType, setActionType] = useState<'ACKNOWLEDGE' | 'RESOLVE' | 'DISMISS' | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [evaluating, setEvaluating] = useState(false);

  useEffect(() => {
    localStorage.setItem(DEV_OPERATOR_KEY, operatorName);
  }, [operatorName]);

  useEffect(() => {
    if (!tenantId || !siteId) return;

    const q = query(
      collection(db, 'exceptions'),
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as OperationalException));
      
      // Sort by firstDetected desc
      fetched.sort((a, b) => {
        const da = (a.firstDetectedAt as any)?.toDate?.() || new Date(a.createdDate as any);
        const db = (b.firstDetectedAt as any)?.toDate?.() || new Date(b.createdDate as any);
        return db.getTime() - da.getTime();
      });

      setExceptions(fetched);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [tenantId, siteId]);

  const stats = useMemo(() => {
    return {
      open: exceptions.filter(e => e.exceptionStatus === 'OPEN').length,
      acknowledged: exceptions.filter(e => e.exceptionStatus === 'ACKNOWLEDGED').length,
      critical: exceptions.filter(e => (e.exceptionStatus === 'OPEN' || e.exceptionStatus === 'ACKNOWLEDGED') && e.severity === 'CRITICAL').length
    };
  }, [exceptions]);

  const filteredExceptions = useMemo(() => {
    return exceptions.filter(e => {
      if (statusFilter === 'ACTIVE' && (e.exceptionStatus === 'RESOLVED' || e.exceptionStatus === 'DISMISSED')) return false;
      if (statusFilter === 'RESOLVED' && (e.exceptionStatus === 'OPEN' || e.exceptionStatus === 'ACKNOWLEDGED')) return false;
      
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (
          !e.title.toLowerCase().includes(term) &&
          !e.message.toLowerCase().includes(term) &&
          !e.exceptionType.toLowerCase().includes(term) &&
          !e.entityId.toLowerCase().includes(term) &&
          !(e.productId && e.productId.toLowerCase().includes(term))
        ) {
          return false;
        }
      }
      return true;
    });
  }, [exceptions, statusFilter, searchTerm]);

  const handleActionClick = (e: OperationalException, type: 'ACKNOWLEDGE' | 'RESOLVE' | 'DISMISS') => {
    setSelectedException(e);
    setActionType(type);
    setActionNote('');
  };

  const submitAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedException || !actionType) return;
    
    setSubmitting(true);
    try {
      let status: ExceptionStatus = 'OPEN';
      if (actionType === 'ACKNOWLEDGE') status = 'ACKNOWLEDGED';
      if (actionType === 'RESOLVE') status = 'RESOLVED';
      if (actionType === 'DISMISS') status = 'DISMISSED';

      await updateExceptionStatus(selectedException.id, status, operatorName, actionNote);
      
      setSelectedException(null);
      setActionType(null);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEvaluate = async () => {
    if (!tenantId || !siteId) return;
    setEvaluating(true);
    try {
      const result = await runExceptionEvaluation(tenantId, siteId, operatorName);
      if (!result.success) {
        alert(result.error);
      }
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <PageHeader 
          title="Exception Centre" 
          description="Manage and resolve automated system exceptions."
        />
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm bg-slate-900 p-2 rounded-lg border border-slate-700">
            <span className="text-slate-400">Dev User:</span>
            <input 
              type="text" 
              value={operatorName}
              onChange={(e) => setOperatorName(e.target.value)}
              className="bg-transparent border-none text-brand-300 focus:ring-0 w-32 px-1"
            />
          </div>
          <button 
            onClick={handleEvaluate}
            disabled={evaluating}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-md font-medium hover:bg-indigo-500/30 transition-colors disabled:opacity-50 text-sm"
          >
            <Play className="w-4 h-4" />
            {evaluating ? 'Evaluating...' : 'Run Rules'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-700 p-4 rounded-lg flex flex-col justify-center">
          <div className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-1">Open Exceptions</div>
          <div className="text-3xl font-mono text-slate-100">{stats.open}</div>
        </div>
        <div className="bg-slate-900 border border-slate-700 p-4 rounded-lg flex flex-col justify-center">
          <div className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-1">Acknowledged</div>
          <div className="text-3xl font-mono text-brand-400">{stats.acknowledged}</div>
        </div>
        <div className="bg-red-950/20 border border-red-900/50 p-4 rounded-lg flex flex-col justify-center">
          <div className="text-sm font-medium text-red-400 uppercase tracking-wider mb-1 flex items-center gap-1"><AlertTriangle className="w-4 h-4"/> Critical Active</div>
          <div className="text-3xl font-mono text-red-500">{stats.critical}</div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 justify-between">
        <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-700 w-max">
          <button
            onClick={() => setStatusFilter('ACTIVE')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${statusFilter === 'ACTIVE' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Active (Open/Ack)
          </button>
          <button
            onClick={() => setStatusFilter('RESOLVED')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${statusFilter === 'RESOLVED' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Resolved
          </button>
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${statusFilter === 'ALL' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            All History
          </button>
        </div>
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
          <input 
            type="text"
            placeholder="Search exceptions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border-slate-700 rounded-md pl-9 text-sm text-slate-200 focus:ring-brand-500 focus:border-brand-500"
          />
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : filteredExceptions.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No exceptions found matching filters.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-800/50 text-slate-400 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-3 font-medium">Status & Severity</th>
                <th className="px-4 py-3 font-medium">Exception Details</th>
                <th className="px-4 py-3 font-medium">Source Entity</th>
                <th className="px-4 py-3 font-medium">Timeline</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {filteredExceptions.map(ex => {
                const first = ex.firstDetectedAt ? ((ex.firstDetectedAt as any)?.toDate?.() || new Date(ex.firstDetectedAt as any)) : null;
                const last = ex.lastDetectedAt ? ((ex.lastDetectedAt as any)?.toDate?.() || new Date(ex.lastDetectedAt as any)) : null;
                const res = ex.resolvedAt ? ((ex.resolvedAt as any)?.toDate?.() || new Date(ex.resolvedAt as any)) : null;

                return (
                  <tr key={ex.id} className={`hover:bg-slate-800/20 transition-colors ${(ex.exceptionStatus === 'RESOLVED' || ex.exceptionStatus === 'DISMISSED') ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-4 align-top w-48">
                      <div className="flex flex-col gap-2">
                        <StatusBadge 
                          variant={ex.exceptionStatus === 'OPEN' ? 'warning' : ex.exceptionStatus === 'ACKNOWLEDGED' ? 'in-progress' : 'completed'}
                          label={ex.exceptionStatus}
                        />
                        <span className={`text-xs font-bold px-2 py-0.5 rounded inline-block w-max ${
                          ex.severity === 'CRITICAL' ? 'bg-red-900/30 text-red-400 border border-red-900' :
                          ex.severity === 'WARNING' ? 'bg-amber-900/30 text-amber-400 border border-amber-900' :
                          'bg-blue-900/30 text-blue-400 border border-blue-900'
                        }`}>
                          {ex.severity}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="text-xs text-slate-500 font-mono mb-1">{ex.exceptionType}</div>
                      <div className="font-medium text-slate-200 mb-1">{ex.title}</div>
                      <div className="text-slate-400 text-xs mb-2 leading-relaxed">{ex.message}</div>
                      {ex.reasonCodes && ex.reasonCodes.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {ex.reasonCodes.map(rc => (
                            <span key={rc} className="bg-slate-800 text-slate-400 text-[10px] px-1.5 py-0.5 rounded border border-slate-700">{rc}</span>
                          ))}
                        </div>
                      )}
                      {ex.resolutionNote && (
                        <div className="mt-2 text-xs bg-slate-950/50 p-2 rounded border border-slate-800 text-slate-400 italic">
                          <span className="font-semibold text-slate-500 not-italic">Note:</span> {ex.resolutionNote}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top w-48">
                      <div className="text-xs text-slate-400 mb-1">{ex.entityType}</div>
                      <div className="font-mono text-brand-300 text-xs break-all">{ex.entityId}</div>
                      {ex.productId && (
                        <div className="text-xs text-slate-500 mt-2">Prod: {ex.productId}</div>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top w-48 text-xs font-mono text-slate-400">
                      <div className="mb-1"><span className="text-slate-500">First:</span> {first ? first.toLocaleDateString() : '-'}</div>
                      <div className="mb-1"><span className="text-slate-500">Last:</span> {last ? last.toLocaleDateString() : '-'}</div>
                      {res && <div><span className="text-slate-500">Res:</span> {res.toLocaleDateString()}</div>}
                    </td>
                    <td className="px-4 py-4 align-top text-right">
                      {ex.exceptionStatus === 'OPEN' && (
                        <button 
                          onClick={() => handleActionClick(ex, 'ACKNOWLEDGE')}
                          className="px-2 py-1 bg-brand-500/10 text-brand-400 border border-brand-500/30 rounded text-xs font-medium hover:bg-brand-500/20 transition-colors mb-2 w-full text-center block"
                        >
                          Acknowledge
                        </button>
                      )}
                      {(ex.exceptionStatus === 'OPEN' || ex.exceptionStatus === 'ACKNOWLEDGED') && (
                        <>
                          <button 
                            onClick={() => handleActionClick(ex, 'RESOLVE')}
                            className="px-2 py-1 bg-green-900/20 text-green-400 border border-green-900/50 rounded text-xs font-medium hover:bg-green-900/40 transition-colors mb-2 w-full text-center block"
                          >
                            Resolve
                          </button>
                          <button 
                            onClick={() => handleActionClick(ex, 'DISMISS')}
                            className="px-2 py-1 bg-slate-800 text-slate-400 border border-slate-700 rounded text-xs font-medium hover:bg-slate-700 transition-colors w-full text-center block"
                          >
                            Dismiss
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selectedException && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
              <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                {actionType === 'ACKNOWLEDGE' ? 'Acknowledge Exception' : actionType === 'RESOLVE' ? 'Resolve Exception' : 'Dismiss Exception'}
              </h2>
            </div>
            
            <form onSubmit={submitAction} className="p-6 space-y-4">
              <div className="bg-slate-800/50 p-3 rounded border border-slate-700/50">
                <div className="font-medium text-slate-200">{selectedException.title}</div>
                <div className="text-xs text-slate-500 mt-1">{selectedException.entityType}: {selectedException.entityId}</div>
              </div>

              {['RESOLVE', 'DISMISS'].includes(actionType) && (
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">
                    Resolution Note (Required for Dismiss)
                  </label>
                  <textarea 
                    required={actionType === 'DISMISS'}
                    rows={3}
                    value={actionNote}
                    onChange={e => setActionNote(e.target.value)}
                    placeholder={actionType === 'DISMISS' ? "Why is this being dismissed?" : "How was this resolved? (Optional if manual)"}
                    className="w-full bg-slate-950 border-slate-700 rounded-md text-slate-200 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
              )}
              
              {actionType === 'ACKNOWLEDGE' && (
                <p className="text-sm text-slate-400">Marking this as acknowledged indicates someone is investigating the issue.</p>
              )}

              <div className="flex justify-end pt-4 gap-3">
                <button 
                  type="button"
                  onClick={() => { setSelectedException(null); setActionType(null); }}
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

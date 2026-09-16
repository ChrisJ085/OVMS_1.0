import React, { useState, useEffect, useRef } from 'react';
import { ShieldAlert, Trash2, AlertTriangle, AlertOctagon, RefreshCw, X, CheckCircle, ArrowLeft, RotateCcw } from 'lucide-react';
import { useAuth } from '../../../auth/context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { getTableName, toCamelCase } from '../../../../utils/caseTransformers';

interface TenantDeletionWorkflowProps {
  tenant: any;
  onClose: () => void;
  onRefresh: () => void;
}

export const TenantDeletionWorkflow: React.FC<TenantDeletionWorkflowProps> = ({ tenant, onClose, onRefresh }) => {
  const { userProfile } = useAuth();
  const [mode, setMode] = useState<'SELECT' | 'DEACTIVATE' | 'DELETE_PREVIEW' | 'DELETE_CONFIRM' | 'JOB_STATUS'>('SELECT');
  
  const [counts, setCounts] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  
  const [typedName, setTypedName] = useState('');
  const [confirmedCheckbox, setConfirmedCheckbox] = useState(false);
  const [startingDeletion, setStartingDeletion] = useState(false);
  const [cancellingDeletion, setCancellingDeletion] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  const [jobId, setJobId] = useState<string | null>(tenant.deletionJobId || tenant.deletion_job_id || null);
  const [jobStatus, setJobStatus] = useState<any>(null);
  const pollTimerRef = useRef<any>(null);

  // If tenant is pending deletion or has a deletion job, default to JOB_STATUS view
  useEffect(() => {
    if (tenant.status === 'DELETION_PENDING' || tenant.deletionJobId || tenant.deletion_job_id) {
      setMode('JOB_STATUS');
      setJobId(tenant.deletionJobId || tenant.deletion_job_id || null);
    }
  }, [tenant]);

  // Fetch job status and poll
  const fetchJobStatus = async () => {
    try {
      let query = supabase.from('tenant_deletion_jobs').select('*');
      if (jobId) {
        query = query.eq('id', jobId);
      } else if (tenant.id) {
        query = query.eq('tenant_id', tenant.id).order('requested_at', { ascending: false }).limit(1);
      } else {
        return;
      }
      
      const { data, error } = await query.maybeSingle();
      if (error) {
        console.warn('Job query warning:', error.message);
        return;
      }
      if (data) {
        setJobStatus(toCamelCase(data));
        if (!jobId && data.id) {
          setJobId(data.id);
        }
      }
    } catch (err) {
      console.error('Error fetching deletion job status:', err);
    }
  };

  useEffect(() => {
    if (mode === 'JOB_STATUS') {
      fetchJobStatus();
      pollTimerRef.current = setInterval(fetchJobStatus, 2000);

      return () => {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      };
    }
  }, [mode, jobId, tenant.id]);

  const handleDeactivate = async () => {
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ status: tenant.status === 'inactive' ? 'active' : 'inactive' })
        .eq('id', tenant.id);

      if (error) throw error;
      onRefresh();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update tenant status');
    }
  };

  const loadPreview = async () => {
    setMode('DELETE_PREVIEW');
    setLoadingPreview(true);
    setErrorMsg('');
    try {
      const collections = [
        'sites', 'users', 'products', 'inventoryBalances',
        'productionPlanEntries', 'productionPlanImports',
        'planningRules', 'promotions', 'recommendations',
        'priorities', 'announcements', 'exceptions'
      ];
      
      let total = 0;
      const previewCounts: any = {};
      
      for (const coll of collections) {
        const tableName = getTableName(coll);
        try {
          const { count, error } = await supabase
            .from(tableName)
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenant.id);

          if (!error && typeof count === 'number') {
            previewCounts[coll] = count;
            total += count;
          } else {
            previewCounts[coll] = 0;
          }
        } catch {
          previewCounts[coll] = 0;
        }
      }
      previewCounts.total = total;
      setCounts(previewCounts);
    } catch (err: any) {
      setErrorMsg('Failed to generate preview: ' + (err.message || err));
    } finally {
      setLoadingPreview(false);
    }
  };

  const startPermanentDeletion = async (forceImmediate: boolean = true) => {
    if (mode === 'DELETE_CONFIRM') {
      const match = (typedName.trim().toLowerCase() === (tenant.tenantName || '').trim().toLowerCase()) ||
                    (typedName.trim().toLowerCase() === (tenant.tenantCode || '').trim().toLowerCase());
      if (!match) {
        setErrorMsg("Typed name does not match tenant name or code.");
        return;
      }
      if (!confirmedCheckbox) {
        setErrorMsg("You must check the confirmation box.");
        return;
      }
    }
    
    setStartingDeletion(true);
    setErrorMsg('');
    setSuccessMsg('');
    
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      const response = await fetch('/api/tenant-deletion', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          tenantId: tenant.id,
          tenantName: tenant.tenantName || tenant.tenantCode,
          forceImmediate
        })
      });
      
      const data = await response.json();
      if (data.success) {
        if (data.jobId) setJobId(data.jobId);
        setMode('JOB_STATUS');
        fetchJobStatus();
        if (data.status === 'COMPLETED') {
          setSuccessMsg('Tenant and all associated data have been permanently removed.');
          onRefresh();
        }
      } else {
        throw new Error(data.error || 'Failed to start deletion process');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error communicating with backend');
    } finally {
      setStartingDeletion(false);
    }
  };

  const cancelDeletion = async () => {
    setCancellingDeletion(true);
    setErrorMsg('');
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      const response = await fetch('/api/admin/cancel-tenant-deletion', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ tenantId: tenant.id })
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Failed to cancel deletion');
      
      onRefresh();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to cancel deletion');
    } finally {
      setCancellingDeletion(false);
    }
  };
  
  const retryJob = async () => {
    if (!jobId) {
      startPermanentDeletion(true);
      return;
    }
    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      const response = await fetch(`/api/tenant-deletion/${jobId}/retry`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Retry failed');
      fetchJobStatus();
    } catch (err: any) {
      setErrorMsg(err.message || 'Retry failed');
    }
  };

  if (userProfile?.role !== 'PLATFORM_SUPERUSER') {
    return (
      <div className="p-6 text-center text-slate-500">
        You do not have permission to delete tenants.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      <div className="flex items-start justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-500" />
            Tenant Administration
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Manage lifecycle for <span className="font-mono text-amber-500 font-semibold">{tenant.tenantName || tenant.tenantCode}</span>
          </p>
        </div>
        <button 
          onClick={onClose} 
          className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-lg flex items-start gap-3 text-sm text-red-200">
          <AlertOctagon className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Action Encountered Error</p>
            <p className="text-xs text-red-300">{errorMsg}</p>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-950/30 border border-emerald-900/50 rounded-lg flex items-start gap-3 text-sm text-emerald-200">
          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <p>{successMsg}</p>
        </div>
      )}

      {mode === 'SELECT' && (
        <div className="space-y-4">
          <div className="p-4 border border-slate-700 bg-slate-900/50 rounded-lg">
            <h3 className="font-semibold text-slate-200 text-sm mb-2">{tenant.status === 'inactive' ? 'Reactivate Tenant' : 'Deactivate Tenant'}</h3>
            <p className="text-xs text-slate-400 mb-4">
              {tenant.status === 'inactive' 
                ? 'Restore access to all tenant users. No data is lost.' 
                : 'Temporarily lock all access to this tenant and prevent new records. Data is preserved.'}
            </p>
            <button 
              onClick={handleDeactivate}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-sm font-medium transition-colors"
            >
              {tenant.status === 'inactive' ? 'Reactivate Tenant' : 'Deactivate Tenant'}
            </button>
          </div>

          <div className="p-4 border border-red-900/30 bg-red-950/10 rounded-lg">
            <h3 className="font-semibold text-red-400 text-sm mb-2 flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              Permanently Delete Tenant
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Irreversibly delete this tenant and all associated data, including users, sites, products, rules, and history so you can start a new tenant.
            </p>
            <button 
              onClick={loadPreview}
              className="px-4 py-2 bg-red-950 hover:bg-red-900 text-red-300 border border-red-900/50 rounded text-sm font-medium transition-colors"
            >
              Permanently delete tenant and all associated data
            </button>
          </div>
        </div>
      )}

      {mode === 'DELETE_PREVIEW' && (
        <div className="space-y-4 animate-fade-in">
          <div className="p-4 bg-slate-900 border border-slate-700 rounded-lg">
            <h3 className="font-semibold text-slate-200 text-sm border-b border-slate-800 pb-2 mb-3">Impact Preview</h3>
            
            {loadingPreview ? (
              <div className="py-8 flex flex-col items-center justify-center text-slate-500 space-y-3">
                <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
                <span className="text-xs">Analyzing tenant documents...</span>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 block mb-1">Tenant</span>
                    <span className="text-slate-200 font-medium">{tenant.tenantName} ({tenant.tenantCode})</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-1">Current Status</span>
                    <span className="text-slate-200 font-medium">{tenant.status}</span>
                  </div>
                  
                  {counts && (
                    <>
                      <div className="col-span-2 border-t border-slate-800 pt-3 mt-1" />
                      <div><span className="text-slate-500">Sites:</span> <span className="text-slate-200 float-right font-medium">{counts.sites}</span></div>
                      <div><span className="text-slate-500">Users:</span> <span className="text-slate-200 float-right font-medium">{counts.users}</span></div>
                      <div><span className="text-slate-500">Products:</span> <span className="text-slate-200 float-right font-medium">{counts.products}</span></div>
                      <div><span className="text-slate-500">Inventory Records:</span> <span className="text-slate-200 float-right font-medium">{counts.inventoryBalances}</span></div>
                      <div><span className="text-slate-500">Planning Rules:</span> <span className="text-slate-200 float-right font-medium">{counts.planningRules}</span></div>
                      <div><span className="text-slate-500">Priorities:</span> <span className="text-slate-200 float-right font-medium">{counts.priorities}</span></div>
                      
                      <div className="col-span-2 border-t border-slate-800 pt-3 mt-1 bg-red-950/20 p-2 rounded">
                        <span className="text-red-400 font-semibold">Total Records to Purge:</span> 
                        <span className="text-red-400 float-right font-bold text-sm">{counts.total} items</span>
                      </div>
                    </>
                  )}
                </div>
                
                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => setMode('SELECT')} className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm">Cancel</button>
                  <button onClick={() => setMode('DELETE_CONFIRM')} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-medium">Continue to Confirmation</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {mode === 'DELETE_CONFIRM' && (
        <div className="space-y-4 animate-fade-in">
          <div className="p-4 border border-red-900/50 bg-red-950/20 rounded-lg space-y-4">
            <h3 className="font-semibold text-red-400 text-sm flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Final Warning
            </h3>
            
            <p className="text-sm text-slate-300">
              This action will permanently delete tenant <strong className="text-white">{tenant.tenantName}</strong>, all its sites, users, inventory, rules, and configurations.
            </p>
            
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Type <span className="text-amber-400 font-mono font-bold">{tenant.tenantName || tenant.tenantCode}</span> to confirm:
              </label>
              <input 
                type="text" 
                value={typedName}
                onChange={e => setTypedName(e.target.value)}
                placeholder={tenant.tenantName || tenant.tenantCode}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-red-500"
              />
            </div>
            
            <label className="flex items-start gap-3 pt-2 cursor-pointer group">
              <input 
                type="checkbox" 
                checked={confirmedCheckbox}
                onChange={e => setConfirmedCheckbox(e.target.checked)}
                className="mt-1 w-4 h-4 bg-slate-900 border-slate-700 rounded text-red-500 focus:ring-red-500"
              />
              <span className="text-sm text-slate-300 group-hover:text-slate-200 transition-colors">
                I understand that this deletion is permanent, unrecoverable, and deletes all users and sites.
              </span>
            </label>
            
            <div className="flex justify-end gap-3 pt-4 border-t border-red-900/30">
              <button disabled={startingDeletion} onClick={() => setMode('SELECT')} className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm">Cancel</button>
              <button 
                onClick={() => startPermanentDeletion(true)}
                disabled={startingDeletion || !confirmedCheckbox || (typedName.trim().toLowerCase() !== (tenant.tenantName || '').trim().toLowerCase() && typedName.trim().toLowerCase() !== (tenant.tenantCode || '').trim().toLowerCase())}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:hover:bg-red-600 text-white rounded text-sm font-bold shadow-lg shadow-red-900/20 flex items-center gap-2"
              >
                {startingDeletion && <RefreshCw className="w-4 h-4 animate-spin" />}
                {startingDeletion ? 'Purging Tenant...' : 'Permanently Delete Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {mode === 'JOB_STATUS' && (
        <div className="space-y-4 animate-fade-in">
          <div className="p-4 border border-slate-700 bg-slate-900 rounded-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-semibold text-slate-200 text-sm">Tenant Lifecycle Status</h3>
              <span className={`px-2.5 py-1 rounded text-xs font-semibold ${
                jobStatus?.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                jobStatus?.status === 'FAILED' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                jobStatus?.status === 'IN_PROGRESS' || tenant.status === 'DELETION_PENDING' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse' :
                'bg-slate-800 text-slate-400'
              }`}>
                {jobStatus?.status || (tenant.status === 'DELETION_PENDING' ? 'DELETION_PENDING' : 'READY')}
              </span>
            </div>
            
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">Tenant:</span>
                <span className="text-slate-200 font-mono font-medium">{tenant.tenantName} ({tenant.tenantCode})</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">Current Stage:</span>
                <span className="text-slate-300 font-medium">{jobStatus?.currentStage || (tenant.status === 'DELETION_PENDING' ? 'Pending Administrative Execution' : 'Ready')}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">Deleted Records:</span>
                <span className="text-slate-300 font-medium">{jobStatus?.documentsDeleted || 0}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">Deleted Users:</span>
                <span className="text-slate-300 font-medium">{jobStatus?.usersDeleted || 0}</span>
              </div>
              
              {jobStatus?.failures && jobStatus.failures.length > 0 && (
                <div className="p-3 bg-red-950/20 border border-red-900/30 rounded mt-4">
                  <h4 className="text-red-400 text-xs font-bold mb-2">Errors Encountered</h4>
                  <ul className="text-xs text-red-300 space-y-1 list-disc pl-4">
                    {jobStatus.failures.map((f: string, i: number) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div className="pt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800">
                <div className="flex items-center gap-2">
                  {tenant.status === 'DELETION_PENDING' && (
                    <button
                      onClick={cancelDeletion}
                      disabled={cancellingDeletion || startingDeletion}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {cancellingDeletion ? 'Restoring...' : 'Restore to Active'}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {jobStatus?.status !== 'COMPLETED' && (
                    <button 
                      onClick={() => startPermanentDeletion(true)}
                      disabled={startingDeletion}
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-bold shadow-lg shadow-red-900/20 flex items-center gap-2 transition-colors"
                    >
                      {startingDeletion ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      {startingDeletion ? 'Purging Tenant...' : 'Purge & Delete Now'}
                    </button>
                  )}

                  {jobStatus?.status === 'COMPLETED' ? (
                    <button 
                      onClick={() => {
                        onRefresh();
                        onClose();
                      }} 
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm font-bold shadow-lg shadow-emerald-900/20 flex items-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Tenant Deleted (Done)
                    </button>
                  ) : (
                    <button 
                      onClick={onClose} 
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm font-medium transition-colors"
                    >
                      Close Window
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { ShieldAlert, Trash2, AlertTriangle, AlertOctagon, Info, RefreshCw, X } from 'lucide-react';
import { useAuth } from '../../../auth/context/AuthContext';
import { db } from '../../../../config/firebase';
import { collection, query, where, getDocs, getCountFromServer, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface TenantDeletionWorkflowProps {
  tenant: any;
  onClose: () => void;
  onRefresh: () => void;
}

export const TenantDeletionWorkflow: React.FC<TenantDeletionWorkflowProps> = ({ tenant, onClose, onRefresh }) => {
  const { userProfile, user } = useAuth();
  const [mode, setMode] = useState<'SELECT' | 'DEACTIVATE' | 'DELETE_PREVIEW' | 'DELETE_CONFIRM' | 'JOB_STATUS'>('SELECT');
  
  const [counts, setCounts] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  
  const [typedName, setTypedName] = useState('');
  const [confirmedCheckbox, setConfirmedCheckbox] = useState(false);
  const [startingDeletion, setStartingDeletion] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [jobId, setJobId] = useState<string | null>(tenant.deletionJobId || null);
  const [jobStatus, setJobStatus] = useState<any>(null);

  // If a job already exists for this tenant, show its status
  useEffect(() => {
    if (tenant.status === 'DELETION_PENDING' || tenant.deletionJobId) {
      setMode('JOB_STATUS');
      setJobId(tenant.deletionJobId);
    }
  }, [tenant]);

  useEffect(() => {
    if (mode === 'JOB_STATUS' && jobId) {
      const unsub = onSnapshot(doc(db, 'tenantDeletionJobs', jobId), (docSnap) => {
        if (docSnap.exists()) {
          setJobStatus(docSnap.data());
        }
      });
      return () => unsub();
    }
  }, [mode, jobId]);

  const handleDeactivate = async () => {
    try {
      await updateDoc(doc(db, 'tenants', tenant.id), {
        status: tenant.status === 'inactive' ? 'active' : 'inactive'
      });
      onRefresh();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update tenant status');
    }
  };

  const loadPreview = async () => {
    setMode('DELETE_PREVIEW');
    setLoadingPreview(true);
    try {
      const collections = [
        'sites', 'users', 'products', 'inventoryBalances',
        'productionPlanEntries', 'productionPlanImports',
        'planningRules', 'promotions', 'recommendations',
        'priorities', 'announcements', 'exceptions', 'auditLogs'
      ];
      
      let total = 0;
      const previewCounts: any = {};
      
      for (const coll of collections) {
        const snap = await getCountFromServer(query(collection(db, coll), where('tenantId', '==', tenant.id)));
        const c = snap.data().count;
        previewCounts[coll] = c;
        total += c;
      }
      previewCounts.total = total;
      setCounts(previewCounts);
    } catch (err: any) {
      setErrorMsg('Failed to generate preview: ' + err.message);
    } finally {
      setLoadingPreview(false);
    }
  };

  const startPermanentDeletion = async () => {
    if (typedName !== tenant.tenantName && typedName !== tenant.tenantCode) {
      setErrorMsg("Typed name does not match tenant name or code.");
      return;
    }
    if (!confirmedCheckbox) {
      setErrorMsg("You must check the confirmation box.");
      return;
    }
    
    setStartingDeletion(true);
    setErrorMsg('');
    
    try {
      const token = await user?.getIdToken();
      const response = await fetch('/api/tenant-deletion', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          tenantId: tenant.id,
          tenantName: tenant.tenantName
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setJobId(data.jobId);
        setMode('JOB_STATUS');
        onRefresh();
      } else {
        throw new Error(data.error || 'Failed to start deletion job');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error communicating with backend');
    } finally {
      setStartingDeletion(false);
    }
  };
  
  const retryJob = async () => {
    if (!jobId) return;
    try {
      const token = await user?.getIdToken();
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
          <p className="text-sm text-slate-400 mt-1">Manage lifecycle for <span className="font-mono text-amber-500">{tenant.tenantCode}</span></p>
        </div>
        {mode !== 'JOB_STATUS' && (
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-lg flex items-start gap-3 text-sm text-red-200">
          <AlertOctagon className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p>{errorMsg}</p>
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
              Irreversibly delete this tenant and all associated data, including users, products, rules, and history.
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
                <RefreshCw className="w-6 h-6 animate-spin" />
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
                    <span className="text-slate-500 block mb-1">Status</span>
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
                      <div><span className="text-slate-500">Audit Records:</span> <span className="text-slate-200 float-right font-medium">{counts.auditLogs}</span></div>
                      
                      <div className="col-span-2 border-t border-slate-800 pt-3 mt-1 bg-red-950/20 p-2 rounded">
                        <span className="text-red-400 font-semibold">Estimated Total Deletions:</span> 
                        <span className="text-red-400 float-right font-bold text-sm">{counts.total}+</span>
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
              This action permanently deletes this tenant, its sites, users, operational records, configuration, imports and associated files. This action cannot be undone.
            </p>
            
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Type tenant name or code to confirm:</label>
              <input 
                type="text" 
                value={typedName}
                onChange={e => setTypedName(e.target.value)}
                placeholder={tenant.tenantName}
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
                I understand that this deletion is permanent and cannot be undone.
              </span>
            </label>
            
            <div className="flex justify-end gap-3 pt-4 border-t border-red-900/30">
              <button disabled={startingDeletion} onClick={() => setMode('SELECT')} className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm">Cancel</button>
              <button 
                onClick={startPermanentDeletion}
                disabled={startingDeletion || !confirmedCheckbox || (typedName !== tenant.tenantName && typedName !== tenant.tenantCode)}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:hover:bg-red-600 text-white rounded text-sm font-bold shadow-lg shadow-red-900/20 flex items-center gap-2"
              >
                {startingDeletion && <RefreshCw className="w-4 h-4 animate-spin" />}
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {mode === 'JOB_STATUS' && (
        <div className="space-y-4 animate-fade-in">
          <div className="p-4 border border-slate-700 bg-slate-900 rounded-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-semibold text-slate-200 text-sm">Deletion Job Status</h3>
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                jobStatus?.status === 'COMPLETED' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                jobStatus?.status === 'FAILED' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                jobStatus?.status === 'IN_PROGRESS' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse' :
                'bg-slate-800 text-slate-400'
              }`}>
                {jobStatus?.status || 'UNKNOWN'}
              </span>
            </div>
            
            {jobStatus ? (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Stage:</span>
                  <span className="text-slate-300 font-medium">{jobStatus.currentStage || 'Initializing...'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Documents Deleted:</span>
                  <span className="text-slate-300 font-medium">{jobStatus.documentsDeleted || 0}</span>
                </div>
                
                {jobStatus.failures && jobStatus.failures.length > 0 && (
                  <div className="p-3 bg-red-950/20 border border-red-900/30 rounded mt-4">
                    <h4 className="text-red-400 text-xs font-bold mb-2">Errors Encountered</h4>
                    <ul className="text-xs text-red-300 space-y-1 list-disc pl-4">
                      {jobStatus.failures.map((f: string, i: number) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <div className="pt-4 flex justify-end gap-3">
                  {jobStatus.status === 'FAILED' && (
                    <button onClick={retryJob} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-sm font-medium">
                      Retry Job
                    </button>
                  )}
                  {jobStatus.status === 'COMPLETED' && (
                    <button onClick={onClose} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-sm font-medium">
                      Close
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-4 flex items-center justify-center text-slate-500">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                <span className="text-sm">Loading job status...</span>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

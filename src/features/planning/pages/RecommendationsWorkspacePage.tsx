import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { Recommendation, RecommendationGenerationJob } from '../../../types/recommendation';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { 
  AlertTriangle, 
  CheckCircle, 
  ArrowRight, 
  RefreshCw, 
  Wand2, 
  SlidersHorizontal, 
  EyeOff, 
  RotateCcw, 
  X, 
  Zap, 
  ShieldAlert,
  Info,
  Clock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { 
  runSiteRecommendationJob, 
  overrideRecommendation, 
  suppressRecommendation, 
  restoreAutomaticRecommendation 
} from '../services/recommendationService';
import { seedTestDataForTesting } from '../services/testDataSeeder';
import { useSiteContext } from '../../../contexts/SiteContext';
import { useAuth } from '../../auth/context/AuthContext';

const TABS = [
  { id: 'current-published', label: 'Current Published', color: 'bg-emerald-900/60 text-emerald-200 border-emerald-700' },
  { id: 'overrides-active', label: 'Overrides Active', color: 'bg-amber-900/60 text-amber-200 border-amber-700' },
  { id: 'suppressed', label: 'Suppressed', color: 'bg-purple-900/60 text-purple-200 border-purple-700' },
  { id: 'exceptions', label: 'Data Exceptions', color: 'bg-rose-900/60 text-rose-200 border-rose-700' },
  { id: 'promotion-affected', label: 'Promotion Affected', color: 'bg-indigo-900/60 text-indigo-200 border-indigo-700' },
  { id: 'withdrawn', label: 'Withdrawn / Superseded', color: 'bg-slate-800 text-slate-400 border-slate-700' },
];

export const RecommendationsWorkspacePage: React.FC = () => {
  const { tenantId, siteId, siteName } = useSiteContext();
  const { userProfile } = useAuth();
  const navigate = useNavigate();

  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('current-published');
  const [recalculating, setRecalculating] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // Modals state
  const [jobSummaryModal, setJobSummaryModal] = useState<RecommendationGenerationJob | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<Recommendation | null>(null);
  const [suppressTarget, setSuppressTarget] = useState<Recommendation | null>(null);

  // Form states
  const [overrideForm, setOverrideForm] = useState({
    actionTypeId: '',
    quantity: '',
    destinationId: '',
    priorityLevelId: '',
    instruction: '',
    reason: ''
  });

  const [suppressForm, setSuppressForm] = useState({
    reason: '',
    scope: 'UNTIL_NEXT_SNAPSHOT' as 'UNTIL_NEXT_SNAPSHOT' | 'UNTIL_DATE' | 'PERMANENT',
    expireAt: ''
  });

  useEffect(() => {
    if (!tenantId || !siteId) return;
    setLoading(true);

    const q = query(
      collection(db, 'recommendations'),
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId)
    );

    const unsub = onSnapshot(q, (snap) => {
      const recs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Recommendation));
      recs.sort((a, b) => {
        const tA = a.generatedAt ? (typeof a.generatedAt === 'string' ? new Date(a.generatedAt).getTime() : ((a.generatedAt as any).toMillis ? (a.generatedAt as any).toMillis() : new Date(a.generatedAt as any).getTime())) : 0;
        const tB = b.generatedAt ? (typeof b.generatedAt === 'string' ? new Date(b.generatedAt).getTime() : ((b.generatedAt as any).toMillis ? (b.generatedAt as any).toMillis() : new Date(b.generatedAt as any).getTime())) : 0;
        return tB - tA;
      });
      setRecommendations(recs);
      setLoading(false);
    }, (err) => {
      console.error('Recommendations subscription error:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [tenantId, siteId]);

  const handleRecalculateSite = async () => {
    if (!tenantId || !siteId) return;
    setRecalculating(true);
    try {
      const res = await runSiteRecommendationJob(tenantId, siteId, {
        triggerType: 'MANUAL_RECALCULATION',
        requestedBy: userProfile?.displayName || userProfile?.email || 'Planner',
        forceRecalculate: true
      });

      if (res.success && res.data) {
        setJobSummaryModal(res.data);
      } else {
        alert(`Recalculation failed: ${res.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      alert(`Recalculation failed: ${e?.message || 'Error executing job'}`);
    } finally {
      setRecalculating(false);
    }
  };

  const handleSeedTestData = async () => {
    if (!tenantId || !siteId) return;
    setSeeding(true);
    try {
      const result = await seedTestDataForTesting(tenantId, siteId);
      alert(result.message);
    } catch (e: any) {
      alert(`Seeding failed: ${e?.message || 'Unknown error'}`);
    } finally {
      setSeeding(false);
    }
  };

  const handleApplyOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideTarget || !overrideForm.reason.trim()) return;

    const res = await overrideRecommendation(
      overrideTarget.id,
      {
        actionTypeId: overrideForm.actionTypeId || undefined,
        quantity: overrideForm.quantity ? parseFloat(overrideForm.quantity) : undefined,
        destinationId: overrideForm.destinationId || undefined,
        priorityLevelId: overrideForm.priorityLevelId || undefined,
        instruction: overrideForm.instruction || undefined,
        reason: overrideForm.reason.trim()
      },
      userProfile?.displayName || userProfile?.email || 'Planner'
    );

    if (res.success) {
      setOverrideTarget(null);
      setOverrideForm({ actionTypeId: '', quantity: '', destinationId: '', priorityLevelId: '', instruction: '', reason: '' });
    } else {
      alert(`Failed to apply override: ${res.error}`);
    }
  };

  const handleApplySuppress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suppressTarget || !suppressForm.reason.trim()) return;

    const res = await suppressRecommendation(
      suppressTarget.id,
      {
        reason: suppressForm.reason.trim(),
        scope: suppressForm.scope,
        expireAt: suppressForm.expireAt ? new Date(suppressForm.expireAt) : undefined
      },
      userProfile?.displayName || userProfile?.email || 'Planner'
    );

    if (res.success) {
      setSuppressTarget(null);
      setSuppressForm({ reason: '', scope: 'UNTIL_NEXT_SNAPSHOT', expireAt: '' });
    } else {
      alert(`Failed to suppress recommendation: ${res.error}`);
    }
  };

  const handleRestoreAutomatic = async (recId: string) => {
    if (!confirm('Are you sure you want to restore automatic instruction generation for this product?')) return;
    const res = await restoreAutomaticRecommendation(recId, userProfile?.displayName || userProfile?.email || 'Planner');
    if (!res.success) {
      alert(`Failed to restore automatic instruction: ${res.error}`);
    }
  };

  const filteredRecs = recommendations.filter(r => {
    const issues = r.decisionOutput?.dataQualityIssues || [];
    const impacts = r.sourceSnapshot?.activePromotionImpacts || [];

    if (activeTab === 'current-published') return r.recommendationStatus === 'AUTO_PUBLISHED';
    if (activeTab === 'overrides-active') return r.recommendationStatus === 'OVERRIDDEN';
    if (activeTab === 'suppressed') return r.recommendationStatus === 'SUPPRESSED';
    if (activeTab === 'exceptions') return r.recommendationStatus === 'FAILED_VALIDATION' || issues.some(i => i.blocking);
    if (activeTab === 'promotion-affected') return impacts.length > 0 && r.recommendationStatus !== 'SUPERSEDED' && r.recommendationStatus !== 'WITHDRAWN';
    if (activeTab === 'withdrawn') return r.recommendationStatus === 'WITHDRAWN' || r.recommendationStatus === 'SUPERSEDED';
    return true;
  });

  const getTabCount = (tabId: string) => {
    if (tabId === 'current-published') return recommendations.filter(r => r.recommendationStatus === 'AUTO_PUBLISHED').length;
    if (tabId === 'overrides-active') return recommendations.filter(r => r.recommendationStatus === 'OVERRIDDEN').length;
    if (tabId === 'suppressed') return recommendations.filter(r => r.recommendationStatus === 'SUPPRESSED').length;
    if (tabId === 'exceptions') return recommendations.filter(r => r.recommendationStatus === 'FAILED_VALIDATION' || (r.decisionOutput?.dataQualityIssues || []).some(i => i.blocking)).length;
    if (tabId === 'promotion-affected') return recommendations.filter(r => (r.sourceSnapshot?.activePromotionImpacts || []).length > 0 && r.recommendationStatus !== 'SUPERSEDED' && r.recommendationStatus !== 'WITHDRAWN').length;
    if (tabId === 'withdrawn') return recommendations.filter(r => r.recommendationStatus === 'WITHDRAWN' || r.recommendationStatus === 'SUPERSEDED').length;
    return 0;
  };

  const formatRecStatusBadge = (rec: Recommendation) => {
    const status = rec.recommendationStatus;
    if (status === 'AUTO_PUBLISHED') return <StatusBadge variant="completed" label="Published (Auto)" />;
    if (status === 'OVERRIDDEN') return <StatusBadge variant="warning" label="Planner Override" />;
    if (status === 'SUPPRESSED') return <StatusBadge variant="inactive" label="Suppressed" />;
    if (status === 'FAILED_VALIDATION') return <StatusBadge variant="blocked" label="Validation Exception" />;
    if (status === 'SUPERSEDED') return <StatusBadge variant="inactive" label="Superseded" />;
    if (status === 'WITHDRAWN') return <StatusBadge variant="inactive" label="Withdrawn" />;
    return <StatusBadge variant="in-progress" label={status.replace(/_/g, ' ')} />;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <PageHeader 
          title="Recommendation Oversight Workspace" 
          description={`Automatic decision engine for ${siteName || 'Site'}. Warehouse instructions are automatically evaluated and published based on inventory snapshots.`}
        />
        <div className="flex flex-wrap gap-2">
          {import.meta.env.DEV && (
            <button 
              onClick={handleSeedTestData} 
              disabled={seeding || loading}
              className="flex items-center gap-2 text-xs font-medium text-slate-300 bg-slate-800 border border-slate-700 px-3 py-2 rounded-md hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              <Wand2 className={`w-3.5 h-3.5 text-brand-400 ${seeding ? 'animate-pulse' : ''}`} />
              {seeding ? 'Seeding...' : 'Seed Test Data'}
            </button>
          )}

          <button 
            onClick={handleRecalculateSite} 
            disabled={recalculating}
            className="flex items-center gap-2 text-xs font-semibold text-slate-900 bg-brand-500 hover:bg-brand-400 px-4 py-2 rounded-md shadow transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${recalculating ? 'animate-spin' : ''}`} />
            {recalculating ? 'Evaluating Decision Engine...' : 'Recalculate Site Instructions'}
          </button>
        </div>
      </div>

      {/* Summary Filter Tabs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {TABS.map(tab => (
          <div 
            key={tab.id} 
            className={`cursor-pointer rounded-lg border p-3.5 flex flex-col items-center justify-center text-center transition-all ${
              activeTab === tab.id 
                ? `ring-2 ring-brand-500 ${tab.color}` 
                : 'bg-slate-800/80 border-slate-700/80 hover:bg-slate-700/60'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="text-2xl font-bold mb-0.5 text-slate-100">{getTabCount(tab.id)}</span>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-black/30 text-white' : 'text-slate-300 bg-slate-900/40'}`}>
              {tab.label}
            </span>
          </div>
        ))}
      </div>

      {/* Main Table */}
      <SectionCard title="Active Product Recommendations & Instructions">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-300">
            <thead className="text-xs uppercase bg-slate-800/80 text-slate-400 border-b border-slate-700">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">Inventory (QOH)</th>
                <th className="px-4 py-3">Planning Status</th>
                <th className="px-4 py-3">Recommended Instruction</th>
                <th className="px-4 py-3">Data Quality</th>
                <th className="px-4 py-3">Published / Evaluated</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">Loading site recommendations...</td>
                </tr>
              ) : filteredRecs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">No recommendations matching the selected workspace view.</td>
                </tr>
              ) : (
                filteredRecs.map(rec => {
                  const output = rec.decisionOutput;
                  const issues = output?.dataQualityIssues || [];
                  const recAction = output?.recommendedActionTypeId || 'RELEASE';
                  const recQty = output?.recommendedQuantity ?? 0;

                  return (
                    <tr key={rec.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-100">{rec.productCodeSnapshot}</div>
                        <div className="text-xs text-slate-400 line-clamp-1">{rec.descriptionSnapshot}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-slate-200">
                        {rec.sourceSnapshot?.inventoryTotal?.toLocaleString() ?? 0}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-300">
                          {output?.planningBandStatus ? output.planningBandStatus.replace(/_/g, ' ') : 'NORMAL'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {recAction && recQty >= 0 ? (
                          <div>
                            <div className="font-semibold text-brand-400">
                              {recAction} ({recQty.toLocaleString()})
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {rec.overrideContext ? 'Manual Override Applied' : 'Automatic Decision'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-xs">No action needed</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {issues.length > 0 ? (
                          <div className={`flex items-center text-xs font-medium ${issues.some(i => i.blocking) ? 'text-rose-400' : 'text-amber-400'}`}>
                            <AlertTriangle className="w-3.5 h-3.5 mr-1 flex-shrink-0" />
                            <span>{issues.length} {issues.some(i => i.blocking) ? 'Blocking Error' : 'Warning'}</span>
                          </div>
                        ) : (
                          <div className="flex items-center text-emerald-400 text-xs">
                            <CheckCircle className="w-3.5 h-3.5 mr-1" />
                            <span>Valid</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {rec.generatedAt ? (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            {(rec.generatedAt as any)?.toDate?.()?.toLocaleString() || new Date(rec.generatedAt as unknown as string).toLocaleString()}
                          </div>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        {formatRecStatusBadge(rec)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {rec.recommendationStatus === 'OVERRIDDEN' || rec.recommendationStatus === 'SUPPRESSED' ? (
                            <button
                              onClick={() => handleRestoreAutomatic(rec.id)}
                              className="text-emerald-400 hover:text-emerald-300 text-xs font-medium flex items-center gap-1 bg-emerald-950/40 border border-emerald-800/60 px-2 py-1 rounded"
                              title="Restore automatic decision engine"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Restore
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setOverrideTarget(rec);
                                  setOverrideForm({
                                    actionTypeId: output?.recommendedActionTypeId || '',
                                    quantity: output?.recommendedQuantity ? String(output.recommendedQuantity) : '',
                                    destinationId: output?.recommendedDestinationId || '',
                                    priorityLevelId: output?.recommendedPriorityLevelId || '',
                                    instruction: '',
                                    reason: ''
                                  });
                                }}
                                className="text-amber-400 hover:text-amber-300 text-xs font-medium flex items-center gap-1 bg-amber-950/40 border border-amber-800/60 px-2 py-1 rounded"
                                title="Apply manual planner override"
                              >
                                <SlidersHorizontal className="w-3 h-3" />
                                Override
                              </button>

                              <button
                                onClick={() => {
                                  setSuppressTarget(rec);
                                  setSuppressForm({ reason: '', scope: 'UNTIL_NEXT_SNAPSHOT', expireAt: '' });
                                }}
                                className="text-slate-400 hover:text-slate-200 text-xs font-medium flex items-center gap-1 bg-slate-800 border border-slate-700 px-2 py-1 rounded"
                                title="Suppress recommendation"
                              >
                                <EyeOff className="w-3 h-3" />
                                Suppress
                              </button>
                            </>
                          )}

                          <button 
                            className="text-brand-400 hover:text-brand-300 text-xs font-medium flex items-center gap-0.5 ml-1"
                            onClick={() => navigate(`/planning/recommendations/${rec.id}`)}
                          >
                            Details <ArrowRight className="w-3.5 h-3.5" />
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

      {/* Generation Summary Modal */}
      {jobSummaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-brand-400" />
                <h3 className="text-lg font-bold text-slate-100">Decision Engine Execution Summary</h3>
              </div>
              <button onClick={() => setJobSummaryModal(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Automatic decision engine completed for site <strong>{siteName}</strong> based on the latest inventory snapshot and planning rules.
            </p>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700">
                <div className="text-slate-400 mb-1">Products Assessed</div>
                <div className="text-xl font-bold text-slate-100">{jobSummaryModal.productCount}</div>
              </div>
              <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700">
                <div className="text-slate-400 mb-1">Published Instructions</div>
                <div className="text-xl font-bold text-emerald-400">{jobSummaryModal.createdCount + jobSummaryModal.updatedCount}</div>
              </div>
              <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700">
                <div className="text-slate-400 mb-1">Unchanged Position</div>
                <div className="text-xl font-bold text-slate-300">{jobSummaryModal.unchangedCount}</div>
              </div>
              <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700">
                <div className="text-slate-400 mb-1">Withdrawn / Superseded</div>
                <div className="text-xl font-bold text-amber-400">{jobSummaryModal.withdrawnCount + jobSummaryModal.supersededCount}</div>
              </div>
            </div>

            {jobSummaryModal.failedCount > 0 && (
              <div className="bg-rose-950/50 border border-rose-800 text-rose-300 p-3 rounded-lg text-xs space-y-1">
                <div className="font-semibold flex items-center gap-1.5 text-rose-200">
                  <ShieldAlert className="w-4 h-4" />
                  {jobSummaryModal.failedCount} Validation Exception(s)
                </div>
                <p className="text-[11px] text-rose-300/80">
                  Some products could not be safely published due to missing planning rules or configuration limits.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setJobSummaryModal(null);
                  setActiveTab('current-published');
                }}
                className="text-xs font-semibold px-4 py-2 bg-brand-500 hover:bg-brand-400 text-slate-900 rounded-md transition-colors"
              >
                View Published Instructions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Override Modal */}
      {overrideTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <form onSubmit={handleApplyOverride} className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                Apply Planner Override — {overrideTarget.productCodeSnapshot}
              </h3>
              <button type="button" onClick={() => setOverrideTarget(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Manual overrides replace the automatically generated instruction. Warehouse Execution will follow your override until cleared or superseded.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Override Quantity</label>
                <input 
                  type="number" 
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-100 focus:outline-none focus:border-brand-500"
                  placeholder="Enter custom override quantity"
                  value={overrideForm.quantity}
                  onChange={e => setOverrideForm({ ...overrideForm, quantity: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Instruction Note for Warehouse</label>
                <input 
                  type="text" 
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-100 focus:outline-none focus:border-brand-500"
                  placeholder="e.g. Priority release due to customer urgent dispatch"
                  value={overrideForm.instruction}
                  onChange={e => setOverrideForm({ ...overrideForm, instruction: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Reason for Override (Required)</label>
                <textarea 
                  required
                  rows={2}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-100 focus:outline-none focus:border-brand-500"
                  placeholder="Justify why the system decision is being overridden..."
                  value={overrideForm.reason}
                  onChange={e => setOverrideForm({ ...overrideForm, reason: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button 
                type="button" 
                onClick={() => setOverrideTarget(null)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md transition-colors"
              >
                Publish Override
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Suppress Modal */}
      {suppressTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <form onSubmit={handleApplySuppress} className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <EyeOff className="w-4 h-4 text-purple-400" />
                Suppress Recommendation — {suppressTarget.productCodeSnapshot}
              </h3>
              <button type="button" onClick={() => setSuppressTarget(null)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Suppression Scope</label>
                <select 
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-100 focus:outline-none focus:border-brand-500"
                  value={suppressForm.scope}
                  onChange={e => setSuppressForm({ ...suppressForm, scope: e.target.value as any })}
                >
                  <option value="UNTIL_NEXT_SNAPSHOT">Until Next Inventory Snapshot (Default)</option>
                  <option value="UNTIL_DATE">Until Specific Expiry Date</option>
                  <option value="PERMANENT">Permanent (Until Manually Restored)</option>
                </select>
              </div>

              {suppressForm.scope === 'UNTIL_DATE' && (
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Expiry Date</label>
                  <input 
                    type="date"
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-100 focus:outline-none focus:border-brand-500"
                    value={suppressForm.expireAt}
                    onChange={e => setSuppressForm({ ...suppressForm, expireAt: e.target.value })}
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-300 font-medium mb-1">Reason for Suppression (Required)</label>
                <textarea 
                  required
                  rows={2}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-100 focus:outline-none focus:border-brand-500"
                  placeholder="Explain why warehouse instruction generation is suppressed for this product..."
                  value={suppressForm.reason}
                  onChange={e => setSuppressForm({ ...suppressForm, reason: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button 
                type="button" 
                onClick={() => setSuppressTarget(null)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white rounded-md transition-colors"
              >
                Apply Suppression
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

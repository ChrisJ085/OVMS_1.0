import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { Recommendation } from '../../../types/recommendation';
import { SectionCard } from '../../../components/ui/SectionCard';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { ArrowLeft, AlertTriangle, CheckCircle, Info, Calculator, Clock, PlayCircle, Settings, Box, RefreshCw } from 'lucide-react';
import { generateRecommendationForProduct, updateRecommendationStatus } from '../services/recommendationService';
import { PlannerDecision, OverrideFlags } from '../../../types/recommendation';
import { useAuth } from '../../../../features/auth/context/AuthContext';
import { useSiteContext } from '../../../../contexts/SiteContext';

export const RecommendationDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { tenantId, siteId } = useSiteContext();
  
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Override states
  const [isOverriding, setIsOverriding] = useState(false);
  const [overrideActionType, setOverrideActionType] = useState('');
  const [overrideQuantity, setOverrideQuantity] = useState<number>(0);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideDestination, setOverrideDestination] = useState('');
  const [overridePriority, setOverridePriority] = useState('');

  // Dismiss states
  const [isDismissing, setIsDismissing] = useState(false);
  const [dismissReason, setDismissReason] = useState('');

  const fetchRec = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const docRef = doc(db, 'recommendations', id);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as Recommendation;
        setRec(data);
        if (data.decisionOutput.recommendedActionTypeId) {
          setOverrideActionType(data.decisionOutput.recommendedActionTypeId);
          setOverrideQuantity(data.decisionOutput.recommendedQuantity || 0);
          setOverrideDestination(data.decisionOutput.recommendedDestinationId || '');
          setOverridePriority(data.decisionOutput.recommendedPriorityLevelId || '');
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRec();
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading recommendation details...</div>;
  }

  if (!rec) {
    return <div className="p-8 text-center text-red-500">Recommendation not found.</div>;
  }

  const handleApprove = async () => {
    if (!rec || !rec.decisionOutput.recommendedActionTypeId) return;
    setActionLoading(true);
    try {
      const decision: PlannerDecision = {
        actionTypeId: rec.decisionOutput.recommendedActionTypeId,
        quantity: rec.decisionOutput.recommendedQuantity || 0,
        destinationId: rec.decisionOutput.recommendedDestinationId || null,
        priorityLevelId: rec.decisionOutput.recommendedPriorityLevelId || null,
        notes: 'Approved without overrides'
      };
      await updateRecommendationStatus(rec.id, 'APPROVED', decision);
      await fetchRec();
    } finally {
      setActionLoading(false);
    }
  };

  const handleOverrideSubmit = async () => {
    if (!rec || !overrideReason.trim()) return;
    
    // Basic validation
    if (overrideQuantity < 0) {
      alert("Quantity cannot be less than zero");
      return;
    }

    setActionLoading(true);
    try {
      const decision: PlannerDecision = {
        actionTypeId: overrideActionType || null,
        quantity: overrideQuantity,
        destinationId: overrideDestination || null,
        priorityLevelId: overridePriority || null,
        notes: overrideReason
      };
      
      const flags: OverrideFlags = {
        actionOverridden: overrideActionType !== rec.decisionOutput.recommendedActionTypeId,
        quantityOverridden: overrideQuantity !== (rec.decisionOutput.recommendedQuantity || 0),
        destinationOverridden: overrideDestination !== rec.decisionOutput.recommendedDestinationId,
        priorityOverridden: overridePriority !== rec.decisionOutput.recommendedPriorityLevelId
      };

      await updateRecommendationStatus(rec.id, 'OVERRIDDEN', decision, flags, overrideReason);
      setIsOverriding(false);
      await fetchRec();
    } finally {
      setActionLoading(false);
    }
  };

  const handleDismissSubmit = async () => {
    if (!rec || !dismissReason.trim()) return;
    setActionLoading(true);
    try {
      await updateRecommendationStatus(rec.id, 'DISMISSED', undefined, undefined, dismissReason);
      setIsDismissing(false);
      await fetchRec();
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecalculate = async () => {
    if (!rec || !tenantId || !siteId) return;
    setActionLoading(true);
    try {
      const result = await generateRecommendationForProduct(tenantId, siteId, rec.productId);
      if (result.success && result.data && result.data !== rec.id) {
        navigate(`/planning/recommendations/${result.data}`);
      } else {
        alert("No changes detected in inputs. Fingerprint matched.");
        await fetchRec();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const isEditable = rec.recommendationStatus === 'AWAITING_REVIEW';
  const out = rec.decisionOutput;
  const snap = rec.sourceSnapshot;
  const rule = snap.planningRule;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            className="flex items-center text-slate-400 hover:text-white transition-colors"
            onClick={() => navigate('/planning/recommendations')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">{rec.productCodeSnapshot}</h1>
            <p className="text-sm text-slate-400">{rec.descriptionSnapshot}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {rec.recommendationStatus === 'AWAITING_REVIEW' 
            ? <StatusBadge variant="in-progress" label={rec.recommendationStatus.replace(/_/g, ' ')} />
            : <StatusBadge variant={rec.recommendationStatus === 'APPROVED' ? 'completed' : 'blocked'} label={rec.recommendationStatus.replace(/_/g, ' ')} />
          }
          <button 
            className="flex items-center px-3 py-1.5 border border-slate-700 rounded-md text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            onClick={handleRecalculate} 
            disabled={actionLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${actionLoading ? 'animate-spin' : ''}`} />
            Recalculate
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Column: Context & Data */}
        <div className="space-y-6">
          <SectionCard title={
            <div className="flex items-center">
              <Box className="w-4 h-4 mr-2" /> Inventory Context
            </div>
          }>
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-xs text-slate-500">Total Quantity</div>
                  <div className="text-2xl font-bold text-slate-100 font-mono">{snap.inventoryTotal}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Updated</div>
                  <div className="text-sm font-medium text-slate-300">
                    {new Date(snap.inventoryUpdatedAt).toLocaleString()}
                  </div>
                </div>
              </div>
              
              {snap.inventoryByLocation.length > 0 && (
                <div className="space-y-2 mt-4 pt-4 border-t border-slate-800">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">By Location</div>
                  {snap.inventoryByLocation.map((loc, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-slate-400 font-mono">{loc.locationId}</span>
                      <span className="font-medium text-slate-200">
                        {loc.quantity} {loc.status !== 'AVAILABLE' && <span className="text-amber-400">({loc.status})</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title={
            <div className="flex items-center">
              <Settings className="w-4 h-4 mr-2" /> Planning Rule Config
            </div>
          }>
            <div className="space-y-3">
              {rule ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Minimum:</span>
                    <span className="font-medium text-slate-200 font-mono">{rule.minimumQuantity}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Target:</span>
                    <span className="font-medium text-slate-200 font-mono">{rule.targetQuantity}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Maximum:</span>
                    <span className="font-medium text-slate-200 font-mono">{rule.maximumQuantity ?? 'None'}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-slate-800 pt-2">
                    <span className="text-slate-500">DDXM:</span>
                    <span className="font-medium text-slate-200 font-mono">{rule.controllingRetentionQuantity}</span>
                  </div>
                </>
              ) : (
                <div className="text-sm text-orange-400 italic">No planning rule configured</div>
              )}
            </div>
          </SectionCard>

          {snap.productionContext && (
            <SectionCard title={
              <div className="flex items-center">
                <PlayCircle className="w-4 h-4 mr-2" /> Production Context
              </div>
            }>
              <div className="space-y-3">
                <div className="flex justify-between text-sm items-center">
                  <span className="text-slate-500">Status:</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${snap.productionContext.isCurrentlyInProduction ? 'bg-brand-500/20 text-brand-400' : 'bg-slate-800 text-slate-400'}`}>
                    {snap.productionContext.isCurrentlyInProduction ? 'Running' : 'Not Running'}
                  </span>
                </div>
                {snap.productionContext.hoursUntilNextProduction !== null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Next Run:</span>
                    <span className="font-medium text-slate-200 font-mono">{snap.productionContext.hoursUntilNextProduction}h</span>
                  </div>
                )}
              </div>
            </SectionCard>
          )}
        </div>

        {/* Right Column: Engine Output & Actions */}
        <div className="md:col-span-2 space-y-6">
          <SectionCard title={
            <div className="flex items-center text-brand-400">
              <Calculator className="w-5 h-5 mr-2" />
              Engine Evaluation
            </div>
          }>
            <div className="space-y-6">
              
              <div className="flex items-center gap-4">
                <div className="flex-1 p-4 bg-slate-800 rounded-lg border border-slate-700">
                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Band Status</div>
                  <div className="text-lg font-bold text-slate-100">{out.planningBand.status.replace(/_/g, ' ')}</div>
                  <div className="text-xs text-slate-400 mt-1">Deficit: <span className="font-mono text-slate-300">{out.planningBand.deficitQuantity}</span>, Excess: <span className="font-mono text-slate-300">{out.planningBand.excessQuantity}</span></div>
                </div>
                
                {out.recommendedActionTypeId && (
                  <div className="flex-1 p-4 bg-brand-500/10 rounded-lg border border-brand-500/20">
                    <div className="text-xs text-brand-400/70 uppercase tracking-wider mb-1">Recommended Action</div>
                    <div className="text-lg font-bold text-brand-300">{out.recommendedActionTypeId}</div>
                    <div className="text-sm font-medium text-brand-400 mt-1">Quantity: <span className="font-mono">{out.recommendedQuantity}</span></div>
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-200 mb-3 flex items-center">
                  <Info className="w-4 h-4 mr-2 text-slate-400" />
                  Explanation Log
                </h4>
                <div className="bg-black/40 text-slate-300 rounded-lg p-4 font-mono text-xs space-y-2 overflow-x-auto border border-slate-800">
                  {out.explanationLines.map((line, idx) => (
                    <div key={idx} className="flex">
                      <span className="text-slate-600 mr-4">{(idx+1).toString().padStart(2, '0')}</span>
                      <span>{line}</span>
                    </div>
                  ))}
                  <div className="flex pt-2 mt-2 border-t border-slate-800">
                    <span className="text-slate-600 mr-4">--</span>
                    <span className="text-brand-400">EVALUATION COMPLETE</span>
                  </div>
                </div>
              </div>

              {out.dataQualityWarnings.length > 0 && (
                <div className="bg-amber-900/20 border border-amber-900/50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-amber-500 mb-2 flex items-center">
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Data Quality Warnings
                  </h4>
                  <ul className="list-disc list-inside text-sm text-amber-400/80 space-y-1">
                    {out.dataQualityWarnings.map((warning, idx) => (
                      <li key={idx}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

            </div>
          </SectionCard>

          {/* Action Area */}
          {isEditable ? (
            <SectionCard title="Planner Decision">
              <div className="space-y-4">
                {(() => {
                  const configIssues = out.dataQualityIssues.filter(i => i.code === 'CONFIGURATION_MISSING');
                  const hasConfigIssues = configIssues.length > 0;
                  const isAuthorizedToEditSettings = userProfile && (userProfile.role === 'PLATFORM_SUPERUSER' || userProfile.role === 'TENANT_ADMIN');

                  return (
                    <>
                      {hasConfigIssues && (
                        <div className="p-4 bg-red-950/40 border border-red-800 rounded-lg space-y-3">
                          <div className="flex items-start gap-3 justify-between">
                            <div className="flex items-start gap-3">
                              <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                              <div>
                                <h3 className="text-sm font-semibold text-red-200">Decision Engine Configuration Incomplete</h3>
                                <p className="text-xs text-red-400 mt-1">
                                  The decision engine was evaluated without a complete or valid site-specific configuration. 
                                  Approval is blocked until these settings are resolved.
                                </p>
                                <ul className="list-disc list-inside text-xs text-red-400/80 mt-2 space-y-1">
                                  {configIssues.map((issue, idx) => (
                                    <li key={idx}>{issue.message}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                            {isAuthorizedToEditSettings && (
                              <button
                                onClick={() => navigate('/admin/decision-settings')}
                                className="px-3 py-1.5 bg-red-900/60 hover:bg-red-900 text-red-200 rounded text-xs font-semibold transition-colors flex-shrink-0"
                              >
                                Go to Settings
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {!isOverriding && !isDismissing ? (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-slate-400">
                              {hasConfigIssues 
                                ? "Recommendation evaluation is incomplete due to missing configuration." 
                                : "Please review the recommendation and choose an action."}
                            </p>
                          </div>
                          <div className="flex gap-3">
                            <button 
                              onClick={() => setIsDismissing(true)} 
                              className="px-4 py-2 border border-slate-700 rounded-md text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
                            >
                              Dismiss
                            </button>
                            <button 
                              onClick={() => setIsOverriding(true)} 
                              disabled={hasConfigIssues}
                              className="px-4 py-2 border border-brand-500/30 rounded-md text-sm font-medium text-brand-400 hover:bg-brand-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              Override
                            </button>
                            <button 
                              onClick={handleApprove} 
                              disabled={actionLoading || !out.recommendedActionTypeId || hasConfigIssues} 
                              className="px-4 py-2 bg-brand-500 rounded-md text-sm font-medium text-slate-900 hover:bg-brand-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              Approve
                            </button>
                          </div>
                        </div>
                      ) : isOverriding ? (
                        <div className="space-y-4 bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                          <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-medium text-slate-200">Override Recommendation</h3>
                            <button className="text-sm text-slate-400 hover:text-slate-200" onClick={() => setIsOverriding(false)}>Cancel</button>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Action Type</label>
                        <select 
                          className="w-full bg-slate-900 border-slate-700 rounded-md shadow-sm focus:ring-brand-500 focus:border-brand-500 sm:text-sm text-slate-200"
                          value={overrideActionType}
                          onChange={(e) => setOverrideActionType(e.target.value)}
                        >
                          <option value="">None</option>
                          <option value="RELEASE_TO_DESPATCH">Release to Despatch</option>
                          <option value="REQUEST_PRODUCTION">Request Production</option>
                          <option value="HOLD_INVENTORY">Hold Inventory</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Quantity</label>
                        <input 
                          type="number"
                          className="w-full bg-slate-900 border-slate-700 rounded-md shadow-sm focus:ring-brand-500 focus:border-brand-500 sm:text-sm text-slate-200"
                          value={overrideQuantity}
                          onChange={(e) => setOverrideQuantity(Number(e.target.value))}
                          min="0"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1">Override Reason <span className="text-red-500">*</span></label>
                      <textarea 
                        className="w-full bg-slate-900 border-slate-700 rounded-md shadow-sm focus:ring-brand-500 focus:border-brand-500 sm:text-sm text-slate-200"
                        rows={3}
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder="Please explain why you are overriding this recommendation..."
                        required
                      />
                    </div>

                    <div className="flex justify-end pt-4">
                      <button 
                        onClick={handleOverrideSubmit} 
                        disabled={!overrideReason.trim() || actionLoading}
                        className="px-4 py-2 bg-brand-500 rounded-md text-sm font-medium text-slate-900 hover:bg-brand-400 transition-colors disabled:opacity-50"
                      >
                        Submit Override
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-medium text-slate-200">Dismiss Recommendation</h3>
                      <button className="text-sm text-slate-400 hover:text-slate-200" onClick={() => setIsDismissing(false)}>Cancel</button>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-1">Dismiss Reason <span className="text-red-500">*</span></label>
                      <textarea 
                        className="w-full bg-slate-900 border-slate-700 rounded-md shadow-sm focus:ring-brand-500 focus:border-brand-500 sm:text-sm text-slate-200"
                        rows={3}
                        value={dismissReason}
                        onChange={(e) => setDismissReason(e.target.value)}
                        placeholder="Please explain why this is not needed..."
                        required
                      />
                    </div>

                    <div className="flex justify-end pt-4">
                      <button 
                        onClick={handleDismissSubmit} 
                        disabled={!dismissReason.trim() || actionLoading}
                        className="px-4 py-2 bg-red-500/20 border border-red-500/50 text-red-400 rounded-md text-sm font-medium hover:bg-red-500/30 transition-colors disabled:opacity-50"
                      >
                        Confirm Dismiss
                      </button>
                    </div>
                  </div>
                )}
                </>
                  );
                })()}
              </div>
            </SectionCard>
          ) : (
            <SectionCard title="Planner Decision">
              <div className="space-y-4">
                {rec.plannerDecision ? (
                  <div className="space-y-4">
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider">Action</div>
                    <div className="font-medium text-slate-200">{rec.plannerDecision.actionTypeId || 'None'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider">Quantity</div>
                    <div className="font-medium text-slate-200 font-mono">{rec.plannerDecision.quantity}</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {!rec.linkedPriorityId && (
                    <button 
                      onClick={() => navigate(`/operations/priorities/new?recommendationId=${rec.id}`)}
                      className="px-4 py-2 bg-brand-500/20 text-brand-400 border border-brand-500/30 rounded-md text-sm font-medium hover:bg-brand-500/30 transition-colors"
                    >
                      Create Operational Priority
                    </button>
                  )}
                  {rec.linkedPriorityId && (
                    <span className="px-3 py-1 bg-green-900/30 text-green-400 text-xs border border-green-800 rounded">
                      Priority Created
                    </span>
                  )}
                  <div className="flex-1 px-4 py-2 bg-slate-800 rounded-md border border-slate-700">
                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Notes / Reason</div>
                    <div className="text-sm text-slate-300">{rec.plannerDecision.notes}</div>
                  </div>
                </div>
              </div>
                  </div>
                ) : (
                  <div className="text-slate-500 italic">No decision recorded (status: {rec.recommendationStatus})</div>
                )}
              </div>
            </SectionCard>
          )}

        </div>
      </div>
    </div>
  );
};

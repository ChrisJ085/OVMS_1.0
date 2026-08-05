import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, where } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { Recommendation } from '../../../types/recommendation';
import { SectionCard } from '../../../components/ui/SectionCard';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { ArrowLeft, AlertTriangle, CheckCircle, Info, Calculator, Box, RefreshCw, SlidersHorizontal, EyeOff, RotateCcw } from 'lucide-react';
import { 
  runSiteRecommendationJob, 
  overrideRecommendation, 
  suppressRecommendation, 
  restoreAutomaticRecommendation 
} from '../services/recommendationService';
import { useAuth } from '../../auth/context/AuthContext';
import { useSiteContext } from '../../../contexts/SiteContext';
import { subscribeToLocations } from '../../inventory/services/locationService';
import { subscribeToCollection } from '../../../services/firestoreBase';
import { collections } from '../../configuration/services/configurationService';
import { Location } from '../../../types/inventory';
import { ActionType, Destination, PriorityLevel } from '../../../types/configuration';
import { getActionTypeLabel, getDestinationLabel, getPriorityLevelLabel } from '../../operations/utils/priorityFormatters';

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

  // Suppress states
  const [isSuppressing, setIsSuppressing] = useState(false);
  const [suppressReason, setSuppressReason] = useState('');
  const [suppressScope, setSuppressScope] = useState<'UNTIL_NEXT_SNAPSHOT' | 'UNTIL_DATE' | 'PERMANENT'>('UNTIL_NEXT_SNAPSHOT');

  // Dynamic collections loaded from database for label mapping
  const [locations, setLocations] = useState<Location[]>([]);
  const [actionTypes, setActionTypes] = useState<ActionType[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [priorityLevels, setPriorityLevels] = useState<PriorityLevel[]>([]);

  useEffect(() => {
    if (!tenantId) return;

    const unsubLocations = subscribeToLocations(
      tenantId,
      siteId || '',
      setLocations,
      console.error
    );

    const unsubActions = subscribeToCollection<ActionType>(
      collections.ACTION_TYPES,
      [where('tenantId', '==', tenantId)],
      setActionTypes,
      console.error
    );

    const unsubDest = subscribeToCollection<Destination>(
      collections.DESTINATIONS,
      [where('tenantId', '==', tenantId)],
      (items) => {
        const filtered = items.filter(d => !d.siteId || d.siteId === '' || d.siteId === siteId);
        setDestinations(filtered);
      },
      console.error
    );

    const unsubPriorities = subscribeToCollection<PriorityLevel>(
      collections.PRIORITY_LEVELS,
      [where('tenantId', '==', tenantId)],
      setPriorityLevels,
      console.error
    );

    return () => {
      unsubLocations();
      unsubActions();
      unsubDest();
      unsubPriorities();
    };
  }, [tenantId, siteId]);

  const fetchRec = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const docRef = doc(db, 'recommendations', id);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as Recommendation;
        setRec(data);
        if (data.decisionOutput?.recommendedActionTypeId) {
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

  const handleOverrideSubmit = async () => {
    if (!rec || !overrideReason.trim()) return;
    setActionLoading(true);
    try {
      const res = await overrideRecommendation(
        rec.id,
        {
          actionTypeId: overrideActionType || undefined,
          quantity: overrideQuantity,
          destinationId: overrideDestination || undefined,
          priorityLevelId: overridePriority || undefined,
          reason: overrideReason.trim()
        }
      );
      if (res.success) {
        setIsOverriding(false);
        await fetchRec();
      } else {
        alert(`Override failed: ${res.error}`);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuppressSubmit = async () => {
    if (!rec || !suppressReason.trim()) return;
    setActionLoading(true);
    try {
      const res = await suppressRecommendation(
        rec.id,
        {
          reason: suppressReason.trim(),
          scope: suppressScope
        }
      );
      if (res.success) {
        setIsSuppressing(false);
        await fetchRec();
      } else {
        alert(`Suppression failed: ${res.error}`);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestoreAutomatic = async () => {
    if (!rec) return;
    setActionLoading(true);
    try {
      const res = await restoreAutomaticRecommendation(rec.id);
      if (res.success) {
        await fetchRec();
      } else {
        alert(`Restore failed: ${res.error}`);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecalculate = async () => {
    if (!rec || !tenantId || !siteId) return;
    setActionLoading(true);
    try {
      const result = await runSiteRecommendationJob(tenantId, siteId, {
        triggerType: 'MANUAL_RECALCULATION',
        productIds: [rec.productId],
        requestedBy: userProfile?.displayName || userProfile?.email || 'Planner',
        forceRecalculate: true
      });
      if (result.success) {
        await fetchRec();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const out = rec.decisionOutput;
  const snap = rec.sourceSnapshot;
  const rule = snap?.planningRule;

  // Sanitize explanation lines to format IDs into human-readable labels
  const formatExplanationLine = (line: string): string => {
    let renderedLine = line;

    actionTypes.forEach(act => {
      if (act.id && renderedLine.includes(act.id)) {
        renderedLine = renderedLine.replaceAll(act.id, act.label || act.name || act.code);
      }
    });

    destinations.forEach(dest => {
      if (dest.id && renderedLine.includes(dest.id)) {
        const label = dest.destinationName ? `${dest.destinationName} (${dest.destinationCode})` : dest.destinationCode;
        renderedLine = renderedLine.replaceAll(dest.id, label);
      }
    });

    priorityLevels.forEach(pl => {
      if (pl.id && renderedLine.includes(pl.id)) {
        renderedLine = renderedLine.replaceAll(pl.id, pl.label || pl.name || pl.code);
      }
    });

    // Clean any remaining raw collection ID substrings if match pattern
    renderedLine = renderedLine.replace(/\b(act_|dest_|prio_|prod_|rule_)[a-zA-Z0-9_-]+\b/g, (match) => {
      return match.toUpperCase();
    });

    return renderedLine;
  };

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
        <div className="flex items-center gap-3">
          {rec.recommendationStatus === 'AUTO_PUBLISHED' && <StatusBadge variant="completed" label="Published (Auto)" />}
          {rec.recommendationStatus === 'OVERRIDDEN' && <StatusBadge variant="warning" label="Planner Override" />}
          {rec.recommendationStatus === 'SUPPRESSED' && <StatusBadge variant="inactive" label="Suppressed" />}
          {rec.recommendationStatus === 'FAILED_VALIDATION' && <StatusBadge variant="blocked" label="Validation Exception" />}
          
          <button 
            className="flex items-center px-3 py-1.5 border border-slate-700 rounded-md text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            onClick={handleRecalculate} 
            disabled={actionLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${actionLoading ? 'animate-spin' : ''}`} />
            Re-evaluate Engine
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
                  <div className="text-2xl font-bold text-slate-100 font-mono">{snap?.inventoryTotal ?? 0}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Snapshot Time</div>
                  <div className="text-xs font-medium text-slate-300">
                    {snap?.inventoryUpdatedAt ? new Date(snap.inventoryUpdatedAt).toLocaleString() : 'N/A'}
                  </div>
                </div>
              </div>
              
              {(snap?.inventoryByLocation || []).length > 0 && (
                <div className="space-y-2 mt-4 pt-4 border-t border-slate-800">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Balances by Location</div>
                  {(snap.inventoryByLocation || []).map((loc, idx) => {
                    const matchLoc = locations.find(l => l.id === loc.locationId || l.locationCode === loc.locationId);
                    const locLabel = matchLoc 
                      ? `${matchLoc.locationCode} - ${matchLoc.locationName}` 
                      : (loc.locationCodeSnapshot || loc.locationId);
                    return (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-slate-400 font-mono">{locLabel}</span>
                        <span className="font-medium text-slate-200">
                          {loc.quantity} {loc.status !== 'AVAILABLE' && <span className="text-amber-400">({loc.status})</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Planning Rule Configuration">
            <div className="space-y-3 text-sm">
              {rule ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Minimum Quantity:</span>
                    <span className="font-medium text-slate-200 font-mono">{rule.minimumQuantity}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Target Quantity:</span>
                    <span className="font-medium text-slate-200 font-mono">{rule.targetQuantity}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Maximum Quantity:</span>
                    <span className="font-medium text-slate-200 font-mono">{rule.maximumQuantity ?? 'Unlimited'}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-800 pt-2">
                    <span className="text-slate-500">Controlling Retention:</span>
                    <span className="font-medium text-slate-200 font-mono">{rule.controllingRetentionQuantity}</span>
                  </div>
                </>
              ) : (
                <div className="text-sm text-rose-400 italic">No planning rule configured</div>
              )}
            </div>
          </SectionCard>
        </div>

        {/* Right Column: Engine Output & Explanation Log */}
        <div className="md:col-span-2 space-y-6">
          <SectionCard title={
            <div className="flex items-center text-brand-400">
              <Calculator className="w-5 h-5 mr-2" />
              Decision Engine Output
            </div>
          }>
            <div className="space-y-6">
              
              <div className="flex flex-col sm:flex-row items-stretch gap-4">
                <div className="flex-1 p-4 bg-slate-800 rounded-lg border border-slate-700">
                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Planning Band</div>
                  <div className="text-lg font-bold text-slate-100">{out?.planningBandStatus ? out.planningBandStatus.replace(/_/g, ' ') : 'NORMAL'}</div>
                  <div className="text-xs text-slate-400 mt-1">Shortfall: <span className="font-mono text-slate-300">{out?.shortfallQuantity ?? 0}</span></div>
                </div>
                
                {out?.recommendedActionTypeId && (() => {
                  const labelStr = getActionTypeLabel(out.recommendedActionTypeId, actionTypes);
                  return (
                    <div className="flex-1 p-4 bg-brand-500/10 rounded-lg border border-brand-500/20">
                      <div className="text-xs text-brand-400/70 uppercase tracking-wider mb-1">Instruction Type</div>
                      <div className="text-lg font-bold text-brand-300">{labelStr}</div>
                      <div className="text-sm font-medium text-brand-400 mt-1">Recommended Qty: <span className="font-mono">{out.recommendedQuantity}</span></div>
                    </div>
                  );
                })()}
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-200 mb-3 flex items-center">
                  <Info className="w-4 h-4 mr-2 text-slate-400" />
                  Explanation Log
                </h4>
                <div className="bg-black/50 text-slate-300 rounded-lg p-4 font-mono text-xs space-y-2 overflow-x-auto border border-slate-800">
                  {(out?.explanationLines || []).map((line, idx) => (
                    <div key={idx} className="flex">
                      <span className="text-slate-600 mr-4 flex-shrink-0">{(idx+1).toString().padStart(2, '0')}</span>
                      <span>{formatExplanationLine(line)}</span>
                    </div>
                  ))}
                  <div className="flex pt-2 mt-2 border-t border-slate-800">
                    <span className="text-slate-600 mr-4">--</span>
                    <span className="text-brand-400">EVALUATION COMPLETE — AUTOMATICALLY PUBLISHED</span>
                  </div>
                </div>
              </div>

              {(out?.dataQualityIssues || []).length > 0 && (
                <div className="bg-amber-900/20 border border-amber-900/50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-amber-500 mb-2 flex items-center">
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Data Quality & Validation Warnings
                  </h4>
                  <ul className="list-disc list-inside text-sm text-amber-400/80 space-y-1">
                    {(out?.dataQualityIssues || []).map((issue, idx) => (
                      <li key={idx}>{issue.message}</li>
                    ))}
                  </ul>
                </div>
              )}

            </div>
          </SectionCard>

          {/* Planner Controls Section */}
          <SectionCard title="Planner Controls & Override Status">
            <div className="space-y-4">
              {rec.recommendationStatus === 'OVERRIDDEN' ? (
                <div className="bg-amber-950/40 border border-amber-800/60 p-4 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-amber-300 flex items-center gap-2 text-sm">
                      <SlidersHorizontal className="w-4 h-4" />
                      Active Manual Override
                    </div>
                    <button 
                      onClick={handleRestoreAutomatic}
                      disabled={actionLoading}
                      className="px-3 py-1 bg-emerald-900 hover:bg-emerald-800 text-emerald-200 text-xs font-semibold rounded flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Restore Automatic Engine
                    </button>
                  </div>
                  <p className="text-xs text-amber-200/80">
                    Reason: <em>{rec.overrideContext?.reason || rec.overrideReason || 'No reason specified'}</em>
                  </p>
                </div>
              ) : rec.recommendationStatus === 'SUPPRESSED' ? (
                <div className="bg-purple-950/40 border border-purple-800/60 p-4 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-purple-300 flex items-center gap-2 text-sm">
                      <EyeOff className="w-4 h-4" />
                      Recommendation Suppressed
                    </div>
                    <button 
                      onClick={handleRestoreAutomatic}
                      disabled={actionLoading}
                      className="px-3 py-1 bg-emerald-900 hover:bg-emerald-800 text-emerald-200 text-xs font-semibold rounded flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Restore Automatic Engine
                    </button>
                  </div>
                  <p className="text-xs text-purple-200/80">
                    Scope: {rec.suppressionContext?.scope || 'UNTIL_NEXT_SNAPSHOT'}. Reason: <em>{rec.suppressionContext?.reason || 'Suppressed by planner'}</em>
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">
                    This recommendation was automatically published to Warehouse Execution upon inventory evaluation.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsSuppressing(true)}
                      className="px-3 py-1.5 border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded"
                    >
                      Suppress
                    </button>
                    <button
                      onClick={() => setIsOverriding(true)}
                      className="px-3 py-1.5 border border-amber-600 bg-amber-950/50 hover:bg-amber-900/60 text-amber-300 text-xs font-semibold rounded"
                    >
                      Override
                    </button>
                  </div>
                </div>
              )}

              {/* Inline Override Form */}
              {isOverriding && (
                <div className="p-4 bg-slate-800/80 border border-slate-700 rounded-lg space-y-3 text-xs mt-3">
                  <h4 className="font-bold text-slate-100">Apply Planner Override</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Action Type</label>
                      <select 
                        className="w-full bg-slate-900 border-slate-700 rounded p-2 text-slate-200"
                        value={overrideActionType}
                        onChange={e => setOverrideActionType(e.target.value)}
                      >
                        {actionTypes.map(act => (
                          <option key={act.id} value={act.id}>{act.label || act.code}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Override Quantity</label>
                      <input 
                        type="number" 
                        className="w-full bg-slate-900 border-slate-700 rounded p-2 text-slate-200"
                        value={overrideQuantity}
                        onChange={e => setOverrideQuantity(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Reason for Override (Required)</label>
                    <textarea 
                      required
                      rows={2}
                      className="w-full bg-slate-900 border-slate-700 rounded p-2 text-slate-200"
                      value={overrideReason}
                      onChange={e => setOverrideReason(e.target.value)}
                      placeholder="Specify business reason..."
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => setIsOverriding(false)} className="px-3 py-1 text-slate-400">Cancel</button>
                    <button onClick={handleOverrideSubmit} className="px-4 py-1 bg-amber-500 text-slate-950 font-bold rounded">Apply Override</button>
                  </div>
                </div>
              )}

              {/* Inline Suppress Form */}
              {isSuppressing && (
                <div className="p-4 bg-slate-800/80 border border-slate-700 rounded-lg space-y-3 text-xs mt-3">
                  <h4 className="font-bold text-slate-100">Suppress Recommendation</h4>
                  <div>
                    <label className="block text-slate-400 mb-1">Scope</label>
                    <select 
                      className="w-full bg-slate-900 border-slate-700 rounded p-2 text-slate-200"
                      value={suppressScope}
                      onChange={e => setSuppressScope(e.target.value as any)}
                    >
                      <option value="UNTIL_NEXT_SNAPSHOT">Until Next Inventory Snapshot</option>
                      <option value="PERMANENT">Permanent (Until Restored)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Reason (Required)</label>
                    <textarea 
                      required
                      rows={2}
                      className="w-full bg-slate-900 border-slate-700 rounded p-2 text-slate-200"
                      value={suppressReason}
                      onChange={e => setSuppressReason(e.target.value)}
                      placeholder="Specify reason for suppressing..."
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => setIsSuppressing(false)} className="px-3 py-1 text-slate-400">Cancel</button>
                    <button onClick={handleSuppressSubmit} className="px-4 py-1 bg-purple-600 text-white font-bold rounded">Apply Suppression</button>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

        </div>
      </div>
    </div>
  );
};

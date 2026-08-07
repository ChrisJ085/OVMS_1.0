import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { Recommendation } from '../../../types/recommendation';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { AlertTriangle, CheckCircle, ArrowRight, RefreshCw, Wand2, Factory, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { generateRecommendationForProduct, refreshSiteRecommendations } from '../services/recommendationService';
import { seedTestDataForTesting } from '../services/testDataSeeder';
import { useSiteContext } from '../../../contexts/SiteContext';
import { subscribeToCollection } from '../../../services/firestoreBase';
import { collections } from '../../configuration/services/configurationService';
import { ActionType, Destination, PriorityLevel } from '../../../types/configuration';
import { subscribeToProducts } from '../../inventory/services/productService';
import { Product } from '../../../types/product';
import { PriorityConflict } from '../../../types/priority';
import { detectPriorityConflicts } from '../../operations/services/priorityService';
import { PriorityConflictModal } from '../../operations/components/PriorityConflictModal';

const SUMMARY_TILES = [
  { id: 'requires-review', label: 'Requires Review', color: 'bg-blue-900 text-blue-100 border-blue-700' },
  { id: 'critical-exceptions', label: 'Critical Exceptions', color: 'bg-red-900 text-red-100 border-red-700' },
  { id: 'promotion-affected', label: 'Promotion Affected', color: 'bg-purple-900 text-purple-100 border-purple-700' },
  { id: 'below-retention', label: 'Below Retention', color: 'bg-orange-900 text-orange-100 border-orange-700' },
  { id: 'above-maximum', label: 'Above Maximum', color: 'bg-yellow-900 text-yellow-100 border-yellow-700' },
  { id: 'stale-missing-data', label: 'Stale/Missing Data', color: 'bg-slate-800 text-slate-300 border-slate-700' },
];

interface GenerationProgress {
  total: number;
  current: number;
  currentProductCode: string;
  successCount: number;
  errorCount: number;
  statusText: string;
}

export const RecommendationsWorkspacePage: React.FC = () => {
  const { tenantId, siteId } = useSiteContext();
  const navigate = useNavigate();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('requires-review');
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);

  const [actionTypes, setActionTypes] = useState<ActionType[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [priorityLevels, setPriorityLevels] = useState<PriorityLevel[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [conflicts, setConflicts] = useState<PriorityConflict[]>([]);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);

  useEffect(() => {
    if (!tenantId) return;

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

    const unsubLevels = subscribeToCollection<PriorityLevel>(
      collections.PRIORITY_LEVELS,
      [where('tenantId', '==', tenantId)],
      setPriorityLevels,
      console.error
    );

    const unsubProducts = subscribeToProducts(tenantId, siteId, setProducts, console.error);

    return () => {
      unsubActions();
      unsubDest();
      unsubLevels();
      unsubProducts();
    };
  }, [tenantId, siteId]);

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach(p => {
      if (p.id) map.set(p.id, p);
      if (p.productCode) map.set(p.productCode, p);
    });
    return map;
  }, [products]);

  const formatRecommendedActionText = (
    actionTypeId: string | null | undefined,
    quantity: number | null | undefined,
    destinationId: string | null | undefined,
    casesPerPallet?: number | null
  ): string => {
    if (!actionTypeId) return 'None';

    const actionMatch = actionTypes.find(a => a.id === actionTypeId || a.code === actionTypeId || a.label === actionTypeId);
    const actionCode = (actionMatch?.code || actionTypeId).toUpperCase();
    const rawLabel = actionMatch?.label || (
      actionCode === 'RELEASE' || actionCode === 'ACTION_RELEASE' ? 'Release' :
      actionCode === 'HOLD' || actionCode === 'ACTION_HOLD' ? 'Hold' :
      actionCode === 'REVIEW' || actionCode === 'ACTION_REVIEW' ? 'Review' :
      actionTypeId.replace(/^ACTION_/, '').replace(/_/g, ' ')
    );
    
    const actionLabel = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1).toLowerCase();

    if (actionCode.includes('HOLD') || actionLabel.toLowerCase().includes('hold')) {
      return 'Hold';
    }

    const rawQty = quantity || 0;
    let finalPallets = rawQty;

    if (casesPerPallet && casesPerPallet > 0) {
      finalPallets = Math.round(rawQty / casesPerPallet);
    }

    let destText = '';
    if (destinationId) {
      const destMatch = destinations.find(d => d.id === destinationId || d.destinationCode === destinationId || d.destinationName === destinationId);
      if (destMatch) {
        destText = destMatch.destinationCode || destMatch.destinationName || destinationId;
      } else if (destinationId.startsWith('DEST_')) {
        destText = destinationId.replace('DEST_', '');
      } else {
        destText = destinationId;
      }
    }

    if (rawQty > 0 || finalPallets > 0) {
      const pltsLabel = `${finalPallets} plts`;
      if (destText) {
        return `${actionLabel} ${pltsLabel} to ${destText}`;
      }
      return `${actionLabel} ${pltsLabel}`;
    }

    if (destText) {
      return `${actionLabel} to ${destText}`;
    }

    return actionLabel;
  };

  const fetchRecs = async () => {
    if (!tenantId || !siteId) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'recommendations'),
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId)
      );
      const snap = await getDocs(q);
      const recs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Recommendation));
      recs.sort((a, b) => {
        const tA = a.generatedAt ? (typeof a.generatedAt === 'string' ? new Date(a.generatedAt).getTime() : ((a.generatedAt as any).toMillis ? (a.generatedAt as any).toMillis() : new Date(a.generatedAt as any).getTime())) : 0;
        const tB = b.generatedAt ? (typeof b.generatedAt === 'string' ? new Date(b.generatedAt).getTime() : ((b.generatedAt as any).toMillis ? (b.generatedAt as any).toMillis() : new Date(b.generatedAt as any).getTime())) : 0;
        return tB - tA;
      });
      setRecommendations(recs);

      // Check for active priority conflicts
      const activeConflicts = await detectPriorityConflicts(tenantId, siteId);
      setConflicts(activeConflicts);
    } catch (e) {
      console.error('Error fetching recommendations:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecs();
  }, [tenantId, siteId]);

  const handleGenerateAll = async () => {
    if (!tenantId || !siteId) return;
    setGenerating(true);
    try {
      setProgress({
        total: 100,
        current: 0,
        currentProductCode: 'Initializing',
        successCount: 0,
        errorCount: 0,
        statusText: 'Starting Recommendation Workspace generation & operational priorities sync...'
      });

      const res = await refreshSiteRecommendations(tenantId, siteId, true, (prog) => {
        setProgress({
          total: prog.total,
          current: prog.current,
          currentProductCode: prog.productCode || '',
          successCount: prog.current,
          errorCount: 0,
          statusText: `Evaluating product ${prog.current} of ${prog.total}: ${prog.productCode || ''}`
        });
      });

      if (res.success && res.data) {
        const detectedConflicts = res.data.conflicts || [];
        setConflicts(detectedConflicts);

        setProgress({
          total: 100,
          current: 100,
          currentProductCode: 'Complete',
          successCount: res.data.generatedCount,
          errorCount: 0,
          statusText: `Recommendation Workspace Generation Complete! Evaluated ${res.data.generatedCount} products.`
        });

        if (detectedConflicts.length > 0) {
          setIsConflictModalOpen(true);
        }
      } else {
        alert(`Workspace generation failed: ${res.error}`);
      }

      await fetchRecs();
      await new Promise(resolve => setTimeout(resolve, 600));
    } catch (e: any) {
      console.error(e);
      alert(`Failed to generate recommendations: ${e?.message || 'Error generating recommendations'}`);
    } finally {
      setProgress(null);
      setGenerating(false);
    }
  };

  const handleSeedTestData = async () => {
    if (!tenantId || !siteId) return;
    setSeeding(true);
    try {
      const result = await seedTestDataForTesting(tenantId, siteId);
      alert(result.message);
      await fetchRecs();
    } catch (e: any) {
      console.error('Seeding failed:', e);
      alert(`Seeding failed: ${e?.message || 'Unknown error'}`);
    } finally {
      setSeeding(false);
    }
  };

  const isQualifyingBelowRetention = (r: Recommendation): boolean => {
    const bandStatus = r.decisionOutput?.planningBandStatus || (r.decisionOutput as any)?.planningBand?.status;
    if (bandStatus !== 'BELOW_CONTROL') return false;

    const qoh = r.sourceSnapshot?.inventoryTotal ?? 0;
    const pCtx = r.sourceSnapshot?.productionContext;
    const hasActiveProductionToday = Boolean(
      pCtx && (
        (pCtx.plannedCasesToday ?? 0) > 0 ||
        (pCtx.plannedPalletsToday ?? 0) > 0 ||
        pCtx.isCurrentlyInProduction
      )
    );

    return qoh > 0 || hasActiveProductionToday;
  };

  const activeRecs = recommendations.filter(r => {
    if (!showSuperseded && (r.recommendationStatus === 'SUPERSEDED' || r.recommendationStatus === 'EXPIRED')) {
      return false;
    }
    return true;
  });

  const filteredRecs = activeRecs.filter(r => {
    const warnings = r.decisionOutput?.dataQualityIssues || [];
    const impacts = r.sourceSnapshot?.activePromotionImpacts || [];
    const bandStatus = r.decisionOutput?.planningBandStatus || (r.decisionOutput as any)?.planningBand?.status;

    if (activeFilter === 'requires-review') return r.recommendationStatus === 'AWAITING_REVIEW';
    if (activeFilter === 'critical-exceptions') return r.recommendationStatus === 'AWAITING_REVIEW' && warnings.length > 0;
    if (activeFilter === 'promotion-affected') return impacts.length > 0;
    if (activeFilter === 'below-retention') return isQualifyingBelowRetention(r);
    if (activeFilter === 'above-maximum') return bandStatus === 'ABOVE_MAXIMUM';
    if (activeFilter === 'stale-missing-data') return warnings.length > 0;
    return true;
  });

  const getTileCount = (id: string) => {
    const currentPool = recommendations.filter(r => r.recommendationStatus !== 'SUPERSEDED' && r.recommendationStatus !== 'EXPIRED');
    if (id === 'requires-review') return currentPool.filter(r => r.recommendationStatus === 'AWAITING_REVIEW').length;
    if (id === 'critical-exceptions') return currentPool.filter(r => r.recommendationStatus === 'AWAITING_REVIEW' && (r.decisionOutput?.dataQualityIssues || []).length > 0).length;
    if (id === 'promotion-affected') return currentPool.filter(r => (r.sourceSnapshot?.activePromotionImpacts || []).length > 0).length;
    if (id === 'below-retention') return currentPool.filter(r => isQualifyingBelowRetention(r)).length;
    if (id === 'above-maximum') return currentPool.filter(r => (r.decisionOutput?.planningBandStatus || (r.decisionOutput as any)?.planningBand?.status) === 'ABOVE_MAXIMUM').length;
    if (id === 'stale-missing-data') return currentPool.filter(r => (r.decisionOutput?.dataQualityIssues || []).length > 0).length;
    return 0;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <PageHeader 
          title="Recommendation Workspace" 
          description="Review, approve, or override system recommendations."
        />
        <div className="flex gap-2">
          <button 
            onClick={handleSeedTestData} 
            disabled={seeding || loading}
            className="flex items-center gap-2 text-sm font-medium text-slate-200 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-md hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <Wand2 className={`w-4 h-4 text-brand-400 ${seeding ? 'animate-pulse' : ''}`} />
            {seeding ? 'Seeding...' : 'Seed Test Data'}
          </button>

          <button 
            onClick={handleGenerateAll} 
            disabled={generating}
            className="flex items-center gap-2 text-sm font-medium text-slate-900 bg-brand-500 px-3 py-1.5 rounded-md hover:bg-brand-400 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Generating...' : 'Generate All'}
          </button>
        </div>
      </div>

      {progress && (
        <div className="bg-slate-800/90 border border-brand-500/40 rounded-xl p-4 shadow-2xl space-y-3 transition-all animate-fadeIn">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-brand-500/10 border border-brand-500/30 rounded-lg text-brand-400">
                <RefreshCw className="w-5 h-5 animate-spin" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <span>Evaluating Recommendations</span>
                  {progress.currentProductCode && progress.currentProductCode !== 'Complete' && (
                    <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-brand-300">
                      {progress.currentProductCode}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {progress.statusText}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold font-mono text-brand-400">
                {Math.round((progress.current / progress.total) * 100)}%
              </div>
              <div className="text-xs text-slate-400 font-mono">
                {progress.current} / {progress.total} SKUs
              </div>
            </div>
          </div>

          <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden border border-slate-700/60 relative">
            <div 
              className="bg-gradient-to-r from-brand-500 via-blue-500 to-emerald-400 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 pt-0.5">
            <div className="flex gap-4">
              <span className="text-emerald-400 font-medium">✓ {progress.successCount} Updated</span>
              {progress.errorCount > 0 && (
                <span className="text-red-400 font-medium">✗ {progress.errorCount} Errors</span>
              )}
            </div>
            <span className="text-slate-500 italic">Will automatically close upon completion</span>
          </div>
        </div>
      )}

      {/* Operational Priority Conflicts Banner */}
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
            <span>Resolve Conflicts Now</span>
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
            <span className={`text-3xl font-bold mb-1 ${activeFilter === tile.id ? '' : 'text-slate-100'}`}>{getTileCount(tile.id)}</span>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${activeFilter === tile.id ? 'bg-black/20' : tile.color}`}>
              {tile.label}
            </span>
          </div>
        ))}
      </div>

      <SectionCard 
        title="Recommendations"
        action={
          <label className="flex items-center gap-2 text-xs font-medium text-slate-400 cursor-pointer hover:text-slate-200 transition-colors">
            <input 
              type="checkbox" 
              checked={showSuperseded} 
              onChange={(e) => setShowSuperseded(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-brand-500 focus:ring-brand-500 focus:ring-offset-slate-900"
            />
            Show Superseded History
          </label>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-300">
            <thead className="text-xs uppercase bg-slate-800 text-slate-400">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">QOH</th>
                <th className="px-4 py-3">Planning Status</th>
                <th className="px-4 py-3">Recommended Action</th>
                <th className="px-4 py-3">Data Quality</th>
                <th className="px-4 py-3">Generated</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">Loading recommendations...</td>
                </tr>
              ) : filteredRecs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">No recommendations found.</td>
                </tr>
              ) : (
                filteredRecs.map(rec => {
                  const pCtx = rec.sourceSnapshot?.productionContext;
                  const hasActiveProductionToday = Boolean(
                    pCtx && (
                      pCtx.isCurrentlyInProduction ||
                      (pCtx.plannedCasesToday ?? 0) > 0 ||
                      (pCtx.plannedPalletsToday ?? 0) > 0
                    )
                  );

                  const prod = productMap.get(rec.productId) || productMap.get(rec.productCodeSnapshot);
                  const casesPerPallet = prod?.casesPerPallet || prod?.configurations?.[0]?.casesPerPallet || (rec.sourceSnapshot as any)?.casesPerPallet || null;

                  return (
                    <tr key={rec.id} className="hover:bg-slate-800/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-100">{rec.productCodeSnapshot}</span>
                          {hasActiveProductionToday && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 border border-amber-500/40 text-amber-300">
                              <Factory className="w-3 h-3 text-amber-400" />
                              In Production {pCtx?.currentProductionLine ? `(${pCtx.currentProductionLine})` : ''}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400">{rec.descriptionSnapshot}</div>
                      </td>
                      <td className="px-4 py-3 font-mono">{rec.sourceSnapshot?.inventoryTotal ?? 0}</td>
                      <td className="px-4 py-3">
                        {(() => {
                          const band = rec.decisionOutput?.planningBandStatus || (rec.decisionOutput as any)?.planningBand?.status || 'NORMAL';
                          let badgeClass = 'border-slate-600 bg-slate-800 text-slate-300';
                          if (band === 'BELOW_CONTROL') badgeClass = 'border-orange-500/50 bg-orange-950/40 text-orange-300';
                          else if (band === 'ABOVE_MAXIMUM') badgeClass = 'border-yellow-500/50 bg-yellow-950/40 text-yellow-300';
                          else if (band === 'BELOW_TARGET') badgeClass = 'border-blue-500/50 bg-blue-950/40 text-blue-300';
                          else if (band === 'AT_TARGET' || band === 'ABOVE_TARGET') badgeClass = 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300';
                          return (
                            <span className={`text-xs font-medium px-2 py-1 rounded border ${badgeClass}`}>
                              {band.replace(/_/g, ' ')}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const actionTypeId = rec.plannerDecision?.actionTypeId || rec.decisionOutput?.recommendedActionTypeId;
                          const qty = rec.plannerDecision ? rec.plannerDecision.quantity : rec.decisionOutput?.recommendedQuantity;
                          const destId = rec.plannerDecision ? rec.plannerDecision.destinationId : rec.decisionOutput?.recommendedDestinationId;

                          const actionText = formatRecommendedActionText(actionTypeId, qty, destId, casesPerPallet);

                          if (actionText === 'None' || actionText === 'Hold') {
                            return <span className="text-slate-500 font-medium">{actionText}</span>;
                          }

                          return (
                            <span className="font-semibold text-brand-400">
                              {actionText}
                            </span>
                          );
                        })()}
                      </td>
                    <td className="px-4 py-3">
                      {(rec.decisionOutput?.dataQualityIssues || []).length > 0 ? (
                        <div className="flex items-center text-amber-400">
                          <AlertTriangle className="w-4 h-4 mr-1" />
                          <span>{(rec.decisionOutput?.dataQualityIssues || []).length} Warnings</span>
                        </div>
                      ) : (
                        <div className="flex items-center text-green-400">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          <span>Good</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {(rec.generatedAt as any)?.toDate?.()?.toLocaleString() || new Date(rec.generatedAt as unknown as string).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {rec.recommendationStatus === 'SUPERSEDED' ? (
                        <StatusBadge variant="blocked" label="SUPERSEDED" />
                      ) : rec.recommendationStatus === 'AUTO_PUBLISHED' ? (
                        <StatusBadge variant="completed" label="AUTO PUBLISHED" />
                      ) : rec.recommendationStatus === 'APPROVED' ? (
                        <StatusBadge variant="completed" label="APPROVED" />
                      ) : rec.recommendationStatus === 'OVERRIDDEN' ? (
                        <StatusBadge variant="warning" label="OVERRIDDEN" />
                      ) : rec.recommendationStatus === 'DISMISSED' ? (
                        <StatusBadge variant="neutral" label="DISMISSED" />
                      ) : (
                        <StatusBadge variant="in-progress" label={rec.recommendationStatus ? rec.recommendationStatus.replace(/_/g, ' ') : 'AWAITING REVIEW'} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button 
                        className="flex items-center justify-end text-brand-400 hover:text-brand-300 text-xs font-medium"
                        onClick={() => navigate(`/planning/recommendations/${rec.id}`)}
                      >
                        Review <ArrowRight className="w-4 h-4 ml-1" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Priority Conflict Modal */}
      <PriorityConflictModal
        isOpen={isConflictModalOpen}
        tenantId={tenantId || ''}
        siteId={siteId || ''}
        conflicts={conflicts}
        actionTypes={actionTypes}
        destinations={destinations}
        priorityLevels={priorityLevels}
        onClose={() => setIsConflictModalOpen(false)}
        onResolved={fetchRecs}
      />
    </div>
  );
};

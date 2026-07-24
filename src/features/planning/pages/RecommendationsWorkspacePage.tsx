import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { Recommendation } from '../../../types/recommendation';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SectionCard } from '../../../components/ui/SectionCard';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { AlertTriangle, CheckCircle, ArrowRight, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { generateRecommendationForProduct } from '../services/recommendationService';
import { useSiteContext } from '../../../contexts/SiteContext';

const SUMMARY_TILES = [
  { id: 'requires-review', label: 'Requires Review', color: 'bg-blue-900 text-blue-100 border-blue-700' },
  { id: 'critical-exceptions', label: 'Critical Exceptions', color: 'bg-red-900 text-red-100 border-red-700' },
  { id: 'promotion-affected', label: 'Promotion Affected', color: 'bg-purple-900 text-purple-100 border-purple-700' },
  { id: 'below-retention', label: 'Below Retention', color: 'bg-orange-900 text-orange-100 border-orange-700' },
  { id: 'above-maximum', label: 'Above Maximum', color: 'bg-yellow-900 text-yellow-100 border-yellow-700' },
  { id: 'stale-missing-data', label: 'Stale/Missing Data', color: 'bg-slate-800 text-slate-300 border-slate-700' },
];

export const RecommendationsWorkspacePage: React.FC = () => {
  const { tenantId, siteId } = useSiteContext();
  const navigate = useNavigate();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('requires-review');
  const [generating, setGenerating] = useState(false);

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
      const q = query(collection(db, 'products'), where('tenantId', '==', tenantId), where('status', '==', 'active'));
      const snap = await getDocs(q);
      
      let count = 0;
      for (const doc of snap.docs) {
        const res = await generateRecommendationForProduct(tenantId, siteId, doc.id);
        if (res.success && res.data) count++;
      }
      alert(`Generated/Updated ${count} recommendations`);
      await fetchRecs();
    } catch (e) {
      console.error(e);
      alert('Error generating recommendations');
    } finally {
      setGenerating(false);
    }
  };

  const filteredRecs = recommendations.filter(r => {
    if (activeFilter === 'requires-review') return r.recommendationStatus === 'AWAITING_REVIEW';
    if (activeFilter === 'critical-exceptions') return r.recommendationStatus === 'AWAITING_REVIEW' && r.decisionOutput.dataQualityWarnings.length > 0;
    if (activeFilter === 'promotion-affected') return r.sourceSnapshot.activePromotionImpacts.length > 0;
    if (activeFilter === 'below-retention') return r.decisionOutput.planningBand.status === 'BELOW_CONTROL';
    if (activeFilter === 'above-maximum') return r.decisionOutput.planningBand.status === 'ABOVE_MAXIMUM';
    if (activeFilter === 'stale-missing-data') return r.decisionOutput.dataQualityWarnings.length > 0;
    return true;
  });

  const getTileCount = (id: string) => {
    if (id === 'requires-review') return recommendations.filter(r => r.recommendationStatus === 'AWAITING_REVIEW').length;
    if (id === 'critical-exceptions') return recommendations.filter(r => r.recommendationStatus === 'AWAITING_REVIEW' && r.decisionOutput.dataQualityWarnings.length > 0).length;
    if (id === 'promotion-affected') return recommendations.filter(r => r.sourceSnapshot.activePromotionImpacts.length > 0).length;
    if (id === 'below-retention') return recommendations.filter(r => r.decisionOutput.planningBand.status === 'BELOW_CONTROL').length;
    if (id === 'above-maximum') return recommendations.filter(r => r.decisionOutput.planningBand.status === 'ABOVE_MAXIMUM').length;
    if (id === 'stale-missing-data') return recommendations.filter(r => r.decisionOutput.dataQualityWarnings.length > 0).length;
    return 0;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <PageHeader 
          title="Recommendation Workspace" 
          description="Review, approve, or override system recommendations."
        />
        <div>
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

      <SectionCard title="Recommendations">
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
                filteredRecs.map(rec => (
                  <tr key={rec.id} className="hover:bg-slate-800/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-100">{rec.productCodeSnapshot}</div>
                      <div className="text-xs text-slate-400">{rec.descriptionSnapshot}</div>
                    </td>
                    <td className="px-4 py-3 font-mono">{rec.sourceSnapshot.inventoryTotal}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium px-2 py-1 rounded border border-slate-600 bg-slate-800 text-slate-300">
                        {rec.decisionOutput.planningBand.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {rec.decisionOutput.recommendedAction ? (
                        <div>
                          <div className="font-medium text-brand-400">{rec.decisionOutput.recommendedAction.actionType}</div>
                          <div className="text-xs text-slate-400">Qty: {rec.decisionOutput.recommendedAction.quantity}</div>
                        </div>
                      ) : (
                        <span className="text-slate-500">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {rec.decisionOutput.dataQualityWarnings.length > 0 ? (
                        <div className="flex items-center text-amber-400">
                          <AlertTriangle className="w-4 h-4 mr-1" />
                          <span>{rec.decisionOutput.dataQualityWarnings.length} Warnings</span>
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
                      {rec.recommendationStatus === 'AWAITING_REVIEW' 
                        ? <StatusBadge variant="in-progress" label={rec.recommendationStatus.replace(/_/g, ' ')} />
                        : <StatusBadge variant={rec.recommendationStatus === 'APPROVED' ? 'completed' : 'blocked'} label={rec.recommendationStatus.replace(/_/g, ' ')} />
                      }
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
};

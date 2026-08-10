import React, { useState } from 'react';
import { CheckCircle, RefreshCw } from 'lucide-react';
import { ParsedPlanPreview } from '../../services/mpps7ImportService';
import { refreshSiteRecommendations } from '../../services/recommendationService';
import { useSiteContext } from '../../../../contexts/SiteContext';

interface ImportCommitStepProps {
  committedImportId: string;
  previewData: ParsedPlanPreview | null;
  onViewPlanGrid: () => void;
  onViewImportHistory: () => void;
}

export const ImportCommitStep: React.FC<ImportCommitStepProps> = ({
  committedImportId,
  previewData,
  onViewPlanGrid,
  onViewImportHistory
}) => {
  const { tenantId, siteId } = useSiteContext();
  const [generating, setGenerating] = useState(false);
  const [genMessage, setGenMessage] = useState<string | null>(null);
  const [regenProgress, setRegenProgress] = useState<{ current: number; total: number; productCode?: string } | null>(null);

  const handleRegenerate = async () => {
    setGenerating(true);
    setGenMessage(null);
    setRegenProgress({ current: 0, total: 1 });
    try {
      const res = await refreshSiteRecommendations(tenantId, siteId, true, (progress) => {
        setRegenProgress(progress);
      });
      if (res.success) {
        setGenMessage(`Regenerated recommendations for ${res.data?.generatedCount || 0} product(s). The latest production plan is now active in the Recommendation Workspace and TV Dashboard!`);
      } else {
        setGenMessage(`Generation failed: ${res.error}`);
      }
    } catch (e: any) {
      setGenMessage(`Error: ${e.message}`);
    } finally {
      setGenerating(false);
      setRegenProgress(null);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center space-y-6">
        <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-slate-100">Planning Ingestion Succeeded</h3>
          <p className="text-sm text-slate-400 mt-1">SAP MPPS7 spreadsheet rows have been written to the master planning collection.</p>
        </div>
        <div className="bg-slate-950 p-4 border border-slate-850 rounded text-xs font-mono text-slate-400 space-y-2">
          <div className="flex justify-between">
            <span>Generated Import ID</span>
            <strong className="text-slate-200 font-semibold">{committedImportId}</strong>
          </div>
          <div className="flex justify-between">
            <span>Active Schedule entries</span>
            <strong className="text-slate-200 font-semibold">{previewData?.rows.length || 0} rows written</strong>
          </div>
        </div>

        <div className="bg-slate-950/80 border border-brand-500/30 rounded-lg p-4 text-left space-y-3">
          <div className="flex items-start gap-2">
            <RefreshCw className="w-4 h-4 text-brand-400 mt-0.5 shrink-0" />
            <div>
              <h4 className="text-xs font-semibold text-slate-200">Recommendation Workspace Sync</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                New production schedule data is uploaded. Would you like to re-evaluate product recommendations to update the Recommendation Workspace and TV Dashboard?
              </p>
            </div>
          </div>

          {generating && regenProgress && (
            <div className="space-y-2 p-3 bg-slate-900/90 rounded-lg border border-slate-800 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                <span className="flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 text-brand-400 animate-spin" />
                  Evaluating product recommendations...
                </span>
                <span className="text-brand-400 font-mono font-semibold">
                  {regenProgress.total > 0 ? Math.round((regenProgress.current / regenProgress.total) * 100) : 0}%
                </span>
              </div>

              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-brand-500 h-2 rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${Math.min(100, Math.max(5, regenProgress.total > 0 ? Math.round((regenProgress.current / regenProgress.total) * 100) : 5))}%`
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Product {regenProgress.current} of {regenProgress.total}</span>
                {regenProgress.productCode && (
                  <span className="font-mono text-slate-300 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                    {regenProgress.productCode}
                  </span>
                )}
              </div>
            </div>
          )}

          {genMessage && (
            <div className="p-2.5 bg-brand-500/10 border border-brand-500/30 rounded text-xs text-brand-300">
              {genMessage}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleRegenerate}
              disabled={generating}
              className="px-3 py-1.5 bg-brand-500 text-slate-950 text-xs font-semibold rounded hover:bg-brand-400 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
              {generating ? 'Regenerating Recommendations...' : 'Regenerate Recommendations Now'}
            </button>
          </div>
        </div>

        <div className="flex gap-3 justify-center pt-2">
          <button
            onClick={onViewPlanGrid}
            className="px-4 py-2 bg-slate-800 border border-slate-700 text-sm font-semibold text-slate-200 rounded hover:bg-slate-750 transition-colors"
          >
            View Plan Grid
          </button>
          <button
            onClick={onViewImportHistory}
            className="px-4 py-2 bg-slate-800 border border-slate-700 text-sm font-semibold text-slate-200 rounded hover:bg-slate-750 transition-colors"
          >
            View Import History
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useMemo } from 'react';
import { 
  refreshSiteRecommendations, 
  getSiteRecommendationRunRef 
} from '../services/recommendationService';
import { PriorityConflict } from '../../../types/priority';
import { SiteRecommendationRun } from '../../../types/recommendation';
import { useAuth } from '../../auth/context/AuthContext';
import { useSiteContext } from '../../../contexts/SiteContext';
import { formatRecLastGenerated, formatRelativeTime } from '../../../utils/timeFormatters';
import { supabase } from '../../../config/supabase';
import { toCamelCase } from '../../../utils/caseTransformers';

export interface GenerationProgress {
  total: number;
  current: number;
  currentProductCode: string;
  successCount: number;
  errorCount: number;
  statusText: string;
}

export interface GenerationCompletionInfo {
  timestamp: number;
  generatedCount: number;
  conflictsCount: number;
  siteId: string;
  completedByName?: string | null;
  error?: string;
}

export interface RecommendationGenerationContextType {
  isGenerating: boolean;
  isLocallyGenerating: boolean;
  generatingTenantId: string | null;
  generatingSiteId: string | null;
  progress: GenerationProgress | null;
  completionInfo: GenerationCompletionInfo | null;
  isCompletedRecently: boolean;
  generatorName: string | null;
  lastRun: SiteRecommendationRun | null;
  lastGeneratedText: string;
  relativeTimeText: string;
  conflicts: PriorityConflict[];
  isConflictModalOpen: boolean;
  setIsConflictModalOpen: (open: boolean) => void;
  startGeneration: (tenantId?: string, siteId?: string, forceReevaluate?: boolean) => Promise<boolean>;
  dismissCompletion: () => void;
  lastRefreshTimestamp: number;
}

const RecommendationGenerationContext = createContext<RecommendationGenerationContextType | undefined>(undefined);

export const RecommendationGenerationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { userProfile, user } = useAuth();
  const { tenantId: activeTenantId, siteId: activeSiteId } = useSiteContext();

  const [isLocallyGenerating, setIsLocallyGenerating] = useState<boolean>(false);
  const [generatingTenantId, setGeneratingTenantId] = useState<string | null>(null);
  const [generatingSiteId, setGeneratingSiteId] = useState<string | null>(null);
  const [localProgress, setLocalProgress] = useState<GenerationProgress | null>(null);
  const [completionInfo, setCompletionInfo] = useState<GenerationCompletionInfo | null>(null);
  const [isCompletedRecently, setIsCompletedRecently] = useState<boolean>(false);
  const [conflicts, setConflicts] = useState<PriorityConflict[]>([]);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState<boolean>(false);
  const [lastRefreshTimestamp, setLastRefreshTimestamp] = useState<number>(Date.now());
  const [siteRunData, setSiteRunData] = useState<SiteRecommendationRun | null>(null);
  const [clockTick, setClockTick] = useState<number>(Date.now());

  const autoDismissTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevRunStatusRef = useRef<string | null>(null);

  // Periodic clock tick every 30 seconds for live relative time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setClockTick(Date.now());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Listen to site recommendation run document natively
  useEffect(() => {
    if (!activeTenantId || !activeSiteId) {
      setSiteRunData(null);
      return;
    }

    const fetchRunData = async () => {
      try {
        const { data, error } = await supabase
          .from('site_recommendation_runs')
          .select('*')
          .eq('id', `${activeTenantId}_${activeSiteId}`)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          const runData = toCamelCase<SiteRecommendationRun>(data);
          setSiteRunData(runData);
          setLastRefreshTimestamp(Date.now());

          const prevStatus = prevRunStatusRef.current;
          prevRunStatusRef.current = runData.status;

          // If another user completed a run recently (transitioned to COMPLETED), show feedback
          if (prevStatus === 'IN_PROGRESS' && runData.status === 'COMPLETED' && !isLocallyGenerating) {
            setCompletionInfo({
              timestamp: Date.now(),
              generatedCount: runData.generatedCount || 0,
              conflictsCount: runData.conflictsCount || 0,
              siteId: activeSiteId,
              completedByName: runData.completedByName || runData.startedByName
            });
            setIsCompletedRecently(true);

            if (autoDismissTimerRef.current) {
              clearTimeout(autoDismissTimerRef.current);
            }
            autoDismissTimerRef.current = setTimeout(() => {
              setIsCompletedRecently(false);
            }, 10000);
          }
        } else {
          setSiteRunData(null);
        }
      } catch (err) {
        console.warn('Error fetching site recommendation run:', err);
      }
    };

    fetchRunData();

    const channel = supabase
      .channel(`site_run_realtime_${activeSiteId}_${Math.random().toString(36).substring(2, 8)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'site_recommendation_runs',
          filter: `id=eq.${activeTenantId}_${activeSiteId}`
        },
        () => {
          fetchRunData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTenantId, activeSiteId, isLocallyGenerating]);

  // Determine whether a run is currently in progress
  const isRemoteGenerating = useMemo(() => {
    if (!siteRunData || siteRunData.status !== 'IN_PROGRESS') return false;
    
    // Check for stale runs (older than 15 minutes)
    const startedMs = siteRunData.startedAt ? new Date(siteRunData.startedAt).getTime() : 0;
    const lastUpdatedMs = siteRunData.lastUpdatedAt ? new Date(siteRunData.lastUpdatedAt).getTime() : startedMs;
    if (Date.now() - (lastUpdatedMs || startedMs) > 15 * 60 * 1000) {
      return false; // Stale run
    }
    return true;
  }, [siteRunData, clockTick]);

  const isGenerating = isLocallyGenerating || isRemoteGenerating;

  // Active progress object (either local high-frequency or remote snapshot)
  const progress: GenerationProgress | null = useMemo(() => {
    if (isLocallyGenerating && localProgress) {
      return localProgress;
    }
    if (isRemoteGenerating && siteRunData) {
      return {
        total: siteRunData.totalProducts || 100,
        current: siteRunData.currentProductIndex || 0,
        currentProductCode: siteRunData.currentProductCode || '',
        successCount: siteRunData.currentProductIndex || 0,
        errorCount: 0,
        statusText: `${siteRunData.startedByName || 'A user'} is generating recommendations (${siteRunData.currentProductIndex || 0}/${siteRunData.totalProducts || 0})`
      };
    }
    return null;
  }, [isLocallyGenerating, localProgress, isRemoteGenerating, siteRunData]);

  // Generator name attribution
  const generatorName = useMemo(() => {
    if (isLocallyGenerating) {
      return userProfile?.displayName || userProfile?.email || user?.displayName || user?.email || 'You';
    }
    if (isRemoteGenerating && siteRunData?.startedByName) {
      return siteRunData.startedByName;
    }
    return siteRunData?.completedByName || siteRunData?.startedByName || null;
  }, [isLocallyGenerating, isRemoteGenerating, siteRunData, userProfile, user]);

  // Relative timestamp and text formatted for UI display
  const lastGeneratedText = useMemo(() => {
    const completedAt = siteRunData?.completedAt;
    const name = siteRunData?.completedByName || siteRunData?.startedByName;
    return formatRecLastGenerated(completedAt, name, clockTick);
  }, [siteRunData, clockTick]);

  const relativeTimeText = useMemo(() => {
    if (!siteRunData?.completedAt) return '';
    return formatRelativeTime(siteRunData.completedAt, clockTick);
  }, [siteRunData, clockTick]);

  const dismissCompletion = () => {
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }
    setIsCompletedRecently(false);
  };

  const startGeneration = async (
    targetTenantId?: string, 
    targetSiteId?: string, 
    forceReevaluate = true
  ): Promise<boolean> => {
    const tId = targetTenantId || activeTenantId;
    const sId = targetSiteId || activeSiteId;

    if (isGenerating) {
      console.warn('Recommendation generation already in progress');
      return false;
    }

    if (!tId || !sId) {
      console.error('Cannot generate recommendations without valid tenantId and siteId');
      return false;
    }

    // Clear previous dismissal timers
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }

    setIsLocallyGenerating(true);
    setGeneratingTenantId(tId);
    setGeneratingSiteId(sId);
    setIsCompletedRecently(false);
    setCompletionInfo(null);

    setLocalProgress({
      total: 100,
      current: 0,
      currentProductCode: 'Initializing',
      successCount: 0,
      errorCount: 0,
      statusText: 'Starting Recommendation Workspace generation & operational priorities sync...'
    });

    const initiatorName = userProfile?.displayName || user?.displayName || userProfile?.email || user?.email || 'Planner';
    const initiatorId = userProfile?.uid || user?.uid || 'planner-user';

    try {
      const res = await refreshSiteRecommendations(
        tId, 
        sId, 
        forceReevaluate, 
        (prog) => {
          setLocalProgress({
            total: prog.total,
            current: prog.current,
            currentProductCode: prog.productCode || '',
            successCount: prog.current,
            errorCount: 0,
            statusText: `Evaluating product ${prog.current} of ${prog.total}: ${prog.productCode || ''}`
          });
        },
        {
          userId: initiatorId,
          userName: initiatorName
        }
      );

      if (res.success && res.data) {
        const detectedConflicts = res.data.conflicts || [];
        setConflicts(detectedConflicts);

        const info: GenerationCompletionInfo = {
          timestamp: Date.now(),
          generatedCount: res.data.generatedCount,
          conflictsCount: detectedConflicts.length,
          siteId: sId,
          completedByName: initiatorName
        };

        setCompletionInfo(info);
        setIsCompletedRecently(true);
        setLastRefreshTimestamp(Date.now());

        if (detectedConflicts.length > 0) {
          setIsConflictModalOpen(true);
        }

        // Set auto-dismiss after 10 seconds
        autoDismissTimerRef.current = setTimeout(() => {
          setIsCompletedRecently(false);
        }, 10000);

        return true;
      } else {
        const errorMessage = typeof res.error === 'string' ? res.error : (res.error as any)?.message || 'Workspace generation failed';
        const info: GenerationCompletionInfo = {
          timestamp: Date.now(),
          generatedCount: 0,
          conflictsCount: 0,
          siteId: sId,
          completedByName: initiatorName,
          error: errorMessage
        };
        setCompletionInfo(info);
        setIsCompletedRecently(true);
        setLastRefreshTimestamp(Date.now());

        autoDismissTimerRef.current = setTimeout(() => {
          setIsCompletedRecently(false);
        }, 12000);

        return false;
      }
    } catch (e: any) {
      console.error('Error during global recommendation generation:', e);
      const info: GenerationCompletionInfo = {
        timestamp: Date.now(),
        generatedCount: 0,
        conflictsCount: 0,
        siteId: sId,
        completedByName: initiatorName,
        error: e?.message || 'Error generating recommendations'
      };
      setCompletionInfo(info);
      setIsCompletedRecently(true);
      setLastRefreshTimestamp(Date.now());

      autoDismissTimerRef.current = setTimeout(() => {
        setIsCompletedRecently(false);
      }, 12000);

      return false;
    } finally {
      setIsLocallyGenerating(false);
      setLocalProgress(null);
    }
  };

  useEffect(() => {
    return () => {
      if (autoDismissTimerRef.current) {
        clearTimeout(autoDismissTimerRef.current);
      }
    };
  }, []);

  return (
    <RecommendationGenerationContext.Provider
      value={{
        isGenerating,
        isLocallyGenerating,
        generatingTenantId,
        generatingSiteId,
        progress,
        completionInfo,
        isCompletedRecently,
        generatorName,
        lastRun: siteRunData,
        lastGeneratedText,
        relativeTimeText,
        conflicts,
        isConflictModalOpen,
        setIsConflictModalOpen,
        startGeneration,
        dismissCompletion,
        lastRefreshTimestamp
      }}
    >
      {children}
    </RecommendationGenerationContext.Provider>
  );
};

export const useRecommendationGeneration = (): RecommendationGenerationContextType => {
  const context = useContext(RecommendationGenerationContext);
  if (!context) {
    throw new Error('useRecommendationGeneration must be used within a RecommendationGenerationProvider');
  }
  return context;
};

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { SopDocument, UserSopProgress, WhatsNewItem } from '../../../types/learning';
import { LearningService } from '../services/learningService';
import { getContextualRecommendation } from '../data/routeSopMapping';
import { useAuth } from '../../auth/context/AuthContext';

export interface ContextualHelpInfo {
  defaultSop: SopDocument | null;
  recommendedSops: SopDocument[];
  contextTitle: string;
  contextDescription: string;
}

interface LearningContextType {
  isHelpDrawerOpen: boolean;
  openHelpDrawer: (sopId?: string, stepNumber?: number) => void;
  closeHelpDrawer: () => void;
  toggleHelpDrawer: () => void;
  activeSopId: string | null;
  activeSop: SopDocument | null;
  setActiveSopId: (sopId: string | null) => void;
  activeStepNumber: number;
  setActiveStepNumber: (step: number) => void;
  allSops: SopDocument[];
  refreshSops: () => void;
  userProgress: Record<string, UserSopProgress>;
  favorites: string[];
  recentSopIds: string[];
  recentSops: SopDocument[];
  toggleFavorite: (sopId: string) => void;
  updateProgress: (sopId: string, updates: Partial<UserSopProgress>) => void;
  acknowledgeSop: (sopId: string, version: string) => void;
  recordView: (sopId: string) => void;
  contextualHelp: ContextualHelpInfo;
  whatsNewItems: WhatsNewItem[];
  saveCustomSop: (sop: SopDocument) => SopDocument;
  deleteCustomSop: (sopId: string) => void;
}

const LearningContext = createContext<LearningContextType | undefined>(undefined);

export const LearningProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { userProfile } = useAuth();
  const tenantId = userProfile?.tenantId || 'DEFAULT_TENANT';
  const userId = userProfile?.uid || 'ANONYMOUS_USER';
  const location = useLocation();

  const [isHelpDrawerOpen, setIsHelpDrawerOpen] = useState(false);
  const [activeSopId, setActiveSopIdState] = useState<string | null>(null);
  const [activeStepNumber, setActiveStepNumber] = useState<number>(1);
  const [allSops, setAllSops] = useState<SopDocument[]>(() => LearningService.getAllSops(tenantId));
  const [userProgress, setUserProgress] = useState<Record<string, UserSopProgress>>(() => 
    LearningService.getUserProgressMap(tenantId, userId)
  );
  const [favorites, setFavorites] = useState<string[]>(() => 
    LearningService.getUserFavorites(tenantId, userId)
  );
  const [recentSopIds, setRecentSopIds] = useState<string[]>(() => 
    LearningService.getRecentlyViewed(tenantId, userId)
  );

  const refreshSops = useCallback(() => {
    setAllSops(LearningService.getAllSops(tenantId));
    setUserProgress(LearningService.getUserProgressMap(tenantId, userId));
    setFavorites(LearningService.getUserFavorites(tenantId, userId));
    setRecentSopIds(LearningService.getRecentlyViewed(tenantId, userId));
  }, [tenantId, userId]);

  useEffect(() => {
    refreshSops();
  }, [tenantId, userId, refreshSops]);

  // Handle global keyboard shortcut '?' / 'F1'
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input, textarea, or contentEditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.tagName === 'SELECT'
      ) {
        return;
      }

      if (e.key === '?' || e.key === 'F1') {
        e.preventDefault();
        setIsHelpDrawerOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Compute contextual recommendations for active location
  const contextualHelp = useMemo<ContextualHelpInfo>(() => {
    const recommendation = getContextualRecommendation(location.pathname);
    const defaultSop = allSops.find(s => s.id === recommendation.defaultSopId) || allSops[0] || null;
    const recommendedSops = allSops.filter(s => recommendation.recommendedSopIds.includes(s.id));

    return {
      defaultSop,
      recommendedSops: recommendedSops.length > 0 ? recommendedSops : (defaultSop ? [defaultSop] : []),
      contextTitle: recommendation.contextTitle,
      contextDescription: recommendation.contextDescription
    };
  }, [location.pathname, allSops]);

  const activeSop = useMemo(() => {
    if (!activeSopId) return contextualHelp.defaultSop;
    return allSops.find(s => s.id === activeSopId || s.slug === activeSopId) || contextualHelp.defaultSop;
  }, [activeSopId, allSops, contextualHelp.defaultSop]);

  const setActiveSopId = useCallback((id: string | null) => {
    setActiveSopIdState(id);
    setActiveStepNumber(1);
    if (id) {
      LearningService.recordView(tenantId, userId, id);
      setRecentSopIds(LearningService.getRecentlyViewed(tenantId, userId));
    }
  }, [tenantId, userId]);

  const openHelpDrawer = useCallback((sopId?: string, stepNumber?: number) => {
    if (sopId) {
      setActiveSopIdState(sopId);
      LearningService.recordView(tenantId, userId, sopId);
      setRecentSopIds(LearningService.getRecentlyViewed(tenantId, userId));
    } else if (!activeSopId && contextualHelp.defaultSop) {
      setActiveSopIdState(contextualHelp.defaultSop.id);
    }
    if (stepNumber !== undefined) {
      setActiveStepNumber(stepNumber);
    }
    setIsHelpDrawerOpen(true);
  }, [activeSopId, contextualHelp.defaultSop, tenantId, userId]);

  const closeHelpDrawer = useCallback(() => {
    setIsHelpDrawerOpen(false);
  }, []);

  const toggleHelpDrawer = useCallback(() => {
    setIsHelpDrawerOpen(prev => !prev);
  }, []);

  const toggleFavorite = useCallback((sopId: string) => {
    LearningService.toggleFavorite(tenantId, userId, sopId);
    setFavorites(LearningService.getUserFavorites(tenantId, userId));
  }, [tenantId, userId]);

  const updateProgress = useCallback((sopId: string, updates: Partial<UserSopProgress>) => {
    LearningService.updateSopProgress(tenantId, userId, sopId, updates);
    setUserProgress(LearningService.getUserProgressMap(tenantId, userId));
  }, [tenantId, userId]);

  const acknowledgeSop = useCallback((sopId: string, version: string) => {
    LearningService.acknowledgeSop(tenantId, userId, sopId, version);
    setUserProgress(LearningService.getUserProgressMap(tenantId, userId));
  }, [tenantId, userId]);

  const recordView = useCallback((sopId: string) => {
    LearningService.recordView(tenantId, userId, sopId);
    setRecentSopIds(LearningService.getRecentlyViewed(tenantId, userId));
  }, [tenantId, userId]);

  const recentSops = useMemo(() => {
    return recentSopIds
      .map(id => allSops.find(s => s.id === id))
      .filter((s): s is SopDocument => Boolean(s));
  }, [recentSopIds, allSops]);

  const whatsNewItems = useMemo(() => {
    return LearningService.getWhatsNew();
  }, []);

  const saveCustomSop = useCallback((sop: SopDocument) => {
    const saved = LearningService.saveCustomSop(tenantId, sop);
    refreshSops();
    return saved;
  }, [tenantId, refreshSops]);

  const deleteCustomSop = useCallback((sopId: string) => {
    LearningService.deleteCustomSop(tenantId, sopId);
    refreshSops();
  }, [tenantId, refreshSops]);

  return (
    <LearningContext.Provider
      value={{
        isHelpDrawerOpen,
        openHelpDrawer,
        closeHelpDrawer,
        toggleHelpDrawer,
        activeSopId,
        activeSop,
        setActiveSopId,
        activeStepNumber,
        setActiveStepNumber,
        allSops,
        refreshSops,
        userProgress,
        favorites,
        recentSopIds,
        recentSops,
        toggleFavorite,
        updateProgress,
        acknowledgeSop,
        recordView,
        contextualHelp,
        whatsNewItems,
        saveCustomSop,
        deleteCustomSop
      }}
    >
      {children}
    </LearningContext.Provider>
  );
};

export const useLearning = (): LearningContextType => {
  const context = useContext(LearningContext);
  if (!context) {
    throw new Error('useLearning must be used within a LearningProvider');
  }
  return context;
};

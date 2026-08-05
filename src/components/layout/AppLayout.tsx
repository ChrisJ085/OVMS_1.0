import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useMatches } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { WifiOff, AlertTriangle } from 'lucide-react';
import { usePageTitle } from '../../hooks/usePageTitle';
import { useSiteContext } from '../../contexts/SiteContext';
import { useSiteOnboarding } from '../../hooks/useSiteOnboarding';
import { SiteOnboardingWizard } from '../onboarding/SiteOnboardingWizard';

export const AppLayout: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { siteReady, siteError, tenantId, siteId } = useSiteContext();
  const { onboarding, canComplete, isComplete } = useSiteOnboarding();
  const [showWizard, setShowWizard] = useState(false);
  
  const matches = useMatches();
  const currentMatch = matches[matches.length - 1];
  const title = (currentMatch?.handle as any)?.title;
  usePageTitle(title);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (onboarding && !isComplete && canComplete) {
      const isDismissed = sessionStorage.getItem(`ovms_onboard_dismissed_${tenantId}_${siteId}`);
      if (!isDismissed) {
        setShowWizard(true);
      }
    } else {
      setShowWizard(false);
    }
  }, [onboarding, isComplete, canComplete, tenantId, siteId]);

  const handleCloseWizard = () => {
    setShowWizard(false);
    sessionStorage.setItem(`ovms_onboard_dismissed_${tenantId}_${siteId}`, 'true');
  };

  const handleOpenWizard = () => {
    setShowWizard(true);
    sessionStorage.removeItem(`ovms_onboard_dismissed_${tenantId}_${siteId}`);
  };

  return (
    <div className="h-screen bg-slate-900 flex text-slate-300 font-sans overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        {!isOnline && (
          <div className="bg-red-500/20 border-b border-red-500/30 text-red-400 px-6 py-2.5 flex items-center justify-center gap-2 text-sm font-medium animate-pulse">
            <WifiOff className="w-4 h-4" />
            <span>You are currently offline. Actions and data queries may fail or display stale cached data.</span>
          </div>
        )}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-900">
          <div className="max-w-7xl mx-auto h-full">
            {siteReady ? (
              <>
                <Outlet context={{ handleOpenOnboardingWizard: handleOpenWizard }} />
                {showWizard && <SiteOnboardingWizard onClose={handleCloseWizard} />}
              </>
            ) : siteError ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center space-y-4 max-w-md mx-auto py-20">
                <AlertTriangle className="w-12 h-12 text-amber-500 animate-bounce" />
                <h1 className="text-xl font-bold text-slate-200">Access Restricted</h1>
                <p className="text-slate-400 text-sm leading-relaxed">{siteError}</p>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center space-y-4 py-20">
                <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm font-medium tracking-wide">Loading your assigned site...</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

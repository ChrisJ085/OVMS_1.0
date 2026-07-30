import React, { useState, useEffect } from 'react';
import { Outlet, useMatches } from 'react-router-dom';
import { LogOut, Settings, X, Building2 } from 'lucide-react';
import { usePageTitle } from '../../hooks/usePageTitle';
import { useAuth } from '../../features/auth/context/AuthContext';
import { useSiteContext } from '../../contexts/SiteContext';

export const TVLayout: React.FC = () => {
  const { userProfile, logout } = useAuth();
  const { siteName, availableSites, siteId, setSite, siteReady, siteError } = useSiteContext();
  const [showControlModal, setShowControlModal] = useState(false);
  
  const matches = useMatches();
  const currentMatch = matches[matches.length - 1];
  const title = (currentMatch?.handle as any)?.title;
  usePageTitle(title);

  // Toggle controls on Ctrl+Shift+L or Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.shiftKey && e.key === 'L') || e.key === 'Escape') {
        setShowControlModal((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isDisplayRole = userProfile?.role === 'DISPLAY';
  const assignedSiteIds = userProfile?.siteIds || [];

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-300 font-sans relative">
      <main className="flex-1 overflow-hidden relative">
        {siteReady ? (
          <Outlet />
        ) : siteError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-950 p-6 text-center space-y-4">
            <div className="text-amber-500 text-5xl">⚠️</div>
            <h1 className="text-2xl font-bold text-slate-200">Access Restricted</h1>
            <p className="max-w-md text-slate-400 text-sm">{siteError}</p>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-950">
            <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-sm font-medium tracking-wide text-slate-400">Loading your assigned site...</p>
          </div>
        )}
      </main>

      {/* Unobtrusive Trigger Button in Bottom Corner */}
      <div className="fixed bottom-3 right-3 z-50 opacity-20 hover:opacity-100 transition-opacity">
        <button
          onClick={() => setShowControlModal(true)}
          title="Display Menu (Ctrl+Shift+L)"
          className="p-2 rounded-full bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer shadow-lg"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Control Modal */}
      {showControlModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">TV Display Controls</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Logged in as <span className="text-amber-400 font-mono">{userProfile?.email}</span> ({userProfile?.role})
                </p>
              </div>
              <button
                onClick={() => setShowControlModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Site selector for multi-site accounts */}
            {availableSites.length > 1 && (!isDisplayRole || assignedSiteIds.length > 1) && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  Active Display Site
                </label>
                <select
                  value={siteId}
                  onChange={(e) => {
                    const selected = availableSites.find((s) => s.siteId === e.target.value);
                    if (selected) setSite(selected);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-amber-500"
                >
                  {availableSites.map((s) => (
                    <option key={`${s.tenantId}_${s.siteId}`} value={s.siteId}>
                      {s.siteName} ({s.siteId})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {isDisplayRole && assignedSiteIds.length === 1 && (
              <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 text-xs text-slate-400">
                Bound to single site: <span className="text-slate-200 font-medium">{siteName}</span>
              </div>
            )}

            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => setShowControlModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium cursor-pointer"
              >
                Close Menu
              </button>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 text-sm font-medium cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

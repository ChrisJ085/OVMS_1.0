import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDevelopmentContext } from '../../contexts/DevelopmentContext';
import { ShieldAlert, Home, LogOut } from 'lucide-react';

export const AccessDeniedPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { userProfile, logout } = useDevelopmentContext();

  const attemptedArea = location.pathname;
  const currentRole = userProfile?.role || 'VIEWER';

  const isDisplay = currentRole === 'DISPLAY';
  const homePath = isDisplay ? '/tv-dashboard' : '/';

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-200">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-2xl text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-white">Access Denied</h1>
          <p className="text-sm text-slate-400">
            You do not have permission to access the requested area.
          </p>
        </div>

        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-4 text-left space-y-2.5 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-medium">Attempted Area:</span>
            <span className="font-mono text-slate-300 font-semibold truncate max-w-[200px]" title={attemptedArea}>
              {attemptedArea}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-medium">Current Role:</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-amber-400 border border-slate-700">
              {currentRole}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={() => navigate(homePath)}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-medium text-sm transition-colors cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Return Home
          </button>
          <button
            onClick={handleSignOut}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-medium text-sm transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};

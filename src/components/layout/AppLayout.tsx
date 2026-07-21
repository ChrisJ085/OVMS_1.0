import React, { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { WifiOff } from 'lucide-react';

export const AppLayout: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

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
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

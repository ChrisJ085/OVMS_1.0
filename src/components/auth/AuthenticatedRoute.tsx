import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useDevelopmentContext } from '../../contexts/DevelopmentContext';

interface AuthenticatedRouteProps {
  children?: React.ReactNode;
}

export const AuthenticatedRoute: React.FC<AuthenticatedRouteProps> = ({ children }) => {
  const { user, userProfile, loading } = useDevelopmentContext();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium tracking-wide">Syncing operational session...</p>
      </div>
    );
  }

  if (!user || !userProfile) {
    return <Navigate to="/login" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

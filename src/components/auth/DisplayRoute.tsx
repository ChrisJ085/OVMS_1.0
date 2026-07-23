import React, { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useDevelopmentContext } from '../../contexts/DevelopmentContext';
import { hasPermission } from '../../config/rolePermissions';
import { AccessDeniedPage } from './AccessDeniedPage';

interface DisplayRouteProps {
  children?: React.ReactNode;
}

export const DisplayRoute: React.FC<DisplayRouteProps> = ({ children }) => {
  const { user, userProfile, loading, siteId, setSite, availableSites } = useDevelopmentContext();

  useEffect(() => {
    if (userProfile && userProfile.role === 'DISPLAY') {
      const assignedSiteIds = userProfile.siteIds || [];
      if (assignedSiteIds.length === 1) {
        // Auto-select single assigned site
        const targetSiteId = assignedSiteIds[0];
        if (siteId !== targetSiteId) {
          const matchedSite = availableSites.find((s) => s.siteId === targetSiteId) || {
            tenantId: userProfile.tenantId || 'tenant_dev',
            tenantName: 'Tenant',
            siteId: targetSiteId,
            siteName: targetSiteId,
            timezone: 'Europe/London',
          };
          setSite(matchedSite);
        }
      } else if (assignedSiteIds.length > 1) {
        // Ensure current selected site is within assigned siteIds
        if (!assignedSiteIds.includes(siteId)) {
          const matchedSite = availableSites.find((s) => assignedSiteIds.includes(s.siteId)) || {
            tenantId: userProfile.tenantId || 'tenant_dev',
            tenantName: 'Tenant',
            siteId: assignedSiteIds[0],
            siteName: assignedSiteIds[0],
            timezone: 'Europe/London',
          };
          setSite(matchedSite);
        }
      }
    }
  }, [userProfile, siteId, availableSites, setSite]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium tracking-wide">Syncing display session...</p>
      </div>
    );
  }

  if (!user || !userProfile) {
    return <Navigate to="/login" replace />;
  }

  const canViewDashboard = hasPermission(userProfile.role, 'VIEW_TV_DASHBOARD');
  if (!canViewDashboard) {
    return <AccessDeniedPage />;
  }

  // Confirm site binding for DISPLAY role
  if (userProfile.role === 'DISPLAY' && userProfile.siteIds && userProfile.siteIds.length > 0) {
    if (!userProfile.siteIds.includes(siteId)) {
      return <AccessDeniedPage />;
    }
  }

  return children ? <>{children}</> : <Outlet />;
};

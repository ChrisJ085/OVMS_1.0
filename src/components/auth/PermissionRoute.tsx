import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Permission, hasAnyPermission } from '../../config/rolePermissions';
import { AccessDeniedPage } from './AccessDeniedPage';
import { useAuth } from '../../features/auth/context/AuthContext';
import { useSiteContext } from '../../contexts/SiteContext';

interface PermissionRouteProps {
  requiredPermissions?: Permission | Permission[];
  children?: React.ReactNode;
}

export const PermissionRoute: React.FC<PermissionRouteProps> = ({
  requiredPermissions,
  children,
}) => {
  const { user, userProfile, loading } = useAuth();
  const { siteId } = useSiteContext();

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

  // DISPLAY users are restricted strictly to TV dashboard routes
  if (userProfile.role === 'DISPLAY') {
    return <Navigate to="/tv-dashboard" replace />;
  }

  // Check role permissions
  if (requiredPermissions) {
    const perms = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
    const hasAccess = hasAnyPermission(userProfile.role, perms);
    if (!hasAccess) {
      return <AccessDeniedPage />;
    }
  }

  // Check site assignment
  if (siteId) {
    const isSuperuser = userProfile.role === 'PLATFORM_SUPERUSER';
    const isTenantAdmin = userProfile.role === 'TENANT_ADMIN';
    const hasSiteAccess =
      isSuperuser ||
      isTenantAdmin ||
      !userProfile.siteIds ||
      userProfile.siteIds.length === 0 ||
      userProfile.siteIds.includes(siteId);

    if (!hasSiteAccess) {
      return <AccessDeniedPage />;
    }
  }

  return children ? <>{children}</> : <Outlet />;
};

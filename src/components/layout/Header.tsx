import React from 'react';
import { Building2, Settings2, LogOut, User, Shield } from 'lucide-react';
import { useAuth } from '../../features/auth/context/AuthContext';
import { useSiteContext } from '../../contexts/SiteContext';

export const Header: React.FC = () => {
  const { userProfile, logout } = useAuth();
  const { siteId, siteName, availableSites, setSite } = useSiteContext();
  const developmentMode = import.meta.env.DEV || import.meta.env.VITE_DEV_MODE === 'true';

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Logout failed', err);
    }
  };

  const roleLabels: Record<string, string> = {
    'PLATFORM_SUPERUSER': 'Superuser',
    'TENANT_ADMIN': 'Tenant Admin',
    'PLANNER': 'Planner',
    'WAREHOUSE_OPERATOR': 'Warehouse Op',
    'VIEWER': 'Viewer',
    'DISPLAY': 'Display Screen'
  };

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'PLATFORM_SUPERUSER': return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
      case 'TENANT_ADMIN': return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      case 'PLANNER': return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'WAREHOUSE_OPERATOR': return 'bg-teal-500/10 text-teal-400 border border-teal-500/20';
      case 'DISPLAY': return 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
    }
  };

  return (
    <header className="h-16 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-6 shrink-0 select-none">
      <div className="flex items-center gap-4 text-slate-300">
        {userProfile && (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-sm text-slate-200 uppercase">
              {userProfile.displayName ? userProfile.displayName.charAt(0) : userProfile.email.charAt(0)}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-200 leading-tight">
                {userProfile.displayName || 'Operations User'}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wider ${getRoleBadgeColor(userProfile.role)}`}>
                  {roleLabels[userProfile.role] || userProfile.role}
                </span>
                {userProfile.tenantId && (
                  <span className="text-[10px] text-slate-500 font-medium">
                    Tenant: {userProfile.tenantId}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        {developmentMode && (
          <div className="hidden md:flex items-center gap-1 text-[10px] font-medium text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded uppercase tracking-wider">
            <Settings2 className="w-3 h-3 animate-pulse" />
            Sandbox Mode
          </div>
        )}

        {/* Site Selector Dropdown */}
        {userProfile && (
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5">
            <Building2 className="w-4 h-4 text-slate-400" />
            {availableSites.length > 1 ? (
              <select
                value={siteId}
                onChange={(e) => {
                  const newSite = availableSites.find((s) => s.siteId === e.target.value);
                  if (newSite) setSite(newSite);
                }}
                className="bg-transparent border-none text-slate-200 text-xs md:text-sm focus:ring-0 cursor-pointer outline-none font-medium"
              >
                {availableSites.map((siteItem) => (
                  <option 
                    key={`${siteItem.tenantId}_${siteItem.siteId}`} 
                    value={siteItem.siteId} 
                    className="bg-slate-900 text-slate-200 text-xs"
                  >
                    {siteItem.siteName}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs md:text-sm text-slate-300 font-medium">
                {siteName || 'No Sites'}
              </span>
            )}
          </div>
        )}

        {/* Logout Button */}
        {userProfile && (
          <button
            onClick={handleLogout}
            title="Sign Out"
            className="flex items-center justify-center p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg border border-slate-800 hover:border-red-500/20 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};

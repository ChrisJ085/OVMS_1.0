import React from 'react';
import { useLocation, useMatches } from 'react-router-dom';
import { useUserFavorites } from '../../contexts/UserFavoritesContext';
import { Star } from 'lucide-react';

const ROUTE_INFO_MAP: Record<string, { title: string; iconName: string; groupTitle: string }> = {
  '/': { title: 'Operational Overview', iconName: 'LayoutDashboard', groupTitle: 'Overview' },
  '/operations/exceptions': { title: 'Exception Centre', iconName: 'AlertTriangle', groupTitle: 'Overview' },
  '/learning': { title: 'Learning & SOPs', iconName: 'GraduationCap', groupTitle: 'Overview' },
  '/planning/recommendations': { title: 'Recommendations', iconName: 'Target', groupTitle: 'Planning' },
  '/planning/northfleet-sto': { title: 'Northfleet STO', iconName: 'Truck', groupTitle: 'Planning' },
  '/planning/rules': { title: 'Planning Rules', iconName: 'FileBox', groupTitle: 'Planning' },
  '/planning/production-plan': { title: 'Production Plan', iconName: 'FileText', groupTitle: 'Planning' },
  '/planning/promotions': { title: 'Promotions', iconName: 'Megaphone', groupTitle: 'Planning' },
  '/operations/priorities': { title: 'Operational Priorities', iconName: 'Box', groupTitle: 'Operations' },
  '/operations/warehouse': { title: 'Warehouse Execution', iconName: 'Workflow', groupTitle: 'Operations' },
  '/operations/announcements': { title: 'Announcements', iconName: 'Megaphone', groupTitle: 'Operations' },
  '/tv-dashboard': { title: 'TV Dashboard', iconName: 'MonitorPlay', groupTitle: 'Operations' },
  '/inventory/products': { title: 'Products', iconName: 'FileBox', groupTitle: 'Inventory' },
  '/inventory/balances': { title: 'Inventory Balances', iconName: 'Database', groupTitle: 'Inventory' },
  '/inventory/locations': { title: 'Storage Locations', iconName: 'MapPin', groupTitle: 'Inventory' },
  '/inventory/movements': { title: 'Inventory Movements', iconName: 'ArrowRightLeft', groupTitle: 'Inventory' },
  '/reports/history': { title: 'Operational History', iconName: 'History', groupTitle: 'Reports' },
  '/reports/kpi': { title: 'KPI Dashboard', iconName: 'BarChart3', groupTitle: 'Reports' },
  '/reports/list': { title: 'Reports List', iconName: 'FileText', groupTitle: 'Reports' },
  '/admin/overview': { title: 'Admin Overview', iconName: 'LayoutDashboard', groupTitle: 'Administration' },
  '/admin/site-settings': { title: 'Site Settings', iconName: 'Settings', groupTitle: 'Administration' },
  '/admin/configuration': { title: 'Configuration', iconName: 'Settings', groupTitle: 'Administration' },
  '/admin/dashboard-settings': { title: 'Dashboard Settings', iconName: 'Settings', groupTitle: 'Administration' },
  '/admin/decision-settings': { title: 'Decision Settings', iconName: 'Settings', groupTitle: 'Administration' },
  '/admin/data-freshness': { title: 'Data Freshness', iconName: 'Settings', groupTitle: 'Administration' },
  '/admin/audit-log': { title: 'Audit Log', iconName: 'History', groupTitle: 'Administration' },
  '/admin/data-utilities': { title: 'Data Utilities', iconName: 'Database', groupTitle: 'Administration' },
};

export const ActivePageStarButton: React.FC = () => {
  const location = useLocation();
  const matches = useMatches();
  const { isFavorite, toggleFavorite } = useUserFavorites();

  const currentPath = location.pathname;
  const currentMatch = matches[matches.length - 1];
  const pageTitle = (currentMatch?.handle as any)?.title;

  const routeInfo = ROUTE_INFO_MAP[currentPath] || {
    title: pageTitle || 'Current Page',
    iconName: 'Star',
    groupTitle: 'General'
  };

  const favorited = isFavorite(currentPath);

  const handleToggle = () => {
    toggleFavorite({
      path: currentPath,
      title: routeInfo.title,
      iconName: routeInfo.iconName,
      groupTitle: routeInfo.groupTitle
    });
  };

  return (
    <button
      onClick={handleToggle}
      title={favorited ? `Starred as favourite • Click to remove` : `Star this page for quick access`}
      className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
        favorited
          ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 hover:bg-amber-500/25'
          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-amber-400 hover:border-slate-700'
      }`}
    >
      <Star className={`w-4 h-4 ${favorited ? 'fill-amber-400 text-amber-400' : ''}`} />
    </button>
  );
};

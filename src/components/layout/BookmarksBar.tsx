import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation, useMatches } from 'react-router-dom';
import { useUserFavorites } from '../../contexts/UserFavoritesContext';
import { 
  Star, 
  ChevronDown, 
  X, 
  Bookmark,
  Plus,
  LayoutDashboard,
  Target,
  FileBox,
  History,
  Settings,
  Workflow,
  Megaphone,
  Box,
  MapPin,
  ArrowRightLeft,
  BarChart3,
  FileText,
  MonitorPlay,
  Database,
  AlertTriangle,
  Truck,
  GraduationCap
} from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard,
  Target,
  FileBox,
  History,
  Settings,
  Workflow,
  Megaphone,
  Box,
  MapPin,
  ArrowRightLeft,
  BarChart3,
  FileText,
  MonitorPlay,
  Database,
  AlertTriangle,
  Truck,
  GraduationCap
};

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

export const BookmarksBar: React.FC = () => {
  const { favorites, isFavorite, toggleFavorite, removeFavorite, loading } = useUserFavorites();
  const location = useLocation();
  const matches = useMatches();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentPath = location.pathname;
  const currentMatch = matches[matches.length - 1];
  const pageTitle = (currentMatch?.handle as any)?.title;
  const isCurrentPageFavorited = isFavorite(currentPath);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // If loading or no favorites, don't show the bar
  if (loading || favorites.length === 0) {
    return null;
  }

  const handleToggleCurrentPage = () => {
    const routeInfo = ROUTE_INFO_MAP[currentPath] || {
      title: pageTitle || 'Current Page',
      iconName: 'Star',
      groupTitle: 'General'
    };

    toggleFavorite({
      path: currentPath,
      title: routeInfo.title,
      iconName: routeInfo.iconName,
      groupTitle: routeInfo.groupTitle
    });
  };

  return (
    <div className="min-h-[38px] py-1.5 px-4 md:px-6 bg-slate-950/95 border-b border-slate-800/80 flex items-center justify-between shrink-0 select-none text-xs transition-all duration-200 shadow-inner gap-3">
      <div className="flex items-center flex-wrap gap-1.5 flex-1">
        {/* Bookmarks Bar Label / Icon */}
        <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-[11px] uppercase tracking-wider pr-2.5 border-r border-slate-800/80 shrink-0 py-0.5">
          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
          <span className="hidden sm:inline">Bookmarks</span>
        </div>

        {/* Bookmarks Items (Wrapped) */}
        <div className="flex items-center flex-wrap gap-1.5">
          {favorites.map((fav) => {
            const IconComponent = (fav.iconName && ICON_MAP[fav.iconName]) ? ICON_MAP[fav.iconName] : Star;
            const isActive = location.pathname === fav.path || (fav.path !== '/' && location.pathname.startsWith(fav.path));

            return (
              <div key={fav.id || fav.path} className="group relative flex items-center shrink-0">
                <NavLink
                  to={fav.path}
                  title={`${fav.title} (${fav.groupTitle || 'Favorites'})`}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-all border ${
                    isActive
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-sm font-semibold'
                      : 'bg-slate-900/60 text-slate-300 hover:text-white hover:bg-slate-850 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <IconComponent className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-amber-400' : 'text-slate-400 group-hover:text-amber-400'}`} />
                  <span className="truncate max-w-[140px] md:max-w-[200px]">{fav.title}</span>
                </NavLink>

                {/* Quick Unstar / Remove Button on Item Hover */}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeFavorite(fav.path);
                  }}
                  title={`Remove ${fav.title} from bookmarks`}
                  className="opacity-0 group-hover:opacity-100 ml-0.5 p-0.5 text-slate-500 hover:text-red-400 rounded transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Side Actions: Quick star/unstar current page */}
      <div className="flex items-center gap-2 shrink-0 border-l border-slate-800/80 pl-2.5 self-center my-auto">
        <button
          onClick={handleToggleCurrentPage}
          title={isCurrentPageFavorited ? 'Remove active page from bookmarks' : 'Bookmark active page'}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
            isCurrentPageFavorited
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-amber-400 hover:border-slate-700'
          }`}
        >
          <Star className={`w-3 h-3 ${isCurrentPageFavorited ? 'fill-amber-400 text-amber-400' : ''}`} />
          <span className="hidden lg:inline">
            {isCurrentPageFavorited ? 'Bookmarked' : 'Bookmark Page'}
          </span>
        </button>
      </div>
    </div>
  );
};

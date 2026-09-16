import React, { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Permission, hasPermission } from '../../config/rolePermissions';
import { useAuth } from '../../features/auth/context/AuthContext';
import { useSidebar } from '../../contexts/SidebarContext';
import { useUserFavorites } from '../../contexts/UserFavoritesContext';
import { SidebarItemTooltip } from './SidebarItemTooltip';
import { 
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
  GraduationCap,
  Star,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  iconName: string;
  permission: Permission;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const ALL_NAVIGATION: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Operational Overview', path: '/', icon: LayoutDashboard, iconName: 'LayoutDashboard', permission: 'VIEW_OVERVIEW' },
      { label: 'Exception Centre', path: '/operations/exceptions', icon: AlertTriangle, iconName: 'AlertTriangle', permission: 'VIEW_PRIORITIES' },
      { label: 'Learning & SOPs', path: '/learning', icon: GraduationCap, iconName: 'GraduationCap', permission: 'VIEW_LEARNING' },
    ],
  },
  {
    title: 'Planning',
    items: [
      { label: 'Recommendation Workspace', path: '/planning/recommendations', icon: Target, iconName: 'Target', permission: 'VIEW_RECOMMENDATIONS' },
      { label: 'Northfleet STO Requirements', path: '/planning/northfleet-sto', icon: Truck, iconName: 'Truck', permission: 'VIEW_RECOMMENDATIONS' },
      { label: 'Product Planning Rules', path: '/planning/rules', icon: FileBox, iconName: 'FileBox', permission: 'MANAGE_PLANNING_RULES' },
      { label: 'Production Plan', path: '/planning/production-plan', icon: FileText, iconName: 'FileText', permission: 'VIEW_PRODUCTION_PLAN' },
      { label: 'Promotions', path: '/planning/promotions', icon: Megaphone, iconName: 'Megaphone', permission: 'MANAGE_PROMOTIONS' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Operational Priorities', path: '/operations/priorities', icon: Box, iconName: 'Box', permission: 'VIEW_PRIORITIES' },
      { label: 'Warehouse Execution', path: '/operations/warehouse', icon: Workflow, iconName: 'Workflow', permission: 'VIEW_WAREHOUSE_EXECUTION' },
      { label: 'Announcements', path: '/operations/announcements', icon: Megaphone, iconName: 'Megaphone', permission: 'VIEW_PRIORITIES' },
      { label: 'TV Dashboard', path: '/tv-dashboard', icon: MonitorPlay, iconName: 'MonitorPlay', permission: 'VIEW_TV_DASHBOARD' },
    ],
  },
  {
    title: 'Inventory',
    items: [
      { label: 'Products', path: '/inventory/products', icon: FileBox, iconName: 'FileBox', permission: 'VIEW_INVENTORY' },
      { label: 'Inventory Balances', path: '/inventory/balances', icon: Database, iconName: 'Database', permission: 'VIEW_INVENTORY' },
      { label: 'Storage Locations', path: '/inventory/locations', icon: MapPin, iconName: 'MapPin', permission: 'VIEW_INVENTORY' },
      { label: 'Inventory Movements', path: '/inventory/movements', icon: ArrowRightLeft, iconName: 'ArrowRightLeft', permission: 'VIEW_INVENTORY' },
    ],
  },
  {
    title: 'History & Reports',
    items: [
      { label: 'Operational History', path: '/reports/history', icon: History, iconName: 'History', permission: 'VIEW_REPORTS' },
      { label: 'KPI Dashboard', path: '/reports/kpi', icon: BarChart3, iconName: 'BarChart3', permission: 'VIEW_REPORTS' },
      { label: 'Reports', path: '/reports/list', icon: FileText, iconName: 'FileText', permission: 'VIEW_REPORTS' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Admin Overview', path: '/admin/overview', icon: LayoutDashboard, iconName: 'LayoutDashboard', permission: 'VIEW_ADMINISTRATION' },
      { label: 'Site Settings', path: '/admin/site-settings', icon: Settings, iconName: 'Settings', permission: 'VIEW_ADMINISTRATION' },
      { label: 'Configuration', path: '/admin/configuration', icon: Settings, iconName: 'Settings', permission: 'MANAGE_CONFIGURATION' },
      { label: 'Dashboard Settings', path: '/admin/dashboard-settings', icon: Settings, iconName: 'Settings', permission: 'VIEW_ADMINISTRATION' },
      { label: 'Decision Settings', path: '/admin/decision-settings', icon: Settings, iconName: 'Settings', permission: 'VIEW_ADMINISTRATION' },
      { label: 'Data Freshness', path: '/admin/data-freshness', icon: Settings, iconName: 'Settings', permission: 'VIEW_ADMINISTRATION' },
      { label: 'Audit Log', path: '/admin/audit-log', icon: History, iconName: 'History', permission: 'VIEW_AUDIT_LOG' },
      { label: 'Data Utilities', path: '/admin/data-utilities', icon: Database, iconName: 'Database', permission: 'MANAGE_CONFIGURATION' },
    ],
  },
];

export const Sidebar: React.FC = () => {
  const { userProfile } = useAuth();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const { favorites, isFavorite, toggleFavorite } = useUserFavorites();
  const role = userProfile?.role;

  // Keyboard shortcut Ctrl+B or Cmd+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

  // Filter navigation dynamically based on central permissions configuration
  const filteredNavigation = ALL_NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasPermission(role, item.permission)),
  })).filter((group) => group.items.length > 0);

  const canViewTvDashboard = hasPermission(role, 'VIEW_TV_DASHBOARD');

  return (
    <div 
      className={`${
        isCollapsed ? 'w-16' : 'w-64'
      } bg-slate-950 border-r border-slate-800 flex flex-col h-full shrink-0 transition-all duration-300 ease-in-out z-30 select-none`}
    >
      {/* Sidebar Header with Brand & Collapse Toggle */}
      <div className="h-16 flex items-center justify-between px-3.5 border-b border-slate-800 shrink-0">
        {!isCollapsed ? (
          <>
            <div className="font-bold text-xl tracking-tight text-white flex items-center gap-2">
              <div className="w-7 h-7 rounded bg-brand-600 flex items-center justify-center shadow-sm">
                <span className="text-white text-xs font-bold">O</span>
              </div>
              <span className="font-semibold tracking-wide">OVMS</span>
            </div>
            <button
              onClick={toggleSidebar}
              title="Collapse sidebar (Ctrl+B)"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </>
        ) : (
          <div className="w-full flex items-center justify-center">
            <button
              onClick={toggleSidebar}
              title="Expand sidebar (Ctrl+B)"
              className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 hover:border-brand-500/50 flex items-center justify-center text-slate-300 hover:text-brand-400 hover:bg-slate-800 transition-all cursor-pointer shadow-sm group"
            >
              <PanelLeftOpen className="w-4 h-4 group-hover:scale-110 transition-transform" />
            </button>
          </div>
        )}
      </div>
      
      {/* Navigation Scroll Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar py-3 px-2 space-y-5">
        
        {/* Starred / Favorites Group (When Expanded and User Has Favorites) */}
        {!isCollapsed && favorites.length > 0 && (
          <div className="pb-2 border-b border-slate-800/80">
            <div className="px-3 flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Star className="w-3 h-3 fill-amber-400" />
                Favorites
              </span>
              <span className="text-[10px] text-slate-500 font-mono">{favorites.length}</span>
            </div>
            <div className="space-y-0.5">
              {favorites.map((fav) => {
                return (
                  <NavLink
                    key={`fav-${fav.path}`}
                    to={fav.path}
                    className={({ isActive }) =>
                      `group flex items-center justify-between px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        isActive
                          ? 'bg-amber-500/15 text-amber-300 font-semibold'
                          : 'text-slate-300 hover:text-white hover:bg-slate-900/90'
                      }`
                    }
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Star className="w-3.5 h-3.5 shrink-0 fill-amber-400 text-amber-400" />
                      <span className="truncate">{fav.title}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleFavorite({ path: fav.path, title: fav.title, iconName: fav.iconName, groupTitle: fav.groupTitle });
                      }}
                      title="Remove from favorites"
                      className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-amber-400 p-0.5 rounded transition-opacity"
                    >
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    </button>
                  </NavLink>
                );
              })}
            </div>
          </div>
        )}

        {/* Regular Categorized Navigation */}
        {filteredNavigation.map((group) => (
          <div key={group.title}>
            {!isCollapsed ? (
              <h3 className="px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                {group.title}
              </h3>
            ) : (
              <div className="w-full flex justify-center py-1">
                <div className="w-6 h-px bg-slate-800" />
              </div>
            )}
            
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const itemFavorited = isFavorite(item.path);

                return (
                  <SidebarItemTooltip
                    key={item.path}
                    label={item.label}
                    path={item.path}
                    groupTitle={group.title}
                    isCollapsed={isCollapsed}
                    isFavorited={itemFavorited}
                    onToggleFavorite={() => {
                      toggleFavorite({
                        path: item.path,
                        title: item.label,
                        iconName: item.iconName,
                        groupTitle: group.title
                      });
                    }}
                  >
                    <div className="relative group">
                      <NavLink
                        to={item.path}
                        title={isCollapsed ? `${item.label} (${group.title})` : undefined}
                        className={({ isActive }) =>
                          `flex items-center ${
                            isCollapsed ? 'justify-center px-0 py-2.5' : 'justify-between px-3 py-2'
                          } text-sm font-medium rounded-md transition-all ${
                            isActive
                              ? 'bg-brand-500/10 text-brand-400 font-semibold'
                              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900'
                          }`
                        }
                      >
                        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} truncate`}>
                          <item.icon className="w-4 h-4 shrink-0" />
                          {!isCollapsed && <span className="truncate text-xs">{item.label}</span>}
                        </div>

                        {/* Favorite Star Toggle (Expanded Mode) */}
                        {!isCollapsed && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleFavorite({
                                path: item.path,
                                title: item.label,
                                iconName: item.iconName,
                                groupTitle: group.title
                              });
                            }}
                            title={itemFavorited ? 'Remove from favorites' : 'Add to favorites'}
                            className={`p-1 rounded transition-all cursor-pointer ${
                              itemFavorited
                                ? 'text-amber-400 opacity-100'
                                : 'text-slate-600 hover:text-amber-400 opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            <Star className={`w-3.5 h-3.5 ${itemFavorited ? 'fill-amber-400 text-amber-400' : ''}`} />
                          </button>
                        )}
                      </NavLink>
                    </div>
                  </SidebarItemTooltip>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* TV Dashboard Bottom Rail */}
      {canViewTvDashboard && (
        <div className="p-2 border-t border-slate-800">
          <SidebarItemTooltip
            label="TV Dashboard"
            path="/tv-dashboard"
            groupTitle="Operations"
            isCollapsed={isCollapsed}
          >
            <NavLink
              to="/tv-dashboard"
              title={isCollapsed ? "TV Dashboard • /tv-dashboard" : undefined}
              className={`flex items-center ${
                isCollapsed ? 'justify-center p-2' : 'justify-center gap-2 px-3 py-2'
              } text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-md transition-colors`}
            >
              <MonitorPlay className="w-4 h-4 shrink-0 text-brand-400" />
              {!isCollapsed && <span>TV Dashboard</span>}
            </NavLink>
          </SidebarItemTooltip>
        </div>
      )}
    </div>
  );
};


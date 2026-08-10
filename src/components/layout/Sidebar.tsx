import React from 'react';
import { NavLink } from 'react-router-dom';
import { Permission, hasPermission } from '../../config/rolePermissions';
import { useAuth } from '../../features/auth/context/AuthContext';
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
  Truck
} from 'lucide-react';

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
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
      { label: 'Operational Overview', path: '/', icon: LayoutDashboard, permission: 'VIEW_OVERVIEW' },
      { label: 'Exception Centre', path: '/operations/exceptions', icon: AlertTriangle, permission: 'VIEW_PRIORITIES' },
    ],
  },
  {
    title: 'Planning',
    items: [
      { label: 'Recommendation Workspace', path: '/planning/recommendations', icon: Target, permission: 'VIEW_RECOMMENDATIONS' },
      { label: 'Northfleet STO Requirements', path: '/planning/northfleet-sto', icon: Truck, permission: 'VIEW_RECOMMENDATIONS' },
      { label: 'Product Planning Rules', path: '/planning/rules', icon: FileBox, permission: 'MANAGE_PLANNING_RULES' },
      { label: 'Production Plan', path: '/planning/production-plan', icon: FileText, permission: 'VIEW_PRODUCTION_PLAN' },
      { label: 'Promotions', path: '/planning/promotions', icon: Megaphone, permission: 'MANAGE_PROMOTIONS' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Operational Priorities', path: '/operations/priorities', icon: Box, permission: 'VIEW_PRIORITIES' },
      { label: 'Warehouse Execution', path: '/operations/warehouse', icon: Workflow, permission: 'VIEW_WAREHOUSE_EXECUTION' },
      { label: 'Announcements', path: '/operations/announcements', icon: Megaphone, permission: 'VIEW_PRIORITIES' },
      { label: 'TV Dashboard', path: '/tv-dashboard', icon: MonitorPlay, permission: 'VIEW_TV_DASHBOARD' },
    ],
  },
  {
    title: 'Inventory',
    items: [
      { label: 'Products', path: '/inventory/products', icon: FileBox, permission: 'VIEW_INVENTORY' },
      { label: 'Inventory Balances', path: '/inventory/balances', icon: Database, permission: 'VIEW_INVENTORY' },
      { label: 'Storage Locations', path: '/inventory/locations', icon: MapPin, permission: 'VIEW_INVENTORY' },
      { label: 'Inventory Movements', path: '/inventory/movements', icon: ArrowRightLeft, permission: 'VIEW_INVENTORY' },
    ],
  },
  {
    title: 'History & Reports',
    items: [
      { label: 'Operational History', path: '/reports/history', icon: History, permission: 'VIEW_REPORTS' },
      { label: 'KPI Dashboard', path: '/reports/kpi', icon: BarChart3, permission: 'VIEW_REPORTS' },
      { label: 'Reports', path: '/reports/list', icon: FileText, permission: 'VIEW_REPORTS' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Admin Overview', path: '/admin/overview', icon: LayoutDashboard, permission: 'VIEW_ADMINISTRATION' },
      { label: 'Site Settings', path: '/admin/site-settings', icon: Settings, permission: 'VIEW_ADMINISTRATION' },
      { label: 'Configuration', path: '/admin/configuration', icon: Settings, permission: 'MANAGE_CONFIGURATION' },
      { label: 'Dashboard Settings', path: '/admin/dashboard-settings', icon: Settings, permission: 'VIEW_ADMINISTRATION' },
      { label: 'Decision Settings', path: '/admin/decision-settings', icon: Settings, permission: 'VIEW_ADMINISTRATION' },
      { label: 'Data Freshness', path: '/admin/data-freshness', icon: Settings, permission: 'VIEW_ADMINISTRATION' },
      { label: 'Audit Log', path: '/admin/audit-log', icon: History, permission: 'VIEW_AUDIT_LOG' },
      { label: 'Data Utilities', path: '/admin/data-utilities', icon: Database, permission: 'MANAGE_CONFIGURATION' },
    ],
  },
];

export const Sidebar: React.FC = () => {
  const { userProfile } = useAuth();
  const role = userProfile?.role;

  // Filter navigation dynamically based on central permissions configuration
  const filteredNavigation = ALL_NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasPermission(role, item.permission)),
  })).filter((group) => group.items.length > 0);

  const canViewTvDashboard = hasPermission(role, 'VIEW_TV_DASHBOARD');

  return (
    <div className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col h-full shrink-0">
      <div className="h-16 flex items-center px-6 border-b border-slate-800 shrink-0">
        <div className="font-bold text-xl tracking-tight text-white flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-brand-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">O</span>
          </div>
          OVMS
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto no-scrollbar py-4 px-3 space-y-6">
        {filteredNavigation.map((group) => (
          <div key={group.title}>
            <h3 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              {group.title}
            </h3>
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      isActive
                        ? 'bg-brand-500/10 text-brand-500'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`
                  }
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>

      {canViewTvDashboard && (
        <div className="p-4 border-t border-slate-800">
          <NavLink
            to="/tv-dashboard"
            className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors"
          >
            <MonitorPlay className="w-4 h-4" />
            TV Dashboard
          </NavLink>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { NavLink } from 'react-router-dom';
import { useDevelopmentContext } from '../../contexts/DevelopmentContext';
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
  AlertTriangle
} from 'lucide-react';

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const ALL_NAVIGATION: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Operational Overview', path: '/', icon: LayoutDashboard },
      { label: 'Exception Centre', path: '/operations/exceptions', icon: AlertTriangle },
    ],
  },
  {
    title: 'Planning',
    items: [
      { label: 'Recommendation Workspace', path: '/planning/recommendations', icon: Target },
      { label: 'Product Planning Rules', path: '/planning/rules', icon: FileBox },
      { label: 'Production Plan', path: '/planning/production-plan', icon: FileText },
      { label: 'Promotions', path: '/planning/promotions', icon: Megaphone },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Operational Priorities', path: '/operations/priorities', icon: Box },
      { label: 'Warehouse Execution', path: '/operations/warehouse', icon: Workflow },
      { label: 'Announcements', path: '/operations/announcements', icon: Megaphone },
    ],
  },
  {
    title: 'Inventory',
    items: [
      { label: 'Products', path: '/inventory/products', icon: FileBox },
      { label: 'Inventory Balances', path: '/inventory/balances', icon: Database },
      { label: 'Storage Locations', path: '/inventory/locations', icon: MapPin },
      { label: 'Inventory Movements', path: '/inventory/movements', icon: ArrowRightLeft },
    ],
  },
  {
    title: 'History & Reports',
    items: [
      { label: 'Operational History', path: '/reports/history', icon: History },
      { label: 'KPI Dashboard', path: '/reports/kpi', icon: BarChart3 },
      { label: 'Reports', path: '/reports/list', icon: FileText },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Admin Overview', path: '/admin/overview', icon: LayoutDashboard },
      { label: 'Site Settings', path: '/admin/site-settings', icon: Settings },
      { label: 'Configuration', path: '/admin/configuration', icon: Settings },
      { label: 'Dashboard Settings', path: '/admin/dashboard-settings', icon: Settings },
      { label: 'Decision Settings', path: '/admin/decision-settings', icon: Settings },
      { label: 'Data Freshness', path: '/admin/data-freshness', icon: Settings },
      { label: 'Audit Log', path: '/admin/audit-log', icon: History },
      { label: 'Data Utilities', path: '/admin/data-utilities', icon: Database },
    ],
  },
];

export const Sidebar: React.FC = () => {
  const { userProfile } = useDevelopmentContext();
  const role = userProfile?.role || 'VIEWER';

  // Filter navigation dynamically based on role
  const filteredNavigation = ALL_NAVIGATION.filter(group => {
    if (role === 'WAREHOUSE_OPERATOR') {
      return ['Overview', 'Operations', 'Inventory', 'History & Reports'].includes(group.title);
    }
    if (role === 'VIEWER') {
      return ['Overview', 'Inventory', 'History & Reports'].includes(group.title);
    }
    if (role === 'PLANNER') {
      return ['Overview', 'Planning', 'Operations', 'Inventory', 'History & Reports'].includes(group.title);
    }
    // PLATFORM_SUPERUSER and TENANT_ADMIN can view everything
    return true;
  });

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

      <div className="p-4 border-t border-slate-800">
        <NavLink
          to="/tv-dashboard"
          target="_blank"
          className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors"
        >
          <MonitorPlay className="w-4 h-4" />
          TV Dashboard
        </NavLink>
      </div>
    </div>
  );
};

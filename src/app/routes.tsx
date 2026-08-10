import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppProviders } from './AppProviders';
import { useAuth } from '../features/auth/context/AuthContext';
import { LoginPage } from '../features/auth/components/LoginPage';
import { PasswordChangePage } from '../features/auth/components/PasswordChangePage';
import { AppLayout } from '../components/layout/AppLayout';
import { TVLayout } from '../components/layout/TVLayout';
import { PermissionRoute } from '../components/auth/PermissionRoute';
import { DisplayRoute } from '../components/auth/DisplayRoute';
import { AccessDeniedPage } from '../components/auth/AccessDeniedPage';

import { OperationalOverviewPage } from '../pages/OperationalOverviewPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { ConfigurationPage } from '../pages/ConfigurationPage';
import { ProductsPage } from '../features/inventory/pages/ProductsPage';
import { LocationsPage } from '../features/inventory/pages/LocationsPage';
import { InventoryBalancesPage } from '../features/inventory/pages/InventoryBalancesPage';
import { InventoryMovementsPage } from '../features/inventory/pages/InventoryMovementsPage';
import { ProductPlanningRulesPage } from '../features/planning/pages/ProductPlanningRulesPage';
import { ProductionPage } from '../features/planning/pages/ProductionPage';
import { ProductionPlanPage } from '../features/planning/pages/ProductionPlanPage';
import { PromotionsPage } from '../features/planning/pages/PromotionsPage';
import { PromotionDetailPage } from '../features/planning/pages/PromotionDetailPage';
import { DecisionEngineScenariosPage } from '../features/planning/pages/DecisionEngineScenariosPage';
import { NorthfleetStoPage } from '../features/planning/pages/NorthfleetStoPage';
import { RecommendationsWorkspacePage } from '../features/planning/pages/RecommendationsWorkspacePage';
import { RecommendationDetailPage } from '../features/planning/pages/RecommendationDetailPage';
import { OperationalPrioritiesPage } from '../features/operations/pages/OperationalPrioritiesPage';
import { CreatePriorityPage } from '../features/operations/pages/CreatePriorityPage';
import { WarehouseExecutionPage } from '../features/operations/pages/WarehouseExecutionPage';
import { TVDashboardPage } from '../features/operations/pages/TVDashboardPage';
import { ExceptionCentrePage } from '../features/operations/pages/ExceptionCentrePage';
import { AnnouncementsPage } from '../features/operations/pages/AnnouncementsPage';
import { OperationalHistoryPage } from '../features/reports/pages/OperationalHistoryPage';
import { KpiDashboardPage } from '../features/reports/pages/KpiDashboardPage';
import { ReportsListPage } from '../features/reports/pages/ReportsListPage';

import { AdminOverviewPage } from '../features/administration/pages/AdminOverviewPage';
import { SiteSettingsPage } from '../features/administration/pages/SiteSettingsPage';
import { DashboardSettingsPage } from '../features/administration/pages/DashboardSettingsPage';
import { DecisionSettingsPage } from '../features/administration/pages/DecisionSettingsPage';
import { DataFreshnessSettingsPage } from '../features/administration/pages/DataFreshnessSettingsPage';
import { AuditLogPage } from '../features/administration/pages/AuditLogPage';
import { DataUtilitiesPage } from '../features/administration/pages/DataUtilitiesPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <PermissionRoute requiredPermissions="VIEW_OVERVIEW">
        <AppLayout />
      </PermissionRoute>
    ),
    children: [
      { index: true, element: <OperationalOverviewPage />, handle: { title: 'Operational Overview' } },
      
      // Planning routes
      { path: 'planning/recommendations', element: <PermissionRoute requiredPermissions="VIEW_RECOMMENDATIONS"><RecommendationsWorkspacePage /></PermissionRoute>, handle: { title: 'Recommendation Workspace' } },
      { path: 'planning/recommendations/:id', element: <PermissionRoute requiredPermissions="VIEW_RECOMMENDATIONS"><RecommendationDetailPage /></PermissionRoute>, handle: { title: 'Recommendation Detail' } },
      { path: 'planning/rules', element: <PermissionRoute requiredPermissions="MANAGE_PLANNING_RULES"><ProductPlanningRulesPage /></PermissionRoute>, handle: { title: 'Planning Rules' } },
      { path: 'planning/production', element: <PermissionRoute requiredPermissions="VIEW_PRODUCTION_PLAN"><ProductionPage /></PermissionRoute>, handle: { title: 'Production Plan' } },
      { path: 'planning/production-plan', element: <PermissionRoute requiredPermissions="VIEW_PRODUCTION_PLAN"><ProductionPlanPage /></PermissionRoute>, handle: { title: 'Production Plan' } },
      { path: 'planning/promotions', element: <PermissionRoute requiredPermissions="MANAGE_PROMOTIONS"><PromotionsPage /></PermissionRoute>, handle: { title: 'Promotions' } },
      { path: 'planning/promotions/:id', element: <PermissionRoute requiredPermissions="MANAGE_PROMOTIONS"><PromotionDetailPage /></PermissionRoute>, handle: { title: 'Promotion Detail' } },
      { path: 'planning/decision-engine-test', element: <PermissionRoute requiredPermissions="MANAGE_PLANNING_RULES"><DecisionEngineScenariosPage /></PermissionRoute>, handle: { title: 'Decision Scenarios' } },
      { path: 'planning/northfleet-sto', element: <PermissionRoute requiredPermissions="VIEW_RECOMMENDATIONS"><NorthfleetStoPage /></PermissionRoute>, handle: { title: 'Northfleet STO Requirements' } },
      
      // Operations routes
      { path: 'operations/priorities', element: <PermissionRoute requiredPermissions="VIEW_PRIORITIES"><OperationalPrioritiesPage /></PermissionRoute>, handle: { title: 'Operational Priorities' } },
      { path: 'operations/priorities/new', element: <PermissionRoute requiredPermissions="MANAGE_PRIORITIES"><CreatePriorityPage /></PermissionRoute>, handle: { title: 'Create Priority' } },
      { path: 'operations/priorities/edit/:id', element: <PermissionRoute requiredPermissions="MANAGE_PRIORITIES"><CreatePriorityPage /></PermissionRoute>, handle: { title: 'Edit Priority' } },
      { path: 'operations/warehouse', element: <PermissionRoute requiredPermissions="VIEW_WAREHOUSE_EXECUTION"><WarehouseExecutionPage /></PermissionRoute>, handle: { title: 'Warehouse Execution' } },
      { path: 'operations/announcements', element: <PermissionRoute requiredPermissions="VIEW_PRIORITIES"><AnnouncementsPage /></PermissionRoute>, handle: { title: 'Announcements' } },
      { path: 'operations/exceptions', element: <PermissionRoute requiredPermissions="VIEW_PRIORITIES"><ExceptionCentrePage /></PermissionRoute>, handle: { title: 'Exceptions' } },
      
      // Inventory routes
      { path: 'inventory/products', element: <PermissionRoute requiredPermissions="VIEW_INVENTORY"><ProductsPage /></PermissionRoute>, handle: { title: 'Inventory Products' } },
      { path: 'inventory/balances', element: <PermissionRoute requiredPermissions="VIEW_INVENTORY"><InventoryBalancesPage /></PermissionRoute>, handle: { title: 'Inventory Balances' } },
      { path: 'inventory/locations', element: <PermissionRoute requiredPermissions="VIEW_INVENTORY"><LocationsPage /></PermissionRoute>, handle: { title: 'Inventory Locations' } },
      { path: 'inventory/movements', element: <PermissionRoute requiredPermissions="VIEW_INVENTORY"><InventoryMovementsPage /></PermissionRoute>, handle: { title: 'Inventory Movements' } },
      
      // Reports routes
      { path: 'reports/history', element: <PermissionRoute requiredPermissions="VIEW_REPORTS"><OperationalHistoryPage /></PermissionRoute>, handle: { title: 'Operational History' } },
      { path: 'reports/kpi', element: <PermissionRoute requiredPermissions="VIEW_REPORTS"><KpiDashboardPage /></PermissionRoute>, handle: { title: 'KPI Dashboard' } },
      { path: 'reports/list', element: <PermissionRoute requiredPermissions="VIEW_REPORTS"><ReportsListPage /></PermissionRoute>, handle: { title: 'Reports' } },
      
      // Administration routes
      { path: 'admin/overview', element: <PermissionRoute requiredPermissions="VIEW_ADMINISTRATION"><AdminOverviewPage /></PermissionRoute>, handle: { title: 'Administration' } },
      { path: 'admin/site-settings', element: <PermissionRoute requiredPermissions="VIEW_ADMINISTRATION"><SiteSettingsPage /></PermissionRoute>, handle: { title: 'Administration' } },
      { path: 'admin/configuration', element: <PermissionRoute requiredPermissions="MANAGE_CONFIGURATION"><ConfigurationPage /></PermissionRoute>, handle: { title: 'Administration' } },
      { path: 'admin/dashboard-settings', element: <PermissionRoute requiredPermissions="VIEW_ADMINISTRATION"><DashboardSettingsPage /></PermissionRoute>, handle: { title: 'Administration' } },
      { path: 'admin/decision-settings', element: <PermissionRoute requiredPermissions="VIEW_ADMINISTRATION"><DecisionSettingsPage /></PermissionRoute>, handle: { title: 'Administration' } },
      { path: 'admin/data-freshness', element: <PermissionRoute requiredPermissions="VIEW_ADMINISTRATION"><DataFreshnessSettingsPage /></PermissionRoute>, handle: { title: 'Administration' } },
      { path: 'admin/audit-log', element: <PermissionRoute requiredPermissions="VIEW_AUDIT_LOG"><AuditLogPage /></PermissionRoute>, handle: { title: 'Administration' } },
      { path: 'admin/data-utilities', element: <PermissionRoute requiredPermissions="MANAGE_CONFIGURATION"><DataUtilitiesPage /></PermissionRoute>, handle: { title: 'Administration' } },
    ],
  },
  {
    path: '/tv-dashboard',
    element: (
      <DisplayRoute>
        <TVLayout />
      </DisplayRoute>
    ),
    children: [
      { index: true, element: <TVDashboardPage />, handle: { title: 'TV Dashboard' } },
    ],
  },
  {
    path: '/operations-display',
    element: (
      <DisplayRoute>
        <TVLayout />
      </DisplayRoute>
    ),
    children: [
      { index: true, element: <TVDashboardPage />, handle: { title: 'TV Dashboard' } },
    ],
  },
  {
    path: '/access-denied',
    element: <AccessDeniedPage />,
    handle: { title: 'Access Denied' }
  },
  {
    path: '*',
    element: <AccessDeniedPage />,
    handle: { title: 'Access Denied' }
  },
]);

function AppRouterWrapper() {
  const { 
    user, 
    userProfile, 
    loading, 
    authError, 
    login, 
    logout, 
    changePassword, 
    requiresPasswordChange 
  } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-medium tracking-wide">Syncing operational session...</p>
      </div>
    );
  }

  if (!user || !userProfile) {
    return (
      <LoginPage 
        onLoginSuccess={login} 
        authError={authError?.userMessage || null} 
        loading={loading}
      />
    );
  }

  if (requiresPasswordChange) {
    return (
      <PasswordChangePage 
        onSubmit={changePassword} 
        loading={loading}
        error={authError?.userMessage || null}
        onLogout={logout}
      />
    );
  }

  return <RouterProvider router={router} />;
}

export function AppRoutes() {
  return (
    <AppProviders>
      <AppRouterWrapper />
    </AppProviders>
  );
}

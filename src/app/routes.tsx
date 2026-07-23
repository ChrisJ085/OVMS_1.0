import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { DevelopmentProvider, useDevelopmentContext } from '../contexts/DevelopmentContext';
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
      { index: true, element: <OperationalOverviewPage /> },
      
      // Planning routes
      { path: 'planning/recommendations', element: <PermissionRoute requiredPermissions="VIEW_RECOMMENDATIONS"><RecommendationsWorkspacePage /></PermissionRoute> },
      { path: 'planning/recommendations/:id', element: <PermissionRoute requiredPermissions="VIEW_RECOMMENDATIONS"><RecommendationDetailPage /></PermissionRoute> },
      { path: 'planning/rules', element: <PermissionRoute requiredPermissions="MANAGE_PLANNING_RULES"><ProductPlanningRulesPage /></PermissionRoute> },
      { path: 'planning/production', element: <PermissionRoute requiredPermissions="VIEW_PRODUCTION_PLAN"><ProductionPage /></PermissionRoute> },
      { path: 'planning/production-plan', element: <PermissionRoute requiredPermissions="VIEW_PRODUCTION_PLAN"><ProductionPlanPage /></PermissionRoute> },
      { path: 'planning/promotions', element: <PermissionRoute requiredPermissions="MANAGE_PROMOTIONS"><PromotionsPage /></PermissionRoute> },
      { path: 'planning/promotions/:id', element: <PermissionRoute requiredPermissions="MANAGE_PROMOTIONS"><PromotionDetailPage /></PermissionRoute> },
      { path: 'planning/decision-engine-test', element: <PermissionRoute requiredPermissions="MANAGE_PLANNING_RULES"><DecisionEngineScenariosPage /></PermissionRoute> },
      
      // Operations routes
      { path: 'operations/priorities', element: <PermissionRoute requiredPermissions="VIEW_PRIORITIES"><OperationalPrioritiesPage /></PermissionRoute> },
      { path: 'operations/priorities/new', element: <PermissionRoute requiredPermissions="MANAGE_PRIORITIES"><CreatePriorityPage /></PermissionRoute> },
      { path: 'operations/warehouse', element: <PermissionRoute requiredPermissions="UPDATE_WAREHOUSE_EXECUTION"><WarehouseExecutionPage /></PermissionRoute> },
      { path: 'operations/announcements', element: <PermissionRoute requiredPermissions="VIEW_PRIORITIES"><AnnouncementsPage /></PermissionRoute> },
      { path: 'operations/exceptions', element: <PermissionRoute requiredPermissions="VIEW_PRIORITIES"><ExceptionCentrePage /></PermissionRoute> },
      
      // Inventory routes
      { path: 'inventory/products', element: <PermissionRoute requiredPermissions="VIEW_INVENTORY"><ProductsPage /></PermissionRoute> },
      { path: 'inventory/balances', element: <PermissionRoute requiredPermissions="VIEW_INVENTORY"><InventoryBalancesPage /></PermissionRoute> },
      { path: 'inventory/locations', element: <PermissionRoute requiredPermissions="VIEW_INVENTORY"><LocationsPage /></PermissionRoute> },
      { path: 'inventory/movements', element: <PermissionRoute requiredPermissions="VIEW_INVENTORY"><InventoryMovementsPage /></PermissionRoute> },
      
      // Reports routes
      { path: 'reports/history', element: <PermissionRoute requiredPermissions="VIEW_REPORTS"><OperationalHistoryPage /></PermissionRoute> },
      { path: 'reports/kpi', element: <PermissionRoute requiredPermissions="VIEW_REPORTS"><KpiDashboardPage /></PermissionRoute> },
      { path: 'reports/list', element: <PermissionRoute requiredPermissions="VIEW_REPORTS"><ReportsListPage /></PermissionRoute> },
      
      // Administration routes
      { path: 'admin/overview', element: <PermissionRoute requiredPermissions="VIEW_ADMINISTRATION"><AdminOverviewPage /></PermissionRoute> },
      { path: 'admin/site-settings', element: <PermissionRoute requiredPermissions="VIEW_ADMINISTRATION"><SiteSettingsPage /></PermissionRoute> },
      { path: 'admin/configuration', element: <PermissionRoute requiredPermissions="MANAGE_CONFIGURATION"><ConfigurationPage /></PermissionRoute> },
      { path: 'admin/dashboard-settings', element: <PermissionRoute requiredPermissions="VIEW_ADMINISTRATION"><DashboardSettingsPage /></PermissionRoute> },
      { path: 'admin/decision-settings', element: <PermissionRoute requiredPermissions="VIEW_ADMINISTRATION"><DecisionSettingsPage /></PermissionRoute> },
      { path: 'admin/data-freshness', element: <PermissionRoute requiredPermissions="VIEW_ADMINISTRATION"><DataFreshnessSettingsPage /></PermissionRoute> },
      { path: 'admin/audit-log', element: <PermissionRoute requiredPermissions="VIEW_AUDIT_LOG"><AuditLogPage /></PermissionRoute> },
      { path: 'admin/data-utilities', element: <PermissionRoute requiredPermissions="MANAGE_CONFIGURATION"><DataUtilitiesPage /></PermissionRoute> },
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
      { index: true, element: <TVDashboardPage /> },
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
      { index: true, element: <TVDashboardPage /> },
    ],
  },
  {
    path: '/access-denied',
    element: <AccessDeniedPage />,
  },
  {
    path: '*',
    element: <AccessDeniedPage />,
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
  } = useDevelopmentContext();

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
        authError={authError} 
        loading={loading}
      />
    );
  }

  if (requiresPasswordChange) {
    return (
      <PasswordChangePage 
        onSubmit={changePassword} 
        loading={loading}
        error={authError}
        onLogout={logout}
      />
    );
  }

  return <RouterProvider router={router} />;
}

export function AppRoutes() {
  return (
    <DevelopmentProvider>
      <AppRouterWrapper />
    </DevelopmentProvider>
  );
}

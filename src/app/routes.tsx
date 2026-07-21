import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { DevelopmentProvider, useDevelopmentContext } from '../contexts/DevelopmentContext';
import { LoginPage } from '../features/auth/components/LoginPage';
import { PasswordChangePage } from '../features/auth/components/PasswordChangePage';
import { AppLayout } from '../components/layout/AppLayout';
import { TVLayout } from '../components/layout/TVLayout';
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
    element: <AppLayout />,
    children: [
      { index: true, element: <PlaceholderPage title="Operational Overview" /> },
      { path: 'planning/recommendations', element: <RecommendationsWorkspacePage /> },
      { path: 'planning/recommendations/:id', element: <RecommendationDetailPage /> },
      { path: 'planning/rules', element: <ProductPlanningRulesPage /> },
      { path: 'planning/production', element: <ProductionPage /> },
      { path: 'planning/production-plan', element: <ProductionPlanPage /> },
      { path: 'planning/promotions', element: <PromotionsPage /> },
      { path: 'planning/promotions/:id', element: <PromotionDetailPage /> },
      { path: 'planning/decision-engine-test', element: <DecisionEngineScenariosPage /> },
      { path: 'operations/priorities', element: <OperationalPrioritiesPage /> },
      { path: 'operations/priorities/new', element: <CreatePriorityPage /> },
      { path: 'operations/warehouse', element: <WarehouseExecutionPage /> },
      { path: 'operations/announcements', element: <AnnouncementsPage /> },
      { path: 'operations/exceptions', element: <ExceptionCentrePage /> },
      { path: 'inventory/products', element: <ProductsPage /> },
      { path: 'inventory/balances', element: <InventoryBalancesPage /> },
      { path: 'inventory/locations', element: <LocationsPage /> },
      { path: 'inventory/movements', element: <InventoryMovementsPage /> },
      { path: 'reports/history', element: <OperationalHistoryPage /> },
      { path: 'reports/kpi', element: <KpiDashboardPage /> },
      { path: 'reports/list', element: <ReportsListPage /> },
      { path: 'admin/overview', element: <AdminOverviewPage /> },
      { path: 'admin/site-settings', element: <SiteSettingsPage /> },
      { path: 'admin/configuration', element: <ConfigurationPage /> },
      { path: 'admin/dashboard-settings', element: <DashboardSettingsPage /> },
      { path: 'admin/decision-settings', element: <DecisionSettingsPage /> },
      { path: 'admin/data-freshness', element: <DataFreshnessSettingsPage /> },
      { path: 'admin/audit-log', element: <AuditLogPage /> },
      { path: 'admin/data-utilities', element: <DataUtilitiesPage /> },
    ],
  },
  {
    path: '/tv-dashboard',
    element: <TVLayout />,
    children: [
      { index: true, element: <TVDashboardPage /> },
    ],
  },
  {
    path: '/operations-display',
    element: <TVLayout />,
    children: [
      { index: true, element: <TVDashboardPage /> },
    ],
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
    bootstrapSuperuser, 
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
        onTriggerBootstrap={bootstrapSuperuser}
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

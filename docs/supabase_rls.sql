-- ============================================================================
-- OVMS AUTHORITATIVE SUPABASE POSTGRESQL ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.priority_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.priorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_plan_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_plan_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.northfleet_sto_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.northfleet_sto_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_recommendation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_deletion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_deletion_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- SECURITY HELPER FUNCTIONS
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_auth_user()
RETURNS public.users AS $$
DECLARE
    u public.users;
BEGIN
    SELECT * INTO u FROM public.users WHERE id = auth.uid();
    RETURN u;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_platform_superuser()
RETURNS BOOLEAN AS $$
DECLARE
    u public.users;
BEGIN
    u := public.get_auth_user();
    RETURN u IS NOT NULL AND u.role = 'PLATFORM_SUPERUSER' AND (u.account_status = 'ACTIVE' OR u.account_status = 'active');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.has_tenant_access(target_tenant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    u public.users;
BEGIN
    IF target_tenant_id IS NULL THEN
        RETURN FALSE;
    END IF;
    IF public.is_platform_superuser() THEN
        RETURN TRUE;
    END IF;
    u := public.get_auth_user();
    RETURN u IS NOT NULL 
       AND u.tenant_id = target_tenant_id 
       AND (u.account_status = 'ACTIVE' OR u.account_status = 'active');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(target_tenant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    u public.users;
BEGIN
    IF public.is_platform_superuser() THEN
        RETURN TRUE;
    END IF;
    u := public.get_auth_user();
    RETURN u IS NOT NULL 
       AND u.tenant_id = target_tenant_id 
       AND u.role = 'TENANT_ADMIN' 
       AND (u.account_status = 'ACTIVE' OR u.account_status = 'active');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.has_site_access(target_tenant_id UUID, target_site_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    u public.users;
BEGIN
    IF public.is_platform_superuser() THEN
        RETURN TRUE;
    END IF;
    IF NOT public.has_tenant_access(target_tenant_id) THEN
        RETURN FALSE;
    END IF;
    IF public.is_tenant_admin(target_tenant_id) THEN
        RETURN TRUE;
    END IF;
    
    -- Check explicit user_sites assignment
    RETURN EXISTS (
        SELECT 1 FROM public.user_sites 
        WHERE user_id = auth.uid() AND site_id = target_site_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ----------------------------------------------------------------------------
-- 1. USERS & USER SITES POLICIES
-- ----------------------------------------------------------------------------

CREATE POLICY "Users: Select policy" ON public.users FOR SELECT USING (
    id = auth.uid() OR
    public.is_platform_superuser() OR
    public.is_tenant_admin(tenant_id)
);

CREATE POLICY "Users: Insert policy" ON public.users FOR INSERT WITH CHECK (
    public.is_platform_superuser() OR
    (public.is_tenant_admin(tenant_id) AND role != 'PLATFORM_SUPERUSER') OR
    id = auth.uid()
);

CREATE POLICY "Users: Update policy" ON public.users FOR UPDATE USING (
    public.is_platform_superuser() OR
    (public.is_tenant_admin(tenant_id) AND role != 'PLATFORM_SUPERUSER') OR
    id = auth.uid()
);

CREATE POLICY "Users: Delete policy" ON public.users FOR DELETE USING (
    public.is_platform_superuser() OR
    (public.is_tenant_admin(tenant_id) AND role != 'PLATFORM_SUPERUSER')
);

CREATE POLICY "UserSites: Select policy" ON public.user_sites FOR SELECT USING (
    user_id = auth.uid() OR
    public.is_platform_superuser() OR
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = user_id AND public.is_tenant_admin(u.tenant_id))
);

CREATE POLICY "UserSites: Insert/Update/Delete policy" ON public.user_sites FOR ALL USING (
    public.is_platform_superuser() OR
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = user_id AND public.is_tenant_admin(u.tenant_id))
);

-- ----------------------------------------------------------------------------
-- 2. TENANTS & SITES POLICIES
-- ----------------------------------------------------------------------------

CREATE POLICY "Tenants: Select policy" ON public.tenants FOR SELECT USING (
    public.is_platform_superuser() OR public.has_tenant_access(id)
);

CREATE POLICY "Tenants: Manage policy" ON public.tenants FOR ALL USING (
    public.is_platform_superuser()
);

CREATE POLICY "Sites: Select policy" ON public.sites FOR SELECT USING (
    public.has_tenant_access(tenant_id)
);

CREATE POLICY "Sites: Manage policy" ON public.sites FOR ALL USING (
    public.is_platform_superuser() OR public.is_tenant_admin(tenant_id)
);

-- ----------------------------------------------------------------------------
-- 3. MASTER DATA POLICIES (Production Lines, Products, Locations, etc.)
-- ----------------------------------------------------------------------------

CREATE POLICY "MasterData: ProductionLines Select" ON public.production_lines FOR SELECT USING (public.has_site_access(tenant_id, site_id));
CREATE POLICY "MasterData: ProductionLines Manage" ON public.production_lines FOR ALL USING (public.is_platform_superuser() OR public.is_tenant_admin(tenant_id));

CREATE POLICY "MasterData: Products Select" ON public.products FOR SELECT USING (public.has_tenant_access(tenant_id));
CREATE POLICY "MasterData: Products Manage" ON public.products FOR ALL USING (public.is_platform_superuser() OR public.is_tenant_admin(tenant_id));

CREATE POLICY "MasterData: Locations Select" ON public.locations FOR SELECT USING (public.has_site_access(tenant_id, site_id));
CREATE POLICY "MasterData: Locations Manage" ON public.locations FOR ALL USING (public.is_platform_superuser() OR public.is_tenant_admin(tenant_id));

CREATE POLICY "MasterData: Destinations Select" ON public.destinations FOR SELECT USING (public.has_tenant_access(tenant_id));
CREATE POLICY "MasterData: Destinations Manage" ON public.destinations FOR ALL USING (public.is_platform_superuser() OR public.is_tenant_admin(tenant_id));

CREATE POLICY "MasterData: ActionTypes Select" ON public.action_types FOR SELECT USING (public.has_tenant_access(tenant_id));
CREATE POLICY "MasterData: ActionTypes Manage" ON public.action_types FOR ALL USING (public.is_platform_superuser() OR public.is_tenant_admin(tenant_id));

CREATE POLICY "MasterData: PriorityLevels Select" ON public.priority_levels FOR SELECT USING (public.has_tenant_access(tenant_id));
CREATE POLICY "MasterData: PriorityLevels Manage" ON public.priority_levels FOR ALL USING (public.is_platform_superuser() OR public.is_tenant_admin(tenant_id));

-- ----------------------------------------------------------------------------
-- 4. INVENTORY BALANCES & MOVEMENTS POLICIES
-- ----------------------------------------------------------------------------

CREATE POLICY "InventoryBalances: Select" ON public.inventory_balances FOR SELECT USING (public.has_site_access(tenant_id, site_id));
CREATE POLICY "InventoryBalances: Write" ON public.inventory_balances FOR ALL USING (
    public.has_site_access(tenant_id, site_id) AND (
        public.is_platform_superuser() OR 
        public.is_tenant_admin(tenant_id) OR 
        public.get_auth_user().role IN ('PLANNER', 'WAREHOUSE_OPERATOR')
    )
);

CREATE POLICY "InventoryMovements: Select" ON public.inventory_movements FOR SELECT USING (public.has_site_access(tenant_id, site_id));
CREATE POLICY "InventoryMovements: Insert" ON public.inventory_movements FOR INSERT WITH CHECK (
    public.has_site_access(tenant_id, site_id) AND (
        public.is_platform_superuser() OR 
        public.is_tenant_admin(tenant_id) OR 
        public.get_auth_user().role IN ('PLANNER', 'WAREHOUSE_OPERATOR')
    )
);

-- ----------------------------------------------------------------------------
-- 5. OPERATIONAL EXECUTIONS POLICIES (Priorities, Exceptions, Announcements)
-- ----------------------------------------------------------------------------

CREATE POLICY "Priorities: Select" ON public.priorities FOR SELECT USING (public.has_site_access(tenant_id, site_id));
CREATE POLICY "Priorities: Manage" ON public.priorities FOR ALL USING (
    public.has_site_access(tenant_id, site_id) AND (
        public.is_platform_superuser() OR 
        public.is_tenant_admin(tenant_id) OR 
        public.get_auth_user().role IN ('PLANNER', 'WAREHOUSE_OPERATOR')
    )
);

CREATE POLICY "Exceptions: Select" ON public.exceptions FOR SELECT USING (public.has_site_access(tenant_id, site_id));
CREATE POLICY "Exceptions: Manage" ON public.exceptions FOR ALL USING (
    public.has_site_access(tenant_id, site_id) AND (
        public.is_platform_superuser() OR 
        public.is_tenant_admin(tenant_id) OR 
        public.get_auth_user().role IN ('PLANNER', 'WAREHOUSE_OPERATOR')
    )
);

CREATE POLICY "Announcements: Select" ON public.announcements FOR SELECT USING (public.has_site_access(tenant_id, site_id));
CREATE POLICY "Announcements: Manage" ON public.announcements FOR ALL USING (
    public.has_site_access(tenant_id, site_id) AND (
        public.is_platform_superuser() OR 
        public.is_tenant_admin(tenant_id) OR 
        public.get_auth_user().role = 'PLANNER'
    )
);

-- ----------------------------------------------------------------------------
-- 6. PRODUCTION PLANNING POLICIES
-- ----------------------------------------------------------------------------

CREATE POLICY "PlanningRules: Select" ON public.planning_rules FOR SELECT USING (public.has_site_access(tenant_id, site_id));
CREATE POLICY "PlanningRules: Manage" ON public.planning_rules FOR ALL USING (
    public.has_site_access(tenant_id, site_id) AND (
        public.is_platform_superuser() OR 
        public.is_tenant_admin(tenant_id) OR 
        public.get_auth_user().role = 'PLANNER'
    )
);

CREATE POLICY "ProductionPlanImports: Select" ON public.production_plan_imports FOR SELECT USING (public.has_site_access(tenant_id, site_id));
CREATE POLICY "ProductionPlanImports: Manage" ON public.production_plan_imports FOR ALL USING (
    public.has_site_access(tenant_id, site_id) AND (
        public.is_platform_superuser() OR 
        public.is_tenant_admin(tenant_id) OR 
        public.get_auth_user().role = 'PLANNER'
    )
);

CREATE POLICY "ProductionPlanEntries: Select" ON public.production_plan_entries FOR SELECT USING (public.has_site_access(tenant_id, site_id));
CREATE POLICY "ProductionPlanEntries: Manage" ON public.production_plan_entries FOR ALL USING (
    public.has_site_access(tenant_id, site_id) AND (
        public.is_platform_superuser() OR 
        public.is_tenant_admin(tenant_id) OR 
        public.get_auth_user().role = 'PLANNER'
    )
);

CREATE POLICY "ProductionEvents: Select" ON public.production_events FOR SELECT USING (public.has_site_access(tenant_id, site_id));
CREATE POLICY "ProductionEvents: Manage" ON public.production_events FOR ALL USING (
    public.has_site_access(tenant_id, site_id) AND (
        public.is_platform_superuser() OR 
        public.is_tenant_admin(tenant_id) OR 
        public.get_auth_user().role IN ('PLANNER', 'WAREHOUSE_OPERATOR')
    )
);

CREATE POLICY "Promotions: Select" ON public.promotions FOR SELECT USING (public.has_site_access(tenant_id, site_id));
CREATE POLICY "Promotions: Manage" ON public.promotions FOR ALL USING (
    public.has_site_access(tenant_id, site_id) AND (
        public.is_platform_superuser() OR 
        public.is_tenant_admin(tenant_id) OR 
        public.get_auth_user().role = 'PLANNER'
    )
);

CREATE POLICY "Recommendations: Select" ON public.recommendations FOR SELECT USING (public.has_site_access(tenant_id, site_id));
CREATE POLICY "Recommendations: Manage" ON public.recommendations FOR ALL USING (
    public.has_site_access(tenant_id, site_id) AND (
        public.is_platform_superuser() OR 
        public.is_tenant_admin(tenant_id) OR 
        public.get_auth_user().role = 'PLANNER'
    )
);

-- ----------------------------------------------------------------------------
-- 7. NORTHFLEET STO REQUIREMENTS POLICIES
-- ----------------------------------------------------------------------------

CREATE POLICY "NorthfleetStoRequirements: Select" ON public.northfleet_sto_requirements FOR SELECT USING (public.has_site_access(tenant_id, site_id));
CREATE POLICY "NorthfleetStoRequirements: Manage" ON public.northfleet_sto_requirements FOR ALL USING (
    public.has_site_access(tenant_id, site_id) AND (
        public.is_platform_superuser() OR 
        public.is_tenant_admin(tenant_id) OR 
        public.get_auth_user().role = 'PLANNER'
    )
);

CREATE POLICY "NorthfleetStoImports: Select" ON public.northfleet_sto_imports FOR SELECT USING (public.has_site_access(tenant_id, site_id));
CREATE POLICY "NorthfleetStoImports: Manage" ON public.northfleet_sto_imports FOR ALL USING (
    public.has_site_access(tenant_id, site_id) AND (
        public.is_platform_superuser() OR 
        public.is_tenant_admin(tenant_id) OR 
        public.get_auth_user().role = 'PLANNER'
    )
);

-- ----------------------------------------------------------------------------
-- 8. SETTINGS, ONBOARDING, AUDIT LOGS, JOBS POLICIES
-- ----------------------------------------------------------------------------

CREATE POLICY "SiteSettings: Select" ON public.site_settings FOR SELECT USING (public.has_site_access(tenant_id, site_id));
CREATE POLICY "SiteSettings: Manage" ON public.site_settings FOR ALL USING (public.is_platform_superuser() OR public.is_tenant_admin(tenant_id));

CREATE POLICY "SiteOnboarding: Select" ON public.site_onboarding FOR SELECT USING (public.has_site_access(tenant_id, site_id));
CREATE POLICY "SiteOnboarding: Manage" ON public.site_onboarding FOR ALL USING (public.is_platform_superuser() OR public.is_tenant_admin(tenant_id));

CREATE POLICY "SiteRecommendationRuns: Select" ON public.site_recommendation_runs FOR SELECT USING (public.has_site_access(tenant_id, site_id));
CREATE POLICY "SiteRecommendationRuns: Manage" ON public.site_recommendation_runs FOR ALL USING (
    public.has_site_access(tenant_id, site_id) AND (
        public.is_platform_superuser() OR 
        public.is_tenant_admin(tenant_id) OR 
        public.get_auth_user().role = 'PLANNER'
    )
);

CREATE POLICY "AuditLogs: Select" ON public.audit_logs FOR SELECT USING (
    public.is_platform_superuser() OR (tenant_id IS NOT NULL AND public.is_tenant_admin(tenant_id))
);
CREATE POLICY "AuditLogs: Insert" ON public.audit_logs FOR INSERT WITH CHECK (
    tenant_id IS NULL OR public.has_tenant_access(tenant_id)
);

CREATE POLICY "TenantDeletionJobs: Select" ON public.tenant_deletion_jobs FOR SELECT USING (public.is_platform_superuser());
CREATE POLICY "TenantDeletionJobs: Manage" ON public.tenant_deletion_jobs FOR ALL USING (public.is_platform_superuser());

CREATE POLICY "PlatformDeletionReceipts: Select" ON public.platform_deletion_receipts FOR SELECT USING (public.is_platform_superuser());
CREATE POLICY "PlatformDeletionReceipts: Manage" ON public.platform_deletion_receipts FOR ALL USING (public.is_platform_superuser());

CREATE POLICY "Sessions: Select/Manage" ON public.sessions FOR ALL USING (user_id = auth.uid() OR public.is_platform_superuser());

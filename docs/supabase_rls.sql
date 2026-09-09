-- OVMS Supabase Row Level Security (RLS) Hardening Script
-- Apply this file to your Supabase instance to enforce Phase 1 & Phase 2 Security Requirements.

-- 1. Create Internal Schema for Security Functions
CREATE SCHEMA IF NOT EXISTS ovms_internal;
GRANT USAGE ON SCHEMA ovms_internal TO postgres, authenticated, anon, service_role;

-- 2. Drop Old Public Security Definer Functions
DROP FUNCTION IF EXISTS public.has_site_access(UUID, UUID);
DROP FUNCTION IF EXISTS public.is_tenant_admin(UUID);
DROP FUNCTION IF EXISTS public.has_tenant_access(UUID);
DROP FUNCTION IF EXISTS public.is_platform_superuser();
DROP FUNCTION IF EXISTS public.get_auth_user();

-- 3. Define Internal Security Functions (Pinned search_path, fully qualified)
CREATE OR REPLACE FUNCTION ovms_internal.get_auth_user()
RETURNS public.users AS $$
DECLARE
    u public.users;
BEGIN
    SELECT * INTO u FROM public.users WHERE id = auth.uid() LIMIT 1;
    RETURN u;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp STABLE;

CREATE OR REPLACE FUNCTION ovms_internal.is_platform_superuser()
RETURNS BOOLEAN AS $$
DECLARE
    u public.users;
BEGIN
    u := ovms_internal.get_auth_user();
    RETURN u IS NOT NULL AND u.role = 'PLATFORM_SUPERUSER' AND (u.account_status = 'ACTIVE' OR u.account_status = 'active');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp STABLE;

CREATE OR REPLACE FUNCTION ovms_internal.has_tenant_access(target_tenant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    u public.users;
BEGIN
    IF target_tenant_id IS NULL THEN RETURN FALSE; END IF;
    u := ovms_internal.get_auth_user();
    IF u IS NULL THEN RETURN FALSE; END IF;
    IF u.role = 'PLATFORM_SUPERUSER' THEN RETURN TRUE; END IF;
    RETURN u.tenant_id = target_tenant_id AND (u.account_status = 'ACTIVE' OR u.account_status = 'active');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp STABLE;

CREATE OR REPLACE FUNCTION ovms_internal.is_tenant_admin(target_tenant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    u public.users;
BEGIN
    IF target_tenant_id IS NULL THEN RETURN FALSE; END IF;
    u := ovms_internal.get_auth_user();
    IF u IS NULL THEN RETURN FALSE; END IF;
    IF u.role = 'PLATFORM_SUPERUSER' THEN RETURN TRUE; END IF;
    RETURN u.role = 'TENANT_ADMIN' AND u.tenant_id = target_tenant_id AND (u.account_status = 'ACTIVE' OR u.account_status = 'active');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp STABLE;

CREATE OR REPLACE FUNCTION ovms_internal.has_site_access(target_tenant_id UUID, target_site_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    has_tenant BOOLEAN;
    site_exists BOOLEAN;
BEGIN
    has_tenant := ovms_internal.has_tenant_access(target_tenant_id);
    IF NOT has_tenant THEN RETURN FALSE; END IF;
    IF ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(target_tenant_id) THEN RETURN TRUE; END IF;
    SELECT EXISTS (
        SELECT 1 FROM public.user_sites us WHERE us.user_id = auth.uid() AND us.site_id = target_site_id
    ) INTO site_exists;
    RETURN site_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp STABLE;

-- 4. Triggers to Prevent Privilege Escalation

CREATE OR REPLACE FUNCTION ovms_internal.trg_users_prevent_escalation()
RETURNS trigger AS $$
BEGIN
    IF ovms_internal.is_platform_superuser() THEN
        RETURN NEW;
    END IF;

    IF ovms_internal.is_tenant_admin(OLD.tenant_id) THEN
        IF NEW.role = 'PLATFORM_SUPERUSER' THEN
            RAISE EXCEPTION 'Tenant Admins cannot grant PLATFORM_SUPERUSER role';
        END IF;
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
            RAISE EXCEPTION 'Tenant Admins cannot move users between tenants';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.id = auth.uid() THEN
        -- Prevent arbitrary users from elevating privileges or modifying sensitive fields
        NEW.role := OLD.role;
        NEW.tenant_id := OLD.tenant_id;
        NEW.account_status := OLD.account_status;
        NEW.failed_login_attempts := OLD.failed_login_attempts;
        NEW.failed_attempt_window_started_at := OLD.failed_attempt_window_started_at;
        NEW.locked_at := OLD.locked_at;

        -- Normal users can clear their password change flag, but not set it
        IF NEW.requires_password_change = TRUE AND OLD.requires_password_change = FALSE THEN
            NEW.requires_password_change := FALSE;
        END IF;
        
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Unauthorized update to users table';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS users_prevent_escalation_trg ON public.users;
CREATE TRIGGER users_prevent_escalation_trg
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION ovms_internal.trg_users_prevent_escalation();

-- Audit Logs Immutable Trigger
CREATE OR REPLACE FUNCTION ovms_internal.trg_audit_logs_immutable()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are immutable and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_immutable_update_trg ON public.audit_logs;
CREATE TRIGGER audit_logs_immutable_update_trg
BEFORE UPDATE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION ovms_internal.trg_audit_logs_immutable();

DROP TRIGGER IF EXISTS audit_logs_immutable_delete_trg ON public.audit_logs;
CREATE TRIGGER audit_logs_immutable_delete_trg
BEFORE DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION ovms_internal.trg_audit_logs_immutable();

-- 5. Revoke Excessive Grants
-- Revoke all permissions on all tables from authenticated users, then explicitly grant ONLY what is needed
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE 'REVOKE ALL ON public.' || quote_ident(r.tablename) || ' FROM authenticated;';
        EXECUTE 'REVOKE ALL ON public.' || quote_ident(r.tablename) || ' FROM anon;';
        -- Explicit grants:
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.' || quote_ident(r.tablename) || ' TO authenticated;';
    END LOOP;
END $$;

-- 6. Apply Explicit RLS Policies

-- Clear existing policies (requires looping since we are replacing all)
DO $$ 
DECLARE 
    r RECORD; 
BEGIN 
    FOR r IN (SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public') 
    LOOP 
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.' || quote_ident(r.tablename); 
    END LOOP; 
END $$;

-- Table: tenants
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenants: Select" ON public.tenants FOR SELECT USING (ovms_internal.has_tenant_access(id));
CREATE POLICY "Tenants: Insert" ON public.tenants FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser());
CREATE POLICY "Tenants: Update" ON public.tenants FOR UPDATE USING (ovms_internal.is_platform_superuser());
CREATE POLICY "Tenants: Delete" ON public.tenants FOR DELETE USING (ovms_internal.is_platform_superuser());

-- Table: sites
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sites: Select" ON public.sites FOR SELECT USING (ovms_internal.has_site_access(tenant_id, id));
CREATE POLICY "Sites: Insert" ON public.sites FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "Sites: Update" ON public.sites FOR UPDATE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "Sites: Delete" ON public.sites FOR DELETE USING (ovms_internal.is_platform_superuser());

-- Table: users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users: Select" ON public.users FOR SELECT USING (id = auth.uid() OR ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "Users: Insert" ON public.users FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser() OR (ovms_internal.is_tenant_admin(tenant_id) AND role != 'PLATFORM_SUPERUSER'));
CREATE POLICY "Users: Update" ON public.users FOR UPDATE USING (id = auth.uid() OR ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "Users: Delete" ON public.users FOR DELETE USING (ovms_internal.is_platform_superuser() OR (ovms_internal.is_tenant_admin(tenant_id) AND role != 'PLATFORM_SUPERUSER' AND id != auth.uid()));

-- Table: user_sites
ALTER TABLE public.user_sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "UserSites: Select" ON public.user_sites FOR SELECT USING (user_id = auth.uid() OR ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin((SELECT tenant_id FROM public.users WHERE id = public.user_sites.user_id LIMIT 1)));
CREATE POLICY "UserSites: Insert" ON public.user_sites FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin((SELECT tenant_id FROM public.users WHERE id = public.user_sites.user_id LIMIT 1)));
CREATE POLICY "UserSites: Update" ON public.user_sites FOR UPDATE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin((SELECT tenant_id FROM public.users WHERE id = public.user_sites.user_id LIMIT 1)));
CREATE POLICY "UserSites: Delete" ON public.user_sites FOR DELETE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin((SELECT tenant_id FROM public.users WHERE id = public.user_sites.user_id LIMIT 1)));

-- Table: action_types
ALTER TABLE public.action_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ActionTypes: Select" ON public.action_types FOR SELECT USING (ovms_internal.has_tenant_access(tenant_id));
CREATE POLICY "ActionTypes: Insert" ON public.action_types FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "ActionTypes: Update" ON public.action_types FOR UPDATE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "ActionTypes: Delete" ON public.action_types FOR DELETE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));

-- Table: products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Products: Select" ON public.products FOR SELECT USING (ovms_internal.has_tenant_access(tenant_id));
CREATE POLICY "Products: Insert" ON public.products FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "Products: Update" ON public.products FOR UPDATE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "Products: Delete" ON public.products FOR DELETE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));

-- Table: production_lines
ALTER TABLE public.production_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ProductionLines: Select" ON public.production_lines FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "ProductionLines: Insert" ON public.production_lines FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "ProductionLines: Update" ON public.production_lines FOR UPDATE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "ProductionLines: Delete" ON public.production_lines FOR DELETE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));

-- Table: locations
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Locations: Select" ON public.locations FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "Locations: Insert" ON public.locations FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "Locations: Update" ON public.locations FOR UPDATE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "Locations: Delete" ON public.locations FOR DELETE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));

-- Table: destinations
ALTER TABLE public.destinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Destinations: Select" ON public.destinations FOR SELECT USING (ovms_internal.has_tenant_access(tenant_id));
CREATE POLICY "Destinations: Insert" ON public.destinations FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "Destinations: Update" ON public.destinations FOR UPDATE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "Destinations: Delete" ON public.destinations FOR DELETE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));

-- Table: priority_levels
ALTER TABLE public.priority_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "PriorityLevels: Select" ON public.priority_levels FOR SELECT USING (ovms_internal.has_tenant_access(tenant_id));
CREATE POLICY "PriorityLevels: Insert" ON public.priority_levels FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "PriorityLevels: Update" ON public.priority_levels FOR UPDATE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "PriorityLevels: Delete" ON public.priority_levels FOR DELETE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));

-- Table: audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "AuditLogs: Select" ON public.audit_logs FOR SELECT USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "AuditLogs: Insert" ON public.audit_logs FOR INSERT WITH CHECK (ovms_internal.has_tenant_access(tenant_id));
-- Update and Delete are blocked by trigger anyway

-- Table: priorities
ALTER TABLE public.priorities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Priorities: Select" ON public.priorities FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "Priorities: Insert" ON public.priorities FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id) AND (ovms_internal.get_auth_user()).role != 'DISPLAY');
CREATE POLICY "Priorities: Update" ON public.priorities FOR UPDATE USING (ovms_internal.has_site_access(tenant_id, site_id) AND (ovms_internal.get_auth_user()).role != 'DISPLAY');
CREATE POLICY "Priorities: Delete" ON public.priorities FOR DELETE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));

-- Table: priority_events
ALTER TABLE public.priority_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "PriorityEvents: Select" ON public.priority_events FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "PriorityEvents: Insert" ON public.priority_events FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id) AND (ovms_internal.get_auth_user()).role != 'DISPLAY');
CREATE POLICY "PriorityEvents: Update" ON public.priority_events FOR UPDATE USING (FALSE); -- Events should be immutable
CREATE POLICY "PriorityEvents: Delete" ON public.priority_events FOR DELETE USING (FALSE); -- Events should be immutable

-- Table: inventory_balances
ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "InventoryBalances: Select" ON public.inventory_balances FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "InventoryBalances: Insert" ON public.inventory_balances FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "InventoryBalances: Update" ON public.inventory_balances FOR UPDATE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "InventoryBalances: Delete" ON public.inventory_balances FOR DELETE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));

-- Table: inventory_movements
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "InventoryMovements: Select" ON public.inventory_movements FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "InventoryMovements: Insert" ON public.inventory_movements FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id) AND (ovms_internal.get_auth_user()).role != 'DISPLAY');
CREATE POLICY "InventoryMovements: Update" ON public.inventory_movements FOR UPDATE USING (FALSE);
CREATE POLICY "InventoryMovements: Delete" ON public.inventory_movements FOR DELETE USING (FALSE);

-- Table: production_events
ALTER TABLE public.production_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ProductionEvents: Select" ON public.production_events FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "ProductionEvents: Insert" ON public.production_events FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id) AND (ovms_internal.get_auth_user()).role != 'DISPLAY');
CREATE POLICY "ProductionEvents: Update" ON public.production_events FOR UPDATE USING (FALSE);
CREATE POLICY "ProductionEvents: Delete" ON public.production_events FOR DELETE USING (FALSE);

-- Table: recommendations
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Recommendations: Select" ON public.recommendations FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "Recommendations: Insert" ON public.recommendations FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id) AND (ovms_internal.get_auth_user()).role != 'DISPLAY');
CREATE POLICY "Recommendations: Update" ON public.recommendations FOR UPDATE USING (ovms_internal.has_site_access(tenant_id, site_id) AND (ovms_internal.get_auth_user()).role != 'DISPLAY');
CREATE POLICY "Recommendations: Delete" ON public.recommendations FOR DELETE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));

-- Table: planning_rules
ALTER TABLE public.planning_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "PlanningRules: Select" ON public.planning_rules FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "PlanningRules: Insert" ON public.planning_rules FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "PlanningRules: Update" ON public.planning_rules FOR UPDATE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "PlanningRules: Delete" ON public.planning_rules FOR DELETE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));

-- Table: promotions
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Promotions: Select" ON public.promotions FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "Promotions: Insert" ON public.promotions FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "Promotions: Update" ON public.promotions FOR UPDATE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "Promotions: Delete" ON public.promotions FOR DELETE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));

-- Table: announcements
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Announcements: Select" ON public.announcements FOR SELECT USING (ovms_internal.has_tenant_access(tenant_id));
CREATE POLICY "Announcements: Insert" ON public.announcements FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "Announcements: Update" ON public.announcements FOR UPDATE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "Announcements: Delete" ON public.announcements FOR DELETE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));

-- Table: exceptions
ALTER TABLE public.exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Exceptions: Select" ON public.exceptions FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "Exceptions: Insert" ON public.exceptions FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id) AND (ovms_internal.get_auth_user()).role != 'DISPLAY');
CREATE POLICY "Exceptions: Update" ON public.exceptions FOR UPDATE USING (ovms_internal.has_site_access(tenant_id, site_id) AND (ovms_internal.get_auth_user()).role != 'DISPLAY');
CREATE POLICY "Exceptions: Delete" ON public.exceptions FOR DELETE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));

-- Table: production_plan_imports
ALTER TABLE public.production_plan_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ProductionPlanImports: Select" ON public.production_plan_imports FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "ProductionPlanImports: Insert" ON public.production_plan_imports FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "ProductionPlanImports: Update" ON public.production_plan_imports FOR UPDATE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "ProductionPlanImports: Delete" ON public.production_plan_imports FOR DELETE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));

-- Table: production_plan_entries
ALTER TABLE public.production_plan_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ProductionPlanEntries: Select" ON public.production_plan_entries FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "ProductionPlanEntries: Insert" ON public.production_plan_entries FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "ProductionPlanEntries: Update" ON public.production_plan_entries FOR UPDATE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "ProductionPlanEntries: Delete" ON public.production_plan_entries FOR DELETE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));

-- Table: site_settings
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "SiteSettings: Select" ON public.site_settings FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "SiteSettings: Insert" ON public.site_settings FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "SiteSettings: Update" ON public.site_settings FOR UPDATE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "SiteSettings: Delete" ON public.site_settings FOR DELETE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));

-- Table: site_onboarding
ALTER TABLE public.site_onboarding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "SiteOnboarding: Select" ON public.site_onboarding FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "SiteOnboarding: Insert" ON public.site_onboarding FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "SiteOnboarding: Update" ON public.site_onboarding FOR UPDATE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "SiteOnboarding: Delete" ON public.site_onboarding FOR DELETE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));

-- Table: site_recommendation_runs
ALTER TABLE public.site_recommendation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "SiteRecommendationRuns: Select" ON public.site_recommendation_runs FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "SiteRecommendationRuns: Insert" ON public.site_recommendation_runs FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id) AND (ovms_internal.get_auth_user()).role != 'DISPLAY');
CREATE POLICY "SiteRecommendationRuns: Update" ON public.site_recommendation_runs FOR UPDATE USING (ovms_internal.has_site_access(tenant_id, site_id) AND (ovms_internal.get_auth_user()).role != 'DISPLAY');
CREATE POLICY "SiteRecommendationRuns: Delete" ON public.site_recommendation_runs FOR DELETE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));

-- Table: sessions
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sessions: Select" ON public.sessions FOR SELECT USING (user_id = auth.uid() OR ovms_internal.is_platform_superuser());
CREATE POLICY "Sessions: Insert" ON public.sessions FOR INSERT WITH CHECK (user_id = auth.uid() OR ovms_internal.is_platform_superuser());
CREATE POLICY "Sessions: Update" ON public.sessions FOR UPDATE USING (user_id = auth.uid() OR ovms_internal.is_platform_superuser());
CREATE POLICY "Sessions: Delete" ON public.sessions FOR DELETE USING (user_id = auth.uid() OR ovms_internal.is_platform_superuser());

-- Table: tenant_deletion_jobs
ALTER TABLE public.tenant_deletion_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "TenantDeletionJobs: Select" ON public.tenant_deletion_jobs FOR SELECT USING (ovms_internal.is_platform_superuser());
CREATE POLICY "TenantDeletionJobs: Insert" ON public.tenant_deletion_jobs FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser());
CREATE POLICY "TenantDeletionJobs: Update" ON public.tenant_deletion_jobs FOR UPDATE USING (ovms_internal.is_platform_superuser());
CREATE POLICY "TenantDeletionJobs: Delete" ON public.tenant_deletion_jobs FOR DELETE USING (ovms_internal.is_platform_superuser());

-- Table: platform_deletion_receipts
ALTER TABLE public.platform_deletion_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "PlatformDeletionReceipts: Select" ON public.platform_deletion_receipts FOR SELECT USING (ovms_internal.is_platform_superuser());
CREATE POLICY "PlatformDeletionReceipts: Insert" ON public.platform_deletion_receipts FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser());
CREATE POLICY "PlatformDeletionReceipts: Update" ON public.platform_deletion_receipts FOR UPDATE USING (ovms_internal.is_platform_superuser());
CREATE POLICY "PlatformDeletionReceipts: Delete" ON public.platform_deletion_receipts FOR DELETE USING (ovms_internal.is_platform_superuser());


-- ====================================================================
-- OVMS DATABASE SCHEMA RECONCILIATION MIGRATION SCRIPT
-- ====================================================================
-- Primary Objective: Reconcile Supabase database schema to match the
-- existing OVMS React/TypeScript codebase without weakening RLS or
-- changing the authorization model.
-- Safe to run against an existing database (idempotent operations).
-- ====================================================================

-- 0. Required Extensions & Helper Functions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --------------------------------------------------------------------
-- 1. RECONCILE: public.tenants
-- --------------------------------------------------------------------
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS tenant_name TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS tenant_code TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS is_system_tenant BOOLEAN DEFAULT FALSE;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS deletion_job_id TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS deletion_requested_by TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS modified_by TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill name <-> tenant_name
UPDATE public.tenants SET name = tenant_name WHERE name IS NULL AND tenant_name IS NOT NULL;
UPDATE public.tenants SET tenant_name = name WHERE tenant_name IS NULL AND name IS NOT NULL;
UPDATE public.tenants SET name = 'Default Tenant' WHERE name IS NULL;
UPDATE public.tenants SET tenant_name = name WHERE tenant_name IS NULL;
ALTER TABLE public.tenants ALTER COLUMN name SET NOT NULL;

-- Trigger to keep name & tenant_name in sync
CREATE OR REPLACE FUNCTION public.sync_tenant_name_cols()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.name IS NOT NULL AND NEW.tenant_name IS NULL THEN
        NEW.tenant_name := NEW.name;
    ELSIF NEW.tenant_name IS NOT NULL AND NEW.name IS NULL THEN
        NEW.name := NEW.tenant_name;
    ELSIF NEW.name IS NOT NULL AND NEW.name <> OLD.name THEN
        NEW.tenant_name := NEW.name;
    ELSIF NEW.tenant_name IS NOT NULL AND NEW.tenant_name <> OLD.tenant_name THEN
        NEW.name := NEW.tenant_name;
    END IF;
    IF NEW.created_date IS NULL THEN NEW.created_date := COALESCE(NEW.created_at, NOW()); END IF;
    IF NEW.created_at IS NULL THEN NEW.created_at := COALESCE(NEW.created_date, NOW()); END IF;
    NEW.modified_date := NOW();
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_tenant_name ON public.tenants;
CREATE TRIGGER trg_sync_tenant_name
BEFORE INSERT OR UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.sync_tenant_name_cols();

-- --------------------------------------------------------------------
-- 2. RECONCILE: public.sites
-- --------------------------------------------------------------------
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS site_code TEXT;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS site_name TEXT;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS modified_by TEXT;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.sites SET site_code = code WHERE site_code IS NULL AND code IS NOT NULL;
UPDATE public.sites SET site_name = name WHERE site_name IS NULL AND name IS NOT NULL;

-- --------------------------------------------------------------------
-- 3. RECONCILE: public.users
-- --------------------------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS site_ids TEXT[];
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS requires_password_change BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS failed_attempt_window_started_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS modified_by TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- --------------------------------------------------------------------
-- 4. RECONCILE: public.sessions
-- --------------------------------------------------------------------
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS login_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS logout_at TIMESTAMPTZ;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS device_info TEXT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- --------------------------------------------------------------------
-- 5. CREATE MISSING TABLE: public.product_categories
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

-- --------------------------------------------------------------------
-- 6. CREATE MISSING TABLE: public.units_of_measure
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.units_of_measure (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    quantity_precision INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

-- --------------------------------------------------------------------
-- 7. CREATE MISSING TABLE: public.storage_areas
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.storage_areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    area_code TEXT NOT NULL,
    code TEXT,
    area_name TEXT NOT NULL,
    name TEXT,
    area_type TEXT NOT NULL DEFAULT 'HIGH_BAY',
    sort_order INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(site_id, area_code)
);

-- --------------------------------------------------------------------
-- 8. RECONCILE: public.locations
-- --------------------------------------------------------------------
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS storage_area_id UUID REFERENCES public.storage_areas(id) ON DELETE SET NULL;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS location_code TEXT;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS location_name TEXT;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS zone TEXT;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS modified_by TEXT;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.locations SET location_code = code WHERE location_code IS NULL AND code IS NOT NULL;
UPDATE public.locations SET location_name = name WHERE location_name IS NULL AND name IS NOT NULL;

-- --------------------------------------------------------------------
-- 9. RECONCILE: public.destinations
-- --------------------------------------------------------------------
ALTER TABLE public.destinations ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.destinations ADD COLUMN IF NOT EXISTS destination_code TEXT;
ALTER TABLE public.destinations ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.destinations ADD COLUMN IF NOT EXISTS destination_name TEXT;
ALTER TABLE public.destinations ADD COLUMN IF NOT EXISTS destination_type TEXT DEFAULT 'EXTERNAL_SITE';
ALTER TABLE public.destinations ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.destinations ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.destinations ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.destinations ADD COLUMN IF NOT EXISTS modified_by TEXT;
ALTER TABLE public.destinations ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.destinations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.destinations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.destinations SET destination_code = code WHERE destination_code IS NULL AND code IS NOT NULL;
UPDATE public.destinations SET destination_name = name WHERE destination_name IS NULL AND name IS NOT NULL;

-- --------------------------------------------------------------------
-- 10. RECONCILE: public.action_types
-- --------------------------------------------------------------------
ALTER TABLE public.action_types ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.action_types ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE public.action_types ADD COLUMN IF NOT EXISTS meaning TEXT;
ALTER TABLE public.action_types ADD COLUMN IF NOT EXISTS colour_token TEXT;
ALTER TABLE public.action_types ADD COLUMN IF NOT EXISTS icon_key TEXT;
ALTER TABLE public.action_types ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.action_types ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.action_types ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.action_types ADD COLUMN IF NOT EXISTS modified_by TEXT;
ALTER TABLE public.action_types ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.action_types ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.action_types ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.action_types SET label = name WHERE label IS NULL AND name IS NOT NULL;
UPDATE public.action_types SET name = label WHERE name IS NULL AND label IS NOT NULL;

-- --------------------------------------------------------------------
-- 11. RECONCILE: public.priority_levels
-- --------------------------------------------------------------------
ALTER TABLE public.priority_levels ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.priority_levels ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE public.priority_levels ADD COLUMN IF NOT EXISTS level INTEGER;
ALTER TABLE public.priority_levels ADD COLUMN IF NOT EXISTS numeric_weight INTEGER DEFAULT 0;
ALTER TABLE public.priority_levels ADD COLUMN IF NOT EXISTS colour_token TEXT;
ALTER TABLE public.priority_levels ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.priority_levels ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.priority_levels ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.priority_levels ADD COLUMN IF NOT EXISTS modified_by TEXT;
ALTER TABLE public.priority_levels ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.priority_levels ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.priority_levels ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.priority_levels SET label = name WHERE label IS NULL AND name IS NOT NULL;
UPDATE public.priority_levels SET name = label WHERE name IS NULL AND label IS NOT NULL;
UPDATE public.priority_levels SET level = numeric_weight WHERE level IS NULL AND numeric_weight IS NOT NULL;
UPDATE public.priority_levels SET numeric_weight = level WHERE numeric_weight IS NULL AND level IS NOT NULL;

-- --------------------------------------------------------------------
-- 12. RECONCILE: public.production_lines
-- --------------------------------------------------------------------
ALTER TABLE public.production_lines ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.production_lines ADD COLUMN IF NOT EXISTS line_code TEXT;
ALTER TABLE public.production_lines ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.production_lines ADD COLUMN IF NOT EXISTS line_name TEXT;
ALTER TABLE public.production_lines ADD COLUMN IF NOT EXISTS sap_resource_code TEXT;
ALTER TABLE public.production_lines ADD COLUMN IF NOT EXISTS sap_resource_aliases JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.production_lines ADD COLUMN IF NOT EXISTS scheduled_clean_day TEXT;
ALTER TABLE public.production_lines ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.production_lines ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.production_lines ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.production_lines ADD COLUMN IF NOT EXISTS modified_by TEXT;
ALTER TABLE public.production_lines ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.production_lines ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.production_lines ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.production_lines SET line_code = code WHERE line_code IS NULL AND code IS NOT NULL;
UPDATE public.production_lines SET line_name = name WHERE line_name IS NULL AND name IS NOT NULL;

-- --------------------------------------------------------------------
-- 13. RECONCILE: public.products
-- --------------------------------------------------------------------
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_code TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS configurations JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS default_import_uom_id TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS default_destination_id UUID REFERENCES public.destinations(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS operationally_relevant BOOLEAN DEFAULT TRUE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS modified_by TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.products SET product_code = code WHERE product_code IS NULL AND code IS NOT NULL;

-- --------------------------------------------------------------------
-- 14. CREATE MISSING TABLE: public.decision_configurations
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.decision_configurations (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    hold_action_id UUID REFERENCES public.action_types(id) ON DELETE SET NULL,
    review_action_id UUID REFERENCES public.action_types(id) ON DELETE SET NULL,
    release_action_id UUID REFERENCES public.action_types(id) ON DELETE SET NULL,
    urgent_priority_id UUID REFERENCES public.priority_levels(id) ON DELETE SET NULL,
    normal_priority_id UUID REFERENCES public.priority_levels(id) ON DELETE SET NULL,
    low_priority_id UUID REFERENCES public.priority_levels(id) ON DELETE SET NULL,
    default_destination_rules JSONB DEFAULT '{}'::jsonb,
    data_quality_rules JSONB DEFAULT '{}'::jsonb,
    version TEXT,
    status TEXT DEFAULT 'active',
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, site_id)
);

-- --------------------------------------------------------------------
-- 15. RECONCILE: public.inventory_balances
-- --------------------------------------------------------------------
ALTER TABLE public.inventory_balances ADD COLUMN IF NOT EXISTS product_code TEXT;
ALTER TABLE public.inventory_balances ADD COLUMN IF NOT EXISTS product_code_snapshot TEXT;
ALTER TABLE public.inventory_balances ADD COLUMN IF NOT EXISTS description_snapshot TEXT;
ALTER TABLE public.inventory_balances ADD COLUMN IF NOT EXISTS location_code_snapshot TEXT;
ALTER TABLE public.inventory_balances ADD COLUMN IF NOT EXISTS pallets INTEGER DEFAULT 0;
ALTER TABLE public.inventory_balances ADD COLUMN IF NOT EXISTS cases INTEGER DEFAULT 0;
ALTER TABLE public.inventory_balances ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'MANUAL';
ALTER TABLE public.inventory_balances ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.inventory_balances ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.inventory_balances ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.inventory_balances ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.inventory_balances ADD COLUMN IF NOT EXISTS modified_by TEXT;
ALTER TABLE public.inventory_balances ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.inventory_balances ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.inventory_balances ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- --------------------------------------------------------------------
-- 16. RECONCILE: public.inventory_movements
-- --------------------------------------------------------------------
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS product_code TEXT;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS product_code_snapshot TEXT;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS pallets INTEGER DEFAULT 0;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS cases INTEGER DEFAULT 0;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS balance_before NUMERIC DEFAULT 0;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS balance_after NUMERIC DEFAULT 0;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS moved_by TEXT;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS moved_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS modified_by TEXT;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- --------------------------------------------------------------------
-- 17. RECONCILE: public.priorities
-- --------------------------------------------------------------------
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'MANUAL';
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS source_recommendation_id UUID;
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS product_code TEXT;
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS product_code_snapshot TEXT;
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS description_snapshot TEXT;
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS action_type_code TEXT;
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS action_type_label TEXT;
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS destination_code TEXT;
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS destination_label TEXT;
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS overflow_destination_id UUID REFERENCES public.destinations(id) ON DELETE SET NULL;
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS overflow_destination_label TEXT;
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS priority_level_code TEXT;
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS priority_level_label TEXT;
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS supporting_reasons JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS planning_context_snapshot JSONB;
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE';
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS priority_status TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS target_pallets INTEGER DEFAULT 0;
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS target_cases INTEGER DEFAULT 0;
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS completed_pallets INTEGER DEFAULT 0;
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS completed_cases INTEGER DEFAULT 0;
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS latest_progress_note TEXT;
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS modified_by TEXT;
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.priorities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.priorities SET priority_status = status WHERE priority_status IS NULL AND status IS NOT NULL;
UPDATE public.priorities SET status = priority_status WHERE status IS NULL AND priority_status IS NOT NULL;

-- --------------------------------------------------------------------
-- 18. RECONCILE: public.display_priorities
-- --------------------------------------------------------------------
ALTER TABLE public.display_priorities ADD COLUMN IF NOT EXISTS overflow_destination_id UUID REFERENCES public.destinations(id) ON DELETE SET NULL;
ALTER TABLE public.display_priorities ADD COLUMN IF NOT EXISTS overflow_destination_label TEXT;
ALTER TABLE public.display_priorities ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.display_priorities ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.display_priorities ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.display_priorities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- --------------------------------------------------------------------
-- 19. CREATE MISSING TABLE: public.priority_events
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.priority_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    priority_id UUID REFERENCES public.priorities(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    previous_status TEXT,
    new_status TEXT,
    previous_value JSONB,
    new_value JSONB,
    note TEXT,
    performed_by TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- --------------------------------------------------------------------
-- 20. RECONCILE: public.exceptions
-- --------------------------------------------------------------------
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'WARNING';
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS entity_id TEXT;
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS priority_id UUID REFERENCES public.priorities(id) ON DELETE SET NULL;
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS reason_codes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'OPEN';
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS exception_status TEXT NOT NULL DEFAULT 'OPEN';
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS first_detected_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS last_detected_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS acknowledged_by TEXT;
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS resolved_by TEXT;
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS resolution_note TEXT;
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS raised_by TEXT;
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS raised_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS modified_by TEXT;
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.exceptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.exceptions SET exception_status = status WHERE exception_status IS NULL AND status IS NOT NULL;
UPDATE public.exceptions SET status = exception_status WHERE status IS NULL AND exception_status IS NOT NULL;

-- --------------------------------------------------------------------
-- 21. RECONCILE: public.announcements
-- --------------------------------------------------------------------
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'NORMAL';
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS expire_at TIMESTAMPTZ;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS display_on_tv BOOLEAN DEFAULT TRUE;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS created_by_name TEXT;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS modified_by_name TEXT;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS published_by TEXT;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.announcements SET content = message WHERE content IS NULL AND message IS NOT NULL;
UPDATE public.announcements SET message = content WHERE message IS NULL AND content IS NOT NULL;

-- --------------------------------------------------------------------
-- 22. RECONCILE: public.planning_rules
-- --------------------------------------------------------------------
ALTER TABLE public.planning_rules ADD COLUMN IF NOT EXISTS product_code TEXT;
ALTER TABLE public.planning_rules ADD COLUMN IF NOT EXISTS product_code_snapshot TEXT;
ALTER TABLE public.planning_rules ADD COLUMN IF NOT EXISTS description_snapshot TEXT;
ALTER TABLE public.planning_rules ADD COLUMN IF NOT EXISTS ddxm_retention_quantity NUMERIC DEFAULT 0;
ALTER TABLE public.planning_rules ADD COLUMN IF NOT EXISTS controlling_threshold_mode TEXT DEFAULT 'DDXM';
ALTER TABLE public.planning_rules ADD COLUMN IF NOT EXISTS custom_controlling_retention_quantity NUMERIC;
ALTER TABLE public.planning_rules ADD COLUMN IF NOT EXISTS below_target_behavior TEXT;
ALTER TABLE public.planning_rules ADD COLUMN IF NOT EXISTS secondary_destination_id UUID REFERENCES public.destinations(id) ON DELETE SET NULL;
ALTER TABLE public.planning_rules ADD COLUMN IF NOT EXISTS default_priority_level_id UUID REFERENCES public.priority_levels(id) ON DELETE SET NULL;
ALTER TABLE public.planning_rules ADD COLUMN IF NOT EXISTS allow_quantity_override BOOLEAN DEFAULT TRUE;
ALTER TABLE public.planning_rules ADD COLUMN IF NOT EXISTS allow_destination_override BOOLEAN DEFAULT TRUE;
ALTER TABLE public.planning_rules ADD COLUMN IF NOT EXISTS override_requires_reason BOOLEAN DEFAULT FALSE;
ALTER TABLE public.planning_rules ADD COLUMN IF NOT EXISTS until_switched_off BOOLEAN DEFAULT TRUE;
ALTER TABLE public.planning_rules ADD COLUMN IF NOT EXISTS min_days INTEGER DEFAULT 0;
ALTER TABLE public.planning_rules ADD COLUMN IF NOT EXISTS max_days INTEGER DEFAULT 0;
ALTER TABLE public.planning_rules ADD COLUMN IF NOT EXISTS target_days INTEGER DEFAULT 0;
ALTER TABLE public.planning_rules ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.planning_rules ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.planning_rules ADD COLUMN IF NOT EXISTS modified_by TEXT;
ALTER TABLE public.planning_rules ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.planning_rules ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.planning_rules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- --------------------------------------------------------------------
-- 23. RECONCILE: public.promotions
-- --------------------------------------------------------------------
ALTER TABLE public.promotions ALTER COLUMN site_id DROP NOT NULL;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS promotion_code TEXT;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS promotion_name TEXT;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS importance TEXT DEFAULT 'STANDARD';
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS promotion_status TEXT DEFAULT 'DRAFT';
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS pre_build_start_date TIMESTAMPTZ;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS run_down_end_date TIMESTAMPTZ;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS modified_by TEXT;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.promotions SET promotion_name = name WHERE promotion_name IS NULL AND name IS NOT NULL;
UPDATE public.promotions SET name = promotion_name WHERE name IS NULL AND promotion_name IS NOT NULL;
UPDATE public.promotions SET promotion_code = code WHERE promotion_code IS NULL AND code IS NOT NULL;
UPDATE public.promotions SET code = promotion_code WHERE code IS NULL AND promotion_code IS NOT NULL;

-- --------------------------------------------------------------------
-- 24. CREATE MISSING TABLE: public.promotion_product_rules
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.promotion_product_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    promotion_id UUID NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    product_code_snapshot TEXT,
    description_snapshot TEXT,
    expected_volume_uplift_quantity NUMERIC,
    expected_volume_uplift_percent NUMERIC,
    retention_uplift_quantity NUMERIC,
    promotion_minimum_override NUMERIC,
    promotion_target_override NUMERIC,
    promotion_maximum_override NUMERIC,
    destination_override_id UUID REFERENCES public.destinations(id) ON DELETE SET NULL,
    priority_weight_uplift NUMERIC DEFAULT 0,
    action_type_override_id UUID REFERENCES public.action_types(id) ON DELETE SET NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- --------------------------------------------------------------------
-- 25. CREATE MISSING TABLE: public.recommendation_runs
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recommendation_runs (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'IDLE',
    started_at TIMESTAMPTZ,
    started_by TEXT,
    started_by_name TEXT,
    completed_at TIMESTAMPTZ,
    completed_by TEXT,
    completed_by_name TEXT,
    total_products INTEGER DEFAULT 0,
    current_product_index INTEGER DEFAULT 0,
    current_product_code TEXT,
    generated_count INTEGER DEFAULT 0,
    conflicts_count INTEGER DEFAULT 0,
    error TEXT,
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, site_id)
);

-- Safely convert old site_recommendation_runs table to a view if it exists as a table
DO 973
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'site_recommendation_runs' AND c.relkind = 'r'
    ) THEN
        DROP TABLE public.site_recommendation_runs CASCADE;
    END IF;
END 973;

DROP VIEW IF EXISTS public.site_recommendation_runs CASCADE;
CREATE OR REPLACE VIEW public.site_recommendation_runs AS SELECT * FROM public.recommendation_runs;

-- --------------------------------------------------------------------
-- 26. RECONCILE: public.recommendations
-- --------------------------------------------------------------------
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS recommendation_status TEXT NOT NULL DEFAULT 'AWAITING_REVIEW';
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS engine_version TEXT DEFAULT '1.0';
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS decision_output JSONB;
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS source_snapshot JSONB;
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS source_fingerprint TEXT;
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS planner_decision JSONB;
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS override_flags JSONB;
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS override_reason TEXT;
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS superseded_by_recommendation_id UUID;
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS linked_priority_id UUID;
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS product_code_snapshot TEXT;
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS description_snapshot TEXT;
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS modified_by TEXT;
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- --------------------------------------------------------------------
-- 27. RECONCILE: public.production_plan_imports
-- --------------------------------------------------------------------
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS file_size_bytes INTEGER DEFAULT 0;
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS file_hash TEXT;
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS source_system TEXT DEFAULT 'SAP_MPPS7';
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS file_type TEXT DEFAULT 'XLSX';
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS uploaded_by TEXT;
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS status_message TEXT;
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS plan_start_date DATE;
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS plan_end_date DATE;
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS detected_plan_dates JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS total_detected_days INTEGER DEFAULT 0;
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS total_source_cases INTEGER DEFAULT 0;
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS total_parsed_cases INTEGER DEFAULT 0;
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS total_pallets INTEGER DEFAULT 0;
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS total_source_rows INTEGER DEFAULT 0;
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS valid_rows INTEGER DEFAULT 0;
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS error_rows INTEGER DEFAULT 0;
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS ignored_rows INTEGER DEFAULT 0;
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS warning_count INTEGER DEFAULT 0;
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS error_count INTEGER DEFAULT 0;
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS parser_version TEXT DEFAULT '1.0';
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS supersedes_import_id UUID;
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS reconciliation_summary JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS diagnostics JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS modified_by TEXT;
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.production_plan_imports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- --------------------------------------------------------------------
-- 28. RECONCILE: public.production_plan_entries
-- --------------------------------------------------------------------
ALTER TABLE public.production_plan_entries ADD COLUMN IF NOT EXISTS import_id UUID REFERENCES public.production_plan_imports(id) ON DELETE CASCADE;
ALTER TABLE public.production_plan_entries ADD COLUMN IF NOT EXISTS active_import_id UUID REFERENCES public.production_plan_imports(id) ON DELETE CASCADE;
ALTER TABLE public.production_plan_entries ADD COLUMN IF NOT EXISTS cases_per_pallet INTEGER DEFAULT 0;
ALTER TABLE public.production_plan_entries ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'SAP_MPPS7';
ALTER TABLE public.production_plan_entries ADD COLUMN IF NOT EXISTS source_sheet_name TEXT;
ALTER TABLE public.production_plan_entries ADD COLUMN IF NOT EXISTS source_row_number INTEGER;
ALTER TABLE public.production_plan_entries ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ;
ALTER TABLE public.production_plan_entries ADD COLUMN IF NOT EXISTS plan_version TEXT DEFAULT 'v1';
ALTER TABLE public.production_plan_entries ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.production_plan_entries ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.production_plan_entries ADD COLUMN IF NOT EXISTS modified_by TEXT;
ALTER TABLE public.production_plan_entries ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.production_plan_entries ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.production_plan_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.production_plan_entries SET import_id = active_import_id WHERE import_id IS NULL AND active_import_id IS NOT NULL;
UPDATE public.production_plan_entries SET active_import_id = import_id WHERE active_import_id IS NULL AND import_id IS NOT NULL;

-- --------------------------------------------------------------------
-- 29. RECONCILE: public.production_events
-- --------------------------------------------------------------------
ALTER TABLE public.production_events ADD COLUMN IF NOT EXISTS note_date TIMESTAMPTZ;
ALTER TABLE public.production_events ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ;
ALTER TABLE public.production_events ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ;
ALTER TABLE public.production_events ADD COLUMN IF NOT EXISTS product_code_snapshot TEXT;
ALTER TABLE public.production_events ADD COLUMN IF NOT EXISTS description_snapshot TEXT;
ALTER TABLE public.production_events ADD COLUMN IF NOT EXISTS production_status TEXT;
ALTER TABLE public.production_events ADD COLUMN IF NOT EXISTS planned_start TIMESTAMPTZ;
ALTER TABLE public.production_events ADD COLUMN IF NOT EXISTS planned_finish TIMESTAMPTZ;
ALTER TABLE public.production_events ADD COLUMN IF NOT EXISTS actual_start TIMESTAMPTZ;
ALTER TABLE public.production_events ADD COLUMN IF NOT EXISTS actual_finish TIMESTAMPTZ;
ALTER TABLE public.production_events ADD COLUMN IF NOT EXISTS planned_quantity NUMERIC;
ALTER TABLE public.production_events ADD COLUMN IF NOT EXISTS actual_quantity NUMERIC;
ALTER TABLE public.production_events ADD COLUMN IF NOT EXISTS unit_of_measure_id TEXT;
ALTER TABLE public.production_events ADD COLUMN IF NOT EXISTS delay_reason TEXT;
ALTER TABLE public.production_events ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.production_events ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.production_events ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.production_events ADD COLUMN IF NOT EXISTS modified_by TEXT;
ALTER TABLE public.production_events ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.production_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.production_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- --------------------------------------------------------------------
-- 30. RECONCILE: public.northfleet_sto_imports
-- --------------------------------------------------------------------
ALTER TABLE public.northfleet_sto_imports ADD COLUMN IF NOT EXISTS effective_start_date TIMESTAMPTZ;
ALTER TABLE public.northfleet_sto_imports ADD COLUMN IF NOT EXISTS effective_end_date TIMESTAMPTZ;
ALTER TABLE public.northfleet_sto_imports ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.northfleet_sto_imports ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.northfleet_sto_imports ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.northfleet_sto_imports ADD COLUMN IF NOT EXISTS modified_by TEXT;
ALTER TABLE public.northfleet_sto_imports ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.northfleet_sto_imports ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.northfleet_sto_imports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- --------------------------------------------------------------------
-- 31. RECONCILE: public.northfleet_sto_requirements
-- --------------------------------------------------------------------
ALTER TABLE public.northfleet_sto_requirements ADD COLUMN IF NOT EXISTS product_description_snapshot TEXT;
ALTER TABLE public.northfleet_sto_requirements ADD COLUMN IF NOT EXISTS cases_per_pallet_snapshot INTEGER DEFAULT 0;
ALTER TABLE public.northfleet_sto_requirements ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.northfleet_sto_requirements ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.northfleet_sto_requirements ADD COLUMN IF NOT EXISTS modified_by TEXT;
ALTER TABLE public.northfleet_sto_requirements ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.northfleet_sto_requirements ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.northfleet_sto_requirements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- --------------------------------------------------------------------
-- 32. RECONCILE: public.site_settings
-- --------------------------------------------------------------------
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS modified_by TEXT;
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();

-- --------------------------------------------------------------------
-- 33. RECONCILE: public.site_onboarding
-- --------------------------------------------------------------------
ALTER TABLE public.site_onboarding ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'NOT_STARTED';
ALTER TABLE public.site_onboarding ADD COLUMN IF NOT EXISTS current_step INTEGER DEFAULT 0;
ALTER TABLE public.site_onboarding ADD COLUMN IF NOT EXISTS completed_steps JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.site_onboarding ADD COLUMN IF NOT EXISTS skipped_optional_steps JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.site_onboarding ADD COLUMN IF NOT EXISTS started_by TEXT;
ALTER TABLE public.site_onboarding ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.site_onboarding ADD COLUMN IF NOT EXISTS last_updated_by TEXT;
ALTER TABLE public.site_onboarding ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMPTZ;
ALTER TABLE public.site_onboarding ADD COLUMN IF NOT EXISTS completed_by TEXT;
ALTER TABLE public.site_onboarding ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.site_onboarding ADD COLUMN IF NOT EXISTS configuration_version TEXT;
ALTER TABLE public.site_onboarding ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;
ALTER TABLE public.site_onboarding ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ;
ALTER TABLE public.site_onboarding ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.site_onboarding ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();

-- --------------------------------------------------------------------
-- 34. RECONCILE: public.tenant_deletion_jobs
-- --------------------------------------------------------------------
ALTER TABLE public.tenant_deletion_jobs ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE public.tenant_deletion_jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.tenant_deletion_jobs ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.tenant_deletion_jobs ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();

-- --------------------------------------------------------------------
-- 35. RECONCILE: public.platform_deletion_receipts
-- --------------------------------------------------------------------
ALTER TABLE public.platform_deletion_receipts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.platform_deletion_receipts ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.platform_deletion_receipts ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();

-- --------------------------------------------------------------------
-- 36. GENERIC DATE SYNCHRONIZATION TRIGGER FOR ALL BASE TABLES
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_document_audit_dates()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.created_date IS NULL THEN
        NEW.created_date := COALESCE(NEW.created_at, NOW());
    END IF;
    IF NEW.created_at IS NULL THEN
        NEW.created_at := COALESCE(NEW.created_date, NOW());
    END IF;
    NEW.modified_date := NOW();
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ 
DECLARE
    tbl text;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY[
        'sites', 'users', 'product_categories', 'units_of_measure', 'products',
        'storage_areas', 'locations', 'destinations', 'action_types', 'priority_levels',
        'production_lines', 'decision_configurations', 'inventory_balances', 'inventory_movements',
        'priorities', 'display_priorities', 'priority_events', 'exceptions', 'announcements',
        'planning_rules', 'promotions', 'promotion_product_rules', 'recommendation_runs',
        'recommendations', 'production_plan_imports', 'production_plan_entries',
        'production_events', 'northfleet_sto_imports', 'northfleet_sto_requirements',
        'site_settings', 'site_onboarding', 'sessions'
    ])
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_sync_dates ON public.%I;', tbl);
        EXECUTE format('CREATE TRIGGER trg_sync_dates BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.sync_document_audit_dates();', tbl);
    END LOOP;
END $$;

-- --------------------------------------------------------------------
-- 37. SUPERUSER AUTO-PROVISIONING GUARANTEE
-- --------------------------------------------------------------------
-- Ensures existing auth user is properly mirrored in public.users as ACTIVE PLATFORM_SUPERUSER
INSERT INTO public.users (id, email, display_name, role, account_status, created_at, updated_at, created_date, modified_date)
SELECT 
    id, 
    email, 
    COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email),
    'PLATFORM_SUPERUSER', 
    'ACTIVE', 
    NOW(), 
    NOW(),
    NOW(),
    NOW()
FROM auth.users
WHERE email IN ('chris.jeal@gxo.com', 'cjeal85@gmail.com') 
   OR id = '65c4bfd0-c41b-4a2a-807e-cb0848cd67f7'
ON CONFLICT (id) DO UPDATE 
SET role = 'PLATFORM_SUPERUSER', account_status = 'ACTIVE';

-- --------------------------------------------------------------------
-- 38. ROW-LEVEL SECURITY & GRANTS FOR RECONCILED TABLES
-- --------------------------------------------------------------------
-- Enable RLS on all missing/new tables
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units_of_measure ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.priority_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_product_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.northfleet_sto_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.northfleet_sto_requirements ENABLE ROW LEVEL SECURITY;

-- Grants to authenticated and service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units_of_measure TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.storage_areas TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.decision_configurations TO authenticated, service_role;
GRANT SELECT, INSERT ON public.priority_events TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recommendation_runs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotion_product_rules TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.northfleet_sto_imports TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.northfleet_sto_requirements TO authenticated, service_role;

-- Product Categories Policies
DROP POLICY IF EXISTS "ProductCategories: Select" ON public.product_categories;
CREATE POLICY "ProductCategories: Select" ON public.product_categories FOR SELECT USING (ovms_internal.has_tenant_access(tenant_id));
DROP POLICY IF EXISTS "ProductCategories: Insert" ON public.product_categories;
CREATE POLICY "ProductCategories: Insert" ON public.product_categories FOR INSERT WITH CHECK (ovms_internal.is_tenant_admin(tenant_id));
DROP POLICY IF EXISTS "ProductCategories: Update" ON public.product_categories;
CREATE POLICY "ProductCategories: Update" ON public.product_categories FOR UPDATE USING (ovms_internal.is_tenant_admin(tenant_id));
DROP POLICY IF EXISTS "ProductCategories: Delete" ON public.product_categories;
CREATE POLICY "ProductCategories: Delete" ON public.product_categories FOR DELETE USING (ovms_internal.is_tenant_admin(tenant_id));

-- Units of Measure Policies
DROP POLICY IF EXISTS "UnitsOfMeasure: Select" ON public.units_of_measure;
CREATE POLICY "UnitsOfMeasure: Select" ON public.units_of_measure FOR SELECT USING (ovms_internal.has_tenant_access(tenant_id));
DROP POLICY IF EXISTS "UnitsOfMeasure: Insert" ON public.units_of_measure;
CREATE POLICY "UnitsOfMeasure: Insert" ON public.units_of_measure FOR INSERT WITH CHECK (ovms_internal.is_tenant_admin(tenant_id));
DROP POLICY IF EXISTS "UnitsOfMeasure: Update" ON public.units_of_measure;
CREATE POLICY "UnitsOfMeasure: Update" ON public.units_of_measure FOR UPDATE USING (ovms_internal.is_tenant_admin(tenant_id));
DROP POLICY IF EXISTS "UnitsOfMeasure: Delete" ON public.units_of_measure;
CREATE POLICY "UnitsOfMeasure: Delete" ON public.units_of_measure FOR DELETE USING (ovms_internal.is_tenant_admin(tenant_id));

-- Storage Areas Policies
DROP POLICY IF EXISTS "StorageAreas: Select" ON public.storage_areas;
CREATE POLICY "StorageAreas: Select" ON public.storage_areas FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
DROP POLICY IF EXISTS "StorageAreas: Insert" ON public.storage_areas;
CREATE POLICY "StorageAreas: Insert" ON public.storage_areas FOR INSERT WITH CHECK (ovms_internal.is_tenant_admin(tenant_id));
DROP POLICY IF EXISTS "StorageAreas: Update" ON public.storage_areas;
CREATE POLICY "StorageAreas: Update" ON public.storage_areas FOR UPDATE USING (ovms_internal.is_tenant_admin(tenant_id));
DROP POLICY IF EXISTS "StorageAreas: Delete" ON public.storage_areas;
CREATE POLICY "StorageAreas: Delete" ON public.storage_areas FOR DELETE USING (ovms_internal.is_tenant_admin(tenant_id));

-- Decision Configurations Policies
DROP POLICY IF EXISTS "DecisionConfigurations: Select" ON public.decision_configurations;
CREATE POLICY "DecisionConfigurations: Select" ON public.decision_configurations FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
DROP POLICY IF EXISTS "DecisionConfigurations: Insert" ON public.decision_configurations;
CREATE POLICY "DecisionConfigurations: Insert" ON public.decision_configurations FOR INSERT WITH CHECK (ovms_internal.is_tenant_admin(tenant_id));
DROP POLICY IF EXISTS "DecisionConfigurations: Update" ON public.decision_configurations;
CREATE POLICY "DecisionConfigurations: Update" ON public.decision_configurations FOR UPDATE USING (ovms_internal.is_tenant_admin(tenant_id));
DROP POLICY IF EXISTS "DecisionConfigurations: Delete" ON public.decision_configurations;
CREATE POLICY "DecisionConfigurations: Delete" ON public.decision_configurations FOR DELETE USING (ovms_internal.is_tenant_admin(tenant_id));

-- Priority Events Policies
DROP POLICY IF EXISTS "PriorityEvents: Select" ON public.priority_events;
CREATE POLICY "PriorityEvents: Select" ON public.priority_events FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
DROP POLICY IF EXISTS "PriorityEvents: Insert" ON public.priority_events;
CREATE POLICY "PriorityEvents: Insert" ON public.priority_events FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id));

-- Recommendation Runs Policies
DROP POLICY IF EXISTS "RecommendationRuns: Select" ON public.recommendation_runs;
CREATE POLICY "RecommendationRuns: Select" ON public.recommendation_runs FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
DROP POLICY IF EXISTS "RecommendationRuns: Insert" ON public.recommendation_runs;
CREATE POLICY "RecommendationRuns: Insert" ON public.recommendation_runs FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id));
DROP POLICY IF EXISTS "RecommendationRuns: Update" ON public.recommendation_runs;
CREATE POLICY "RecommendationRuns: Update" ON public.recommendation_runs FOR UPDATE USING (ovms_internal.has_site_access(tenant_id, site_id));
DROP POLICY IF EXISTS "RecommendationRuns: Delete" ON public.recommendation_runs;
CREATE POLICY "RecommendationRuns: Delete" ON public.recommendation_runs FOR DELETE USING (ovms_internal.is_tenant_admin(tenant_id));

-- Promotion Product Rules Policies
DROP POLICY IF EXISTS "PromotionProductRules: Select" ON public.promotion_product_rules;
CREATE POLICY "PromotionProductRules: Select" ON public.promotion_product_rules FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
DROP POLICY IF EXISTS "PromotionProductRules: Insert" ON public.promotion_product_rules;
CREATE POLICY "PromotionProductRules: Insert" ON public.promotion_product_rules FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id));
DROP POLICY IF EXISTS "PromotionProductRules: Update" ON public.promotion_product_rules;
CREATE POLICY "PromotionProductRules: Update" ON public.promotion_product_rules FOR UPDATE USING (ovms_internal.has_site_access(tenant_id, site_id));
DROP POLICY IF EXISTS "PromotionProductRules: Delete" ON public.promotion_product_rules;
CREATE POLICY "PromotionProductRules: Delete" ON public.promotion_product_rules FOR DELETE USING (ovms_internal.has_site_access(tenant_id, site_id));

-- Northfleet STO Imports Policies
DROP POLICY IF EXISTS "NorthfleetStoImports: Select" ON public.northfleet_sto_imports;
CREATE POLICY "NorthfleetStoImports: Select" ON public.northfleet_sto_imports FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
DROP POLICY IF EXISTS "NorthfleetStoImports: Insert" ON public.northfleet_sto_imports;
CREATE POLICY "NorthfleetStoImports: Insert" ON public.northfleet_sto_imports FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id));
DROP POLICY IF EXISTS "NorthfleetStoImports: Update" ON public.northfleet_sto_imports;
CREATE POLICY "NorthfleetStoImports: Update" ON public.northfleet_sto_imports FOR UPDATE USING (ovms_internal.has_site_access(tenant_id, site_id));
DROP POLICY IF EXISTS "NorthfleetStoImports: Delete" ON public.northfleet_sto_imports;
CREATE POLICY "NorthfleetStoImports: Delete" ON public.northfleet_sto_imports FOR DELETE USING (ovms_internal.is_tenant_admin(tenant_id));

-- Northfleet STO Requirements Policies
DROP POLICY IF EXISTS "NorthfleetStoReq: Select" ON public.northfleet_sto_requirements;
CREATE POLICY "NorthfleetStoReq: Select" ON public.northfleet_sto_requirements FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
DROP POLICY IF EXISTS "NorthfleetStoReq: Insert" ON public.northfleet_sto_requirements;
CREATE POLICY "NorthfleetStoReq: Insert" ON public.northfleet_sto_requirements FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id));
DROP POLICY IF EXISTS "NorthfleetStoReq: Update" ON public.northfleet_sto_requirements;
CREATE POLICY "NorthfleetStoReq: Update" ON public.northfleet_sto_requirements FOR UPDATE USING (ovms_internal.has_site_access(tenant_id, site_id));
DROP POLICY IF EXISTS "NorthfleetStoReq: Delete" ON public.northfleet_sto_requirements;
CREATE POLICY "NorthfleetStoReq: Delete" ON public.northfleet_sto_requirements FOR DELETE USING (ovms_internal.is_tenant_admin(tenant_id));

-- --------------------------------------------------------------------
-- 39. RELOAD POSTGREST SCHEMA CACHE
-- --------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

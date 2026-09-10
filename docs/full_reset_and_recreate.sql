-- ============================================================================
-- OVMS DATABASE CLEAN TEARDOWN & RECREATION SCRIPT
-- ============================================================================
-- Complete, clean database setup matching the OVMS codebase exactly.
-- Safe to run in Supabase SQL Editor.
-- ============================================================================

-- ============================================================================
-- PART 1: DESTRUCTIVE TEARDOWN (CLEAN WIPE)
-- ============================================================================

-- Drop all views in public schema dynamically
DO $$ 
DECLARE 
    r RECORD; 
BEGIN 
    FOR r IN (SELECT table_name FROM information_schema.views WHERE table_schema = 'public') 
    LOOP 
        EXECUTE 'DROP VIEW IF EXISTS public.' || quote_ident(r.table_name) || ' CASCADE;'; 
    END LOOP; 
END $$;

-- Drop all public tables with CASCADE
DO $$ 
DECLARE 
    r RECORD; 
BEGIN 
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') 
    LOOP 
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE;'; 
    END LOOP; 
END $$;

-- Drop all policies in public
DO $$ 
DECLARE 
    r RECORD; 
BEGIN 
    FOR r IN (SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public') 
    LOOP 
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.' || quote_ident(r.tablename); 
    END LOOP; 
END $$;

-- Drop custom types in public
DO $$ 
DECLARE 
    r RECORD; 
BEGIN 
    FOR r IN (SELECT typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e') 
    LOOP 
        EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE;'; 
    END LOOP; 
END $$;

-- Drop functions in ovms_internal
DROP SCHEMA IF EXISTS ovms_internal CASCADE;

-- ============================================================================
-- PART 2: EXTENSIONS & SECURITY SCHEMA
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS ovms_internal;

-- ============================================================================
-- PART 3: RECREATE ALL TABLES (WITH APP-MATCHING SCHEMAS)
-- ============================================================================

-- 1. Tenants
CREATE TABLE public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    tenant_name TEXT,
    tenant_code TEXT,
    active BOOLEAN DEFAULT TRUE,
    status TEXT NOT NULL DEFAULT 'active',
    is_system_tenant BOOLEAN DEFAULT FALSE,
    deletion_job_id TEXT,
    deletion_requested_by TEXT,
    deletion_requested_at TIMESTAMPTZ,
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Sites
CREATE TABLE public.sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    site_code TEXT,
    name TEXT NOT NULL,
    site_name TEXT,
    timezone TEXT DEFAULT 'Europe/London',
    status TEXT NOT NULL DEFAULT 'active',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

-- 3. Users (Mirrors Supabase auth.users)
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT,
    job_title TEXT,
    role TEXT NOT NULL CHECK (role IN ('PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER', 'WAREHOUSE_OPERATOR', 'VIEWER', 'DISPLAY')),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    site_ids TEXT[],
    account_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (account_status IN ('ACTIVE', 'DISABLED', 'LOCKED', 'ARCHIVED', 'active', 'disabled', 'locked', 'archived')),
    requires_password_change BOOLEAN DEFAULT FALSE,
    failed_login_attempts INTEGER DEFAULT 0,
    failed_attempt_window_started_at TIMESTAMPTZ,
    locked_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    password_changed_at TIMESTAMPTZ,
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. User Sites Join
CREATE TABLE public.user_sites (
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, site_id)
);

-- 5. Sessions
CREATE TABLE public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
    login_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    last_active TIMESTAMPTZ DEFAULT NOW(),
    logout_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    device_info TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Product Categories
CREATE TABLE public.product_categories (
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

-- 7. Units of Measure
CREATE TABLE public.units_of_measure (
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

-- 8. Destinations
CREATE TABLE public.destinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
    code TEXT NOT NULL,
    destination_code TEXT,
    name TEXT NOT NULL,
    destination_name TEXT,
    destination_type TEXT DEFAULT 'EXTERNAL_SITE',
    default_colour TEXT,
    sort_order INTEGER DEFAULT 0,
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

-- 9. Products
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    product_code TEXT,
    description TEXT NOT NULL,
    category_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL,
    unit_of_measure_id TEXT,
    cases_per_pallet INTEGER,
    units_per_case INTEGER,
    configurations JSONB DEFAULT '[]'::jsonb,
    default_import_uom_id TEXT,
    default_destination_id UUID REFERENCES public.destinations(id) ON DELETE SET NULL,
    operationally_relevant BOOLEAN DEFAULT TRUE,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

-- 10. Storage Areas
CREATE TABLE public.storage_areas (
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

-- 11. Locations
CREATE TABLE public.locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    storage_area_id UUID REFERENCES public.storage_areas(id) ON DELETE SET NULL,
    code TEXT NOT NULL,
    location_code TEXT,
    name TEXT NOT NULL,
    location_name TEXT,
    zone TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(site_id, code)
);

-- 12. Action Types
CREATE TABLE public.action_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    label TEXT,
    meaning TEXT,
    colour_token TEXT,
    icon_key TEXT,
    sort_order INTEGER DEFAULT 0,
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

-- 13. Priority Levels
CREATE TABLE public.priority_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    label TEXT,
    level INTEGER,
    numeric_weight INTEGER DEFAULT 0,
    colour_token TEXT,
    sort_order INTEGER DEFAULT 0,
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

-- 14. Production Lines
CREATE TABLE public.production_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    line_code TEXT,
    name TEXT NOT NULL,
    line_name TEXT,
    sap_resource_code TEXT,
    sap_resource_aliases JSONB DEFAULT '[]'::jsonb,
    scheduled_clean_day TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(site_id, code)
);

-- 15. Decision Configurations
CREATE TABLE public.decision_configurations (
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

-- 16. Inventory Balances
CREATE TABLE public.inventory_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_code TEXT,
    product_code_snapshot TEXT,
    description_snapshot TEXT,
    location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    location_code_snapshot TEXT,
    quantity NUMERIC DEFAULT 0,
    pallets INTEGER DEFAULT 0,
    cases INTEGER DEFAULT 0,
    unit_of_measure_id TEXT,
    source TEXT DEFAULT 'MANUAL',
    source_updated_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. Inventory Movements
CREATE TABLE public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_code TEXT,
    product_code_snapshot TEXT,
    from_location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    to_location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    movement_type TEXT NOT NULL,
    quantity NUMERIC DEFAULT 0,
    pallets INTEGER DEFAULT 0,
    cases INTEGER DEFAULT 0,
    reason TEXT,
    reference TEXT,
    balance_before NUMERIC DEFAULT 0,
    balance_after NUMERIC DEFAULT 0,
    performed_by TEXT,
    moved_by TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    moved_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active',
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18. Priorities
CREATE TABLE public.priorities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    source_type TEXT DEFAULT 'MANUAL',
    source_recommendation_id UUID,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_code TEXT,
    product_code_snapshot TEXT,
    description_snapshot TEXT,
    action_type_id UUID REFERENCES public.action_types(id) ON DELETE SET NULL,
    action_type_code TEXT,
    action_type_label TEXT,
    requested_quantity NUMERIC,
    destination_id UUID REFERENCES public.destinations(id) ON DELETE SET NULL,
    destination_code TEXT,
    destination_label TEXT,
    overflow_destination_id UUID REFERENCES public.destinations(id) ON DELETE SET NULL,
    overflow_destination_label TEXT,
    priority_level_id UUID REFERENCES public.priority_levels(id) ON DELETE SET NULL,
    priority_level_code TEXT,
    priority_level_label TEXT,
    title TEXT DEFAULT '',
    description TEXT,
    instruction TEXT,
    planner_reason TEXT,
    supporting_reasons JSONB DEFAULT '[]'::jsonb,
    planning_context_snapshot JSONB,
    start_at TIMESTAMPTZ DEFAULT NOW(),
    expire_at TIMESTAMPTZ,
    until_switched_off BOOLEAN DEFAULT FALSE,
    priority_status TEXT NOT NULL DEFAULT 'ACTIVE',
    status TEXT DEFAULT 'ACTIVE',
    progress_quantity NUMERIC DEFAULT 0,
    remaining_quantity NUMERIC DEFAULT 0,
    progress_percent NUMERIC DEFAULT 0,
    target_pallets INTEGER DEFAULT 0,
    target_cases INTEGER DEFAULT 0,
    completed_pallets INTEGER DEFAULT 0,
    completed_cases INTEGER DEFAULT 0,
    latest_progress_note TEXT,
    published_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 19. Display Priorities
CREATE TABLE public.display_priorities (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    source_priority_id UUID NOT NULL REFERENCES public.priorities(id) ON DELETE CASCADE,
    priority_code TEXT NOT NULL,
    product_code_snapshot TEXT NOT NULL,
    description_snapshot TEXT,
    title TEXT NOT NULL,
    instruction TEXT,
    priority_status TEXT NOT NULL,
    priority_level_id UUID REFERENCES public.priority_levels(id) ON DELETE SET NULL,
    priority_level_label TEXT,
    action_type_id UUID REFERENCES public.action_types(id) ON DELETE SET NULL,
    action_type_label TEXT,
    requested_quantity NUMERIC,
    progress_quantity NUMERIC DEFAULT 0,
    progress_percent NUMERIC DEFAULT 0,
    destination_id UUID REFERENCES public.destinations(id) ON DELETE SET NULL,
    destination_label TEXT,
    overflow_destination_id UUID REFERENCES public.destinations(id) ON DELETE SET NULL,
    overflow_destination_label TEXT,
    start_at TIMESTAMPTZ,
    expire_at TIMESTAMPTZ,
    until_switched_off BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 20. Priority Events
CREATE TABLE public.priority_events (
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

-- 21. Exceptions
CREATE TABLE public.exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    exception_type TEXT,
    severity TEXT NOT NULL DEFAULT 'WARNING',
    entity_type TEXT,
    entity_id TEXT,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    priority_id UUID REFERENCES public.priorities(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    message TEXT,
    description TEXT,
    reason_codes JSONB DEFAULT '[]'::jsonb,
    exception_status TEXT NOT NULL DEFAULT 'OPEN',
    status TEXT DEFAULT 'OPEN',
    first_detected_at TIMESTAMPTZ DEFAULT NOW(),
    last_detected_at TIMESTAMPTZ DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    resolution_note TEXT,
    raised_by TEXT,
    raised_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    updated_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 22. Announcements
CREATE TABLE public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'GENERAL',
    title TEXT NOT NULL,
    message TEXT,
    content TEXT,
    severity TEXT NOT NULL DEFAULT 'INFO',
    priority TEXT DEFAULT 'NORMAL',
    start_at TIMESTAMPTZ DEFAULT NOW(),
    expire_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    display_on_tv BOOLEAN DEFAULT TRUE,
    active BOOLEAN DEFAULT TRUE,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT,
    created_by_name TEXT,
    modified_by TEXT,
    modified_by_name TEXT,
    published_by TEXT,
    published_at TIMESTAMPTZ DEFAULT NOW(),
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 23. Planning Rules
CREATE TABLE public.planning_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    product_code TEXT,
    product_code_snapshot TEXT,
    description_snapshot TEXT,
    minimum_quantity NUMERIC DEFAULT 0,
    target_quantity NUMERIC DEFAULT 0,
    maximum_quantity NUMERIC DEFAULT 0,
    ddxm_retention_quantity NUMERIC DEFAULT 0,
    controlling_threshold_mode TEXT DEFAULT 'DDXM',
    custom_controlling_retention_quantity NUMERIC,
    below_target_behavior TEXT,
    preferred_destination_id UUID REFERENCES public.destinations(id) ON DELETE SET NULL,
    secondary_destination_id UUID REFERENCES public.destinations(id) ON DELETE SET NULL,
    default_action_type_id UUID REFERENCES public.action_types(id) ON DELETE SET NULL,
    default_priority_level_id UUID REFERENCES public.priority_levels(id) ON DELETE SET NULL,
    allow_quantity_override BOOLEAN DEFAULT TRUE,
    allow_destination_override BOOLEAN DEFAULT TRUE,
    override_requires_reason BOOLEAN DEFAULT FALSE,
    effective_from TIMESTAMPTZ DEFAULT NOW(),
    effective_to TIMESTAMPTZ,
    until_switched_off BOOLEAN DEFAULT TRUE,
    notes TEXT,
    min_days INTEGER DEFAULT 0,
    max_days INTEGER DEFAULT 0,
    target_days INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(site_id, product_id)
);

-- 24. Promotions
CREATE TABLE public.promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
    promotion_code TEXT,
    code TEXT,
    promotion_name TEXT,
    name TEXT,
    description TEXT,
    importance TEXT DEFAULT 'STANDARD',
    promotion_status TEXT DEFAULT 'DRAFT',
    status TEXT DEFAULT 'active',
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    pre_build_start_date TIMESTAMPTZ,
    run_down_end_date TIMESTAMPTZ,
    notes TEXT,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_code TEXT,
    uplift_percentage NUMERIC DEFAULT 0,
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 25. Promotion Product Rules
CREATE TABLE public.promotion_product_rules (
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

-- 26. Recommendation Runs
CREATE TABLE public.recommendation_runs (
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
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, site_id)
);

CREATE OR REPLACE VIEW public.site_recommendation_runs AS 
SELECT * FROM public.recommendation_runs;

-- 27. Recommendations
CREATE TABLE public.recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_code TEXT,
    product_code_snapshot TEXT,
    description_snapshot TEXT,
    recommendation_status TEXT NOT NULL DEFAULT 'AWAITING_REVIEW',
    engine_version TEXT DEFAULT '1.0',
    decision_output JSONB,
    source_snapshot JSONB,
    source_fingerprint TEXT,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by TEXT,
    planner_decision JSONB,
    override_flags JSONB,
    override_reason TEXT,
    superseded_by_recommendation_id UUID,
    linked_priority_id UUID,
    recommendation_type TEXT,
    suggested_action TEXT,
    priority TEXT DEFAULT 'MEDIUM',
    status TEXT DEFAULT 'active',
    payload JSONB,
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 28. Production Plan Imports
CREATE TABLE public.production_plan_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_size_bytes INTEGER DEFAULT 0,
    file_hash TEXT,
    source_system TEXT DEFAULT 'SAP_MPPS7',
    file_type TEXT DEFAULT 'XLSX',
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    uploaded_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'UPLOADED',
    status_message TEXT,
    plan_start_date DATE,
    plan_end_date DATE,
    detected_plan_dates JSONB DEFAULT '[]'::jsonb,
    total_detected_days INTEGER DEFAULT 0,
    total_source_cases INTEGER DEFAULT 0,
    total_parsed_cases INTEGER DEFAULT 0,
    total_pallets INTEGER DEFAULT 0,
    total_source_rows INTEGER DEFAULT 0,
    valid_rows INTEGER DEFAULT 0,
    error_rows INTEGER DEFAULT 0,
    ignored_rows INTEGER DEFAULT 0,
    warning_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    parser_version TEXT DEFAULT '1.0',
    supersedes_import_id UUID,
    notes TEXT,
    reconciliation_summary JSONB DEFAULT '{}'::jsonb,
    diagnostics JSONB DEFAULT '{}'::jsonb,
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 29. Production Plan Entries
CREATE TABLE public.production_plan_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    import_id UUID REFERENCES public.production_plan_imports(id) ON DELETE CASCADE,
    active_import_id UUID REFERENCES public.production_plan_imports(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_code_snapshot TEXT NOT NULL,
    description_snapshot TEXT,
    production_line_id UUID REFERENCES public.production_lines(id) ON DELETE SET NULL,
    production_line_code_snapshot TEXT NOT NULL,
    production_date TIMESTAMPTZ NOT NULL,
    planned_cases INTEGER NOT NULL DEFAULT 0,
    cases_per_pallet INTEGER DEFAULT 0,
    planned_pallets INTEGER DEFAULT 0,
    source_type TEXT DEFAULT 'SAP_MPPS7',
    source_sheet_name TEXT,
    source_row_number INTEGER,
    source_updated_at TIMESTAMPTZ,
    plan_version TEXT DEFAULT 'v1',
    status TEXT NOT NULL DEFAULT 'PLANNED',
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 30. Production Events
CREATE TABLE public.production_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    production_line_id UUID REFERENCES public.production_lines(id) ON DELETE SET NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_code_snapshot TEXT,
    description_snapshot TEXT,
    note_type TEXT DEFAULT 'LINE_NOTE',
    title TEXT DEFAULT '',
    note TEXT DEFAULT '',
    severity TEXT DEFAULT 'INFO',
    source TEXT DEFAULT 'PLANNER',
    active BOOLEAN DEFAULT TRUE,
    note_date TIMESTAMPTZ,
    event_date DATE,
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    production_status TEXT,
    planned_start TIMESTAMPTZ,
    planned_finish TIMESTAMPTZ,
    actual_start TIMESTAMPTZ,
    actual_finish TIMESTAMPTZ,
    planned_quantity NUMERIC,
    actual_quantity NUMERIC,
    unit_of_measure_id TEXT,
    delay_reason TEXT,
    notes TEXT,
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 31. Northfleet STO Imports
CREATE TABLE public.northfleet_sto_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    imported_by TEXT NOT NULL,
    row_count INTEGER DEFAULT 0,
    valid_row_count INTEGER DEFAULT 0,
    warning_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    effective_start_date TIMESTAMPTZ,
    effective_end_date TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'COMMITTED',
    notes TEXT,
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 32. Northfleet STO Requirements
CREATE TABLE public.northfleet_sto_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    sto_number TEXT NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_code TEXT NOT NULL,
    product_description_snapshot TEXT,
    destination_id UUID REFERENCES public.destinations(id) ON DELETE SET NULL,
    destination_code TEXT,
    northfleet_delivery_date TIMESTAMPTZ,
    barrow_collection_date TIMESTAMPTZ,
    pallets INTEGER DEFAULT 0,
    cases INTEGER DEFAULT 0,
    cases_per_pallet_snapshot INTEGER DEFAULT 0,
    import_id UUID REFERENCES public.northfleet_sto_imports(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'UPCOMING',
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 33. Site Settings
CREATE TABLE public.site_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by TEXT,
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, site_id)
);

-- 34. Site Onboarding
CREATE TABLE public.site_onboarding (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'NOT_STARTED',
    current_step INTEGER DEFAULT 0,
    completed_steps JSONB DEFAULT '[]'::jsonb,
    skipped_optional_steps JSONB DEFAULT '[]'::jsonb,
    started_by TEXT,
    started_at TIMESTAMPTZ,
    last_updated_by TEXT,
    last_updated_at TIMESTAMPTZ,
    completed_by TEXT,
    completed_at TIMESTAMPTZ,
    configuration_version TEXT,
    dismissed_at TIMESTAMPTZ,
    reopened_at TIMESTAMPTZ,
    step INTEGER DEFAULT 1,
    completed BOOLEAN DEFAULT FALSE,
    step_data JSONB DEFAULT '{}'::jsonb,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, site_id)
);

-- 35. Audit Logs
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    user_email TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 36. Tenant Deletion Jobs
CREATE TABLE public.tenant_deletion_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    tenant_name TEXT NOT NULL,
    requested_by UUID,
    requested_by_email TEXT NOT NULL,
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'DELETION_PENDING',
    current_stage TEXT,
    collections_processed JSONB DEFAULT '[]'::jsonb,
    documents_deleted INTEGER DEFAULT 0,
    users_deleted INTEGER DEFAULT 0,
    files_deleted INTEGER DEFAULT 0,
    failures JSONB DEFAULT '[]'::jsonb,
    retry_count INTEGER DEFAULT 0,
    error TEXT,
    completed_at TIMESTAMPTZ,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 37. Platform Deletion Receipts
CREATE TABLE public.platform_deletion_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deleted_tenant_id UUID NOT NULL,
    deleted_tenant_name TEXT NOT NULL,
    job_id UUID NOT NULL,
    requested_by UUID NOT NULL,
    requested_by_email TEXT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ DEFAULT NOW(),
    final_document_count INTEGER DEFAULT 0,
    final_user_count INTEGER DEFAULT 0,
    final_file_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'COMPLETED',
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 4: BIDIRECTIONAL SYNCHRONIZATION & DATE TRIGGERS
-- ============================================================================

-- Sync tenant name & code columns
CREATE OR REPLACE FUNCTION public.sync_tenant_aliases()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.name IS NOT NULL AND NEW.tenant_name IS NULL THEN NEW.tenant_name := NEW.name;
    ELSIF NEW.tenant_name IS NOT NULL AND NEW.name IS NULL THEN NEW.name := NEW.tenant_name;
    ELSIF TG_OP = 'UPDATE' AND NEW.name <> OLD.name THEN NEW.tenant_name := NEW.name;
    ELSIF TG_OP = 'UPDATE' AND NEW.tenant_name <> OLD.tenant_name THEN NEW.name := NEW.tenant_name;
    END IF;
    IF NEW.created_date IS NULL THEN NEW.created_date := COALESCE(NEW.created_at, NOW()); END IF;
    IF NEW.created_at IS NULL THEN NEW.created_at := COALESCE(NEW.created_date, NOW()); END IF;
    NEW.modified_date := NOW();
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_tenant_aliases
BEFORE INSERT OR UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.sync_tenant_aliases();

-- Sync document audit dates for all other tables
CREATE OR REPLACE FUNCTION public.sync_document_audit_dates()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.created_date IS NULL THEN NEW.created_date := COALESCE(NEW.created_at, NOW()); END IF;
    IF NEW.created_at IS NULL THEN NEW.created_at := COALESCE(NEW.created_date, NOW()); END IF;
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
        'sites', 'users', 'user_sites', 'product_categories', 'units_of_measure', 'products',
        'storage_areas', 'locations', 'destinations', 'action_types', 'priority_levels',
        'production_lines', 'decision_configurations', 'inventory_balances', 'inventory_movements',
        'priorities', 'display_priorities', 'priority_events', 'exceptions', 'announcements',
        'planning_rules', 'promotions', 'promotion_product_rules', 'recommendation_runs',
        'recommendations', 'production_plan_imports', 'production_plan_entries',
        'production_events', 'northfleet_sto_imports', 'northfleet_sto_requirements',
        'site_settings', 'site_onboarding', 'sessions', 'tenant_deletion_jobs', 'platform_deletion_receipts'
    ])
    LOOP
        EXECUTE format('CREATE TRIGGER trg_sync_dates BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.sync_document_audit_dates();', tbl);
    END LOOP;
END $$;

-- ============================================================================
-- PART 5: SECURITY HELPER FUNCTIONS (IN ovms_internal)
-- ============================================================================

CREATE OR REPLACE FUNCTION ovms_internal.get_auth_user()
RETURNS public.users AS $$
DECLARE
    u public.users;
BEGIN
    SELECT * INTO u FROM public.users WHERE id = auth.uid() LIMIT 1;
    RETURN u;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' STABLE;

CREATE OR REPLACE FUNCTION ovms_internal.is_platform_superuser()
RETURNS BOOLEAN AS $$
DECLARE
    u public.users;
BEGIN
    u := ovms_internal.get_auth_user();
    RETURN u IS NOT NULL AND u.role = 'PLATFORM_SUPERUSER' AND (u.account_status = 'ACTIVE' OR u.account_status = 'active');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' STABLE;

CREATE OR REPLACE FUNCTION ovms_internal.has_tenant_access(target_tenant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    u public.users;
BEGIN
    u := ovms_internal.get_auth_user();
    IF u IS NULL THEN
        RETURN FALSE;
    END IF;
    IF u.role = 'PLATFORM_SUPERUSER' THEN
        RETURN TRUE;
    END IF;
    RETURN u.tenant_id = target_tenant_id AND (u.account_status = 'ACTIVE' OR u.account_status = 'active');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' STABLE;

CREATE OR REPLACE FUNCTION ovms_internal.is_tenant_admin(target_tenant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    u public.users;
BEGIN
    u := ovms_internal.get_auth_user();
    IF u IS NULL THEN
        RETURN FALSE;
    END IF;
    IF u.role = 'PLATFORM_SUPERUSER' THEN
        RETURN TRUE;
    END IF;
    RETURN u.tenant_id = target_tenant_id AND u.role = 'TENANT_ADMIN' AND (u.account_status = 'ACTIVE' OR u.account_status = 'active');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' STABLE;

CREATE OR REPLACE FUNCTION ovms_internal.has_site_access(target_tenant_id UUID, target_site_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    u public.users;
BEGIN
    u := ovms_internal.get_auth_user();
    IF u IS NULL THEN
        RETURN FALSE;
    END IF;
    IF u.role = 'PLATFORM_SUPERUSER' THEN
        RETURN TRUE;
    END IF;
    IF u.tenant_id != target_tenant_id OR (u.account_status != 'ACTIVE' AND u.account_status != 'active') THEN
        RETURN FALSE;
    END IF;
    IF u.role = 'TENANT_ADMIN' THEN
        RETURN TRUE;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.user_sites us 
        WHERE us.user_id = u.id AND us.site_id = target_site_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' STABLE;

-- Security Triggers: Prevent privilege escalation & ensure audit immutability
CREATE OR REPLACE FUNCTION ovms_internal.trg_users_prevent_escalation()
RETURNS TRIGGER AS $$
DECLARE
    caller public.users;
    current_jwt_uid UUID;
BEGIN
    -- If executed outside of client HTTP / PostgREST session (e.g. Supabase SQL Editor, DB migration, admin console)
    BEGIN
        current_jwt_uid := auth.uid();
    EXCEPTION WHEN OTHERS THEN
        current_jwt_uid := NULL;
    END;

    IF current_jwt_uid IS NULL THEN
        -- Direct DB administrator / migration session allowed
        RETURN NEW;
    END IF;

    caller := ovms_internal.get_auth_user();
    IF caller IS NULL OR caller.role != 'PLATFORM_SUPERUSER' THEN
        IF TG_OP = 'INSERT' THEN
            IF NEW.role = 'PLATFORM_SUPERUSER' THEN
                RAISE EXCEPTION 'Security Policy Violation: Only Platform Superusers can create Superuser accounts.';
            END IF;
            IF caller IS NOT NULL AND caller.role = 'TENANT_ADMIN' AND NEW.tenant_id != caller.tenant_id THEN
                RAISE EXCEPTION 'Security Policy Violation: Tenant Admins cannot provision users for other tenants.';
            END IF;
        ELSIF TG_OP = 'UPDATE' THEN
            IF OLD.role != NEW.role AND (NEW.role = 'PLATFORM_SUPERUSER' OR OLD.role = 'PLATFORM_SUPERUSER') THEN
                RAISE EXCEPTION 'Security Policy Violation: Superuser privileges cannot be assigned or removed by non-superusers.';
            END IF;
            IF OLD.tenant_id != NEW.tenant_id THEN
                RAISE EXCEPTION 'Security Policy Violation: Tenant assignments cannot be altered across tenant boundaries.';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER trg_users_prevent_escalation
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION ovms_internal.trg_users_prevent_escalation();

CREATE OR REPLACE FUNCTION ovms_internal.trg_audit_logs_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Security Policy Violation: audit_logs records are strictly immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION ovms_internal.trg_audit_logs_immutable();

-- Grant internal helper execution
GRANT EXECUTE ON FUNCTION ovms_internal.get_auth_user() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION ovms_internal.is_platform_superuser() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION ovms_internal.has_tenant_access(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION ovms_internal.is_tenant_admin(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION ovms_internal.has_site_access(UUID, UUID) TO authenticated, service_role;

-- ============================================================================
-- PART 6: PERMISSIONS & LEAST-PRIVILEGE GRANTS
-- ============================================================================

-- Immutable event logs (SELECT, INSERT only)
GRANT SELECT, INSERT ON public.audit_logs TO authenticated, service_role;
GRANT SELECT, INSERT ON public.priority_events TO authenticated, service_role;
GRANT SELECT, INSERT ON public.inventory_movements TO authenticated, service_role;
GRANT SELECT, INSERT ON public.production_events TO authenticated, service_role;
GRANT SELECT, INSERT ON public.platform_deletion_receipts TO authenticated, service_role;

-- Mutable operational tables (SELECT, INSERT, UPDATE, DELETE)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sites TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sites TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units_of_measure TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.destinations TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.storage_areas TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.action_types TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.priority_levels TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_lines TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.decision_configurations TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_balances TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.priorities TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.display_priorities TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exceptions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planning_rules TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotion_product_rules TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recommendation_runs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recommendations TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_plan_imports TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_plan_entries TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.northfleet_sto_imports TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.northfleet_sto_requirements TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_settings TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_onboarding TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_deletion_jobs TO authenticated, service_role;

-- ============================================================================
-- PART 7: ROW-LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS across all tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units_of_measure ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.priority_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.priorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.display_priorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.priority_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_product_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_plan_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_plan_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.northfleet_sto_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.northfleet_sto_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_deletion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_deletion_receipts ENABLE ROW LEVEL SECURITY;

-- Tenants Policies
CREATE POLICY "Tenants: Select" ON public.tenants FOR SELECT USING (ovms_internal.has_tenant_access(id));
CREATE POLICY "Tenants: Insert" ON public.tenants FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser());
CREATE POLICY "Tenants: Update" ON public.tenants FOR UPDATE USING (ovms_internal.is_platform_superuser());
CREATE POLICY "Tenants: Delete" ON public.tenants FOR DELETE USING (ovms_internal.is_platform_superuser());

-- Sites Policies
CREATE POLICY "Sites: Select" ON public.sites FOR SELECT USING (ovms_internal.has_site_access(tenant_id, id));
CREATE POLICY "Sites: Insert" ON public.sites FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "Sites: Update" ON public.sites FOR UPDATE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "Sites: Delete" ON public.sites FOR DELETE USING (ovms_internal.is_platform_superuser());

-- Users Policies
CREATE POLICY "Users: Select" ON public.users FOR SELECT USING (id = auth.uid() OR ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "Users: Insert" ON public.users FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser() OR (ovms_internal.is_tenant_admin(tenant_id) AND role NOT IN ('PLATFORM_SUPERUSER', 'TENANT_ADMIN')));
CREATE POLICY "Users: Update" ON public.users FOR UPDATE USING (id = auth.uid() OR ovms_internal.is_platform_superuser() OR (ovms_internal.is_tenant_admin(tenant_id) AND role NOT IN ('PLATFORM_SUPERUSER', 'TENANT_ADMIN')));
CREATE POLICY "Users: Delete" ON public.users FOR DELETE USING (ovms_internal.is_platform_superuser() OR (ovms_internal.is_tenant_admin(tenant_id) AND role NOT IN ('PLATFORM_SUPERUSER', 'TENANT_ADMIN') AND id != auth.uid()));

-- User Sites Policies
CREATE POLICY "UserSites: Select" ON public.user_sites FOR SELECT USING (user_id = auth.uid() OR ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin((SELECT u.tenant_id FROM public.users u WHERE u.id = public.user_sites.user_id LIMIT 1)));
CREATE POLICY "UserSites: Insert" ON public.user_sites FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin((SELECT u.tenant_id FROM public.users u WHERE u.id = public.user_sites.user_id LIMIT 1)));
CREATE POLICY "UserSites: Update" ON public.user_sites FOR UPDATE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin((SELECT u.tenant_id FROM public.users u WHERE u.id = public.user_sites.user_id LIMIT 1)));
CREATE POLICY "UserSites: Delete" ON public.user_sites FOR DELETE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin((SELECT u.tenant_id FROM public.users u WHERE u.id = public.user_sites.user_id LIMIT 1)));

-- Sessions Policies
CREATE POLICY "Sessions: Select" ON public.sessions FOR SELECT USING (user_id = auth.uid() OR ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "Sessions: Insert" ON public.sessions FOR INSERT WITH CHECK (user_id = auth.uid() OR ovms_internal.is_platform_superuser());
CREATE POLICY "Sessions: Update" ON public.sessions FOR UPDATE USING (user_id = auth.uid() OR ovms_internal.is_platform_superuser());
CREATE POLICY "Sessions: Delete" ON public.sessions FOR DELETE USING (user_id = auth.uid() OR ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));

-- Tenant-Level Master Data Policies (Product Categories, Units of Measure, Destinations, Action Types, Priority Levels)
CREATE POLICY "ProductCategories: Select" ON public.product_categories FOR SELECT USING (ovms_internal.has_tenant_access(tenant_id));
CREATE POLICY "ProductCategories: Insert" ON public.product_categories FOR INSERT WITH CHECK (ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "ProductCategories: Update" ON public.product_categories FOR UPDATE USING (ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "ProductCategories: Delete" ON public.product_categories FOR DELETE USING (ovms_internal.is_tenant_admin(tenant_id));

CREATE POLICY "UnitsOfMeasure: Select" ON public.units_of_measure FOR SELECT USING (ovms_internal.has_tenant_access(tenant_id));
CREATE POLICY "UnitsOfMeasure: Insert" ON public.units_of_measure FOR INSERT WITH CHECK (ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "UnitsOfMeasure: Update" ON public.units_of_measure FOR UPDATE USING (ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "UnitsOfMeasure: Delete" ON public.units_of_measure FOR DELETE USING (ovms_internal.is_tenant_admin(tenant_id));

CREATE POLICY "Destinations: Select" ON public.destinations FOR SELECT USING (ovms_internal.has_tenant_access(tenant_id));
CREATE POLICY "Destinations: Insert" ON public.destinations FOR INSERT WITH CHECK (ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "Destinations: Update" ON public.destinations FOR UPDATE USING (ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "Destinations: Delete" ON public.destinations FOR DELETE USING (ovms_internal.is_tenant_admin(tenant_id));

CREATE POLICY "ActionTypes: Select" ON public.action_types FOR SELECT USING (ovms_internal.has_tenant_access(tenant_id));
CREATE POLICY "ActionTypes: Insert" ON public.action_types FOR INSERT WITH CHECK (ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "ActionTypes: Update" ON public.action_types FOR UPDATE USING (ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "ActionTypes: Delete" ON public.action_types FOR DELETE USING (ovms_internal.is_tenant_admin(tenant_id));

CREATE POLICY "PriorityLevels: Select" ON public.priority_levels FOR SELECT USING (ovms_internal.has_tenant_access(tenant_id));
CREATE POLICY "PriorityLevels: Insert" ON public.priority_levels FOR INSERT WITH CHECK (ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "PriorityLevels: Update" ON public.priority_levels FOR UPDATE USING (ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "PriorityLevels: Delete" ON public.priority_levels FOR DELETE USING (ovms_internal.is_tenant_admin(tenant_id));

-- Site-Scoped Operational Tables Policies
CREATE POLICY "Products: Select" ON public.products FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "Products: Insert" ON public.products FOR INSERT WITH CHECK (ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "Products: Update" ON public.products FOR UPDATE USING (ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "Products: Delete" ON public.products FOR DELETE USING (ovms_internal.is_tenant_admin(tenant_id));

CREATE POLICY "StorageAreas: Select" ON public.storage_areas FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "StorageAreas: Insert" ON public.storage_areas FOR INSERT WITH CHECK (ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "StorageAreas: Update" ON public.storage_areas FOR UPDATE USING (ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "StorageAreas: Delete" ON public.storage_areas FOR DELETE USING (ovms_internal.is_tenant_admin(tenant_id));

CREATE POLICY "Locations: Select" ON public.locations FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "Locations: Insert" ON public.locations FOR INSERT WITH CHECK (ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "Locations: Update" ON public.locations FOR UPDATE USING (ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "Locations: Delete" ON public.locations FOR DELETE USING (ovms_internal.is_tenant_admin(tenant_id));

CREATE POLICY "ProductionLines: Select" ON public.production_lines FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "ProductionLines: Insert" ON public.production_lines FOR INSERT WITH CHECK (ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "ProductionLines: Update" ON public.production_lines FOR UPDATE USING (ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "ProductionLines: Delete" ON public.production_lines FOR DELETE USING (ovms_internal.is_tenant_admin(tenant_id));

CREATE POLICY "DecisionConfigs: Select" ON public.decision_configurations FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "DecisionConfigs: Insert" ON public.decision_configurations FOR INSERT WITH CHECK (ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "DecisionConfigs: Update" ON public.decision_configurations FOR UPDATE USING (ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "DecisionConfigs: Delete" ON public.decision_configurations FOR DELETE USING (ovms_internal.is_tenant_admin(tenant_id));

CREATE POLICY "InventoryBalances: Select" ON public.inventory_balances FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "InventoryBalances: Insert" ON public.inventory_balances FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "InventoryBalances: Update" ON public.inventory_balances FOR UPDATE USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "InventoryBalances: Delete" ON public.inventory_balances FOR DELETE USING (ovms_internal.has_site_access(tenant_id, site_id));

CREATE POLICY "InventoryMovements: Select" ON public.inventory_movements FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "InventoryMovements: Insert" ON public.inventory_movements FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id));

CREATE POLICY "Priorities: Select" ON public.priorities FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "Priorities: Insert" ON public.priorities FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "Priorities: Update" ON public.priorities FOR UPDATE USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "Priorities: Delete" ON public.priorities FOR DELETE USING (ovms_internal.has_site_access(tenant_id, site_id));

CREATE POLICY "DisplayPriorities: Select" ON public.display_priorities FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "DisplayPriorities: Insert" ON public.display_priorities FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "DisplayPriorities: Update" ON public.display_priorities FOR UPDATE USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "DisplayPriorities: Delete" ON public.display_priorities FOR DELETE USING (ovms_internal.has_site_access(tenant_id, site_id));

CREATE POLICY "PriorityEvents: Select" ON public.priority_events FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "PriorityEvents: Insert" ON public.priority_events FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id));

CREATE POLICY "Exceptions: Select" ON public.exceptions FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "Exceptions: Insert" ON public.exceptions FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "Exceptions: Update" ON public.exceptions FOR UPDATE USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "Exceptions: Delete" ON public.exceptions FOR DELETE USING (ovms_internal.has_site_access(tenant_id, site_id));

CREATE POLICY "Announcements: Select" ON public.announcements FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "Announcements: Insert" ON public.announcements FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "Announcements: Update" ON public.announcements FOR UPDATE USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "Announcements: Delete" ON public.announcements FOR DELETE USING (ovms_internal.has_site_access(tenant_id, site_id));

CREATE POLICY "PlanningRules: Select" ON public.planning_rules FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "PlanningRules: Insert" ON public.planning_rules FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "PlanningRules: Update" ON public.planning_rules FOR UPDATE USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "PlanningRules: Delete" ON public.planning_rules FOR DELETE USING (ovms_internal.has_site_access(tenant_id, site_id));

CREATE POLICY "Promotions: Select" ON public.promotions FOR SELECT USING (ovms_internal.has_tenant_access(tenant_id));
CREATE POLICY "Promotions: Insert" ON public.promotions FOR INSERT WITH CHECK (ovms_internal.has_tenant_access(tenant_id));
CREATE POLICY "Promotions: Update" ON public.promotions FOR UPDATE USING (ovms_internal.has_tenant_access(tenant_id));
CREATE POLICY "Promotions: Delete" ON public.promotions FOR DELETE USING (ovms_internal.has_tenant_access(tenant_id));

CREATE POLICY "PromotionProductRules: Select" ON public.promotion_product_rules FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "PromotionProductRules: Insert" ON public.promotion_product_rules FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "PromotionProductRules: Update" ON public.promotion_product_rules FOR UPDATE USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "PromotionProductRules: Delete" ON public.promotion_product_rules FOR DELETE USING (ovms_internal.has_site_access(tenant_id, site_id));

CREATE POLICY "RecommendationRuns: Select" ON public.recommendation_runs FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "RecommendationRuns: Insert" ON public.recommendation_runs FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "RecommendationRuns: Update" ON public.recommendation_runs FOR UPDATE USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "RecommendationRuns: Delete" ON public.recommendation_runs FOR DELETE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));

CREATE POLICY "Recommendations: Select" ON public.recommendations FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "Recommendations: Insert" ON public.recommendations FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "Recommendations: Update" ON public.recommendations FOR UPDATE USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "Recommendations: Delete" ON public.recommendations FOR DELETE USING (ovms_internal.has_site_access(tenant_id, site_id));

CREATE POLICY "ProductionPlanImports: Select" ON public.production_plan_imports FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "ProductionPlanImports: Insert" ON public.production_plan_imports FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "ProductionPlanImports: Update" ON public.production_plan_imports FOR UPDATE USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "ProductionPlanImports: Delete" ON public.production_plan_imports FOR DELETE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));

CREATE POLICY "ProductionPlanEntries: Select" ON public.production_plan_entries FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "ProductionPlanEntries: Insert" ON public.production_plan_entries FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "ProductionPlanEntries: Update" ON public.production_plan_entries FOR UPDATE USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "ProductionPlanEntries: Delete" ON public.production_plan_entries FOR DELETE USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));

CREATE POLICY "ProductionEvents: Select" ON public.production_events FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "ProductionEvents: Insert" ON public.production_events FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id));

CREATE POLICY "NorthfleetStoImports: Select" ON public.northfleet_sto_imports FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "NorthfleetStoImports: Insert" ON public.northfleet_sto_imports FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "NorthfleetStoImports: Update" ON public.northfleet_sto_imports FOR UPDATE USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "NorthfleetStoImports: Delete" ON public.northfleet_sto_imports FOR DELETE USING (ovms_internal.is_tenant_admin(tenant_id));

CREATE POLICY "NorthfleetStoReq: Select" ON public.northfleet_sto_requirements FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "NorthfleetStoReq: Insert" ON public.northfleet_sto_requirements FOR INSERT WITH CHECK (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "NorthfleetStoReq: Update" ON public.northfleet_sto_requirements FOR UPDATE USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "NorthfleetStoReq: Delete" ON public.northfleet_sto_requirements FOR DELETE USING (ovms_internal.is_tenant_admin(tenant_id));

CREATE POLICY "SiteSettings: Select" ON public.site_settings FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "SiteSettings: Insert" ON public.site_settings FOR INSERT WITH CHECK (ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "SiteSettings: Update" ON public.site_settings FOR UPDATE USING (ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "SiteSettings: Delete" ON public.site_settings FOR DELETE USING (ovms_internal.is_tenant_admin(tenant_id));

CREATE POLICY "SiteOnboarding: Select" ON public.site_onboarding FOR SELECT USING (ovms_internal.has_site_access(tenant_id, site_id));
CREATE POLICY "SiteOnboarding: Insert" ON public.site_onboarding FOR INSERT WITH CHECK (ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "SiteOnboarding: Update" ON public.site_onboarding FOR UPDATE USING (ovms_internal.is_tenant_admin(tenant_id));
CREATE POLICY "SiteOnboarding: Delete" ON public.site_onboarding FOR DELETE USING (ovms_internal.is_tenant_admin(tenant_id));

CREATE POLICY "AuditLogs: Select" ON public.audit_logs FOR SELECT USING (ovms_internal.is_platform_superuser() OR (tenant_id IS NOT NULL AND ovms_internal.is_tenant_admin(tenant_id)));
CREATE POLICY "AuditLogs: Insert" ON public.audit_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "TenantDeletionJobs: Select" ON public.tenant_deletion_jobs FOR SELECT USING (ovms_internal.is_platform_superuser());
CREATE POLICY "TenantDeletionJobs: Insert" ON public.tenant_deletion_jobs FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser());
CREATE POLICY "TenantDeletionJobs: Update" ON public.tenant_deletion_jobs FOR UPDATE USING (ovms_internal.is_platform_superuser());
CREATE POLICY "TenantDeletionJobs: Delete" ON public.tenant_deletion_jobs FOR DELETE USING (ovms_internal.is_platform_superuser());

CREATE POLICY "PlatformReceipts: Select" ON public.platform_deletion_receipts FOR SELECT USING (ovms_internal.is_platform_superuser());
CREATE POLICY "PlatformReceipts: Insert" ON public.platform_deletion_receipts FOR INSERT WITH CHECK (ovms_internal.is_platform_superuser());

-- ============================================================================
-- PART 8: SUPERUSER AUTO-PROVISIONING GUARANTEE
-- ============================================================================

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

-- ============================================================================
-- PART 9: POSTGREST SCHEMA CACHE RELOAD
-- ============================================================================

NOTIFY pgrst, 'reload schema';

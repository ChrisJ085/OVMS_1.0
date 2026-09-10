-- ============================================================================
-- OVMS (Operational Visibility & Monitoring System)
-- Reconciled Canonical Supabase Database Schema
-- Compatible with OVMS React/TypeScript Application Architecture
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. CORE TENANCY & SYSTEM ARCHITECTURE
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenants (
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

CREATE TABLE IF NOT EXISTS public.sites (
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

CREATE TABLE IF NOT EXISTS public.users (
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

CREATE TABLE IF NOT EXISTS public.user_sites (
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, site_id)
);

CREATE TABLE IF NOT EXISTS public.sessions (
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

-- ----------------------------------------------------------------------------
-- 2. CONFIGURATION & MASTER DATA
-- ----------------------------------------------------------------------------

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

CREATE TABLE IF NOT EXISTS public.destinations (
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

CREATE TABLE IF NOT EXISTS public.products (
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

CREATE TABLE IF NOT EXISTS public.locations (
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

CREATE TABLE IF NOT EXISTS public.action_types (
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

CREATE TABLE IF NOT EXISTS public.priority_levels (
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

CREATE TABLE IF NOT EXISTS public.production_lines (
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

-- ----------------------------------------------------------------------------
-- 3. INVENTORY & BALANCES
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inventory_balances (
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

CREATE TABLE IF NOT EXISTS public.inventory_movements (
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

-- ----------------------------------------------------------------------------
-- 4. OPERATIONAL PRIORITIES & EXCEPTIONS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.priorities (
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
    status TEXT DEFAULT 'OPEN',
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

CREATE TABLE IF NOT EXISTS public.display_priorities (
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

CREATE TABLE IF NOT EXISTS public.exceptions (
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

CREATE TABLE IF NOT EXISTS public.announcements (
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

-- ----------------------------------------------------------------------------
-- 5. PLANNING, PROMOTIONS & RECOMMENDATIONS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.planning_rules (
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

CREATE TABLE IF NOT EXISTS public.promotions (
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

CREATE TABLE IF NOT EXISTS public.recommendations (
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

-- ----------------------------------------------------------------------------
-- 6. PRODUCTION PLAN IMPORTS, ENTRIES & EVENTS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.production_plan_imports (
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

CREATE TABLE IF NOT EXISTS public.production_plan_entries (
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

CREATE TABLE IF NOT EXISTS public.production_events (
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

-- ----------------------------------------------------------------------------
-- 7. NORTHFLEET STO REQUIREMENTS & IMPORTS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.northfleet_sto_imports (
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

CREATE TABLE IF NOT EXISTS public.northfleet_sto_requirements (
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

-- ----------------------------------------------------------------------------
-- 8. SITE SETTINGS & ONBOARDING
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.site_settings (
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

CREATE TABLE IF NOT EXISTS public.site_onboarding (
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

-- ----------------------------------------------------------------------------
-- 9. AUDIT LOGS & TENANT DELETION
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audit_logs (
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
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tenant_deletion_jobs (
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

CREATE TABLE IF NOT EXISTS public.platform_deletion_receipts (
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

-- ----------------------------------------------------------------------------
-- 10. VIEWS & ALIASES
-- ----------------------------------------------------------------------------

-- Safely convert old site_recommendation_runs table to a view if it exists as a table
DO 979
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'site_recommendation_runs' AND c.relkind = 'r'
    ) THEN
        DROP TABLE public.site_recommendation_runs CASCADE;
    END IF;
END 979;

DROP VIEW IF EXISTS public.site_recommendation_runs CASCADE;
CREATE OR REPLACE VIEW public.site_recommendation_runs AS 
SELECT * FROM public.recommendation_runs;

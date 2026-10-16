-- ============================================================================
-- OVMS Migration: SAP SNP87 Planning Data Model & RLS Security
-- Compatible with Stages 1-3 of the SNP87 Migration Architecture
-- ============================================================================
-- This script provisions the new SNP87 Planning data architecture for Supabase.
-- It can be safely applied to an existing OVMS database without disrupting
-- existing MPPS7 production plan tables, inventory, recommendations, or priorities.
-- ============================================================================

-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. TABLE: public.snp87_imports
-- ----------------------------------------------------------------------------
-- Captures weekly SNP87 Excel report imports, audit metadata, validation
-- summary counts, planning horizons, and committed snapshot status.

CREATE TABLE IF NOT EXISTS public.snp87_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    source_report_name TEXT NOT NULL,
    source_report_type TEXT NOT NULL DEFAULT 'SNP87',
    file_hash TEXT,
    imported_by TEXT NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    import_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (import_status IN (
        'DRAFT', 'VALIDATED', 'REQUIRES_REVIEW', 'READY_TO_COMMIT', 'COMMITTED', 'FAILED', 'SUPERSEDED'
    )),
    source_row_count INTEGER DEFAULT 0,
    recognised_row_count INTEGER DEFAULT 0,
    ignored_row_count INTEGER DEFAULT 0,
    forecast_row_count INTEGER DEFAULT 0,
    confirmed_production_row_count INTEGER DEFAULT 0,
    total_forecast_quantity NUMERIC DEFAULT 0,
    total_confirmed_production_quantity NUMERIC DEFAULT 0,
    warning_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    unknown_product_count INTEGER DEFAULT 0,
    import_period JSONB DEFAULT NULL,
    diagnostics JSONB DEFAULT '{}'::jsonb,
    version INTEGER DEFAULT 1,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. TABLE: public.snp87_planning_rows
-- ----------------------------------------------------------------------------
-- Stores parsed, validated, and classified SNP87 planning rows.
-- Represents dynamic FORECAST requirements and CONFIRMED_PRODUCTION supply.
-- Does NOT require production line / resource ID master data.

CREATE TABLE IF NOT EXISTS public.snp87_planning_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_id UUID NOT NULL REFERENCES public.snp87_imports(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    row_index INTEGER NOT NULL,
    order_sku TEXT,
    product_number TEXT NOT NULL,
    product_description TEXT,
    location TEXT,
    sort TEXT,
    info_object TEXT,
    row_text TEXT,
    planning_type TEXT NOT NULL CHECK (planning_type IN ('FORECAST', 'CONFIRMED_PRODUCTION', 'IGNORED')),
    start_date_raw TEXT,
    end_date_raw TEXT,
    planning_date DATE NOT NULL,
    start_date DATE,
    end_date DATE,
    quantity NUMERIC NOT NULL DEFAULT 0,
    forecast_quantity NUMERIC,
    confirmed_production_quantity NUMERIC,
    base_unit_of_measure TEXT NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_code_snapshot TEXT,
    description_snapshot TEXT,
    product_matched BOOLEAN DEFAULT FALSE,
    validation_status TEXT NOT NULL DEFAULT 'VALID' CHECK (validation_status IN ('VALID', 'WARNING', 'ERROR', 'IGNORED')),
    validation_errors JSONB DEFAULT '[]'::jsonb,
    validation_warnings JSONB DEFAULT '[]'::jsonb,
    ignored_reason TEXT,
    is_duplicate BOOLEAN DEFAULT FALSE,
    raw_source_row JSONB DEFAULT '{}'::jsonb,
    created_by TEXT,
    created_date TIMESTAMPTZ DEFAULT NOW(),
    modified_by TEXT,
    modified_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. PERFORMANCE INDEXES
-- ----------------------------------------------------------------------------

-- Indexes for snp87_imports
CREATE INDEX IF NOT EXISTS idx_snp87_imports_tenant_site ON public.snp87_imports(tenant_id, site_id);
CREATE INDEX IF NOT EXISTS idx_snp87_imports_status ON public.snp87_imports(tenant_id, site_id, import_status);
CREATE INDEX IF NOT EXISTS idx_snp87_imports_imported_at ON public.snp87_imports(imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_snp87_imports_file_hash ON public.snp87_imports(file_hash);

-- Indexes for snp87_planning_rows
CREATE INDEX IF NOT EXISTS idx_snp87_planning_rows_import_id ON public.snp87_planning_rows(import_id);
CREATE INDEX IF NOT EXISTS idx_snp87_planning_rows_tenant_site ON public.snp87_planning_rows(tenant_id, site_id);
CREATE INDEX IF NOT EXISTS idx_snp87_planning_rows_planning_date ON public.snp87_planning_rows(planning_date);
CREATE INDEX IF NOT EXISTS idx_snp87_planning_rows_product_id ON public.snp87_planning_rows(product_id);
CREATE INDEX IF NOT EXISTS idx_snp87_planning_rows_product_number ON public.snp87_planning_rows(product_number);
CREATE INDEX IF NOT EXISTS idx_snp87_planning_rows_planning_type ON public.snp87_planning_rows(planning_type);
CREATE INDEX IF NOT EXISTS idx_snp87_planning_rows_active_eval ON public.snp87_planning_rows(import_id, product_id, planning_type, planning_date);

-- ----------------------------------------------------------------------------
-- 4. PERMISSIONS & LEAST-PRIVILEGE GRANTS
-- ----------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.snp87_imports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.snp87_planning_rows TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

ALTER TABLE public.snp87_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snp87_planning_rows ENABLE ROW LEVEL SECURITY;

-- Clean up existing policies if re-running migration
DROP POLICY IF EXISTS "Snp87Imports: Select" ON public.snp87_imports;
DROP POLICY IF EXISTS "Snp87Imports: Insert" ON public.snp87_imports;
DROP POLICY IF EXISTS "Snp87Imports: Update" ON public.snp87_imports;
DROP POLICY IF EXISTS "Snp87Imports: Delete" ON public.snp87_imports;

DROP POLICY IF EXISTS "Snp87PlanningRows: Select" ON public.snp87_planning_rows;
DROP POLICY IF EXISTS "Snp87PlanningRows: Insert" ON public.snp87_planning_rows;
DROP POLICY IF EXISTS "Snp87PlanningRows: Update" ON public.snp87_planning_rows;
DROP POLICY IF EXISTS "Snp87PlanningRows: Delete" ON public.snp87_planning_rows;

-- RLS: snp87_imports
CREATE POLICY "Snp87Imports: Select" ON public.snp87_imports
    FOR SELECT TO authenticated
    USING (ovms_internal.has_site_access(tenant_id, site_id));

CREATE POLICY "Snp87Imports: Insert" ON public.snp87_imports
    FOR INSERT TO authenticated
    WITH CHECK (
        ovms_internal.has_site_access(tenant_id, site_id)
        AND (ovms_internal.get_auth_user()).role IN ('PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER')
    );

CREATE POLICY "Snp87Imports: Update" ON public.snp87_imports
    FOR UPDATE TO authenticated
    USING (
        ovms_internal.has_site_access(tenant_id, site_id)
        AND (ovms_internal.get_auth_user()).role IN ('PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER')
    );

CREATE POLICY "Snp87Imports: Delete" ON public.snp87_imports
    FOR DELETE TO authenticated
    USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));

-- RLS: snp87_planning_rows
CREATE POLICY "Snp87PlanningRows: Select" ON public.snp87_planning_rows
    FOR SELECT TO authenticated
    USING (ovms_internal.has_site_access(tenant_id, site_id));

CREATE POLICY "Snp87PlanningRows: Insert" ON public.snp87_planning_rows
    FOR INSERT TO authenticated
    WITH CHECK (
        ovms_internal.has_site_access(tenant_id, site_id)
        AND (ovms_internal.get_auth_user()).role IN ('PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER')
    );

CREATE POLICY "Snp87PlanningRows: Update" ON public.snp87_planning_rows
    FOR UPDATE TO authenticated
    USING (
        ovms_internal.has_site_access(tenant_id, site_id)
        AND (ovms_internal.get_auth_user()).role IN ('PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER')
    );

CREATE POLICY "Snp87PlanningRows: Delete" ON public.snp87_planning_rows
    FOR DELETE TO authenticated
    USING (ovms_internal.is_platform_superuser() OR ovms_internal.is_tenant_admin(tenant_id));

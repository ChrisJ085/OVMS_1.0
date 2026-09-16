-- ==============================================================================
-- FIX SCHEMA: Add missing priority_events table and synchronize tenants columns
-- ==============================================================================

-- 1. Create missing table: public.priority_events
CREATE TABLE IF NOT EXISTS public.priority_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    priority_id UUID NOT NULL REFERENCES public.priorities(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    description TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Synchronize columns in public.tenants
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS tenant_code TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS modified_by TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();

-- 3. Synchronize decision_configurations columns
ALTER TABLE public.decision_configurations ADD COLUMN IF NOT EXISTS inventory_staleness_hours_threshold INTEGER DEFAULT 24;
ALTER TABLE public.decision_configurations ADD COLUMN IF NOT EXISTS production_staleness_hours_threshold INTEGER DEFAULT 24;
ALTER TABLE public.decision_configurations ADD COLUMN IF NOT EXISTS near_production_days_window INTEGER DEFAULT 7;
ALTER TABLE public.decision_configurations ADD COLUMN IF NOT EXISTS capacity_warning_threshold_percentage NUMERIC DEFAULT 100;
ALTER TABLE public.decision_configurations ADD COLUMN IF NOT EXISTS as_per_schedule_action_id UUID REFERENCES public.action_types(id) ON DELETE SET NULL;
ALTER TABLE public.decision_configurations ADD COLUMN IF NOT EXISTS configuration_version TEXT;

-- 4. Force API schema reload to recognize new columns/tables
NOTIFY pgrst, 'reload schema';

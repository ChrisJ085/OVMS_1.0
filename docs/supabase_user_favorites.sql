-- ==============================================================================
-- OVMS Migration: User Favorites & Starring Functionality
-- Table: public.user_favorites
-- Date: 2026-09-14
-- ==============================================================================

-- 1. Create the user_favorites table
CREATE TABLE IF NOT EXISTS public.user_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    title TEXT NOT NULL,
    icon_name TEXT,
    group_title TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_favorite_tenant_user_path UNIQUE(tenant_id, user_id, path)
);

-- 2. Create Performance Indexes
CREATE INDEX IF NOT EXISTS idx_user_favorites_lookup 
    ON public.user_favorites(tenant_id, user_id, order_index ASC);

CREATE INDEX IF NOT EXISTS idx_user_favorites_path 
    ON public.user_favorites(path);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

-- 4. Clean up any existing policies
DROP POLICY IF EXISTS "user_favorites_select" ON public.user_favorites;
DROP POLICY IF EXISTS "user_favorites_insert" ON public.user_favorites;
DROP POLICY IF EXISTS "user_favorites_update" ON public.user_favorites;
DROP POLICY IF EXISTS "user_favorites_delete" ON public.user_favorites;

-- 5. Define Secure RLS Policies using OVMS tenant security
CREATE POLICY "user_favorites_select" ON public.user_favorites
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid() 
        AND ovms_internal.has_tenant_access(tenant_id)
    );

CREATE POLICY "user_favorites_insert" ON public.user_favorites
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid() 
        AND ovms_internal.has_tenant_access(tenant_id)
    );

CREATE POLICY "user_favorites_update" ON public.user_favorites
    FOR UPDATE TO authenticated
    USING (
        user_id = auth.uid() 
        AND ovms_internal.has_tenant_access(tenant_id)
    )
    WITH CHECK (
        user_id = auth.uid() 
        AND ovms_internal.has_tenant_access(tenant_id)
    );

CREATE POLICY "user_favorites_delete" ON public.user_favorites
    FOR DELETE TO authenticated
    USING (
        user_id = auth.uid() 
        AND ovms_internal.has_tenant_access(tenant_id)
    );

-- 6. Trigger for updated_at maintenance
CREATE OR REPLACE FUNCTION public.handle_user_favorites_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_favorites_updated_at ON public.user_favorites;
CREATE TRIGGER trg_user_favorites_updated_at
    BEFORE UPDATE ON public.user_favorites
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_user_favorites_updated_at();

-- 7. Permissions
GRANT ALL ON TABLE public.user_favorites TO authenticated;
GRANT ALL ON TABLE public.user_favorites TO service_role;

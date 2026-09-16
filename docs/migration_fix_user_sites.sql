-- ============================================================================
-- MIGRATION: Fix user_sites table schema & site_recommendation_runs view
-- ============================================================================

-- 1. Ensure user_sites table has all required audit timestamp columns
-- This prevents the trg_sync_dates trigger from failing with: "record 'new' has no field 'modified_date'"
ALTER TABLE public.user_sites ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.user_sites ADD COLUMN IF NOT EXISTS modified_date TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.user_sites ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.user_sites ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Drop the redundant audit trigger on user_sites (if desired) or let it use the columns
DROP TRIGGER IF EXISTS trg_sync_dates ON public.user_sites;

-- 3. Fix site_recommendation_runs view security invoker (resolves view RLS error)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'site_recommendation_runs') THEN
    ALTER VIEW public.site_recommendation_runs SET (security_invoker = true);
  END IF;
END $$;

-- 4. Populate user_sites for any existing users who currently have 0 assigned sites
INSERT INTO public.user_sites (user_id, site_id)
SELECT u.id, s.id
FROM public.users u
JOIN public.sites s ON s.tenant_id = u.tenant_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_sites us WHERE us.user_id = u.id
)
ON CONFLICT (user_id, site_id) DO NOTHING;

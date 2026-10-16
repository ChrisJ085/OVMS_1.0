-- ============================================================================
-- OVMS Migration: SNP87 Table Name Compatibility View & Aliases
-- ============================================================================
-- If your Supabase database has public.snp87_planning_imports (canonical),
-- this optional view allows any legacy or external scripts referencing
-- public.snp87_imports to resolve seamlessly without schema duplication.
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'snp87_planning_imports'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'snp87_imports'
    ) THEN
        CREATE OR REPLACE VIEW public.snp87_imports AS
        SELECT * FROM public.snp87_planning_imports;
    END IF;
END $$;

-- ============================================================================
-- MIGRATION: Fix Audit Logs Immutability Conflict with User & Tenant Deletion
-- ============================================================================

-- 1. Drop foreign key constraints on public.audit_logs
-- In enterprise audit logging, audit records must remain intact as immutable historical
-- forensic data and should NOT attempt to cascade-delete or set-null on user/tenant/site deletion.
-- Dropping these foreign key constraints prevents Postgres from firing UPDATE/DELETE on audit_logs
-- when a user, site, or tenant is deleted.

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_schema = 'public' 
          AND table_name = 'audit_logs' 
          AND constraint_type = 'FOREIGN KEY'
    )
    LOOP
        EXECUTE 'ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name) || ';';
    END LOOP;
END $$;

-- 2. Update the Audit Logs Immutable Trigger Function
-- Ensures audit logs are protected against standard user/client modifications, while
-- allowing administrative cleanup during tenant purges or system maintenance.
CREATE OR REPLACE FUNCTION ovms_internal.trg_audit_logs_immutable()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow bypass if explicitly flagged for maintenance/tenant purge
    IF current_setting('ovms.allow_audit_log_cleanup', true) = 'on' THEN
        RETURN OLD;
    END IF;
    
    -- Disallow updates to existing audit entries
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Security Policy Violation: audit_logs records are strictly immutable and cannot be updated.';
    ELSIF TG_OP = 'DELETE' THEN
        -- If session is running as service_role / superuser purge, allow
        IF current_user = 'service_role' OR current_user = 'postgres' OR current_user = 'supabase_admin' THEN
            RETURN OLD;
        END IF;
        RAISE EXCEPTION 'Security Policy Violation: audit_logs records are strictly immutable and cannot be deleted directly without system clearance.';
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 3. Ensure trigger is attached properly
DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
DROP TRIGGER IF EXISTS audit_logs_immutable_update_trg ON public.audit_logs;
DROP TRIGGER IF EXISTS audit_logs_immutable_delete_trg ON public.audit_logs;

CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION ovms_internal.trg_audit_logs_immutable();

-- 4. Clean up any stuck tenant deletion jobs or pending states
UPDATE public.tenants 
SET status = 'active' 
WHERE status = 'DELETION_PENDING';

-- 5. Make tenant_id nullable on site_onboarding so platform superusers / global context do not violate FK constraints
ALTER TABLE IF EXISTS public.site_onboarding ALTER COLUMN tenant_id DROP NOT NULL;

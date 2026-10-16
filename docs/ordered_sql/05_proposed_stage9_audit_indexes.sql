-- ============================================================================
-- OVMS Migration: Stage 9 - Recommendation Audit & Generation Tracking Indexes
-- ============================================================================
-- Note: Do NOT execute directly on Supabase without explicit approval.
-- Existing structures (public.recommendations.source_snapshot JSONB,
-- public.recommendations.source_fingerprint TEXT, and public.audit_logs.details JSONB)
-- natively store the extended Stage 9 SNP87 audit snapshots without requiring
-- table alterations.
--
-- The proposed DDL below provides optional performance indices for querying
-- generation runs and tracing recommendations back to SNP87 source imports.
-- ============================================================================

-- 1. Index on source_fingerprint in recommendations table (if not exists)
CREATE INDEX IF NOT EXISTS idx_recommendations_source_fingerprint 
ON public.recommendations(source_fingerprint);

-- 2. Index on superseded_by_recommendation_id for regeneration audit trail navigation
CREATE INDEX IF NOT EXISTS idx_recommendations_superseded_by 
ON public.recommendations(superseded_by_recommendation_id);

-- 3. Expression index on generation_id extracted from source_snapshot JSONB
CREATE INDEX IF NOT EXISTS idx_recommendations_generation_id 
ON public.recommendations USING btree ((source_snapshot->>'generationId'));

-- 4. Expression index on SNP87 import ID extracted from source_snapshot JSONB
CREATE INDEX IF NOT EXISTS idx_recommendations_snp87_import_id 
ON public.recommendations USING btree ((source_snapshot->'planningContext'->>'sourceImportId'));

-- 5. GIN index on audit_logs details for JSON path querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_details_gin 
ON public.audit_logs USING gin (details);

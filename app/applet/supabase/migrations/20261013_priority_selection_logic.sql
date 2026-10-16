-- Migration: Add System Selection Logic & Sizing Breakdown columns to Priorities
-- Supports human-readable explanation blurbs and structured calculations

ALTER TABLE public.priorities
  ADD COLUMN IF NOT EXISTS selection_logic_summary TEXT,
  ADD COLUMN IF NOT EXISTS sizing_rationale_breakdown JSONB;

ALTER TABLE public.display_priorities
  ADD COLUMN IF NOT EXISTS selection_logic_summary TEXT;

-- Index for efficient querying by recommendation and selection source
CREATE INDEX IF NOT EXISTS idx_priorities_selection_logic ON public.priorities(tenant_id, site_id, source_type);

-- Migration 07: Add STO Product Substitution & Deferred Backlog Tracking
-- Adds columns to northfleet_sto_requirements table for substitution and original demand tracking

ALTER TABLE northfleet_sto_requirements
  ADD COLUMN IF NOT EXISTS original_product_id TEXT,
  ADD COLUMN IF NOT EXISTS original_product_code TEXT,
  ADD COLUMN IF NOT EXISTS original_product_description_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS substituted_product_id TEXT,
  ADD COLUMN IF NOT EXISTS substituted_product_code TEXT,
  ADD COLUMN IF NOT EXISTS substitution_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_backlog_retained BOOLEAN DEFAULT TRUE;

-- Add indexes for efficient backlog and substitution queries
CREATE INDEX IF NOT EXISTS idx_sto_substitution ON northfleet_sto_requirements(tenant_id, site_id, substituted_product_id);
CREATE INDEX IF NOT EXISTS idx_sto_backlog ON northfleet_sto_requirements(tenant_id, site_id, original_product_id, is_backlog_retained);

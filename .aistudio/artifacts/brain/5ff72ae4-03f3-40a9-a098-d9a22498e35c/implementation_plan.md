# Implementation Plan - STO Product Substitution & Deferred Backlog Tracking

This plan outlines the implementation of **Product Substitution on Northfleet STOs**, enabling warehouse planners to substitute an unavailable product with an alternative while retaining the original product's demand as a deferred backlog requirement for future fulfillment. It also includes the required Supabase schema updates to ensure full database and frontend alignment.

---

## 1. Supabase Database Schema & Migration SQL

To support product substitution and backlog tracking, we will update the `northfleet_sto_requirements` table in Supabase (and ensure fallback support in local storage overlay).

### Migration SQL (`supabase/migrations/20261013_sto_product_substitution.sql`)
```sql
-- Add substitution and backlog tracking columns to northfleet_sto_requirements
ALTER TABLE northfleet_sto_requirements
  ADD COLUMN IF NOT EXISTS original_product_id TEXT,
  ADD COLUMN IF NOT EXISTS original_product_code TEXT,
  ADD COLUMN IF NOT EXISTS substituted_product_id TEXT,
  ADD COLUMN IF NOT EXISTS substituted_product_code TEXT,
  ADD COLUMN IF NOT EXISTS substitution_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_backlog_retained BOOLEAN DEFAULT TRUE;

-- Add index for efficient backlog and substitution queries
CREATE INDEX IF NOT EXISTS idx_sto_substitution ON northfleet_sto_requirements(tenant_id, site_id, substituted_product_id);
CREATE INDEX IF NOT EXISTS idx_sto_backlog ON northfleet_sto_requirements(tenant_id, site_id, original_product_id, is_backlog_retained);
```

---

## 2. Backend Service Layer (`src/features/planning/services/northfleetStoService.ts`)

### New Types & Interfaces
```ts
export interface StoProductSubstitutionRequest {
  stoId: string;
  newProductId: string;
  newProductCode: string;
  newProductDescription?: string;
  retainOriginalBacklog: boolean;
  userId: string;
}
```

### Service Functions to Add / Update
1. **`substituteStoProduct`**:
   - Fetches current STO requirement.
   - Records `originalProductId` and `originalProductCode` if not already set.
   - Updates STO record with new `productId`, `productCode`, `productDescriptionSnapshot`.
   - Sets `substitutionDate` and `isBacklog_retained`.
   - Triggers recommendation recalculations (`generateRecommendationForProduct`) for **both** the original product and the new substituted product.
   - Logs audit event `NORTHFLEET_STO_PRODUCT_SUBSTITUTION`.

---

## 3. Frontend UI Components (`StoTrackerDashboard.tsx` & Modals)

1. **Substitution Modal**:
   - Triggered via a new "Substitute" action button on each STO row.
   - Displays current product vs. dropdown of available alternative products (with live stock-on-hand preview).
   - Checkbox: *"Retain original product as deferred backlog requirement for future stock/production"*.

2. **Table Display & Badges**:
   - Substituted rows display a distinct badge: `Substituted with [SKU]`.
   - Tooltip details the substitution date and original product demand.

3. **Backlog / Substituted Filter & View**:
   - Add filter in the STO tracker to view all substituted or backlogged STOs.

---

## 4. Verification Plan

1. **Database Schema Validation**:
   - Run linter / schema checks.
2. **Service Unit Tests**:
   - Test `substituteStoProduct` ensures dual-product recommendation recalculations and backlog retention.
3. **UI Interaction Test**:
   - Perform product substitution in the STO Tracker, verify correct status badge display and waterfall recalculation.

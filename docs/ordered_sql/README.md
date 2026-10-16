# OVMS Supabase SQL Execution Guide

This folder contains the ordered SQL scripts for setting up or updating your Supabase database for the OVMS application.

The syntax error (`ERROR: 42601: syntax error at or near "973" LINE 596: DO 973`) has been **fixed**. The legacy `DO $$` procedural block has been replaced with clean, standard idempotent `DROP VIEW IF EXISTS` and `DROP TABLE IF EXISTS` SQL statements.

---

## Path 1: Updating / Reconciling an Existing Database (Recommended)

If you already have an active Supabase database with data, run these **3 files in order**:

1. `01_reconcile_schema.sql` (or `upgrade_existing/01_reconcile_schema.sql`)
   - Safely updates tables, columns, and views without destroying existing data.
2. `02_supabase_rls.sql` (or `upgrade_existing/02_supabase_rls.sql`)
   - Enables and updates Row Level Security (RLS) policies and internal auth helper functions.
3. `03_migration_snp87_planning.sql` (or `upgrade_existing/03_migration_snp87_planning.sql`)
   - Adds SNP87 Planning data context tables (`snp87_imports`, `snp87_planning_rows`) and Northfleet STO tables (`northfleet_sto_imports`, `northfleet_sto_requirements`).

---

## Path 2: Fresh / New Supabase Setup

If you are setting up a **brand new, empty Supabase project**:

1. `fresh_setup/01_supabase_schema.sql`
   - Creates core tables, schema, types, indexes, and triggers.
2. `fresh_setup/02_supabase_rls.sql`
   - Configures all Row Level Security (RLS) policies and security functions.
3. `fresh_setup/03_migration_snp87_planning.sql`
   - Provisions SNP87 Planning & Northfleet STO tables and policies.

---

## Summary Table

| Execution Order | File Name | Purpose |
|-----------------|-----------|---------|
| **Step 1** | `01_reconcile_schema.sql` | Reconciles schema & tables safely |
| **Step 2** | `02_supabase_rls.sql` | Configures RLS policies & auth functions |
| **Step 3** | `03_migration_snp87_planning.sql` | Provisions SNP87 Planning & Northfleet STO tables |

All scripts are idempotent and safe to run in the Supabase SQL Editor.

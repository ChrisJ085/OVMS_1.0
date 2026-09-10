-- Migration: Synchronize schema with authoritative definitions

-- 1. Create missing table: public.priority_events
CREATE TABLE IF NOT EXISTS public.priority_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  site_id uuid NOT NULL,
  priority_id uuid NOT NULL,
  event_type text NOT NULL,
  description text,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT priority_events_pkey PRIMARY KEY (id),
  CONSTRAINT priority_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT priority_events_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id),
  CONSTRAINT priority_events_priority_id_fkey FOREIGN KEY (priority_id) REFERENCES public.priorities(id)
);

-- 2. Synchronize columns in public.tenants
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS tenant_code text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS created_date timestamp with time zone DEFAULT now();
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS modified_by text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS modified_date timestamp with time zone DEFAULT now();

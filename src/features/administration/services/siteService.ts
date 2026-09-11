import { supabase } from '../../../config/supabase';
import { UserProfile } from '../../../types/auth';
import { Site } from '../../../types/site';

async function querySitesWithTenant(tenantFilter?: string | null): Promise<any[]> {
  try {
    let q = supabase.from('sites').select('*, tenants(id, name)');
    if (tenantFilter && tenantFilter !== 'GLOBAL') {
      q = q.eq('tenant_id', tenantFilter);
    }
    const { data, error } = await q;
    if (!error && data && data.length > 0) {
      return data;
    }
    if (!error && data) {
      return data;
    }
  } catch (e) {
    // Continue to fallback without relation
  }

  try {
    let q2 = supabase.from('sites').select('*');
    if (tenantFilter && tenantFilter !== 'GLOBAL') {
      q2 = q2.eq('tenant_id', tenantFilter);
    }
    const { data: rawSites, error: err2 } = await q2;
    if (!err2 && rawSites) {
      return rawSites;
    }
  } catch (e) {
    // ignore
  }

  return [];
}

export async function fetchUserPermittedSites(profile: UserProfile): Promise<Site[]> {
  if (!profile) return [];

  const uid = profile.uid || 'unknown';
  const tenantId = profile.tenantId;

  // Platform superuser must have active status
  if (profile.role === 'PLATFORM_SUPERUSER') {
    if (profile.accountStatus !== 'ACTIVE' && (profile.accountStatus as string) !== 'active' && profile.accountStatus) {
      return [];
    }
  }

  try {
    const sitesMap = new Map<string, Site>();

    // 1. Platform Superuser: query all active sites across all tenants
    if (profile.role === 'PLATFORM_SUPERUSER') {
      const sites = await querySitesWithTenant(null);

      (sites || []).forEach((row: any) => {
        const tId = row.tenant_id || tenantId || 'GLOBAL';
        const isActive = row.status === 'active' || row.status === 'ACTIVE' || row.status == null;
        if (isActive) {
          const key = `${tId}_${row.id}`;
          sitesMap.set(key, {
            tenantId: tId,
            tenantName: row.tenants?.name || row.tenantName || 'Tenant',
            siteId: row.id,
            siteName: row.name || row.code || row.id,
            timezone: row.timezone || 'Europe/London',
          });
        }
      });

      if (sitesMap.size === 0) {
        return [
          {
            tenantId: tenantId || 'GLOBAL',
            tenantName: 'Platform Global',
            siteId: 'GLOBAL',
            siteName: 'Global System',
            timezone: 'Europe/London',
          }
        ];
      }

      return Array.from(sitesMap.values());
    }

    // 2. Tenant Admin: query all active sites in their tenant
    if (profile.role === 'TENANT_ADMIN') {
      const targetTenantId = tenantId || 'TENANT_DEFAULT';
      const sites = await querySitesWithTenant(targetTenantId);

      // Look up tenant name
      let tenantName = 'Tenant Organization';
      if (targetTenantId && targetTenantId !== 'TENANT_DEFAULT' && targetTenantId !== 'GLOBAL') {
        try {
          const { data: tenantRow } = await supabase
            .from('tenants')
            .select('name')
            .eq('id', targetTenantId)
            .maybeSingle();
          if (tenantRow?.name) {
            tenantName = tenantRow.name;
          }
        } catch {
          // ignore
        }
      }

      (sites || []).forEach((row: any) => {
        const isActive = row.status === 'active' || row.status === 'ACTIVE' || row.status == null;
        if (isActive) {
          const key = `${targetTenantId}_${row.id}`;
          sitesMap.set(key, {
            tenantId: targetTenantId,
            tenantName: row.tenants?.name || tenantName,
            siteId: row.id,
            siteName: row.name || row.code || row.id,
            timezone: row.timezone || 'Europe/London',
          });
        }
      });

      // If no sites exist yet in this tenant, provision a tenant workspace setup site
      // so Tenant Admins can always access administration, settings, and the onboarding wizard
      if (sitesMap.size === 0) {
        sitesMap.set(`${targetTenantId}_setup`, {
          tenantId: targetTenantId,
          tenantName,
          siteId: 'SETUP_REQUIRED',
          siteName: 'Primary Site (Setup Required)',
          timezone: 'Europe/London',
        });
      }

      return Array.from(sitesMap.values());
    }

    // 3. Operational roles (PLANNER, WAREHOUSE_OPERATOR, VIEWER, DISPLAY):
    let userSiteIds = Array.isArray(profile.siteIds) ? profile.siteIds : [];

    if (userSiteIds.length === 0 && profile.uid) {
      try {
        const { data: userSiteRows } = await supabase
          .from('user_sites')
          .select('site_id')
          .eq('user_id', profile.uid);

        if (userSiteRows && userSiteRows.length > 0) {
          userSiteIds = userSiteRows.map((us: any) => us.site_id);
        }
      } catch (e) {
        // ignore
      }
    }

    const targetTenantId = tenantId || 'TENANT_DEFAULT';
    const sites = await querySitesWithTenant(targetTenantId);

    // Look up tenant name
    let tenantName = 'Tenant Organization';
    if (targetTenantId && targetTenantId !== 'TENANT_DEFAULT' && targetTenantId !== 'GLOBAL') {
      try {
        const { data: tenantRow } = await supabase
          .from('tenants')
          .select('name')
          .eq('id', targetTenantId)
          .maybeSingle();
        if (tenantRow?.name) {
          tenantName = tenantRow.name;
        }
      } catch {
        // ignore
      }
    }

    (sites || []).forEach((row: any) => {
      // If user has specific assigned siteIds, match on id or code;
      // If user has no specific site restrictions, grant access to all active sites of their tenant.
      const isAssigned = userSiteIds.length === 0 || userSiteIds.includes(row.id) || userSiteIds.includes(row.code);
      const isActive = row.status === 'active' || row.status === 'ACTIVE' || row.status == null;
      if (isAssigned && isActive) {
        const key = `${targetTenantId}_${row.id}`;
        sitesMap.set(key, {
          tenantId: targetTenantId,
          tenantName: row.tenants?.name || tenantName,
          siteId: row.id,
          siteName: row.name || row.code || row.id,
          timezone: row.timezone || 'Europe/London',
        });
      }
    });

    const results = Array.from(sitesMap.values());
    if (userSiteIds.length > 0 && results.length === 0) {
      console.warn(`[fetchUserPermittedSites] Diagnostic: User ${uid} has assigned siteIds [${userSiteIds.join(', ')}], but none matched active sites for tenant ${tenantId}.`);
    }

    return results;

  } catch (err: any) {
    console.error('[fetchUserPermittedSites] Error:', {
      uid,
      tenantId,
      message: err?.message,
    });
    return [];
  }
}


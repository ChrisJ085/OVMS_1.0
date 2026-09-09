import { supabase } from '../../../config/supabase';
import { UserProfile } from '../../../types/auth';
import { Site } from '../../../types/site';

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
      const { data: sites, error } = await supabase
        .from('sites')
        .select('*, tenants(id, name)');

      if (error) {
        console.warn('[fetchUserPermittedSites] Failed to query sites for superuser:', error.message);
        return [];
      }

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
      return Array.from(sitesMap.values());
    }

    // 2. Tenant Admin: query all active sites in their tenant
    if (profile.role === 'TENANT_ADMIN') {
      if (!tenantId || tenantId === 'GLOBAL') return [];

      const { data: sites, error } = await supabase
        .from('sites')
        .select('*, tenants(id, name)')
        .eq('tenant_id', tenantId);

      if (error) {
        console.warn('[fetchUserPermittedSites] Failed to query sites for tenant admin:', error.message);
        return [];
      }

      (sites || []).forEach((row: any) => {
        const isActive = row.status === 'active' || row.status === 'ACTIVE' || row.status == null;
        if (isActive) {
          const key = `${tenantId}_${row.id}`;
          sitesMap.set(key, {
            tenantId,
            tenantName: row.tenants?.name || row.tenantName || 'Tenant',
            siteId: row.id,
            siteName: row.name || row.code || row.id,
            timezone: row.timezone || 'Europe/London',
          });
        }
      });
      return Array.from(sitesMap.values());
    }

    // 3. Restricted roles (PLANNER, WAREHOUSE_OPERATOR, VIEWER, DISPLAY):
    // Determine assigned site IDs from profile or user_sites table
    let userSiteIds = Array.isArray(profile.siteIds) ? profile.siteIds : [];

    if (userSiteIds.length === 0 && profile.uid) {
      const { data: userSiteRows } = await supabase
        .from('user_sites')
        .select('site_id')
        .eq('user_id', profile.uid);

      if (userSiteRows && userSiteRows.length > 0) {
        userSiteIds = userSiteRows.map((us: any) => us.site_id);
      }
    }

    if (!tenantId || tenantId === 'GLOBAL' || userSiteIds.length === 0) {
      console.log(`[fetchUserPermittedSites] User ${uid} (role ${profile.role}) has no assigned siteIds.`);
      return [];
    }

    // Query assigned sites by ID or code for tenant
    const { data: sites, error } = await supabase
      .from('sites')
      .select('*, tenants(id, name)')
      .eq('tenant_id', tenantId);

    if (error) {
      console.warn('[fetchUserPermittedSites] Failed to query sites for assigned user:', error.message);
      return [];
    }

    (sites || []).forEach((row: any) => {
      const isAssigned = userSiteIds.includes(row.id) || userSiteIds.includes(row.code);
      const isActive = row.status === 'active' || row.status === 'ACTIVE' || row.status == null;
      if (isAssigned && isActive) {
        const key = `${tenantId}_${row.id}`;
        sitesMap.set(key, {
          tenantId,
          tenantName: row.tenants?.name || row.tenantName || 'Tenant',
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

import { SiteSettings } from '../../../types/settings';
import { AuditEvent } from '../../../types/audit';
import { supabase } from '../../../config/supabase';
import { logAuditEvent } from '../../../services/auditService';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isValidUuid = (val: any): boolean => typeof val === 'string' && UUID_REGEX.test(val.trim());

export const getSiteSettings = async (tenantId: string, siteId: string): Promise<SiteSettings | null> => {
  if (!tenantId || !siteId || tenantId === 'GLOBAL' || siteId === 'GLOBAL' || !isValidUuid(tenantId) || !isValidUuid(siteId)) {
    return null;
  }
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('site_id', siteId)
      .maybeSingle();

    if (error) {
      console.error('[getSiteSettings] Error fetching settings:', error);
      return null;
    }

    if (!data) return null;

    const parsed = data.settings || {};
    return {
      id: data.id,
      tenantId,
      siteId,
      ...parsed,
      modifiedBy: data.updated_by || parsed.modifiedBy,
      modifiedDate: data.updated_at || parsed.modifiedDate
    } as SiteSettings;
  } catch (err) {
    console.error('[getSiteSettings] Error:', err);
    return null;
  }
};

export const updateSiteSettings = async (
  tenantId: string, 
  siteId: string, 
  settings: Partial<SiteSettings>,
  userId: string
): Promise<{ success: boolean; error?: string }> => {
  if (!tenantId || !siteId || tenantId === 'GLOBAL' || siteId === 'GLOBAL' || !isValidUuid(tenantId) || !isValidUuid(siteId)) {
    return { success: false, error: 'Cannot update settings for invalid tenant or site' };
  }
  try {
    const existing = await getSiteSettings(tenantId, siteId);
    
    const mergedSettings = {
      ...(existing || {}),
      ...settings,
    };
    
    const { id, tenantId: t, siteId: s, ...cleanSettings } = mergedSettings as any;

    const payload = {
      tenant_id: tenantId,
      site_id: siteId,
      settings: cleanSettings,
      updated_by: userId,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('site_settings')
      .upsert(payload, { onConflict: 'tenant_id,site_id' });

    if (error) throw error;

    // Log audit event
    await createAuditLog({
      tenantId,
      siteId,
      eventType: 'SETTINGS_UPDATE',
      entityType: 'SiteSettings',
      entityId: `${tenantId}_${siteId}`,
      summary: 'Updated site configuration settings',
      previousValue: existing,
      newValue: mergedSettings,
      performedBy: userId,
      timestamp: new Date()
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

export const createAuditLog = async (log: Omit<AuditEvent, 'id'>) => {
  await logAuditEvent(log);
};

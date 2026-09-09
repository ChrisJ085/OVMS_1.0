import { supabase } from '../config/supabase';
import { AuditEvent } from '../types/audit';

function cleanUndefined(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (Array.isArray(obj)) return obj.map(cleanUndefined);
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const res: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) {
        res[k] = cleanUndefined(v);
      }
    }
    return res;
  }
  return obj;
}

export const logAuditEvent = async (
  event: Omit<AuditEvent, 'id' | 'timestamp'>
): Promise<string | null> => {
  try {
    const sanitized = cleanUndefined(event);
    
    // Handle UUID conversion if performedBy is a fake user/non-UUID string
    let performedByUuid: string | null = null;
    if (sanitized.performedBy && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sanitized.performedBy)) {
      performedByUuid = sanitized.performedBy;
    }

    const dbRow = {
      tenant_id: (sanitized.tenantId && sanitized.tenantId !== 'GLOBAL') ? sanitized.tenantId : null,
      site_id: (sanitized.siteId && sanitized.siteId !== 'GLOBAL') ? sanitized.siteId : null,
      user_id: performedByUuid,
      user_email: sanitized.performedByEmail || null,
      action: sanitized.eventType || 'UNKNOWN',
      entity_type: sanitized.entityType || 'UNKNOWN',
      entity_id: sanitized.entityId || null,
      details: {
        summary: sanitized.summary,
        performedByName: sanitized.performedByName,
        performedByRaw: sanitized.performedBy,
        previousValue: sanitized.previousValue,
        newValue: sanitized.newValue,
        metadata: sanitized.metadata,
        ...sanitized
      },
      timestamp: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('audit_logs')
      .insert(dbRow)
      .select('id')
      .single();

    if (error) {
      console.warn('Failed to log audit event in database:', error.message);
      return null;
    }
    return data?.id || null;
  } catch (err) {
    console.warn('Failed to log audit event:', err);
    return null;
  }
};

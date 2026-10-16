import { supabase } from '../config/supabase';
import { getTableName, toCamelCase, toSnakeCase, normalizeTablePayload } from '../utils/caseTransformers';
import { BaseDocument } from '../types/common';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const TEXT_ID_TABLES = new Set([
  'decision_configurations',
  'recommendation_runs',
  'display_priorities',
  'site_onboarding',
  'announcements'
]);

export const isValidUuid = (val: any): boolean => {
  return typeof val === 'string' && UUID_REGEX.test(val.trim());
};

export const isUuidField = (fieldName: string): boolean => {
  const f = fieldName.toLowerCase();
  const nonUuidFields = [
    'unit_of_measure_id',
    'default_import_uom_id',
    'entity_id',
    'deletion_job_id',
    'unitofmeasureid',
    'defaultimportuomid',
    'entityid',
    'deletionjobid'
  ];
  if (nonUuidFields.includes(f)) {
    return false;
  }
  return f === 'id' || f.endsWith('_id') || f.endsWith('id');
};

export interface QueryFilter {
  field: string;
  op: '==' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'array-contains';
  value: any;
}

export const getFallbackTableName = (tableName: string): string | null => {
  if (tableName === 'snp87_planning_imports') return 'snp87_imports';
  if (tableName === 'snp87_imports') return 'snp87_planning_imports';
  if (tableName === 'snp87_planning_rows') return 'snp87_rows';
  if (tableName === 'snp87_rows') return 'snp87_planning_rows';
  return null;
};

export const getDocument = async <T = any>(collectionName: string, id: string): Promise<T | null> => {
  if (!id || id === 'GLOBAL' || id.includes('GLOBAL')) {
    return null;
  }

  let tableName = getTableName(collectionName);

  // Handle composite IDs like `${tenantId}_${siteId}`
  if (id.includes('_')) {
    const parts = id.split('_');
    if (parts.length === 2 && isValidUuid(parts[0]) && isValidUuid(parts[1])) {
      let { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('tenant_id', parts[0])
        .eq('site_id', parts[1])
        .maybeSingle();

      if (error && (error as any).code === 'PGRST205') {
        const fallback = getFallbackTableName(tableName);
        if (fallback) {
          const fallbackRes = await supabase
            .from(fallback)
            .select('*')
            .eq('tenant_id', parts[0])
            .eq('site_id', parts[1])
            .maybeSingle();
          if (!fallbackRes.error) {
            data = fallbackRes.data;
            error = null;
          }
        }
      }

      if (error) {
        console.warn(`[Supabase getDocument] Error fetching composite ${tableName}/${id}:`, error);
        return null;
      }
      return data ? toCamelCase<T>(data) : null;
    }
    return null;
  }

  if (!isValidUuid(id)) {
    return null;
  }

  let { data, error } = await supabase
    .from(tableName)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error && (error as any).code === 'PGRST205') {
    const fallback = getFallbackTableName(tableName);
    if (fallback) {
      const fallbackRes = await supabase
        .from(fallback)
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!fallbackRes.error) {
        data = fallbackRes.data;
        error = null;
      }
    }
  }

  if (error) {
    console.error(`[Supabase getDocument] Error fetching ${tableName}/${id}:`, error);
    throw new Error(`Failed to fetch document ${id} from ${tableName}: ${error.message}`);
  }

  if (!data) return null;
  return toCamelCase<T>(data);
};

export const getDocuments = async <T = any>(
  collectionName: string,
  filters: QueryFilter[] = []
): Promise<T[]> => {
  const tableName = getTableName(collectionName);

  // Check for impossible filters (e.g. querying a UUID column with 'GLOBAL' or invalid UUID on ==)
  for (const f of filters) {
    const snakeField = f.field.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (f.op === '==' || f.op === undefined) {
      if (f.value === 'GLOBAL') {
        return [];
      }
      if ((snakeField === 'tenant_id' || snakeField === 'site_id') && !isValidUuid(f.value)) {
        return [];
      }
    } else if (f.op === 'in') {
      if (!Array.isArray(f.value) || f.value.length === 0) {
        return [];
      }
      if (snakeField === 'tenant_id' || snakeField === 'site_id') {
        const validValues = f.value.filter(v => v !== 'GLOBAL' && isValidUuid(v));
        if (validValues.length === 0) {
          return [];
        }
      }
    }
  }

  const buildQuery = (targetTable: string) => {
    let query = supabase.from(targetTable).select('*');
    for (const f of filters) {
      const snakeField = f.field.replace(/([A-Z])/g, '_$1').toLowerCase();
      switch (f.op) {
        case '==':
          query = query.eq(snakeField, f.value);
          break;
        case '!=':
          query = query.neq(snakeField, f.value);
          break;
        case '>':
          query = query.gt(snakeField, f.value);
          break;
        case '>=':
          query = query.gte(snakeField, f.value);
          break;
        case '<':
          query = query.lt(snakeField, f.value);
          break;
        case '<=':
          query = query.lte(snakeField, f.value);
          break;
        case 'in': {
          let values = Array.isArray(f.value) ? f.value : [f.value];
          if (isUuidField(snakeField)) {
            values = values.filter(v => v !== 'GLOBAL' && isValidUuid(v));
          }
          query = query.in(snakeField, values);
          break;
        }
        case 'array-contains':
          query = query.contains(snakeField, [f.value]);
          break;
        default:
          query = query.eq(snakeField, f.value);
      }
    }
    return query;
  };

  let { data, error } = await buildQuery(tableName);

  if (error && (error as any).code === 'PGRST205') {
    const fallback = getFallbackTableName(tableName);
    if (fallback) {
      const fallbackRes = await buildQuery(fallback);
      if (!fallbackRes.error) {
        data = fallbackRes.data;
        error = null;
      }
    }
  }

  if (error) {
    console.error(`[Supabase getDocuments] Error querying ${tableName}:`, error);
    throw new Error(`Failed to query ${tableName}: ${error.message}`);
  }

  return (data || []).map(row => toCamelCase<T>(row));
};

function enrichWithActiveSite(data: Record<string, any>, tableName?: string): Record<string, any> {
  const result = { ...data };
  if (tableName === 'sites' || tableName === 'tenants' || tableName === 'users') {
    delete result.siteId;
    delete result.site_id;
    return result;
  }

  let tenantId = result.tenantId || result.tenant_id;
  let siteId = result.siteId || result.site_id;

  if (!tenantId || tenantId === 'GLOBAL' || !siteId || siteId === 'GLOBAL' || siteId === 'SETUP_REQUIRED') {
    try {
      const activeSiteStr = localStorage.getItem('ovms_active_site');
      if (activeSiteStr) {
        const activeSite = JSON.parse(activeSiteStr);
        if (!tenantId || tenantId === 'GLOBAL') {
          tenantId = activeSite.tenantId;
        }
        if (!siteId || siteId === 'GLOBAL' || siteId === 'SETUP_REQUIRED') {
          siteId = activeSite.siteId;
        }
      }
    } catch {}
  }

  if (tenantId) {
    result.tenantId = tenantId;
    result.tenant_id = tenantId;
  }
  if (siteId && siteId !== 'GLOBAL' && siteId !== 'SETUP_REQUIRED') {
    result.siteId = siteId;
    result.site_id = siteId;
  }

  return result;
}

function sanitizeUuidFields(data: Record<string, any>, tableName?: string): Record<string, any> {
  const result = { ...data };
  const nonUuidFields = [
    'unit_of_measure_id',
    'default_import_uom_id',
    'entity_id',
    'deletion_job_id',
    'site_ids'
  ];
  for (const key of Object.keys(result)) {
    const val = result[key];
    if (key === 'id') {
      if (!val || !isValidUuid(val)) {
        if (tableName && TEXT_ID_TABLES.has(tableName) && typeof val === 'string' && val.trim() !== '') {
          result[key] = val.trim();
        } else if (!tableName || !TEXT_ID_TABLES.has(tableName)) {
          try {
            result[key] = crypto.randomUUID();
          } catch {
            delete result[key];
          }
        } else {
          // Never set primary key id to null! That violates NOT NULL constraints on PostgreSQL UUID columns.
          delete result[key];
        }
      }
      continue;
    }

    const isIdField = (key.endsWith('_id') || key.endsWith('id')) && key !== 'tenant_id' && key !== 'site_id';
    if (isIdField) {
      if (val === '' || val === undefined) {
        result[key] = null;
      } else if (val !== null && !nonUuidFields.includes(key.toLowerCase())) {
        if (!isValidUuid(val)) {
          result[key] = null;
        }
      }
    }
  }
  return result;
}

export function notifyCollectionChange(collectionName: string) {
  const tableName = getTableName(collectionName);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ovms:collection_changed', {
      detail: { collectionName, tableName }
    }));
  }
}

export const createDocument = async <T extends BaseDocument>(
  collectionName: string,
  data: Omit<T, 'id' | 'createdBy' | 'createdDate' | 'modifiedBy' | 'modifiedDate'>
): Promise<string> => {
  const tableName = getTableName(collectionName);
  const isSiteOrTenant = tableName === 'sites' || tableName === 'tenants' || tableName === 'users';
  
  const enrichedData = enrichWithActiveSite(data, tableName);
  if (isSiteOrTenant) {
    delete (enrichedData as any).siteId;
    delete (enrichedData as any).site_id;
  }
  const createdBy = (enrichedData as any).createdBy;
  const modifiedBy = (enrichedData as any).modifiedBy || createdBy;

  const rawSnake = toSnakeCase({
    ...enrichedData,
    createdBy,
    createdDate: new Date().toISOString(),
    modifiedBy,
    modifiedDate: new Date().toISOString(),
  });

  if (isSiteOrTenant) {
    delete (rawSnake as any).site_id;
    delete (rawSnake as any).siteId;
  }

  const snakeData = sanitizeUuidFields(normalizeTablePayload(tableName, rawSnake as Record<string, any>), tableName);
  if (isSiteOrTenant) {
    delete snakeData.site_id;
    delete snakeData.siteId;
  }
  if (!snakeData.id || (!isValidUuid(snakeData.id) && !TEXT_ID_TABLES.has(tableName))) {
    if (!TEXT_ID_TABLES.has(tableName)) {
      try {
        snakeData.id = crypto.randomUUID();
      } catch {
        delete snakeData.id;
      }
    } else {
      delete snakeData.id;
    }
  }

  let { data: inserted, error } = await supabase
    .from(tableName)
    .insert(snakeData)
    .select('id')
    .single();

  if (error && (error as any).code === 'PGRST205') {
    const fallback = getFallbackTableName(tableName);
    if (fallback) {
      const fallbackRes = await supabase
        .from(fallback)
        .insert(snakeData)
        .select('id')
        .single();
      if (!fallbackRes.error) {
        inserted = fallbackRes.data;
        error = null;
      }
    }
  }

  if (error) {
    console.error(`[Supabase createDocument] Error creating ${tableName}:`, error);
    throw new Error(`Failed to create document in ${tableName}: ${error.message}`);
  }

  notifyCollectionChange(collectionName);
  return inserted.id;
};

export const createDocuments = async <T extends BaseDocument>(
  collectionName: string,
  items: Array<Omit<T, 'id' | 'createdBy' | 'createdDate' | 'modifiedBy' | 'modifiedDate'>>
): Promise<string[]> => {
  if (!items || items.length === 0) return [];
  const tableName = getTableName(collectionName);
  const isSiteOrTenant = tableName === 'sites' || tableName === 'tenants' || tableName === 'users';
  const now = new Date().toISOString();

  const payloads = items.map(item => {
    const enriched = enrichWithActiveSite(item, tableName);
    if (isSiteOrTenant) {
      delete (enriched as any).siteId;
      delete (enriched as any).site_id;
    }
    const createdBy = (enriched as any).createdBy;
    const modifiedBy = (enriched as any).modifiedBy || createdBy;
    const rawSnake = toSnakeCase({
      ...enriched,
      createdBy,
      createdDate: now,
      modifiedBy,
      modifiedDate: now
    });
    if (isSiteOrTenant) {
      delete (rawSnake as any).site_id;
      delete (rawSnake as any).siteId;
    }
    const normalized = sanitizeUuidFields(normalizeTablePayload(tableName, rawSnake as Record<string, any>), tableName);
    if (isSiteOrTenant) {
      delete normalized.site_id;
      delete normalized.siteId;
    }
    if (!normalized.id || (!isValidUuid(normalized.id) && !TEXT_ID_TABLES.has(tableName))) {
      if (!TEXT_ID_TABLES.has(tableName)) {
        try {
          normalized.id = crypto.randomUUID();
        } catch {
          delete normalized.id;
        }
      } else {
        delete normalized.id;
      }
    }
    return normalized;
  });

  const insertedIds: string[] = [];
  const CHUNK_SIZE = 100;
  for (let i = 0; i < payloads.length; i += CHUNK_SIZE) {
    const chunk = payloads.slice(i, i + CHUNK_SIZE);
    let { data: inserted, error } = await supabase
      .from(tableName)
      .insert(chunk)
      .select('id');

    if (error && (error as any).code === 'PGRST205') {
      const fallback = getFallbackTableName(tableName);
      if (fallback) {
        const fallbackRes = await supabase
          .from(fallback)
          .insert(chunk)
          .select('id');
        if (!fallbackRes.error) {
          inserted = fallbackRes.data;
          error = null;
        }
      }
    }

    if (error) {
      console.error(`[Supabase createDocuments] Error creating documents in ${tableName}:`, error);
      throw new Error(`Failed to create documents in ${tableName}: ${error.message}`);
    }
    if (inserted) {
      insertedIds.push(...inserted.map(row => row.id));
    }
  }

  notifyCollectionChange(collectionName);
  return insertedIds;
};

export const setDocument = async (
  collectionName: string,
  id: string,
  data: Record<string, any>
): Promise<void> => {
  const tableName = getTableName(collectionName);
  const isSiteOrTenant = tableName === 'sites' || tableName === 'tenants' || tableName === 'users';
  const enriched = enrichWithActiveSite(data, tableName);
  if (isSiteOrTenant) {
    delete (enriched as any).siteId;
    delete (enriched as any).site_id;
  }
  const payload: Record<string, any> = { ...enriched };

  // Set ID if valid UUID, OR if table uses string/composite IDs (like decision_configurations, recommendation_runs, display_priorities, etc.)
  const TEXT_ID_TABLES = new Set([
    'decision_configurations',
    'recommendation_runs',
    'display_priorities',
    'site_onboarding',
    'announcements'
  ]);

  if (isValidUuid(id) || TEXT_ID_TABLES.has(tableName)) {
    payload.id = id;
  }
  payload.modifiedDate = new Date().toISOString();

  const rawSnake = toSnakeCase(payload);
  if (isSiteOrTenant) {
    delete (rawSnake as any).site_id;
    delete (rawSnake as any).siteId;
  }
  const snakeData = sanitizeUuidFields(normalizeTablePayload(tableName, rawSnake as Record<string, any>));
  if (isSiteOrTenant) {
    delete snakeData.site_id;
    delete snakeData.siteId;
  }

  if (TEXT_ID_TABLES.has(tableName) && !snakeData.id && id) {
    snakeData.id = id;
  }

  const TENANT_SITE_UNIQUE_TABLES = new Set([
    'decision_configurations',
    'recommendation_runs',
    'display_priorities'
  ]);

  let error;
  if (!isValidUuid(id) && TENANT_SITE_UNIQUE_TABLES.has(tableName) && snakeData.tenant_id && snakeData.site_id) {
    const res = await supabase
      .from(tableName)
      .upsert(snakeData, { onConflict: 'tenant_id,site_id' });
    error = res.error;
  } else {
    const res = await supabase
      .from(tableName)
      .upsert(snakeData);
    error = res.error;
  }

  if (error && (error as any).code === 'PGRST205') {
    const fallback = getFallbackTableName(tableName);
    if (fallback) {
      if (!isValidUuid(id) && TENANT_SITE_UNIQUE_TABLES.has(fallback) && snakeData.tenant_id && snakeData.site_id) {
        const res = await supabase
          .from(fallback)
          .upsert(snakeData, { onConflict: 'tenant_id,site_id' });
        error = res.error;
      } else {
        const res = await supabase
          .from(fallback)
          .upsert(snakeData);
        error = res.error;
      }
    }
  }

  if (error) {
    console.error(`[Supabase setDocument] Error upserting ${tableName}/${id}:`, error);
    throw new Error(`Failed to set document ${id} in ${tableName}: ${error.message}`);
  }

  notifyCollectionChange(collectionName);
};

export const updateDocument = async (
  collectionName: string,
  id: string,
  data: Record<string, any>
): Promise<void> => {
  const tableName = getTableName(collectionName);
  const isSiteOrTenant = tableName === 'sites' || tableName === 'tenants' || tableName === 'users';
  const enriched = { ...data };
  delete enriched.id;
  delete enriched.ID;
  delete (enriched as any)._id;

  const enrichedWithSite = enrichWithActiveSite(enriched, tableName);
  if (isSiteOrTenant) {
    delete (enrichedWithSite as any).siteId;
    delete (enrichedWithSite as any).site_id;
  }
  
  const rawSnake = toSnakeCase({
    ...enrichedWithSite,
    modifiedBy: enrichedWithSite.modifiedBy,
    modifiedDate: new Date().toISOString(),
  });
  if (isSiteOrTenant) {
    delete (rawSnake as any).site_id;
    delete (rawSnake as any).siteId;
  }
  const snakeData = sanitizeUuidFields(normalizeTablePayload(tableName, rawSnake as Record<string, any>));
  delete snakeData.id;
  if (isSiteOrTenant) {
    delete snakeData.site_id;
    delete snakeData.siteId;
  }

  if (id.includes('_')) {
    const parts = id.split('_');
    if (parts.length === 2 && isValidUuid(parts[0]) && isValidUuid(parts[1])) {
      let { error } = await supabase
        .from(tableName)
        .update(snakeData)
        .eq('tenant_id', parts[0])
        .eq('site_id', parts[1]);

      if (error && (error as any).code === 'PGRST205') {
        const fallback = getFallbackTableName(tableName);
        if (fallback) {
          const res = await supabase
            .from(fallback)
            .update(snakeData)
            .eq('tenant_id', parts[0])
            .eq('site_id', parts[1]);
          error = res.error;
        }
      }

      if (error) {
        console.error(`[Supabase updateDocument] Error updating composite ${tableName}/${id}:`, error);
        throw new Error(`Failed to update document ${id} in ${tableName}: ${error.message}`);
      }
      notifyCollectionChange(collectionName);
      return;
    }
  }

  if (!isValidUuid(id)) {
    return;
  }

  let { error } = await supabase
    .from(tableName)
    .update(snakeData)
    .eq('id', id);

  if (error && (error as any).code === 'PGRST205') {
    const fallback = getFallbackTableName(tableName);
    if (fallback) {
      const res = await supabase
        .from(fallback)
        .update(snakeData)
        .eq('id', id);
      error = res.error;
    }
  }

  if (error) {
    console.error(`[Supabase updateDocument] Error updating ${tableName}/${id}:`, error);
    throw new Error(`Failed to update document ${id} in ${tableName}: ${error.message}`);
  }

  notifyCollectionChange(collectionName);
};

export const deleteDocument = async (
  collectionName: string,
  id: string
): Promise<void> => {
  const tableName = getTableName(collectionName);

  if (id.includes('_')) {
    const parts = id.split('_');
    if (parts.length === 2 && isValidUuid(parts[0]) && isValidUuid(parts[1])) {
      let { error } = await supabase
        .from(tableName)
        .delete()
        .eq('tenant_id', parts[0])
        .eq('site_id', parts[1]);

      if (error && (error as any).code === 'PGRST205') {
        const fallback = getFallbackTableName(tableName);
        if (fallback) {
          const res = await supabase
            .from(fallback)
            .delete()
            .eq('tenant_id', parts[0])
            .eq('site_id', parts[1]);
          error = res.error;
        }
      }

      if (error) {
        console.error(`[Supabase deleteDocument] Error deleting composite ${tableName}/${id}:`, error);
        throw new Error(`Failed to delete document ${id} from ${tableName}: ${error.message}`);
      }
      notifyCollectionChange(collectionName);
      return;
    }
  }

  if (!isValidUuid(id)) {
    return;
  }

  let { error } = await supabase
    .from(tableName)
    .delete()
    .eq('id', id);

  if (error && (error as any).code === 'PGRST205') {
    const fallback = getFallbackTableName(tableName);
    if (fallback) {
      const res = await supabase
        .from(fallback)
        .delete()
        .eq('id', id);
      error = res.error;
    }
  }

  if (error) {
    console.error(`[Supabase deleteDocument] Error deleting ${tableName}/${id}:`, error);
    throw new Error(`Failed to delete document ${id} from ${tableName}: ${error.message}`);
  }

  notifyCollectionChange(collectionName);
};

export const deactivateDocument = async (
  collectionName: string,
  id: string
): Promise<void> => {
  await updateDocument(collectionName, id, { status: 'inactive' });
};

export const subscribeToDocument = <T = any>(
  collectionName: string,
  id: string,
  onUpdate: (data: T | null) => void,
  onError?: (error: Error) => void
) => {
  if (!id || id === 'GLOBAL' || id.includes('GLOBAL')) {
    onUpdate(null);
    return () => {};
  }
  if (!isValidUuid(id) && !id.includes('_')) {
    onUpdate(null);
    return () => {};
  }

  const tableName = getTableName(collectionName);
  
  // Initial fetch
  getDocument<T>(collectionName, id)
    .then(data => onUpdate(data))
    .catch(err => onError ? onError(err) : console.error(err));

  if (!isValidUuid(id)) {
    return () => {};
  }

  // Realtime subscription natively with unique channel name
  const channel = supabase
    .channel(`sub_doc_${tableName}_${id}_${Math.random().toString(36).substring(2, 8)}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: tableName,
        filter: `id=eq.${id}`
      },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          onUpdate(null);
        } else {
          onUpdate(toCamelCase<T>(payload.new));
        }
      }
    );

  channel.subscribe((status) => {
    if (status === 'CHANNEL_ERROR') {
      console.info(`[Supabase Realtime] Channel info for ${tableName}/${id}: Realtime not enabled or disconnected.`);
    }
  });

  return () => {
    supabase.removeChannel(channel);
  };
};

export const subscribeToCollection = <T = any>(
  collectionName: string,
  filters: QueryFilter[] = [],
  onUpdate: (data: T[]) => void,
  onError?: (error: Error) => void
) => {
  // Check for impossible filters (e.g. querying a UUID column with 'GLOBAL' or invalid UUID on ==)
  for (const f of filters) {
    const snakeField = f.field.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (f.op === '==' || f.op === undefined) {
      if (f.value === 'GLOBAL' || (isUuidField(snakeField) && !isValidUuid(f.value))) {
        onUpdate([]);
        return () => {};
      }
    } else if (f.op === 'in') {
      if (!Array.isArray(f.value) || f.value.length === 0) {
        onUpdate([]);
        return () => {};
      }
      if (isUuidField(snakeField)) {
        const validValues = f.value.filter(v => v !== 'GLOBAL' && isValidUuid(v));
        if (validValues.length === 0) {
          onUpdate([]);
          return () => {};
        }
      }
    }
  }

  const tableName = getTableName(collectionName);

  const fetchAndNotify = () => {
    getDocuments<T>(collectionName, filters)
      .then(data => onUpdate(data))
      .catch(err => onError ? onError(err) : console.error(err));
  };

  fetchAndNotify();

  // Instant in-app reactivity for local document changes
  const handleLocalChange = (e: Event) => {
    const detail = (e as CustomEvent)?.detail;
    if (!detail) {
      fetchAndNotify();
      return;
    }
    const targetTable = getTableName(detail.collectionName || detail.tableName || '');
    if (
      detail.collectionName === collectionName ||
      detail.tableName === tableName ||
      targetTable === tableName
    ) {
      fetchAndNotify();
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('ovms:collection_changed', handleLocalChange);
  }

  // Create unique native channel
  const channel = supabase
    .channel(`sub_coll_${tableName}_${Math.random().toString(36).slice(2, 8)}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: tableName
      },
      () => {
        fetchAndNotify();
      }
    );

  channel.subscribe((status) => {
    if (status === 'CHANNEL_ERROR') {
      console.info(`[Supabase Realtime] Channel info for table ${tableName}: Realtime not enabled or disconnected.`);
    }
  });

  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('ovms:collection_changed', handleLocalChange);
    }
    supabase.removeChannel(channel);
  };
};

export const where = (field: string, op: string, value: any): QueryFilter => {
  return { field, op: op as any, value };
};

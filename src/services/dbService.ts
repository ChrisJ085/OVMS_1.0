import { supabase } from '../config/supabase';
import { getTableName, toCamelCase, toSnakeCase, normalizeTablePayload } from '../utils/caseTransformers';
import { BaseDocument } from '../types/common';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isValidUuid = (val: any): boolean => {
  return typeof val === 'string' && UUID_REGEX.test(val.trim());
};

export const isUuidField = (fieldName: string): boolean => {
  const f = fieldName.toLowerCase();
  return f === 'id' || f.endsWith('_id') || f.endsWith('id');
};

export interface QueryFilter {
  field: string;
  op: '==' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'array-contains';
  value: any;
}

export const getDocument = async <T = any>(collectionName: string, id: string): Promise<T | null> => {
  if (!id || id === 'GLOBAL' || id.includes('GLOBAL')) {
    return null;
  }

  const tableName = getTableName(collectionName);

  // Handle composite IDs like `${tenantId}_${siteId}`
  if (id.includes('_')) {
    const parts = id.split('_');
    if (parts.length === 2 && isValidUuid(parts[0]) && isValidUuid(parts[1])) {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('tenant_id', parts[0])
        .eq('site_id', parts[1])
        .maybeSingle();

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

  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .eq('id', id)
    .maybeSingle();

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
      if (f.value === 'GLOBAL' || (isUuidField(snakeField) && !isValidUuid(f.value))) {
        return [];
      }
    } else if (f.op === 'in') {
      if (!Array.isArray(f.value) || f.value.length === 0) {
        return [];
      }
      if (isUuidField(snakeField)) {
        const validValues = f.value.filter(v => v !== 'GLOBAL' && isValidUuid(v));
        if (validValues.length === 0) {
          return [];
        }
      }
    }
  }

  let dbQuery = supabase.from(tableName).select('*');

  for (const f of filters) {
    const snakeField = f.field.replace(/([A-Z])/g, '_$1').toLowerCase();
    switch (f.op) {
      case '==':
        dbQuery = dbQuery.eq(snakeField, f.value);
        break;
      case '!=':
        dbQuery = dbQuery.neq(snakeField, f.value);
        break;
      case '>':
        dbQuery = dbQuery.gt(snakeField, f.value);
        break;
      case '>=':
        dbQuery = dbQuery.gte(snakeField, f.value);
        break;
      case '<':
        dbQuery = dbQuery.lt(snakeField, f.value);
        break;
      case '<=':
        dbQuery = dbQuery.lte(snakeField, f.value);
        break;
      case 'in': {
        let values = Array.isArray(f.value) ? f.value : [f.value];
        if (isUuidField(snakeField)) {
          values = values.filter(v => v !== 'GLOBAL' && isValidUuid(v));
        }
        dbQuery = dbQuery.in(snakeField, values);
        break;
      }
      case 'array-contains':
        dbQuery = dbQuery.contains(snakeField, [f.value]);
        break;
      default:
        dbQuery = dbQuery.eq(snakeField, f.value);
    }
  }

  const { data, error } = await dbQuery;

  if (error) {
    console.error(`[Supabase getDocuments] Error querying ${tableName}:`, error);
    throw new Error(`Failed to query ${tableName}: ${error.message}`);
  }

  return (data || []).map(row => toCamelCase<T>(row));
};

function enrichWithActiveSite(data: Record<string, any>): Record<string, any> {
  const result = { ...data };
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

function sanitizeUuidFields(data: Record<string, any>): Record<string, any> {
  const result = { ...data };
  for (const key of Object.keys(result)) {
    const val = result[key];
    if (val !== undefined && val !== null && val !== '') {
      if ((key.endsWith('_id') || key === 'id') && key !== 'tenant_id' && key !== 'site_id') {
        if (typeof val === 'string' && !isValidUuid(val)) {
          result[key] = null;
        }
      }
    }
  }
  return result;
}

export const createDocument = async <T extends BaseDocument>(
  collectionName: string,
  data: Omit<T, 'id' | 'createdBy' | 'createdDate' | 'modifiedBy' | 'modifiedDate'>
): Promise<string> => {
  const tableName = getTableName(collectionName);
  
  const enrichedData = enrichWithActiveSite(data);
  const createdBy = (enrichedData as any).createdBy;
  const modifiedBy = (enrichedData as any).modifiedBy || createdBy;

  const rawSnake = toSnakeCase({
    ...enrichedData,
    createdBy,
    createdDate: new Date().toISOString(),
    modifiedBy,
    modifiedDate: new Date().toISOString(),
  });

  const snakeData = sanitizeUuidFields(normalizeTablePayload(tableName, rawSnake as Record<string, any>));

  const { data: inserted, error } = await supabase
    .from(tableName)
    .insert(snakeData)
    .select('id')
    .single();

  if (error) {
    console.error(`[Supabase createDocument] Error creating ${tableName}:`, error);
    throw new Error(`Failed to create document in ${tableName}: ${error.message}`);
  }

  return inserted.id;
};

export const createDocuments = async <T extends BaseDocument>(
  collectionName: string,
  items: Array<Omit<T, 'id' | 'createdBy' | 'createdDate' | 'modifiedBy' | 'modifiedDate'>>
): Promise<string[]> => {
  if (!items || items.length === 0) return [];
  const tableName = getTableName(collectionName);
  const now = new Date().toISOString();

  const payloads = items.map(item => {
    const enriched = enrichWithActiveSite(item);
    const createdBy = (enriched as any).createdBy;
    const modifiedBy = (enriched as any).modifiedBy || createdBy;
    const rawSnake = toSnakeCase({
      ...enriched,
      createdBy,
      createdDate: now,
      modifiedBy,
      modifiedDate: now
    });
    return sanitizeUuidFields(normalizeTablePayload(tableName, rawSnake as Record<string, any>));
  });

  const insertedIds: string[] = [];
  const CHUNK_SIZE = 100;
  for (let i = 0; i < payloads.length; i += CHUNK_SIZE) {
    const chunk = payloads.slice(i, i + CHUNK_SIZE);
    const { data: inserted, error } = await supabase
      .from(tableName)
      .insert(chunk)
      .select('id');

    if (error) {
      console.error(`[Supabase createDocuments] Error creating documents in ${tableName}:`, error);
      throw new Error(`Failed to create documents in ${tableName}: ${error.message}`);
    }
    if (inserted) {
      insertedIds.push(...inserted.map(row => row.id));
    }
  }

  return insertedIds;
};

export const setDocument = async (
  collectionName: string,
  id: string,
  data: Record<string, any>
): Promise<void> => {
  const tableName = getTableName(collectionName);
  const enriched = enrichWithActiveSite(data);
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
  const snakeData = sanitizeUuidFields(normalizeTablePayload(tableName, rawSnake as Record<string, any>));

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

  if (error) {
    console.error(`[Supabase setDocument] Error upserting ${tableName}/${id}:`, error);
    throw new Error(`Failed to set document ${id} in ${tableName}: ${error.message}`);
  }
};

export const updateDocument = async (
  collectionName: string,
  id: string,
  data: Record<string, any>
): Promise<void> => {
  const tableName = getTableName(collectionName);
  const enriched = { ...data };
  delete enriched.id;
  delete enriched.ID;
  delete (enriched as any)._id;

  const enrichedWithSite = enrichWithActiveSite(enriched);
  
  const rawSnake = toSnakeCase({
    ...enrichedWithSite,
    modifiedBy: enrichedWithSite.modifiedBy,
    modifiedDate: new Date().toISOString(),
  });
  const snakeData = sanitizeUuidFields(normalizeTablePayload(tableName, rawSnake as Record<string, any>));
  delete snakeData.id;

  if (id.includes('_')) {
    const parts = id.split('_');
    if (parts.length === 2 && isValidUuid(parts[0]) && isValidUuid(parts[1])) {
      const { error } = await supabase
        .from(tableName)
        .update(snakeData)
        .eq('tenant_id', parts[0])
        .eq('site_id', parts[1]);

      if (error) {
        console.error(`[Supabase updateDocument] Error updating composite ${tableName}/${id}:`, error);
        throw new Error(`Failed to update document ${id} in ${tableName}: ${error.message}`);
      }
      return;
    }
  }

  if (!isValidUuid(id)) {
    return;
  }

  const { error } = await supabase
    .from(tableName)
    .update(snakeData)
    .eq('id', id);

  if (error) {
    console.error(`[Supabase updateDocument] Error updating ${tableName}/${id}:`, error);
    throw new Error(`Failed to update document ${id} in ${tableName}: ${error.message}`);
  }
};

export const deleteDocument = async (
  collectionName: string,
  id: string
): Promise<void> => {
  const tableName = getTableName(collectionName);

  if (id.includes('_')) {
    const parts = id.split('_');
    if (parts.length === 2 && isValidUuid(parts[0]) && isValidUuid(parts[1])) {
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('tenant_id', parts[0])
        .eq('site_id', parts[1]);

      if (error) {
        console.error(`[Supabase deleteDocument] Error deleting composite ${tableName}/${id}:`, error);
        throw new Error(`Failed to delete document ${id} from ${tableName}: ${error.message}`);
      }
      return;
    }
  }

  if (!isValidUuid(id)) {
    return;
  }

  const { error } = await supabase
    .from(tableName)
    .delete()
    .eq('id', id);

  if (error) {
    console.error(`[Supabase deleteDocument] Error deleting ${tableName}/${id}:`, error);
    throw new Error(`Failed to delete document ${id} from ${tableName}: ${error.message}`);
  }
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
    if (status === 'CHANNEL_ERROR' && onError) {
      onError(new Error(`Realtime channel error for ${tableName}/${id}`));
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
    if (status === 'CHANNEL_ERROR' && onError) {
      onError(new Error(`Realtime channel error for table ${tableName}`));
    }
  });

  return () => {
    supabase.removeChannel(channel);
  };
};

export const where = (field: string, op: string, value: any): QueryFilter => {
  return { field, op: op as any, value };
};

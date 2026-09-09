import { supabase } from '../config/supabase';
import { getTableName, toCamelCase, toSnakeCase } from '../utils/caseTransformers';
import { BaseDocument } from '../types/common';

export interface QueryFilter {
  field: string;
  op: '==' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'array-contains';
  value: any;
}

export const getDocument = async <T = any>(collectionName: string, id: string): Promise<T | null> => {
  const tableName = getTableName(collectionName);
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
      case 'in':
        dbQuery = dbQuery.in(snakeField, Array.isArray(f.value) ? f.value : [f.value]);
        break;
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

export const createDocument = async <T extends BaseDocument>(
  collectionName: string,
  data: Omit<T, 'id' | 'createdBy' | 'createdDate' | 'modifiedBy' | 'modifiedDate'>
): Promise<string> => {
  const tableName = getTableName(collectionName);
  
  const createdBy = (data as any).createdBy;
  const modifiedBy = (data as any).modifiedBy || createdBy;

  const snakeData = toSnakeCase({
    ...data,
    createdBy,
    createdDate: new Date().toISOString(),
    modifiedBy,
    modifiedDate: new Date().toISOString(),
  });

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

export const updateDocument = async (
  collectionName: string,
  id: string,
  data: Record<string, any>
): Promise<void> => {
  const tableName = getTableName(collectionName);
  
  const snakeData = toSnakeCase({
    ...data,
    modifiedBy: data.modifiedBy,
    modifiedDate: new Date().toISOString(),
  });

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
  const tableName = getTableName(collectionName);
  
  // Initial fetch
  getDocument<T>(collectionName, id)
    .then(data => onUpdate(data))
    .catch(err => onError ? onError(err) : console.error(err));

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

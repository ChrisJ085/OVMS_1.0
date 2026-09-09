import { supabase } from '../config/supabase';
import { getTableName, toCamelCase, toSnakeCase } from '../utils/caseTransformers';
import { BaseDocument, Timestamp as CommonTimestamp } from '../types/common';

const DEV_USER = 'development-user';

export type Timestamp = CommonTimestamp;
export type QueryConstraint = any;

export interface QueryFilter {
  field: string;
  op: '==' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'array-contains';
  value: any;
}

export const db = 'supabase_db';

export const where = (field: string, op: string, value: any): QueryFilter => {
  return { field, op: op as any, value };
};

export const orderBy = (field: string, dir: string = 'asc') => ({ type: 'orderBy', field, dir });
export const limit = (n: number) => ({ type: 'limit', n });

export const collection = (dbOrName: any, collectionName?: string) => {
  if (typeof dbOrName === 'string') {
    return collectionName ? collectionName : dbOrName;
  }
  return collectionName || 'default_collection';
};

export const doc = (dbOrColl: any, collOrId?: string, id?: string) => {
  if (id) {
    return { collection: collOrId, id };
  }
  if (collOrId && typeof dbOrColl === 'string') {
    if (dbOrColl === db) {
      return { collection: collOrId, id: '' };
    }
    return { collection: dbOrColl, id: collOrId };
  }
  return { collection: typeof dbOrColl === 'string' ? dbOrColl : 'default', id: collOrId || '' };
};

export const query = (coll: any, ...constraints: any[]) => {
  const collectionName = typeof coll === 'string' ? coll : (coll.collection || coll);
  const filters = constraints.flat().filter(c => c && c.field && c.op);
  return { collectionName, filters };
};

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

export const getDoc = async (docRef: any) => {
  const collectionName = typeof docRef === 'string' ? docRef : docRef.collection;
  const id = docRef.id || docRef;
  const data = await getDocument(collectionName, id);
  return {
    exists: () => data !== null,
    data: () => data,
    id,
    ref: { collection: collectionName, id }
  };
};

export const getDocs = async (queryOrColl: any) => {
  let collectionName = '';
  let filters: QueryFilter[] = [];

  if (typeof queryOrColl === 'string') {
    collectionName = queryOrColl;
  } else if (queryOrColl?.collectionName) {
    collectionName = queryOrColl.collectionName;
    filters = queryOrColl.filters || [];
  } else if (queryOrColl?.collection) {
    collectionName = queryOrColl.collection;
  }

  const items = await getDocuments(collectionName, filters);
  const docs = items.map((item: any) => ({
    id: item.id,
    data: () => item,
    exists: () => true,
    ref: { collection: collectionName, id: item.id }
  }));

  return {
    empty: docs.length === 0,
    size: docs.length,
    docs,
    forEach: (callback: (doc: any) => void) => docs.forEach(callback)
  };
};

export const getCountFromServer = async (queryOrColl: any) => {
  const docsResult = await getDocs(queryOrColl);
  return {
    data: () => ({ count: docsResult.size })
  };
};

export const createDocument = async <T extends BaseDocument>(
  collectionName: string,
  data: Omit<T, 'id' | 'createdBy' | 'createdDate' | 'modifiedBy' | 'modifiedDate'>
): Promise<string> => {
  const tableName = getTableName(collectionName);
  const snakeData = toSnakeCase({
    ...data,
    createdBy: (data as any).createdBy || DEV_USER,
    createdDate: new Date().toISOString(),
    modifiedBy: (data as any).modifiedBy || DEV_USER,
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

export const addDoc = async (collRef: any, data: any) => {
  const collectionName = typeof collRef === 'string' ? collRef : (collRef.collection || collRef);
  const id = await createDocument(collectionName, data);
  return { id, collection: collectionName };
};

export const setDoc = async (docRef: any, data: any, options?: any) => {
  const collectionName = docRef.collection;
  const id = docRef.id;
  if (options?.merge) {
    await updateDocument(collectionName, id, data);
  } else {
    await createDocument(collectionName, { ...data, id });
  }
};

export const updateDocument = async (
  collectionName: string,
  id: string,
  data: Record<string, any>
): Promise<void> => {
  const tableName = getTableName(collectionName);
  const snakeData = toSnakeCase({
    ...data,
    modifiedBy: data.modifiedBy || DEV_USER,
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

export const updateDoc = async (docRef: any, data: any) => {
  const collectionName = docRef.collection;
  const id = docRef.id;
  await updateDocument(collectionName, id, data);
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

export const deleteDoc = async (docRef: any) => {
  const collectionName = docRef.collection;
  const id = docRef.id;
  await deleteDocument(collectionName, id);
};

export const deactivateDocument = async (
  collectionName: string,
  id: string
): Promise<void> => {
  await updateDocument(collectionName, id, { status: 'inactive' });
};

export const serverTimestamp = () => new Date().toISOString();

export const Timestamp = {
  now: () => new Date().toISOString(),
  fromDate: (d: Date) => d.toISOString(),
  fromMillis: (m: number) => new Date(m).toISOString()
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

  // Realtime subscription natively
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

export const onSnapshot = (
  queryOrRef: any,
  onNext: (snapshot: any) => void,
  onError?: (err: any) => void
) => {
  if (typeof queryOrRef === 'string' || queryOrRef?.collectionName) {
    const collectionName = typeof queryOrRef === 'string' ? queryOrRef : queryOrRef.collectionName;
    const filters = queryOrRef?.filters || [];
    return subscribeToCollection(collectionName, filters, (items) => {
      const docs = items.map((item: any) => ({
        id: item.id,
        data: () => item,
        exists: () => true,
        ref: { collection: collectionName, id: item.id }
      }));
      onNext({
        empty: docs.length === 0,
        size: docs.length,
        docs,
        forEach: (cb: any) => docs.forEach(cb)
      });
    }, onError);
  } else if (queryOrRef?.collection && queryOrRef?.id) {
    return subscribeToDocument(queryOrRef.collection, queryOrRef.id, (data) => {
      onNext({
        exists: () => data !== null,
        data: () => data,
        id: queryOrRef.id,
      });
    }, onError);
  }
  return () => {};
};

export const writeBatch = (_db?: any) => {
  const operations: (() => Promise<void>)[] = [];
  return {
    set: (docRef: any, data: any) => {
      operations.push(() => createDocument(docRef.collection, data).then(() => {}));
    },
    update: (docRef: any, data: any) => {
      operations.push(() => updateDocument(docRef.collection, docRef.id, data));
    },
    delete: (docRef: any) => {
      operations.push(() => deleteDocument(docRef.collection, docRef.id));
    },
    commit: async () => {
      for (const op of operations) {
        await op();
      }
    }
  };
};

export const getBatch = writeBatch;

export const runTransaction = async <T>(
  _db: any,
  updateFunction: (transaction: any) => Promise<T>
): Promise<T> => {
  const dummyTx = {
    get: async (docRef: any) => {
      const docData = await getDocument(docRef.collection, docRef.id);
      return {
        exists: () => docData !== null,
        data: () => docData,
        id: docRef.id,
        ref: docRef
      };
    },
    set: (docRef: any, data: any) => {
      createDocument(docRef.collection, data);
    },
    update: (docRef: any, data: any) => {
      updateDocument(docRef.collection, docRef.id, data);
    },
    delete: (docRef: any) => {
      deleteDocument(docRef.collection, docRef.id);
    }
  };
  return updateFunction(dummyTx);
};

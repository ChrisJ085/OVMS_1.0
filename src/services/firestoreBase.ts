import {
  getDocument as sbGetDocument,
  getDocuments as sbGetDocuments,
  createDocument as sbCreateDocument,
  updateDocument as sbUpdateDocument,
  deleteDocument as sbDeleteDocument,
  deactivateDocument as sbDeactivateDocument,
  subscribeToDocument as sbSubscribeToDocument,
  subscribeToCollection as sbSubscribeToCollection,
  QueryFilter
} from './supabaseBase';
import { BaseDocument, Timestamp as CommonTimestamp } from '../types/common';

export type Timestamp = CommonTimestamp;

export const where = (field: string, op: string, value: any): QueryFilter => {
  return { field, op: op as any, value };
};

export const orderBy = (field: string, dir: string = 'asc') => ({ type: 'orderBy', field, dir });
export const limit = (n: number) => ({ type: 'limit', n });

export const collection = (dbOrName: any, collectionName?: string) => {
  return typeof dbOrName === 'string' ? dbOrName : (collectionName || dbOrName);
};

export const doc = (dbOrColl: any, collOrId?: string, id?: string) => {
  if (id) {
    return { collection: collOrId, id };
  }
  if (collOrId && typeof dbOrColl === 'string') {
    return { collection: dbOrColl, id: collOrId };
  }
  return { collection: dbOrColl, id: collOrId };
};

export const query = (coll: any, ...constraints: any[]) => {
  const collectionName = typeof coll === 'string' ? coll : (coll.collection || coll);
  const filters = constraints.flat().filter(c => c && c.field && c.op);
  return { collectionName, filters };
};

export const getDoc = async (docRef: any) => {
  const collectionName = typeof docRef === 'string' ? docRef : docRef.collection;
  const id = docRef.id || docRef;
  const data = await sbGetDocument(collectionName, id);
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

  const items = await sbGetDocuments(collectionName, filters);
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

export const addDoc = async (collRef: any, data: any) => {
  const collectionName = typeof collRef === 'string' ? collRef : (collRef.collection || collRef);
  const id = await sbCreateDocument(collectionName, data);
  return { id, collection: collectionName };
};

export const setDoc = async (docRef: any, data: any, options?: any) => {
  const collectionName = docRef.collection;
  const id = docRef.id;
  if (options?.merge) {
    await sbUpdateDocument(collectionName, id, data);
  } else {
    await sbCreateDocument(collectionName, { ...data, id });
  }
};

export const updateDoc = async (docRef: any, data: any) => {
  const collectionName = docRef.collection;
  const id = docRef.id;
  await sbUpdateDocument(collectionName, id, data);
};

export const deleteDoc = async (docRef: any) => {
  const collectionName = docRef.collection;
  const id = docRef.id;
  await sbDeleteDocument(collectionName, id);
};

export const serverTimestamp = () => new Date().toISOString();

export const Timestamp = {
  now: () => new Date().toISOString(),
  fromDate: (d: Date) => d.toISOString(),
  fromMillis: (m: number) => new Date(m).toISOString()
};

export const getDocument = sbGetDocument;
export const getDocuments = sbGetDocuments;

export const subscribeToDocument = <T = any>(
  collectionName: string,
  id: string,
  onUpdate: (data: T | null) => void,
  onError?: (error: Error) => void
) => {
  return sbSubscribeToDocument<T>(collectionName, id, onUpdate, onError);
};

export const subscribeToCollection = <T = any>(
  collectionName: string,
  constraints: any[],
  onUpdate: (data: T[]) => void,
  onError?: (error: Error) => void
) => {
  const filters = Array.isArray(constraints) ? constraints.filter((c: any) => c && c.field && c.op) : [];
  return sbSubscribeToCollection<T>(collectionName, filters, onUpdate, onError);
};

export const createDocument = sbCreateDocument;
export const updateDocument = sbUpdateDocument;
export const deleteDocument = sbDeleteDocument;
export const deactivateDocument = sbDeactivateDocument;

export const writeBatch = (db?: any) => {
  const operations: (() => Promise<void>)[] = [];
  return {
    set: (docRef: any, data: any) => {
      operations.push(() => sbCreateDocument(docRef.collection, data).then(() => {}));
    },
    update: (docRef: any, data: any) => {
      operations.push(() => sbUpdateDocument(docRef.collection, docRef.id, data));
    },
    delete: (docRef: any) => {
      operations.push(() => sbDeleteDocument(docRef.collection, docRef.id));
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
  db: any,
  updateFunction: (transaction: any) => Promise<T>
): Promise<T> => {
  const dummyTx = {
    get: async (docRef: any) => {
      const doc = await sbGetDocument(docRef.collection, docRef.id);
      return {
        exists: () => doc !== null,
        data: () => doc,
        id: docRef.id,
        ref: docRef
      };
    },
    set: (docRef: any, data: any) => {
      sbCreateDocument(docRef.collection, data);
    },
    update: (docRef: any, data: any) => {
      sbUpdateDocument(docRef.collection, docRef.id, data);
    },
    delete: (docRef: any) => {
      sbDeleteDocument(docRef.collection, docRef.id);
    }
  };
  return updateFunction(dummyTx);
};

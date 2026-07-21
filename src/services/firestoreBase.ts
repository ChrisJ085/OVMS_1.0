import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  QueryConstraint,
  serverTimestamp,
  DocumentData,
  onSnapshot,
  writeBatch,
  runTransaction,
  Transaction,
  WriteBatch
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { BaseDocument } from '../types/common';

const requireDb = () => {
  if (!db) {
    throw new Error('Firebase Firestore is not initialized. Please check your configuration.');
  }
  return db;
};

// Until authentication exists
const DEV_USER = 'development-user';

export const getDocument = async <T = DocumentData>(collectionName: string, id: string): Promise<T | null> => {
  const database = requireDb();
  const docRef = doc(database, collectionName, id);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as T;
  }
  return null;
};

export const subscribeToDocument = <T = DocumentData>(
  collectionName: string,
  id: string,
  onUpdate: (data: T | null) => void,
  onError: (error: Error) => void
) => {
  const database = requireDb();
  const docRef = doc(database, collectionName, id);
  return onSnapshot(
    docRef,
    (docSnap) => {
      if (docSnap.exists()) {
        onUpdate({ id: docSnap.id, ...docSnap.data() } as T);
      } else {
        onUpdate(null);
      }
    },
    onError
  );
};

export const subscribeToCollection = <T = DocumentData>(
  collectionName: string,
  constraints: QueryConstraint[],
  onUpdate: (data: T[]) => void,
  onError: (error: Error) => void
) => {
  const database = requireDb();
  const collRef = collection(database, collectionName);
  const q = query(collRef, ...constraints);
  
  return onSnapshot(
    q,
    (querySnapshot) => {
      const items = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
      onUpdate(items);
    },
    onError
  );
};

export const createDocument = async <T extends BaseDocument>(
  collectionName: string,
  data: Omit<T, 'id' | 'createdBy' | 'createdDate' | 'modifiedBy' | 'modifiedDate'>
): Promise<string> => {
  const database = requireDb();
  const collRef = collection(database, collectionName);
  const docData = {
    ...data,
    createdBy: DEV_USER,
    createdDate: serverTimestamp(),
    modifiedBy: DEV_USER,
    modifiedDate: serverTimestamp(),
  };
  const docRef = await addDoc(collRef, docData);
  return docRef.id;
};

export const updateDocument = async (
  collectionName: string,
  id: string,
  data: Partial<DocumentData>
): Promise<void> => {
  const database = requireDb();
  const docRef = doc(database, collectionName, id);
  await updateDoc(docRef, {
    ...data,
    modifiedBy: DEV_USER,
    modifiedDate: serverTimestamp(),
  });
};

export const deactivateDocument = async (
  collectionName: string,
  id: string
): Promise<void> => {
  const database = requireDb();
  const docRef = doc(database, collectionName, id);
  await updateDoc(docRef, {
    status: 'inactive',
    modifiedBy: DEV_USER,
    modifiedDate: serverTimestamp(),
  });
};

export const getBatch = (): WriteBatch => {
  const database = requireDb();
  return writeBatch(database);
};

export const executeTransaction = async <T>(
  updateFunction: (transaction: Transaction) => Promise<T>
): Promise<T> => {
  const database = requireDb();
  return runTransaction(database, updateFunction);
};

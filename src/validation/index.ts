import { Timestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';

export const isRequired = (value: string | undefined | null): boolean => {
  if (value === undefined || value === null) return false;
  return value.trim().length > 0;
};

export const trimCode = (value: string): string => {
  return value ? value.trim().toUpperCase() : '';
};

export const trimDescription = (value: string): string => {
  return value ? value.trim() : '';
};

export const isNonNegative = (value: number | undefined | null): boolean => {
  if (value === undefined || value === null) return false;
  return value >= 0;
};

export const isValidStockRange = (minimum: number, target: number, maximum: number): boolean => {
  return minimum >= 0 && minimum <= target && target <= maximum;
};

export const isValidEffectiveDateRange = (startDate: Date, endDate: Date | null): boolean => {
  if (!endDate) return true;
  return startDate <= endDate;
};

export const isValidDateRange = (startDate: Date, expiryDate: Date): boolean => {
  return startDate <= expiryDate;
};

export const toFirestoreTimestamp = (date: Date): Timestamp => {
  return Timestamp.fromDate(date);
};

export const isUniqueCode = async (
  collectionName: string,
  tenantId: string,
  siteId: string,
  codeField: string,
  codeValue: string,
  excludeId?: string
): Promise<boolean> => {
  if (!db) throw new Error('Firestore not initialized');
  
  const collRef = collection(db, collectionName);
  const q = query(
    collRef,
    where('tenantId', '==', tenantId),
    where('siteId', '==', siteId),
    where(codeField, '==', codeValue)
  );
  
  const querySnapshot = await getDocs(q);
  if (querySnapshot.empty) return true;
  
  if (excludeId) {
    // If it only found the exact same document, it's not a duplicate
    const docs = querySnapshot.docs.filter(doc => doc.id !== excludeId);
    return docs.length === 0;
  }
  
  return false;
};

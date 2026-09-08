import { AuditEvent } from '../types/audit';
import { addDoc, collection, db, getDocs, limit, orderBy, query, serverTimestamp, where } from './firestoreBase';

function cleanUndefined(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (Array.isArray(obj)) return obj.map(cleanUndefined);
  if (typeof obj === 'object' && !(obj instanceof Date) && !obj.toDate && !obj._methodName) {
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
  if (!db) return null;
  try {
    const sanitized = cleanUndefined(event);
    const docRef = await addDoc(collection(db, 'auditLogs'), {
      ...sanitized,
      timestamp: serverTimestamp()
    });
    return docRef.id;
  } catch (err) {
    console.warn('Failed to log audit event:', err);
    return null;
  }
};


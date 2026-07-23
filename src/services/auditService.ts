import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { AuditEvent } from '../types/audit';

export const logAuditEvent = async (
  event: Omit<AuditEvent, 'id' | 'timestamp'>
): Promise<string | null> => {
  if (!db) return null;
  try {
    const docRef = await addDoc(collection(db, 'auditLogs'), {
      ...event,
      timestamp: serverTimestamp()
    });
    return docRef.id;
  } catch (err) {
    console.warn('Failed to log audit event:', err);
    return null;
  }
};

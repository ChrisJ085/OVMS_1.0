import { collection, doc, getDoc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { SiteSettings } from '../../../types/settings';
import { AuditEvent } from '../../../types/audit';

const COLLECTION = 'siteSettings';
const AUDIT_COLLECTION = 'auditLogs';

export const getSiteSettings = async (tenantId: string, siteId: string): Promise<SiteSettings | null> => {
  if (!tenantId || !siteId) return null;
  const docRef = doc(db, COLLECTION, `${tenantId}_${siteId}`);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    return { id: snap.id, ...snap.data() } as SiteSettings;
  }
  return null;
};

export const updateSiteSettings = async (
  tenantId: string, 
  siteId: string, 
  settings: Partial<SiteSettings>,
  userId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const docId = `${tenantId}_${siteId}`;
    const docRef = doc(db, COLLECTION, docId);
    
    const existing = await getDoc(docRef);
    const prevData = existing.exists() ? existing.data() : null;
    
    const payload = {
      ...settings,
      tenantId,
      siteId,
      modifiedBy: userId,
      modifiedDate: serverTimestamp()
    };
    
    if (existing.exists()) {
      await updateDoc(docRef, payload);
    } else {
      await setDoc(docRef, payload);
    }
    
    // Log audit event
    await createAuditLog({
      tenantId,
      siteId,
      eventType: 'SETTINGS_UPDATE',
      entityType: 'SiteSettings',
      entityId: docId,
      summary: 'Updated site configuration settings',
      previousValue: prevData,
      newValue: payload,
      performedBy: userId,
      timestamp: serverTimestamp()
    });
    
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

export const createAuditLog = async (log: Omit<AuditEvent, 'id'>) => {
  const newRef = doc(collection(db, AUDIT_COLLECTION));
  await setDoc(newRef, log);
};

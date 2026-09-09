import { UserProfile, UserSession } from '../../../types/auth';
import { Timestamp, collection, doc, setDoc, updateDoc } from '../../../services/supabaseBase';

export async function createSessionRecord(profile: UserProfile, activeSiteId: string): Promise<string | null> {
  try {
    const sessRef = doc(collection('sessions'));
    const sessionPayload: UserSession = {
      id: sessRef.id,
      userId: profile.uid,
      tenantId: profile.tenantId,
      siteId: activeSiteId,
      loginAt: Timestamp.now(),
      lastActivityAt: Timestamp.now(),
      logoutAt: null,
      status: 'ACTIVE',
      deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'Server/App',
      createdDate: Timestamp.now(),
      modifiedDate: Timestamp.now()
    };
    await setDoc(sessRef, sessionPayload);
    return sessRef.id;
  } catch (err) {
    console.warn('Could not track session start:', err);
    return null;
  }
}

export async function updateSessionActivityRecord(sessionId: string): Promise<void> {
  if (!sessionId) return;
  try {
    await updateDoc(doc('sessions', sessionId), {
      lastActivityAt: Timestamp.now(),
      modifiedDate: Timestamp.now()
    });
  } catch (err) {
    // Ignore activity log failures
  }
}

export async function updateSessionSiteContext(sessionId: string, newSiteId: string): Promise<void> {
  if (!sessionId) return;
  try {
    await updateDoc(doc('sessions', sessionId), {
      siteId: newSiteId,
      modifiedDate: Timestamp.now()
    });
  } catch (err) {
    // Ignore site update failures
  }
}

export async function closeSessionRecord(sessionId: string): Promise<void> {
  if (!sessionId) return;
  try {
    await updateDoc(doc('sessions', sessionId), {
      logoutAt: Timestamp.now(),
      status: 'LOGGED_OUT',
      modifiedDate: Timestamp.now()
    });
  } catch (err) {
    // Ignore logout session write errors
  }
}

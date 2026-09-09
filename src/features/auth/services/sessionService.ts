import { UserProfile } from '../../../types/auth';
import { supabase } from '../../../config/supabase';
import { toSnakeCase } from '../../../utils/caseTransformers';

export async function createSessionRecord(profile: UserProfile, activeSiteId: string): Promise<string | null> {
  try {
    const sessionPayload = toSnakeCase({
      userId: profile.uid,
      tenantId: profile.tenantId,
      siteId: activeSiteId,
      loginAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      logoutAt: null,
      status: 'ACTIVE',
      deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'Server/App',
      createdDate: new Date().toISOString(),
      modifiedDate: new Date().toISOString()
    });

    const { data, error } = await supabase
      .from('sessions')
      .insert(sessionPayload)
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  } catch (err) {
    console.warn('Could not track session start:', err);
    return null;
  }
}

export async function updateSessionActivityRecord(sessionId: string): Promise<void> {
  if (!sessionId) return;
  try {
    await supabase
      .from('sessions')
      .update({
        last_activity_at: new Date().toISOString(),
        modified_date: new Date().toISOString()
      })
      .eq('id', sessionId);
  } catch (err) {
    // Ignore activity log failures
  }
}

export async function updateSessionSiteContext(sessionId: string, newSiteId: string): Promise<void> {
  if (!sessionId) return;
  try {
    await supabase
      .from('sessions')
      .update({
        site_id: newSiteId,
        modified_date: new Date().toISOString()
      })
      .eq('id', sessionId);
  } catch (err) {
    // Ignore site update failures
  }
}

export async function closeSessionRecord(sessionId: string): Promise<void> {
  if (!sessionId) return;
  try {
    await supabase
      .from('sessions')
      .update({
        logout_at: new Date().toISOString(),
        status: 'LOGGED_OUT',
        modified_date: new Date().toISOString()
      })
      .eq('id', sessionId);
  } catch (err) {
    // Ignore logout session write errors
  }
}

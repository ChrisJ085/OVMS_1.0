import { supabase } from '../../../config/supabase';
import { UserProfile } from '../../../types/auth';
import { AppError, toAppError } from '../../../types/error';
import { toCamelCase } from '../../../utils/caseTransformers';

export async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const { data: userRow, error } = await supabase
      .from('users')
      .select('*, user_sites(site_id)')
      .eq('id', uid)
      .maybeSingle();

    if (error) {
      console.error('[fetchUserProfile] Error fetching user profile:', error);
      throw error;
    }

    if (!userRow) {
      return null;
    }

    const siteIds = Array.isArray(userRow.user_sites)
      ? userRow.user_sites.map((us: any) => us.site_id)
      : [];

    const profile: UserProfile = {
      id: userRow.id,
      uid: userRow.id,
      email: userRow.email,
      displayName: userRow.display_name || userRow.email,
      jobTitle: userRow.job_title || '',
      role: userRow.role,
      tenantId: userRow.tenant_id,
      siteIds,
      accountStatus: userRow.account_status || 'ACTIVE',
      requiresPasswordChange: Boolean(userRow.requires_password_change),
      failedLoginAttempts: userRow.failed_login_attempts || 0,
      failedAttemptWindowStartedAt: null,
      lockedAt: null,
      lastLoginAt: userRow.last_login_at || null,
      passwordChangedAt: userRow.password_changed_at || null,
      createdBy: userRow.created_by || 'SYSTEM',
      createdDate: userRow.created_at || new Date().toISOString(),
      modifiedBy: userRow.modified_by || 'SYSTEM',
      modifiedDate: userRow.updated_at || new Date().toISOString()
    };

    return profile;
  } catch (err) {
    throw toAppError(err, 'Failed to fetch user profile.', 'PROFILE_FETCH_FAILED');
  }
}

export async function markPasswordChangedInProfile(uid: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('users')
      .update({
        requires_password_change: false,
        password_changed_at: new Date().toISOString(),
        modified_by: uid,
        updated_at: new Date().toISOString()
      })
      .eq('id', uid);

    if (error) {
      throw error;
    }
  } catch (err) {
    throw toAppError(err, 'Failed to update user profile password status.', 'PROFILE_UPDATE_FAILED');
  }
}

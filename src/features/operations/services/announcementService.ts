import { Announcement } from '../../../types/announcement';
import { ServiceResult } from '../../../types/common';
import { supabase } from '../../../config/supabase';
import { toSnakeCase } from '../../../utils/caseTransformers';

export interface AuthorIdentity {
  uid: string;
  displayName?: string | null;
  email?: string | null;
}

export const createAnnouncement = async (
  announcement: Omit<Announcement, 'id' | 'createdDate' | 'modifiedDate' | 'createdBy' | 'modifiedBy' | 'status'>,
  author: string | AuthorIdentity
): Promise<ServiceResult<string>> => {
  try {
    if (announcement.displayOnTv && announcement.message.length > 200) {
      return { success: false, error: 'TV Announcements must be 200 characters or less' };
    }

    const uid = typeof author === 'string' ? author : author.uid;
    const displayName = typeof author === 'string' ? author : (author.displayName || author.email || author.uid);
    const validUid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid) ? uid : null;

    const rawPayload = {
      ...announcement,
      status: 'active',
      createdBy: validUid,
      createdByName: displayName,
      modifiedBy: validUid,
      modifiedByName: displayName,
      createdDate: new Date().toISOString(),
      modifiedDate: new Date().toISOString()
    };

    const dbRow = toSnakeCase(rawPayload);

    const { data, error } = await supabase
      .from('announcements')
      .insert(dbRow)
      .select('id')
      .single();

    if (error) throw error;
    return { success: true, data: data.id };
  } catch (error: any) {
    console.error('Error creating announcement:', error);
    return { success: false, error: error.message };
  }
};

export const updateAnnouncement = async (
  id: string,
  updates: Partial<Omit<Announcement, 'id' | 'createdDate' | 'createdBy'>>,
  author: string | AuthorIdentity
): Promise<ServiceResult<void>> => {
  try {
    if (updates.displayOnTv && updates.message && updates.message.length > 200) {
      return { success: false, error: 'TV Announcements must be 200 characters or less' };
    }

    const uid = typeof author === 'string' ? author : author.uid;
    const displayName = typeof author === 'string' ? author : (author.displayName || author.email || author.uid);
    const validUid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid) ? uid : null;

    const rawUpdates = {
      ...updates,
      modifiedBy: validUid,
      modifiedByName: displayName,
      modifiedDate: new Date().toISOString()
    };

    const dbUpdates = toSnakeCase(rawUpdates);

    const { error } = await supabase
      .from('announcements')
      .update(dbUpdates)
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error updating announcement:', error);
    return { success: false, error: error.message };
  }
};

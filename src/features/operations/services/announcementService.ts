import { Announcement } from '../../../types/announcement';
import { ServiceResult } from '../../../types/common';
import { Timestamp, addDoc, collection, db, doc, getDoc, getDocs, query, updateDoc, where, writeBatch } from '../../../services/firestoreBase';

const COLLECTION = 'announcements';

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

    const docRef = await addDoc(collection(db, COLLECTION), {
      ...announcement,
      status: 'active',
      createdDate: Timestamp.now(),
      modifiedDate: Timestamp.now(),
      createdBy: uid,
      createdByName: displayName,
      modifiedBy: uid,
      modifiedByName: displayName
    });
    return { success: true, data: docRef.id };
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

    const docRef = doc(db, COLLECTION, id);
    await updateDoc(docRef, {
      ...updates,
      modifiedDate: Timestamp.now(),
      modifiedBy: uid,
      modifiedByName: displayName
    });
    return { success: true };
  } catch (error: any) {
    console.error('Error updating announcement:', error);
    return { success: false, error: error.message };
  }
};

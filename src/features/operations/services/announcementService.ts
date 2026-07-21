import { collection, doc, getDocs, query, where, addDoc, updateDoc, Timestamp, writeBatch, getDoc } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { Announcement } from '../../../types/announcement';
import { ServiceResult } from '../../../types/common';

const COLLECTION = 'announcements';

export const createAnnouncement = async (
  announcement: Omit<Announcement, 'id' | 'createdDate' | 'modifiedDate' | 'createdBy' | 'modifiedBy' | 'status'>,
  userId: string
): Promise<ServiceResult<string>> => {
  try {
    if (announcement.displayOnTv && announcement.message.length > 200) {
      return { success: false, error: 'TV Announcements must be 200 characters or less' };
    }

    const docRef = await addDoc(collection(db, COLLECTION), {
      ...announcement,
      status: 'active',
      createdDate: Timestamp.now(),
      modifiedDate: Timestamp.now(),
      createdBy: userId,
      modifiedBy: userId
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
  userId: string
): Promise<ServiceResult<void>> => {
  try {
    if (updates.displayOnTv && updates.message && updates.message.length > 200) {
      return { success: false, error: 'TV Announcements must be 200 characters or less' };
    }

    const docRef = doc(db, COLLECTION, id);
    await updateDoc(docRef, {
      ...updates,
      modifiedDate: Timestamp.now(),
      modifiedBy: userId
    });
    return { success: true };
  } catch (error: any) {
    console.error('Error updating announcement:', error);
    return { success: false, error: error.message };
  }
};

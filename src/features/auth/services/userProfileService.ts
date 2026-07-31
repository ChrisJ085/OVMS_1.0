import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { UserProfile } from '../../../types/auth';
import { AppError, toAppError } from '../../../types/error';

export async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  if (!db) return null;
  try {
    const userDocRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userDocRef);

    if (!userSnap.exists()) {
      return null;
    }

    const data = userSnap.data() as UserProfile;
    return data;
  } catch (err) {
    throw toAppError(err, 'Failed to fetch user profile.', 'PROFILE_FETCH_FAILED');
  }
}

export async function markPasswordChangedInProfile(uid: string): Promise<void> {
  if (!db) return;
  try {
    const userDocRef = doc(db, 'users', uid);
    await updateDoc(userDocRef, {
      requiresPasswordChange: false,
      passwordChangedAt: serverTimestamp(),
      modifiedBy: uid,
      modifiedDate: serverTimestamp()
    });
  } catch (err) {
    throw toAppError(err, 'Failed to update user profile password status.', 'PROFILE_UPDATE_FAILED');
  }
}

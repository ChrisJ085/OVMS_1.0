import { 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut, 
  updatePassword as firebaseUpdatePassword,
  User as FirebaseUser
} from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, app } from '../../../config/firebase';
import { AppError, toAppError } from '../../../types/error';

export async function loginWithEmail(email: string, pass: string): Promise<FirebaseUser> {
  if (!auth) {
    throw {
      userMessage: 'Authentication service is not configured.',
      code: 'AUTH_NOT_CONFIGURED'
    } as AppError;
  }

  try {
    const credential = await signInWithEmailAndPassword(auth, email, pass);
    return credential.user;
  } catch (err) {
    // Record failure in background
    try {
      if (app) {
        const functionsInstance = getFunctions(app);
        const recordFailure = httpsCallable(functionsInstance, 'recordLoginFailure');
        await recordFailure({ email });
      }
    } catch (logErr) {
      console.warn('Failed to report login failure:', logErr);
    }
    throw toAppError(err, 'Invalid email or password.', 'AUTH_LOGIN_FAILED');
  }
}

export async function logoutUser(): Promise<void> {
  if (!auth) return;
  try {
    await firebaseSignOut(auth);
  } catch (err) {
    throw toAppError(err, 'Failed to log out.', 'AUTH_LOGOUT_FAILED');
  }
}

export async function changeUserPassword(newPass: string): Promise<void> {
  const activeUser = auth?.currentUser;
  if (!activeUser) {
    throw {
      userMessage: 'You must be logged in to change your password.',
      code: 'AUTH_UNAUTHENTICATED'
    } as AppError;
  }

  try {
    await firebaseUpdatePassword(activeUser, newPass);
  } catch (err) {
    throw toAppError(err, 'Failed to update password.', 'AUTH_PASSWORD_CHANGE_FAILED');
  }
}

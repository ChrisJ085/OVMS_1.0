import { supabase } from '../../../config/supabase';
import { AppError, toAppError } from '../../../types/error';

export async function loginWithEmail(email: string, pass: string): Promise<any> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: pass
    });

    if (error) {
      throw error;
    }

    return data.user;
  } catch (err) {
    throw toAppError(err, 'Invalid email or password.', 'AUTH_LOGIN_FAILED');
  }
}

export async function logoutUser(): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
  } catch (err) {
    throw toAppError(err, 'Failed to log out.', 'AUTH_LOGOUT_FAILED');
  }
}

export async function changeUserPassword(newPass: string): Promise<void> {
  try {
    const { error } = await supabase.auth.updateUser({
      password: newPass
    });
    if (error) {
      throw error;
    }
  } catch (err) {
    throw toAppError(err, 'Failed to update password.', 'AUTH_PASSWORD_CHANGE_FAILED');
  }
}

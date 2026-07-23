export interface AppError {
  userMessage: string;
  code: string;
  retryAction?: () => void;
  diagnosticInfo?: Record<string, any>;
}

export type Result<T, E = AppError> =
  | { success: true; data: T }
  | { success: false; error: E };

export function toAppError(error: unknown, fallbackMessage = 'An unexpected error occurred.', code = 'UNKNOWN_ERROR'): AppError {
  if (typeof error === 'object' && error !== null && 'userMessage' in error && 'code' in error) {
    return error as AppError;
  }
  const rawMessage = error instanceof Error ? error.message : String(error);
  
  let userMessage = fallbackMessage;
  if (rawMessage.includes('auth/user-not-found') || rawMessage.includes('auth/wrong-password') || rawMessage.includes('auth/invalid-credential')) {
    userMessage = 'Invalid email or password.';
  } else if (rawMessage.includes('auth/too-many-requests')) {
    userMessage = 'Too many failed attempts. Please try again later.';
  } else if (rawMessage.includes('permission-denied') || rawMessage.includes('Missing or insufficient permissions')) {
    userMessage = 'You do not have permission to perform this action.';
  } else if (!rawMessage.includes('Firebase') && !rawMessage.includes('auth/') && !rawMessage.includes('Error:')) {
    userMessage = rawMessage;
  }

  return {
    userMessage,
    code,
    diagnosticInfo: { rawMessage }
  };
}

export type DataLoadingState = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export interface AsyncData<T> {
  state: DataLoadingState;
  data: T | null;
  error: AppError | null;
}

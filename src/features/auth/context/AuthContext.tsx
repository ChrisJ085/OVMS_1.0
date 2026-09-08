import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../../../config/supabase';
import { UserProfile } from '../../../types/auth';
import { AppError, toAppError } from '../../../types/error';
import { loginWithEmail, logoutUser, changeUserPassword } from '../services/authService';
import { fetchUserProfile, markPasswordChangedInProfile } from '../services/userProfileService';
import { hasPermission as checkRolePermission, Permission } from '../../../config/rolePermissions';

export interface AuthContextType {
  user: any | null;
  userProfile: UserProfile | null;
  currentUser: string;
  loading: boolean;
  authError: AppError | null;
  requiresPasswordChange: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (newPass: string) => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<AppError | null>(null);
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        setLoading(true);
        const sbUser = session?.user || null;

        if (sbUser) {
          setAuthError(null);
          setUser(sbUser);
          const profile = await fetchUserProfile(sbUser.id);
          
          if (!profile) {
            await logoutUser();
            setUser(null);
            setUserProfile(null);
            setAuthError({
              userMessage: 'Your account has not been provisioned for OVMS. Please contact an administrator.',
              code: 'PROFILE_NOT_PROVISIONED'
            });
            return;
          }

          if (profile.accountStatus && (profile.accountStatus as string) !== 'ACTIVE' && (profile.accountStatus as string) !== 'active') {
            await logoutUser();
            setUser(null);
            setUserProfile(null);
            setAuthError({
              userMessage: `Your account is currently ${profile.accountStatus.toLowerCase()}. Please contact your administrator.`,
              code: 'ACCOUNT_LOCKED'
            });
            return;
          }

          if (profile.tenantId && profile.role !== 'PLATFORM_SUPERUSER') {
            try {
              const { data: tenantRow } = await supabase
                .from('tenants')
                .select('status')
                .eq('id', profile.tenantId)
                .maybeSingle();

              if (tenantRow) {
                const tenantStatus = tenantRow.status;
                if (tenantStatus === 'inactive' || tenantStatus === 'DELETION_PENDING') {
                  await logoutUser();
                  setUser(null);
                  setUserProfile(null);
                  setAuthError({
                    userMessage: `Your organization's account is currently ${tenantStatus === 'inactive' ? 'inactive' : 'pending deletion'}. Please contact support.`,
                    code: 'TENANT_DEACTIVATED'
                  });
                  return;
                }
              }
            } catch (err) {
              console.error('Failed to verify tenant status:', err);
            }
          }

          setUserProfile(profile);
          setRequiresPasswordChange(profile.requiresPasswordChange);
        } else {
          setUser(null);
          setUserProfile(null);
          setRequiresPasswordChange(false);
        }
      } catch (err) {
        console.error('Auth state change error:', err);
        setAuthError(toAppError(err, 'Failed to sync authentication.', 'AUTH_SYNC_FAILED'));
      } finally {
        setLoading(false);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (userProfile?.tenantId && userProfile.role !== 'PLATFORM_SUPERUSER') {
      const channel = supabase
        .channel(`tenant_status_check_${userProfile.tenantId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'tenants',
            filter: `id=eq.${userProfile.tenantId}`
          },
          async (payload) => {
            const tenantStatus = payload.new?.status;
            if (tenantStatus === 'inactive' || tenantStatus === 'DELETION_PENDING') {
              await logoutUser();
              setUser(null);
              setUserProfile(null);
              setAuthError({
                userMessage: `Your organization's account is currently ${tenantStatus === 'inactive' ? 'inactive' : 'pending deletion'}. Please contact support.`,
                code: 'TENANT_DEACTIVATED'
              });
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [userProfile?.tenantId, userProfile?.role]);

  const login = async (email: string, pass: string) => {
    setLoading(true);
    setAuthError(null);
    try {
      await loginWithEmail(email, pass);
    } catch (err: any) {
      setAuthError(toAppError(err, 'Invalid email or password.', 'LOGIN_FAILED'));
      setLoading(false);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await logoutUser();
    } finally {
      setUser(null);
      setUserProfile(null);
      setRequiresPasswordChange(false);
      setAuthError(null);
    }
  };

  const changePassword = async (newPass: string) => {
    if (!user || !userProfile) {
      throw new Error('Not logged in');
    }
    setLoading(true);
    try {
      await changeUserPassword(newPass);
      await markPasswordChangedInProfile(user.id || user.uid);
      setRequiresPasswordChange(false);
      setUserProfile(prev => (prev ? { ...prev, requiresPasswordChange: false } : null));
    } catch (err) {
      const appErr = toAppError(err, 'Failed to update password.', 'PASSWORD_CHANGE_FAILED');
      setAuthError(appErr);
      throw appErr;
    } finally {
      setLoading(false);
    }
  };

  const hasPermission = (permission: Permission): boolean => {
    if (!userProfile) return false;
    return checkRolePermission(userProfile.role, permission);
  };

  const clearAuthError = () => setAuthError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        currentUser: user?.id || user?.uid || '',
        loading,
        authError,
        requiresPasswordChange,
        login,
        logout,
        changePassword,
        hasPermission,
        clearAuthError
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

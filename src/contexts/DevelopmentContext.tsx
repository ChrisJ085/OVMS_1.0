import React, { ReactNode } from 'react';
import { AuthProvider, useAuth } from '../features/auth/context/AuthContext';
import { SiteProvider, useSiteContext } from './SiteContext';
import { SessionProvider, useSession } from '../features/auth/context/SessionContext';
import { Site } from '../types/site';

export type { Site };

export const DevelopmentProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <AuthProvider>
      <SiteProvider>
        <SessionProvider>
          {children}
        </SessionProvider>
      </SiteProvider>
    </AuthProvider>
  );
};

export const useDevelopmentContext = () => {
  const auth = useAuth();
  const site = useSiteContext();

  return {
    ...site,
    developmentMode: import.meta.env.DEV || import.meta.env.VITE_DEV_MODE === 'true',
    
    user: auth.user,
    userProfile: auth.userProfile,
    currentUser: auth.currentUser,
    loading: auth.loading,
    authError: auth.authError ? auth.authError.userMessage : null,
    requiresPasswordChange: auth.requiresPasswordChange,

    login: auth.login,
    logout: auth.logout,
    changePassword: auth.changePassword,
  };
};

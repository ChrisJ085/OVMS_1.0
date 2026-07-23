import React, { ReactNode } from 'react';
import { AuthProvider } from '../features/auth/context/AuthContext';
import { SiteProvider } from '../contexts/SiteContext';
import { SessionProvider } from '../features/auth/context/SessionContext';

export const AppProviders: React.FC<{ children: ReactNode }> = ({ children }) => {
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

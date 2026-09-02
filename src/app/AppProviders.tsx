import React, { ReactNode } from 'react';
import { AuthProvider } from '../features/auth/context/AuthContext';
import { SiteProvider } from '../contexts/SiteContext';
import { SessionProvider } from '../features/auth/context/SessionContext';
import { RecommendationGenerationProvider } from '../features/planning/context/RecommendationGenerationContext';
import { DataFreshnessProvider } from '../features/planning/context/DataFreshnessContext';

export const AppProviders: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <AuthProvider>
      <SiteProvider>
        <SessionProvider>
          <DataFreshnessProvider>
            <RecommendationGenerationProvider>
              {children}
            </RecommendationGenerationProvider>
          </DataFreshnessProvider>
        </SessionProvider>
      </SiteProvider>
    </AuthProvider>
  );
};

import React, { ReactNode } from 'react';
import { AuthProvider } from '../features/auth/context/AuthContext';
import { SiteProvider } from '../contexts/SiteContext';
import { SessionProvider } from '../features/auth/context/SessionContext';
import { RecommendationGenerationProvider } from '../features/planning/context/RecommendationGenerationContext';
import { DataFreshnessProvider } from '../features/planning/context/DataFreshnessContext';
import { EnvironmentModeProvider } from '../contexts/EnvironmentModeContext';
import { UserFavoritesProvider } from '../contexts/UserFavoritesContext';
import { SidebarProvider } from '../contexts/SidebarContext';

export const AppProviders: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <EnvironmentModeProvider>
      <AuthProvider>
        <SiteProvider>
          <SessionProvider>
            <UserFavoritesProvider>
              <SidebarProvider>
                <DataFreshnessProvider>
                  <RecommendationGenerationProvider>
                    {children}
                  </RecommendationGenerationProvider>
                </DataFreshnessProvider>
              </SidebarProvider>
            </UserFavoritesProvider>
          </SessionProvider>
        </SiteProvider>
      </AuthProvider>
    </EnvironmentModeProvider>
  );
};

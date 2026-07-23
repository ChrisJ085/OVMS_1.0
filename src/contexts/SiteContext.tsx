import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Site } from '../types/site';
import { DEFAULT_SITES, fetchUserPermittedSites } from '../features/administration/services/siteService';
import { useAuth } from '../features/auth/context/AuthContext';

export interface SiteContextType extends Site {
  site: Site;
  setSite: (site: Site) => void;
  availableSites: Site[];
}

const SiteContext = createContext<SiteContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'ovms_dev_context';

export const SiteProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { userProfile } = useAuth();

  const [site, setSiteState] = useState<Site>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved) as Site;
      } catch (e) {
        console.error('Failed to parse saved site context', e);
      }
    }
    return DEFAULT_SITES[0];
  });

  const [availableSites, setAvailableSites] = useState<Site[]>(DEFAULT_SITES);

  // Sync available sites whenever userProfile changes
  useEffect(() => {
    let isMounted = true;

    async function syncSites() {
      if (!userProfile) {
        if (isMounted) setAvailableSites(DEFAULT_SITES);
        return;
      }

      const sites = await fetchUserPermittedSites(userProfile);
      if (!isMounted) return;

      setAvailableSites(sites);

      // Validate if current active site is permitted for user
      const isCurrentSiteValid = sites.some(s => s.tenantId === site.tenantId && s.siteId === site.siteId);
      if (!isCurrentSiteValid && sites.length > 0) {
        setSiteState(sites[0]);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sites[0]));
      }
    }

    syncSites();

    return () => {
      isMounted = false;
    };
  }, [userProfile]);

  const setSite = (newSite: Site) => {
    setSiteState(newSite);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newSite));
  };

  return (
    <SiteContext.Provider
      value={{
        ...site,
        site,
        setSite,
        availableSites
      }}
    >
      {children}
    </SiteContext.Provider>
  );
};

export const useSiteContext = () => {
  const context = useContext(SiteContext);
  if (context === undefined) {
    throw new Error('useSiteContext must be used within a SiteProvider');
  }
  return context;
};

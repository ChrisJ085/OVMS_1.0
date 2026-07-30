import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Site } from '../types/site';
import { DEFAULT_SITES, fetchUserPermittedSites } from '../features/administration/services/siteService';
import { useAuth } from '../features/auth/context/AuthContext';

export interface SiteContextType {
  tenantId: string;
  tenantName: string;
  siteId: string;
  siteName: string;
  timezone: string;
  site: Site | null;
  setSite: (site: Site) => void;
  availableSites: Site[];
  siteLoading: boolean;
  siteReady: boolean;
  siteError: string | null;
}

const SiteContext = createContext<SiteContextType | undefined>(undefined);

const NEW_LOCAL_STORAGE_KEY = 'ovms_active_site';
const OLD_LOCAL_STORAGE_KEY = 'ovms_dev_context';

function isValidSite(data: any): data is Site {
  return (
    data !== null &&
    typeof data === 'object' &&
    typeof data.tenantId === 'string' && data.tenantId.trim() !== '' &&
    typeof data.tenantName === 'string' && data.tenantName.trim() !== '' &&
    typeof data.siteId === 'string' && data.siteId.trim() !== '' &&
    typeof data.siteName === 'string' && data.siteName.trim() !== '' &&
    typeof data.timezone === 'string' && data.timezone.trim() !== ''
  );
}

function getStoredSite(): Site | null {
  const newSaved = localStorage.getItem(NEW_LOCAL_STORAGE_KEY);
  if (newSaved) {
    try {
      const parsed = JSON.parse(newSaved);
      if (isValidSite(parsed)) {
        return parsed;
      } else {
        console.warn('Malformed site data found in ovms_active_site, removing.');
        localStorage.removeItem(NEW_LOCAL_STORAGE_KEY);
      }
    } catch (e) {
      console.error('Failed to parse site context from ovms_active_site', e);
      localStorage.removeItem(NEW_LOCAL_STORAGE_KEY);
    }
  }

  // Attempt migration from old key
  const oldSaved = localStorage.getItem(OLD_LOCAL_STORAGE_KEY);
  if (oldSaved) {
    try {
      const parsed = JSON.parse(oldSaved);
      if (isValidSite(parsed)) {
        // Save to new key
        localStorage.setItem(NEW_LOCAL_STORAGE_KEY, JSON.stringify(parsed));
        // Remove old key
        localStorage.removeItem(OLD_LOCAL_STORAGE_KEY);
        return parsed;
      } else {
        console.warn('Malformed site data found in ovms_dev_context, removing.');
        localStorage.removeItem(OLD_LOCAL_STORAGE_KEY);
      }
    } catch (e) {
      console.error('Failed to parse site context from ovms_dev_context', e);
      localStorage.removeItem(OLD_LOCAL_STORAGE_KEY);
    }
  }

  return null;
}

export const SiteProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { userProfile, loading: authLoading } = useAuth();

  const [site, setSiteState] = useState<Site | null>(null);
  const [availableSites, setAvailableSites] = useState<Site[]>([]);
  const [siteLoading, setSiteLoading] = useState(true);
  const [siteReady, setSiteReady] = useState(false);
  const [siteError, setSiteError] = useState<string | null>(null);

  // Sync available sites and validate active site whenever userProfile or authLoading changes
  useEffect(() => {
    let isMounted = true;

    async function syncSites() {
      if (authLoading) {
        if (isMounted) {
          setSiteLoading(true);
          setSiteReady(false);
        }
        return;
      }

      if (!userProfile) {
        if (isMounted) {
          setSiteState(null);
          setAvailableSites([]);
          setSiteLoading(false);
          setSiteReady(false);
          setSiteError(null);
        }
        return;
      }

      try {
        if (isMounted) {
          setSiteLoading(true);
          setSiteReady(false);
          setSiteError(null);
        }

        const sites = await fetchUserPermittedSites(userProfile);
        if (!isMounted) return;

        setAvailableSites(sites);

        if (!sites || sites.length === 0) {
          if (isMounted) {
            setSiteState(null);
            setSiteLoading(false);
            setSiteReady(false);
            setSiteError('You have no assigned operational sites.');
          }
          return;
        }

        // Validate current active site or local storage site
        let selectedSite: Site | null = null;
        const savedSite = getStoredSite();
        if (savedSite) {
          // Check if saved site is in permitted list
          const isPermitted = sites.some(s => s.tenantId === savedSite.tenantId && s.siteId === savedSite.siteId);
          if (isPermitted) {
            selectedSite = savedSite;
          }
        }

        if (!selectedSite) {
          selectedSite = sites[0];
          localStorage.setItem(NEW_LOCAL_STORAGE_KEY, JSON.stringify(selectedSite));
        }

        if (isMounted) {
          setSiteState(selectedSite);
          setSiteError(null);
          setSiteReady(true);
        }
      } catch (err: any) {
        console.error('Error loading permitted sites:', err);
        if (isMounted) {
          setSiteError('Failed to load permitted sites.');
        }
      } finally {
        if (isMounted) {
          setSiteLoading(false);
        }
      }
    }

    syncSites();

    return () => {
      isMounted = false;
    };
  }, [userProfile, authLoading]);

  const setSite = (newSite: Site) => {
    setSiteReady(false);
    setSiteLoading(true);
    setSiteState(newSite);
    localStorage.setItem(NEW_LOCAL_STORAGE_KEY, JSON.stringify(newSite));

    // Simulate short transition for unsubscription / state clearing
    setTimeout(() => {
      setSiteLoading(false);
      setSiteReady(true);
    }, 100);
  };

  const contextValue: SiteContextType = {
    tenantId: site?.tenantId || '',
    tenantName: site?.tenantName || '',
    siteId: site?.siteId || '',
    siteName: site?.siteName || '',
    timezone: site?.timezone || 'Europe/London',
    site,
    setSite,
    availableSites,
    siteLoading,
    siteReady,
    siteError,
  };

  return (
    <SiteContext.Provider value={contextValue}>
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

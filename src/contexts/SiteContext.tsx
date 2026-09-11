import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Site } from '../types/site';
import { fetchUserPermittedSites } from '../features/administration/services/siteService';
import { useAuth } from '../features/auth/context/AuthContext';
import { supabase } from '../config/supabase';

export interface SiteContextType {
  tenantId: string;
  tenantName: string;
  siteId: string;
  siteName: string;
  timezone: string;
  site: Site | null;
  setSite: (site: Site) => void;
  refreshSites: () => Promise<void>;
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
  const syncSites = useCallback(async () => {
    if (authLoading) {
      setSiteLoading(true);
      setSiteReady(false);
      return;
    }

    if (!userProfile) {
      setSiteState(null);
      setAvailableSites([]);
      setSiteLoading(false);
      setSiteReady(false);
      setSiteError(null);
      return;
    }

    try {
      setSiteLoading(true);
      setSiteReady(false);
      setSiteError(null);

      const isSuperuser = userProfile.role === 'PLATFORM_SUPERUSER';
      const isTenantAdmin = userProfile.role === 'TENANT_ADMIN';
      const sites = await fetchUserPermittedSites(userProfile);

      setAvailableSites(sites);

      if (!sites || sites.length === 0) {
        if (isSuperuser) {
          const globalSite: Site = {
            tenantId: userProfile.tenantId || 'GLOBAL',
            tenantName: 'Platform Global',
            siteId: 'GLOBAL',
            siteName: 'Global System',
            timezone: 'Europe/London',
          };
          setSiteState(globalSite);
          setAvailableSites([globalSite]);
          setSiteError(null);
          setSiteReady(true);
        } else if (isTenantAdmin) {
          const tenantAdminSite: Site = {
            tenantId: userProfile.tenantId || 'TENANT_DEFAULT',
            tenantName: 'Organization Workspace',
            siteId: 'SETUP_REQUIRED',
            siteName: 'Primary Site (Setup Required)',
            timezone: 'Europe/London',
          };
          setSiteState(tenantAdminSite);
          setAvailableSites([tenantAdminSite]);
          setSiteError(null);
          setSiteReady(true);
        } else {
          setSiteState(null);
          setSiteLoading(false);
          setSiteReady(false);
          setSiteError('You have no assigned operational sites.');
        }
        return;
      }

      // Filter out placeholder sites if real sites exist
      const realSites = sites.filter(s => s.siteId !== 'GLOBAL' && s.siteId !== 'SETUP_REQUIRED');
      const candidates = realSites.length > 0 ? realSites : sites;

      // Validate current active site or local storage site
      let selectedSite: Site | null = null;
      const savedSite = getStoredSite();
      if (savedSite && savedSite.siteId !== 'GLOBAL' && savedSite.siteId !== 'SETUP_REQUIRED') {
        const isPermitted = isSuperuser || candidates.some(s => s.tenantId === savedSite.tenantId && s.siteId === savedSite.siteId);
        if (isPermitted) {
          selectedSite = candidates.find(s => s.siteId === savedSite.siteId) || savedSite;
        }
      }

      if (!selectedSite && candidates.length > 0) {
        selectedSite = candidates[0];
        localStorage.setItem(NEW_LOCAL_STORAGE_KEY, JSON.stringify(selectedSite));
      }

      if (selectedSite) {
        setSiteState(selectedSite);
        setSiteError(null);
        setSiteReady(true);
      }
    } catch (err: any) {
      console.error('Error loading permitted sites:', err);
      const isSuperuser = userProfile.role === 'PLATFORM_SUPERUSER';
      const isTenantAdmin = userProfile.role === 'TENANT_ADMIN';
      if (isSuperuser) {
        const globalSite: Site = {
          tenantId: userProfile.tenantId || 'GLOBAL',
          tenantName: 'Platform Global',
          siteId: 'GLOBAL',
          siteName: 'Global System',
          timezone: 'Europe/London',
        };
        setSiteState(globalSite);
        setAvailableSites([globalSite]);
        setSiteError(null);
        setSiteReady(true);
      } else if (isTenantAdmin) {
        const tenantAdminSite: Site = {
          tenantId: userProfile.tenantId || 'TENANT_DEFAULT',
          tenantName: 'Organization Workspace',
          siteId: 'SETUP_REQUIRED',
          siteName: 'Primary Site (Setup Required)',
          timezone: 'Europe/London',
        };
        setSiteState(tenantAdminSite);
        setAvailableSites([tenantAdminSite]);
        setSiteError(null);
        setSiteReady(true);
      } else {
        const errMsg = err?.message || '';
        const userSiteIds = Array.isArray(userProfile.siteIds) ? userProfile.siteIds : [];
        if (err?.code === 'permission-denied' || errMsg.includes('permission')) {
          setSiteError('Your site access could not be verified.');
        } else if (errMsg.includes('UNRESOLVED_ASSIGNMENTS')) {
          setSiteError('Your assigned sites could not be found. Contact an administrator.');
        } else if (userSiteIds.length === 0) {
          setSiteError('You have no assigned operational sites.');
        } else {
          setSiteError('Operational sites could not be loaded.');
        }
      }
    } finally {
      setSiteLoading(false);
    }
  }, [userProfile, authLoading]);

  useEffect(() => {
    syncSites();

    // Subscribe to realtime changes on 'sites' table to keep availableSites up to date
    const channel = supabase
      .channel(`sub_sites_ctx_${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sites' },
        () => {
          syncSites();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [syncSites]);

  const refreshSites = useCallback(async () => {
    await syncSites();
  }, [syncSites]);

  const setSite = (newSite: Site) => {
    if (!isValidSite(newSite)) {
      console.error('setSite rejected: Malformed site object', newSite);
      setSiteError('Invalid site data provided.');
      return;
    }

    const isSuperuser = userProfile?.role === 'PLATFORM_SUPERUSER';
    const isTenantAdmin = userProfile?.role === 'TENANT_ADMIN';
    const matchedSite = availableSites.find(
      (s) => s.tenantId === newSite.tenantId && s.siteId === newSite.siteId
    );

    const isPermitted = matchedSite || isSuperuser || (isTenantAdmin && (newSite.tenantId === userProfile?.tenantId || !userProfile?.tenantId));

    if (!isPermitted) {
      console.error('setSite rejected: Site not permitted in availableSites', newSite);
      setSiteError('Selected site is not permitted or does not belong to your account.');
      return;
    }

    const targetSite = matchedSite || newSite;

    setSiteReady(false);
    setSiteLoading(false);
    localStorage.setItem(NEW_LOCAL_STORAGE_KEY, JSON.stringify(targetSite));
    setSiteState(targetSite);
    setSiteError(null);
    setSiteReady(true);
  };

  const contextValue: SiteContextType = {
    tenantId: site?.tenantId || '',
    tenantName: site?.tenantName || '',
    siteId: site?.siteId || '',
    siteName: site?.siteName || '',
    timezone: site?.timezone || 'Europe/London',
    site,
    setSite,
    refreshSites,
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

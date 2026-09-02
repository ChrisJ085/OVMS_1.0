import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useSiteContext } from '../../../contexts/SiteContext';
import { 
  SystemDataFreshnessSummary, 
  fetchSystemDataFreshness 
} from '../services/dataFreshnessService';
import { getSiteSettings } from '../../administration/services/settingsService';
import { SiteSettings } from '../../../types/settings';

interface DataFreshnessContextValue {
  summary: SystemDataFreshnessSummary | null;
  loading: boolean;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
  siteSettings: Partial<SiteSettings> | null;
}

const DataFreshnessContext = createContext<DataFreshnessContextValue | undefined>(undefined);

export const DataFreshnessProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { tenantId, siteId } = useSiteContext();
  const [summary, setSummary] = useState<SystemDataFreshnessSummary | null>(null);
  const [siteSettings, setSiteSettings] = useState<Partial<SiteSettings> | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Load site settings
  useEffect(() => {
    let isMounted = true;
    const loadSettings = async () => {
      if (!tenantId || !siteId) return;
      try {
        const settings = await getSiteSettings(tenantId, siteId);
        if (isMounted && settings) {
          setSiteSettings(settings);
        }
      } catch (err) {
        console.warn('Failed to load site settings in DataFreshnessProvider:', err);
      }
    };
    loadSettings();
    return () => { isMounted = false; };
  }, [tenantId, siteId]);

  // Fetch freshness
  const performFetch = useCallback(async (isManual: boolean = false) => {
    if (!tenantId || !siteId) {
      setSummary(null);
      setLoading(false);
      return;
    }

    if (isManual) {
      setIsRefreshing(true);
    }

    try {
      const data = await fetchSystemDataFreshness(tenantId, siteId, siteSettings);
      setSummary(data);
    } catch (err) {
      console.warn('Error updating data freshness summary:', err);
    } finally {
      setLoading(false);
      if (isManual) {
        setIsRefreshing(false);
      }
    }
  }, [tenantId, siteId, siteSettings]);

  // Initial and site change fetch
  useEffect(() => {
    setLoading(true);
    performFetch(false);
  }, [performFetch]);

  // Periodic refresh every 45 seconds to keep relative times and background changes current
  useEffect(() => {
    if (!tenantId || !siteId) return;
    const interval = setInterval(() => {
      performFetch(false);
    }, 45000);
    return () => clearInterval(interval);
  }, [tenantId, siteId, performFetch]);

  const refresh = useCallback(async () => {
    await performFetch(true);
  }, [performFetch]);

  return (
    <DataFreshnessContext.Provider
      value={{
        summary,
        loading,
        isRefreshing,
        refresh,
        siteSettings
      }}
    >
      {children}
    </DataFreshnessContext.Provider>
  );
};

export const useDataFreshness = (): DataFreshnessContextValue => {
  const context = useContext(DataFreshnessContext);
  if (!context) {
    throw new Error('useDataFreshness must be used within a DataFreshnessProvider');
  }
  return context;
};

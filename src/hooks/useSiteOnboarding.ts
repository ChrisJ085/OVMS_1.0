import { useState, useEffect } from 'react';
import { useAuth } from '../features/auth/context/AuthContext';
import { useSiteContext } from '../contexts/SiteContext';
import { SiteOnboarding, getSiteOnboarding, initializeSiteOnboarding } from '../features/configuration/services/siteOnboardingService';
import { isValidUuid } from '../features/administration/services/settingsService';
import { supabase } from '../config/supabase';
import { toCamelCase } from '../utils/caseTransformers';

export function useSiteOnboarding() {
  const { userProfile } = useAuth();
  const { tenantId, siteId } = useSiteContext();
  const [onboarding, setOnboarding] = useState<SiteOnboarding | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const role = userProfile?.role || 'VIEWER';
  const isSuperUser = role === 'PLATFORM_SUPERUSER';
  const isTenantAdmin = role === 'TENANT_ADMIN';
  const isPlanner = role === 'PLANNER';
  const isWarehouse = role === 'WAREHOUSE_OPERATOR';
  const isViewer = role === 'VIEWER';
  const isDisplay = role === 'DISPLAY';

  const canComplete = isSuperUser || isTenantAdmin || isPlanner;
  const canModifyConfig = isSuperUser || isTenantAdmin;

  useEffect(() => {
    if (
      !tenantId ||
      !siteId ||
      tenantId === 'GLOBAL' ||
      siteId === 'GLOBAL' ||
      siteId === 'SETUP_REQUIRED' ||
      !isValidUuid(tenantId) ||
      !isValidUuid(siteId)
    ) {
      setOnboarding(null);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    const fetchOnboarding = async () => {
      try {
        const record = await getSiteOnboarding(tenantId, siteId);
        if (!active) return;

        if (record) {
          setOnboarding(record);
          setLoading(false);
        } else {
          if (canComplete && userProfile?.uid) {
            try {
              const newRecord = await initializeSiteOnboarding(tenantId, siteId, userProfile.uid);
              if (active) {
                setOnboarding(newRecord);
                setLoading(false);
              }
            } catch (err: any) {
              console.error('Failed to initialize onboarding record:', err);
              if (active) {
                setError(err.message || 'Initialization failed');
                setLoading(false);
              }
            }
          } else {
            if (active) {
              setOnboarding({
                tenantId,
                siteId,
                status: 'NOT_STARTED',
                currentStep: 0,
                completedSteps: [],
                skippedOptionalSteps: []
              });
              setLoading(false);
            }
          }
        }
      } catch (err: any) {
        console.error('Error fetching onboarding:', err);
        if (active) {
          setError(err.message || 'Fetch failed');
          setLoading(false);
        }
      }
    };

    fetchOnboarding();

    // Set up unique Realtime channel natively
    const channelName = `realtime_site_onboarding_${tenantId}_${siteId}_${Math.random().toString(36).substring(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'site_onboarding',
          filter: `site_id=eq.${siteId}`
        },
        (payload) => {
          if (!active) return;
          if (payload.eventType === 'DELETE') {
            setOnboarding(null);
          } else if (payload.new) {
            const camelData = toCamelCase<SiteOnboarding>(payload.new);
            setOnboarding(camelData);
          }
        }
      );

    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' && active) {
        console.warn('Realtime channel subscription failed for site onboarding');
      }
    });

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [tenantId, siteId, userProfile?.uid, canComplete]);

  return {
    onboarding,
    loading,
    error,
    isComplete: onboarding?.status === 'COMPLETED',
    role,
    canComplete,
    canModifyConfig,
    isDisplay,
    isWarehouse,
    isViewer
  };
}

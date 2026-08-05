import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../features/auth/context/AuthContext';
import { useSiteContext } from '../contexts/SiteContext';
import { SiteOnboarding, getSiteOnboarding, initializeSiteOnboarding } from '../features/configuration/services/siteOnboardingService';

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
    if (!tenantId || !siteId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const docId = `${tenantId}_${siteId}`;
    const docRef = doc(db, 'siteOnboarding', docId);

    const unsubscribe = onSnapshot(
      docRef,
      async (snap) => {
        if (snap.exists()) {
          setOnboarding(snap.data() as SiteOnboarding);
          setLoading(false);
        } else {
          // If the record doesn't exist, let's create one if we can write
          if (canComplete && userProfile?.uid) {
            try {
              const newRecord = await initializeSiteOnboarding(tenantId, siteId, userProfile.uid);
              setOnboarding(newRecord);
            } catch (err: any) {
              console.error('Failed to initialize onboarding record:', err);
              setError(err.message || 'Initialization failed');
            }
          } else {
            // Read-only user: mock NOT_STARTED state
            setOnboarding({
              tenantId,
              siteId,
              status: 'NOT_STARTED',
              currentStep: 0,
              completedSteps: [],
              skippedOptionalSteps: []
            });
          }
          setLoading(false);
        }
      },
      (err) => {
        console.error('Error listening to site onboarding:', err);
        setError(err.message || 'Permission denied or fetch failed');
        setLoading(false);
      }
    );

    return () => unsubscribe();
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

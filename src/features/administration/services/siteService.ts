import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { UserProfile } from '../../../types/auth';
import { Site } from '../../../types/site';

export async function fetchUserPermittedSites(profile: UserProfile): Promise<Site[]> {
  if (!db || !profile) return [];

  // Platform superuser must have active status
  if (profile.role === 'PLATFORM_SUPERUSER') {
    if (profile.accountStatus !== 'ACTIVE' && (profile.accountStatus as string) !== 'active') {
      return [];
    }
  }

  try {
    if (profile.role === 'PLATFORM_SUPERUSER') {
      const sitesSnap = await getDocs(collection(db, 'sites'));
      const sitesMap = new Map<string, Site>();

      sitesSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const siteId = data.siteId || docSnap.id;
        if (data.tenantId && siteId) {
          const key = `${data.tenantId}_${siteId}`;
          sitesMap.set(key, {
            tenantId: data.tenantId,
            tenantName: data.tenantName || 'Tenant',
            siteId: siteId,
            siteName: data.siteName || siteId,
            timezone: data.timezone || 'Europe/London',
          });
        }
      });

      return Array.from(sitesMap.values());
    } else {
      const tenantId = profile.tenantId;
      if (!tenantId) return [];

      const q = query(collection(db, 'sites'), where('tenantId', '==', tenantId));
      const sitesSnap = await getDocs(q);

      const sitesMap = new Map<string, Site>();

      sitesSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const siteId = data.siteId || docSnap.id;

        const isAssigned =
          profile.role === 'TENANT_ADMIN' ||
          (Array.isArray(profile.siteIds) && profile.siteIds.length > 0 && profile.siteIds.includes(siteId));

        if (siteId && isAssigned) {
          const key = `${tenantId}_${siteId}`;
          sitesMap.set(key, {
            tenantId,
            tenantName: data.tenantName || 'Tenant',
            siteId: siteId,
            siteName: data.siteName || siteId,
            timezone: data.timezone || 'Europe/London',
          });
        }
      });

      return Array.from(sitesMap.values());
    }
  } catch (e) {
    console.error('Error fetching sites from sites collection:', e);
    return [];
  }
}


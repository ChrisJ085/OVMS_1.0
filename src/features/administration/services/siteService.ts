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
        const siteId = data.siteId || data.siteCode || docSnap.id;
        const tenantId = data.tenantId || profile.tenantId || 'GLOBAL';
        if (siteId) {
          const key = `${tenantId}_${siteId}`;
          sitesMap.set(key, {
            tenantId,
            tenantName: data.tenantName || 'Tenant',
            siteId: siteId,
            siteName: data.siteName || data.siteCode || siteId,
            timezone: data.timezone || 'Europe/London',
          });
        }
      });

      return Array.from(sitesMap.values());
    } else {
      const tenantId = profile.tenantId;
      if (!tenantId) return [];

      let docsToProcess: any[] = [];
      const primarySnap = await getDocs(query(collection(db, 'sites'), where('tenantId', '==', tenantId)));
      
      if (!primarySnap.empty) {
        docsToProcess = primarySnap.docs;
      } else {
        // Fallback: load all sites in case tenantId is missing or case mismatched in database
        const fallbackSnap = await getDocs(collection(db, 'sites'));
        fallbackSnap.forEach(docSnap => {
          const data = docSnap.data();
          if (!data.tenantId || data.tenantId.toLowerCase() === tenantId.toLowerCase()) {
            docsToProcess.push(docSnap);
          }
        });
      }

      const sitesMap = new Map<string, Site>();
      const userSiteIds = Array.isArray(profile.siteIds) ? profile.siteIds : [];

      docsToProcess.forEach((docSnap) => {
        const data = docSnap.data();
        const siteId = data.siteId || data.siteCode || docSnap.id;

        const isAssigned =
          profile.role === 'TENANT_ADMIN' ||
          (userSiteIds.length > 0 && (
            userSiteIds.includes(docSnap.id) ||
            userSiteIds.includes(siteId) ||
            (data.siteId && userSiteIds.includes(data.siteId)) ||
            (data.siteCode && userSiteIds.includes(data.siteCode))
          ));

        if (siteId && isAssigned) {
          const key = `${tenantId}_${siteId}`;
          sitesMap.set(key, {
            tenantId,
            tenantName: data.tenantName || 'Tenant',
            siteId: siteId,
            siteName: data.siteName || data.siteCode || siteId,
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


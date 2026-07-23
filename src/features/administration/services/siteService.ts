import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { UserProfile } from '../../../types/auth';
import { Site } from '../../../types/site';

export const DEFAULT_SITES: Site[] = [
  {
    tenantId: 'tenant_dev',
    tenantName: 'GXO Development',
    siteId: 'site_barrow',
    siteName: 'Barrow RDC',
    timezone: 'Europe/London',
  },
  {
    tenantId: 'tenant_dev',
    tenantName: 'GXO Development',
    siteId: 'site_test',
    siteName: 'Test Facility',
    timezone: 'Europe/London',
  },
];

export async function fetchUserPermittedSites(profile: UserProfile): Promise<Site[]> {
  if (!db) return DEFAULT_SITES;

  try {
    if (profile.role === 'PLATFORM_SUPERUSER') {
      const locationsSnap = await getDocs(collection(db, 'locations'));
      const sitesMap = new Map<string, Site>();

      DEFAULT_SITES.forEach(s => sitesMap.set(`${s.tenantId}_${s.siteId}`, s));

      locationsSnap.forEach(docSnap => {
        const data = docSnap.data();
        if (data.tenantId && data.siteId) {
          const key = `${data.tenantId}_${data.siteId}`;
          sitesMap.set(key, {
            tenantId: data.tenantId,
            tenantName: data.tenantName || 'Tenant',
            siteId: data.siteId,
            siteName: data.siteName || data.siteId,
            timezone: data.timezone || 'Europe/London'
          });
        }
      });

      return Array.from(sitesMap.values());
    } else {
      const tenantId = profile.tenantId || 'tenant_dev';
      const q = query(collection(db, 'locations'), where('tenantId', '==', tenantId));
      const locationsSnap = await getDocs(q);

      const sitesMap = new Map<string, Site>();

      locationsSnap.forEach(docSnap => {
        const data = docSnap.data();
        const isAssigned =
          profile.role === 'TENANT_ADMIN' ||
          !profile.siteIds ||
          profile.siteIds.length === 0 ||
          profile.siteIds.includes(data.siteId);

        if (data.siteId && isAssigned) {
          const key = `${tenantId}_${data.siteId}`;
          sitesMap.set(key, {
            tenantId,
            tenantName: data.tenantName || 'Tenant',
            siteId: data.siteId,
            siteName: data.siteName || data.siteId,
            timezone: data.timezone || 'Europe/London'
          });
        }
      });

      if (sitesMap.size === 0) {
        const assignedIds = profile.siteIds && profile.siteIds.length > 0 ? profile.siteIds : ['site_barrow'];
        assignedIds.forEach(id => {
          sitesMap.set(`${tenantId}_${id}`, {
            tenantId,
            tenantName: 'GXO Tenant',
            siteId: id,
            siteName: id === 'site_barrow' ? 'Barrow RDC' : id,
            timezone: 'Europe/London'
          });
        });
      }

      return Array.from(sitesMap.values());
    }
  } catch (e) {
    console.error('Error fetching sites:', e);
    return DEFAULT_SITES;
  }
}

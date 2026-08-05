import { collection, query, where, getDocs, doc, getDoc, limit } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { UserProfile } from '../../../types/auth';
import { Site } from '../../../types/site';

export async function fetchUserPermittedSites(profile: UserProfile): Promise<Site[]> {
  if (!db || !profile) return [];

  const uid = profile.uid || 'unknown';
  const tenantId = profile.tenantId;
  const userSiteIds = Array.isArray(profile.siteIds) ? profile.siteIds : [];

  // Platform superuser must have active status
  if (profile.role === 'PLATFORM_SUPERUSER') {
    if (profile.accountStatus !== 'ACTIVE' && (profile.accountStatus as string) !== 'active') {
      return [];
    }
  }

  try {
    const sitesMap = new Map<string, Site>();

    // 1. Platform Superuser: query all active sites across all tenants
    if (profile.role === 'PLATFORM_SUPERUSER') {
      const sitesSnap = await getDocs(collection(db, 'sites'));
      sitesSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const tId = data.tenantId || tenantId || 'GLOBAL';
        const isActive = data.active === true || data.status === 'ACTIVE' || data.status === 'active' || data.status == null;
        if (isActive) {
          const key = `${tId}_${docSnap.id}`;
          sitesMap.set(key, {
            tenantId: tId,
            tenantName: data.tenantName || 'Tenant',
            siteId: docSnap.id,
            siteName: data.siteName || data.siteCode || docSnap.id,
            timezone: data.timezone || 'Europe/London',
          });
        }
      });
      return Array.from(sitesMap.values());
    }

    // 2. Tenant Admin: query all active sites where tenantId equals their own tenantId
    if (profile.role === 'TENANT_ADMIN') {
      if (!tenantId) return [];
      const sitesQuery = query(collection(db, 'sites'), where('tenantId', '==', tenantId));
      const sitesSnap = await getDocs(sitesQuery);
      sitesSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const docTenantId = data.tenantId || tenantId;
        if (docTenantId === tenantId) {
          const isActive = data.active === true || data.status === 'ACTIVE' || data.status === 'active' || data.status == null;
          if (isActive) {
            const key = `${tenantId}_${docSnap.id}`;
            sitesMap.set(key, {
              tenantId,
              tenantName: data.tenantName || 'Tenant',
              siteId: docSnap.id,
              siteName: data.siteName || data.siteCode || docSnap.id,
              timezone: data.timezone || 'Europe/London',
            });
          }
        }
      });
      return Array.from(sitesMap.values());
    }

    // 3. Restricted roles (PLANNER, WAREHOUSE_OPERATOR, VIEWER, DISPLAY):
    // Must NOT query all tenant sites. Load only explicitly assigned siteIds.
    if (!tenantId || userSiteIds.length === 0) {
      console.log(`[fetchUserPermittedSites] User ${uid} (role ${profile.role}) has no assigned siteIds.`);
      return [];
    }

    for (const assignedId of userSiteIds) {
      if (!assignedId || typeof assignedId !== 'string') continue;

      let foundDoc: any = null;
      let lookupMethod = 'direct_doc';

      // Step A: Direct document ID lookup
      try {
        const docRef = doc(db, 'sites', assignedId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          const docTenantId = data.tenantId;
          const isActive = data.active === true || data.status === 'ACTIVE' || data.status === 'active' || data.status == null;

          if (docTenantId === tenantId && isActive) {
            foundDoc = { id: docSnap.id, ...data };
          } else {
            console.warn(`[fetchUserPermittedSites] Site doc ${assignedId} found for user ${uid}, but tenantId mismatch (${docTenantId} vs ${tenantId}) or inactive.`);
          }
        }
      } catch (docErr: any) {
        console.warn(`[fetchUserPermittedSites] Direct doc lookup failed for ${assignedId}:`, docErr?.message);
        if (docErr?.code === 'permission-denied' || docErr?.message?.includes('permission')) {
          throw docErr;
        }
      }

      // Step B: Fallback to narrow query on siteId if direct doc lookup failed
      if (!foundDoc) {
        try {
          lookupMethod = 'narrow_query_siteId';
          const qSiteId = query(
            collection(db, 'sites'),
            where('tenantId', '==', tenantId),
            where('siteId', '==', assignedId),
            limit(1)
          );
          const snap1 = await getDocs(qSiteId);
          if (!snap1.empty) {
            const d = snap1.docs[0];
            const data = d.data();
            const isActive = data.active === true || data.status === 'ACTIVE' || data.status === 'active' || data.status == null;
            if (isActive) {
              foundDoc = { id: d.id, ...data };
            }
          }
        } catch (q1Err: any) {
          if (q1Err?.code === 'permission-denied' || q1Err?.message?.includes('permission')) {
            throw q1Err;
          }
        }
      }

      // Step C: Fallback to narrow query on siteCode if still not found
      if (!foundDoc) {
        try {
          lookupMethod = 'narrow_query_siteCode';
          const qSiteCode = query(
            collection(db, 'sites'),
            where('tenantId', '==', tenantId),
            where('siteCode', '==', assignedId),
            limit(1)
          );
          const snap2 = await getDocs(qSiteCode);
          if (!snap2.empty) {
            const d = snap2.docs[0];
            const data = d.data();
            const isActive = data.active === true || data.status === 'ACTIVE' || data.status === 'active' || data.status == null;
            if (isActive) {
              foundDoc = { id: d.id, ...data };
            }
          }
        } catch (q2Err: any) {
          if (q2Err?.code === 'permission-denied' || q2Err?.message?.includes('permission')) {
            throw q2Err;
          }
        }
      }

      if (foundDoc) {
        const key = `${tenantId}_${foundDoc.id}`;
        sitesMap.set(key, {
          tenantId,
          tenantName: foundDoc.tenantName || 'Tenant',
          siteId: foundDoc.id,
          siteName: foundDoc.siteName || foundDoc.siteCode || foundDoc.id,
          timezone: foundDoc.timezone || 'Europe/London',
        });
      } else {
        console.warn(`[fetchUserPermittedSites] Diagnostic: Failed to resolve assigned site ID '${assignedId}' for user ${uid} (tenant ${tenantId}) using lookup method '${lookupMethod}'.`);
      }
    }

    const results = Array.from(sitesMap.values());
    if (userSiteIds.length > 0 && results.length === 0) {
      throw new Error('UNRESOLVED_ASSIGNMENTS: Assigned sites could not be resolved.');
    }

    return results;

  } catch (err: any) {
    console.error('[fetchUserPermittedSites] Error:', {
      uid,
      tenantId,
      siteIds: userSiteIds,
      errorCode: err?.code,
      message: err?.message,
    });
    throw err;
  }
}

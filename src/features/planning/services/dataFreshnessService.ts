import { toEpochMillis, formatRelativeTime } from '../../../utils/timeFormatters';
import { SiteSettings } from '../../../types/settings';
import { collection, db, doc, getDoc, getDocs, limit, query, where } from '../../../services/firestoreBase';

export type FreshnessStatus = 'FRESH' | 'AGING' | 'STALE' | 'MISSING';

export interface DataFreshnessItem {
  key: 'inventory' | 'sto' | 'production_plan' | 'recommendations';
  title: string;
  shortLabel: string;
  status: FreshnessStatus;
  statusLabel: string;
  updatedAtMillis: number | null;
  updatedAtFormatted: string;
  relativeTime: string;
  updatedBy: string | null;
  sourceSummary: string;
  route: string;
  actionLabel: string;
  ageMinutes: number | null;
  details?: {
    recordCount?: number;
    fileName?: string;
    sourceType?: string;
  };
}

export interface SystemDataFreshnessSummary {
  tenantId: string;
  siteId: string;
  fetchedAtMillis: number;
  overallStatus: FreshnessStatus;
  overallScore: number; // e.g., 4/4 fresh
  recommendationDecisionAdvice: string;
  items: {
    inventory: DataFreshnessItem;
    sto: DataFreshnessItem;
    productionPlan: DataFreshnessItem;
    recommendations: DataFreshnessItem;
  };
}

// Format timestamp to localized date & time string e.g. "02 Sep 2026, 09:15"
export const formatFreshnessTimestamp = (epochMillis: number | null): string => {
  if (!epochMillis) return 'No data recorded';
  const d = new Date(epochMillis);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

export const calculateFreshnessStatus = (
  ageMinutes: number | null,
  thresholds: { freshMinutes: number; agingMinutes: number; staleMinutes: number }
): { status: FreshnessStatus; statusLabel: string } => {
  if (ageMinutes === null) {
    return { status: 'MISSING', statusLabel: 'No Data' };
  }
  if (ageMinutes <= thresholds.freshMinutes) {
    return { status: 'FRESH', statusLabel: 'Fresh' };
  }
  if (ageMinutes <= thresholds.agingMinutes) {
    return { status: 'AGING', statusLabel: 'Aging' };
  }
  return { status: 'STALE', statusLabel: 'Stale' };
};

/**
 * Fetches freshness metadata for all 4 key system areas:
 * 1. Inventory Balance
 * 2. STO Requirements
 * 3. Production Plan
 * 4. Recommendations
 */
export const fetchSystemDataFreshness = async (
  tenantId: string,
  siteId: string,
  siteSettings?: Partial<SiteSettings> | null,
  nowEpoch: number = Date.now()
): Promise<SystemDataFreshnessSummary> => {
  // Freshness thresholds (defaults or from site settings)
  const invFreshMin = siteSettings?.inventoryFreshMinutes || 60; // 1 hr default
  const invAgingMin = siteSettings?.inventoryAgingMinutes || 240; // 4 hrs default
  const invStaleMin = siteSettings?.inventoryStaleMinutes || 720; // 12 hrs default

  // STO and Production Plan usually update on daily/shift schedules
  const planFreshMin = 480; // 8 hrs
  const planAgingMin = 1440; // 24 hrs
  const planStaleMin = 2880; // 48 hrs

  // Recommendations: fresh if within 4 hours, aging up to 24 hrs
  const recFreshMin = 240; // 4 hrs
  const recAgingMin = 720; // 12 hrs
  const recStaleMin = 1440; // 24 hrs

  // Execute queries in parallel
  const [invResult, stoResult, planResult, recResult] = await Promise.all([
    // 1. Inventory Balances
    (async () => {
      try {
        const q = query(
          collection(db, 'inventoryBalances'),
          where('tenantId', '==', tenantId),
          where('siteId', '==', siteId),
          limit(100)
        );
        const snap = await getDocs(q);
        if (snap.empty) {
          return { latestEpoch: null, updatedBy: null, source: null, count: 0 };
        }

        let maxEpoch: number | null = null;
        let lastUser: string | null = null;
        let source: string | null = null;
        let count = 0;

        snap.docs.forEach(docSnap => {
          const data = docSnap.data();
          if ((data.quantity || 0) > 0) count++;
          const tSource = toEpochMillis(data.sourceUpdatedAt);
          const tMod = toEpochMillis(data.modifiedDate);
          const tCreated = toEpochMillis(data.createdDate);
          const best = tSource || tMod || tCreated;

          if (best && (!maxEpoch || best > maxEpoch)) {
            maxEpoch = best;
            lastUser = data.modifiedBy || data.createdBy || null;
            source = data.source || null;
          }
        });

        return { latestEpoch: maxEpoch, updatedBy: lastUser, source, count: snap.docs.length };
      } catch (err) {
        console.warn('Error fetching inventory freshness:', err);
        return { latestEpoch: null, updatedBy: null, source: null, count: 0 };
      }
    })(),

    // 2. STO Requirements
    (async () => {
      try {
        // First check northfleetStoImports
        const importsQ = query(
          collection(db, 'northfleetStoImports'),
          where('tenantId', '==', tenantId),
          where('siteId', '==', siteId),
          limit(10)
        );
        const snap = await getDocs(importsQ);
        if (!snap.empty) {
          const imports = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
          imports.sort((a, b) => {
            const tA = toEpochMillis(a.importedAt || a.createdDate) || 0;
            const tB = toEpochMillis(b.importedAt || b.createdDate) || 0;
            return tB - tA;
          });
          const latest = imports[0];
          const latestEpoch = toEpochMillis(latest.importedAt || latest.createdDate);
          return {
            latestEpoch,
            updatedBy: latest.importedBy || null,
            rowCount: latest.validRowCount || latest.rowCount || 0,
            status: latest.status || 'COMMITTED'
          };
        }

        // Fallback: check northfleetStoRequirements directly
        const reqsQ = query(
          collection(db, 'northfleetStoRequirements'),
          where('tenantId', '==', tenantId),
          where('siteId', '==', siteId),
          limit(50)
        );
        const reqsSnap = await getDocs(reqsQ);
        if (reqsSnap.empty) {
          return { latestEpoch: null, updatedBy: null, rowCount: 0, status: null };
        }

        let maxEpoch: number | null = null;
        let lastUser: string | null = null;
        reqsSnap.docs.forEach(docSnap => {
          const data = docSnap.data();
          const t = toEpochMillis(data.modifiedDate || data.createdDate);
          if (t && (!maxEpoch || t > maxEpoch)) {
            maxEpoch = t;
            lastUser = data.modifiedBy || data.createdBy || null;
          }
        });

        return {
          latestEpoch: maxEpoch,
          updatedBy: lastUser,
          rowCount: reqsSnap.docs.length,
          status: 'COMMITTED'
        };
      } catch (err) {
        console.warn('Error fetching STO freshness:', err);
        return { latestEpoch: null, updatedBy: null, rowCount: 0, status: null };
      }
    })(),

    // 3. Production Plan
    (async () => {
      try {
        const importsQ = query(
          collection(db, 'productionPlanImports'),
          where('tenantId', '==', tenantId),
          where('siteId', '==', siteId),
          limit(10)
        );
        const snap = await getDocs(importsQ);
        if (!snap.empty) {
          const imports = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
          imports.sort((a, b) => {
            const tA = toEpochMillis(a.uploadedAt || a.createdDate) || 0;
            const tB = toEpochMillis(b.uploadedAt || b.createdDate) || 0;
            return tB - tA;
          });
          const latest = imports[0];
          const latestEpoch = toEpochMillis(latest.uploadedAt || latest.createdDate);
          return {
            latestEpoch,
            updatedBy: latest.uploadedBy || null,
            fileName: latest.fileName || 'SAP MPPS7 Plan',
            rowCount: latest.recognisedRows || latest.totalSourceRows || 0,
            status: latest.status || 'COMMITTED'
          };
        }

        // Fallback: check productionPlanEntries directly
        const entriesQ = query(
          collection(db, 'productionPlanEntries'),
          where('tenantId', '==', tenantId),
          where('siteId', '==', siteId),
          limit(50)
        );
        const entriesSnap = await getDocs(entriesQ);
        if (entriesSnap.empty) {
          return { latestEpoch: null, updatedBy: null, fileName: null, rowCount: 0, status: null };
        }

        let maxEpoch: number | null = null;
        entriesSnap.docs.forEach(docSnap => {
          const data = docSnap.data();
          const t = toEpochMillis(data.modifiedDate || data.createdDate);
          if (t && (!maxEpoch || t > maxEpoch)) {
            maxEpoch = t;
          }
        });

        return {
          latestEpoch: maxEpoch,
          updatedBy: null,
          fileName: 'Active Production Entries',
          rowCount: entriesSnap.docs.length,
          status: 'ACTIVE'
        };
      } catch (err) {
        console.warn('Error fetching production plan freshness:', err);
        return { latestEpoch: null, updatedBy: null, fileName: null, rowCount: 0, status: null };
      }
    })(),

    // 4. Recommendations
    (async () => {
      try {
        // First check siteRecommendationRuns
        const runRef = doc(db, 'siteRecommendationRuns', `${tenantId}_${siteId}`);
        const runSnap = await getDoc(runRef);
        if (runSnap.exists()) {
          const runData = runSnap.data();
          const latestEpoch = toEpochMillis(runData.completedAt || runData.lastUpdatedAt || runData.startedAt);
          if (latestEpoch) {
            return {
              latestEpoch,
              updatedBy: runData.completedByName || runData.startedByName || runData.completedBy || null,
              count: runData.generatedCount || runData.totalProducts || 0,
              inProgress: runData.status === 'IN_PROGRESS'
            };
          }
        }

        // Fallback: check recommendations collection
        const recsQ = query(
          collection(db, 'recommendations'),
          where('tenantId', '==', tenantId),
          where('siteId', '==', siteId),
          limit(20)
        );
        const snap = await getDocs(recsQ);
        if (snap.empty) {
          return { latestEpoch: null, updatedBy: null, count: 0, inProgress: false };
        }

        let maxEpoch: number | null = null;
        let lastUser: string | null = null;
        snap.docs.forEach(docSnap => {
          const data = docSnap.data();
          const t = toEpochMillis(data.generatedAt || data.createdDate);
          if (t && (!maxEpoch || t > maxEpoch)) {
            maxEpoch = t;
            lastUser = data.createdBy || null;
          }
        });

        return { latestEpoch: maxEpoch, updatedBy: lastUser, count: snap.docs.length, inProgress: false };
      } catch (err) {
        console.warn('Error fetching recommendation freshness:', err);
        return { latestEpoch: null, updatedBy: null, count: 0, inProgress: false };
      }
    })()
  ]);

  // Build Item 1: Inventory
  const invAgeMin = invResult.latestEpoch ? Math.max(0, Math.floor((nowEpoch - invResult.latestEpoch) / 60000)) : null;
  const invStatusInfo = calculateFreshnessStatus(invAgeMin, {
    freshMinutes: invFreshMin,
    agingMinutes: invAgingMin,
    staleMinutes: invStaleMin
  });
  const inventoryItem: DataFreshnessItem = {
    key: 'inventory',
    title: 'Inventory Balance',
    shortLabel: 'Inventory',
    status: invStatusInfo.status,
    statusLabel: invStatusInfo.statusLabel,
    updatedAtMillis: invResult.latestEpoch,
    updatedAtFormatted: formatFreshnessTimestamp(invResult.latestEpoch),
    relativeTime: invResult.latestEpoch ? formatRelativeTime(invResult.latestEpoch, nowEpoch) : 'Never',
    updatedBy: invResult.updatedBy,
    sourceSummary: invResult.latestEpoch 
      ? `${invResult.count} SKU balance records${invResult.source ? ` (${invResult.source})` : ''}`
      : 'No inventory balances loaded',
    route: '/inventory/balances',
    actionLabel: 'Update Inventory',
    ageMinutes: invAgeMin,
    details: { recordCount: invResult.count, sourceType: invResult.source || undefined }
  };

  // Build Item 2: STO Requirements
  const stoAgeMin = stoResult.latestEpoch ? Math.max(0, Math.floor((nowEpoch - stoResult.latestEpoch) / 60000)) : null;
  const stoStatusInfo = calculateFreshnessStatus(stoAgeMin, {
    freshMinutes: planFreshMin,
    agingMinutes: planAgingMin,
    staleMinutes: planStaleMin
  });
  const stoItem: DataFreshnessItem = {
    key: 'sto',
    title: 'STO Requirements',
    shortLabel: 'STO Reqs',
    status: stoStatusInfo.status,
    statusLabel: stoStatusInfo.statusLabel,
    updatedAtMillis: stoResult.latestEpoch,
    updatedAtFormatted: formatFreshnessTimestamp(stoResult.latestEpoch),
    relativeTime: stoResult.latestEpoch ? formatRelativeTime(stoResult.latestEpoch, nowEpoch) : 'Never',
    updatedBy: stoResult.updatedBy,
    sourceSummary: stoResult.latestEpoch
      ? `${stoResult.rowCount} STO requirements active`
      : 'No STO requirements imported',
    route: '/planning/northfleet-sto',
    actionLabel: 'Import STO Requirements',
    ageMinutes: stoAgeMin,
    details: { recordCount: stoResult.rowCount }
  };

  // Build Item 3: Production Plan
  const planAgeMin = planResult.latestEpoch ? Math.max(0, Math.floor((nowEpoch - planResult.latestEpoch) / 60000)) : null;
  const planStatusInfo = calculateFreshnessStatus(planAgeMin, {
    freshMinutes: planFreshMin,
    agingMinutes: planAgingMin,
    staleMinutes: planStaleMin
  });
  const planItem: DataFreshnessItem = {
    key: 'production_plan',
    title: 'Production Plan',
    shortLabel: 'Prod Plan',
    status: planStatusInfo.status,
    statusLabel: planStatusInfo.statusLabel,
    updatedAtMillis: planResult.latestEpoch,
    updatedAtFormatted: formatFreshnessTimestamp(planResult.latestEpoch),
    relativeTime: planResult.latestEpoch ? formatRelativeTime(planResult.latestEpoch, nowEpoch) : 'Never',
    updatedBy: planResult.updatedBy,
    sourceSummary: planResult.latestEpoch
      ? `${planResult.fileName || 'SAP MPPS7 Plan'}${planResult.rowCount ? ` (${planResult.rowCount} rows)` : ''}`
      : 'No production plan imported',
    route: '/planning/production-plan',
    actionLabel: 'Upload Production Plan',
    ageMinutes: planAgeMin,
    details: { fileName: planResult.fileName || undefined, recordCount: planResult.rowCount }
  };

  // Build Item 4: Recommendations
  const recAgeMin = recResult.latestEpoch ? Math.max(0, Math.floor((nowEpoch - recResult.latestEpoch) / 60000)) : null;
  const recStatusInfo = calculateFreshnessStatus(recAgeMin, {
    freshMinutes: recFreshMin,
    agingMinutes: recAgingMin,
    staleMinutes: recStaleMin
  });
  const recItem: DataFreshnessItem = {
    key: 'recommendations',
    title: 'Recommendations',
    shortLabel: 'Recommendations',
    status: recStatusInfo.status,
    statusLabel: recStatusInfo.statusLabel,
    updatedAtMillis: recResult.latestEpoch,
    updatedAtFormatted: formatFreshnessTimestamp(recResult.latestEpoch),
    relativeTime: recResult.latestEpoch ? formatRelativeTime(recResult.latestEpoch, nowEpoch) : 'Never',
    updatedBy: recResult.updatedBy,
    sourceSummary: recResult.latestEpoch
      ? `${recResult.count} SKU recommendations evaluated`
      : 'No recommendation run on record',
    route: '/planning/recommendations',
    actionLabel: 'Generate Recommendations',
    ageMinutes: recAgeMin,
    details: { recordCount: recResult.count }
  };

  const allItems = [inventoryItem, stoItem, planItem, recItem];
  const freshCount = allItems.filter(i => i.status === 'FRESH').length;
  const staleCount = allItems.filter(i => i.status === 'STALE').length;
  const missingCount = allItems.filter(i => i.status === 'MISSING').length;
  const agingCount = allItems.filter(i => i.status === 'AGING').length;

  let overallStatus: FreshnessStatus = 'FRESH';
  if (missingCount > 0 || staleCount > 0) {
    overallStatus = staleCount > 0 ? 'STALE' : 'MISSING';
  } else if (agingCount > 0) {
    overallStatus = 'AGING';
  }

  // Generate clear decision advice for planners
  let advice = 'All core operational data sources are current. Recommendations reflect up-to-date inputs.';
  if (missingCount > 0 || staleCount > 0) {
    const staleNames = allItems
      .filter(i => i.status === 'STALE' || i.status === 'MISSING')
      .map(i => i.title)
      .join(', ');
    advice = `Notice: ${staleNames} ${allItems.filter(i => i.status === 'STALE' || i.status === 'MISSING').length > 1 ? 'are' : 'is'} outdated or missing. Consider updating inputs before taking action on recommendations.`;
  } else if (agingCount > 0) {
    const agingNames = allItems
      .filter(i => i.status === 'AGING')
      .map(i => i.title)
      .join(', ');
    advice = `${agingNames} ${allItems.filter(i => i.status === 'AGING').length > 1 ? 'have' : 'has'} not been refreshed recently.`;
  }

  return {
    tenantId,
    siteId,
    fetchedAtMillis: nowEpoch,
    overallStatus,
    overallScore: freshCount,
    recommendationDecisionAdvice: advice,
    items: {
      inventory: inventoryItem,
      sto: stoItem,
      productionPlan: planItem,
      recommendations: recItem
    }
  };
};

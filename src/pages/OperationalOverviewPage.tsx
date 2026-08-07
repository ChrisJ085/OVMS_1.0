import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link, useOutletContext } from 'react-router-dom';
import { collection, query, where, onSnapshot, getDocs, Timestamp, orderBy, limit } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Priority, PriorityStatus } from '../types/priority';
import { Recommendation } from '../types/recommendation';
import { OperationalException, ExceptionSeverity } from '../types/exception';
import { Announcement } from '../types/announcement';
import { ProductionPlanImport, ProductionPlanEntry, ProductionEvent } from '../types/production';
import { SiteSettings } from '../types/settings';
import { Product } from '../types/product';
import { Destination, ActionType, PriorityLevel } from '../types/configuration';
import { subscribeToCollection } from '../services/firestoreBase';
import { collections } from '../features/configuration/services/configurationService';
import { subscribeToProducts } from '../features/inventory/services/productService';
import { getActionTypeLabel, getDestinationLabel, getPriorityLevelLabel, formatQuantityInPallets } from '../features/operations/utils/priorityFormatters';
import { PageHeader } from '../components/ui/PageHeader';
import { SectionCard } from '../components/ui/SectionCard';
import { StatusBadge, BadgeVariant } from '../components/ui/StatusBadge';
import { useAuth } from '../features/auth/context/AuthContext';
import { useSiteContext } from '../contexts/SiteContext';
import { useSiteOnboarding } from '../hooks/useSiteOnboarding';
import { resetSiteOnboarding } from '../features/configuration/services/siteOnboardingService';
import { Sparkles, RotateCcw } from 'lucide-react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Package,
  ArrowRight,
  Plus,
  FileSpreadsheet,
  Megaphone,
  RefreshCw,
  Sliders,
  ShieldAlert,
  Users,
  Radio,
  Layers,
  CalendarDays,
  ExternalLink,
  TrendingUp,
  XCircle,
  AlertOctagon,
  Info,
  Tv
} from 'lucide-react';

// Timezone-aware start of today and start of following day calculation
export const getSiteTimezoneBoundaries = (timezone: string = 'Europe/London') => {
  const now = new Date();
  try {
    const dtf = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    
    const parts = dtf.formatToParts(now);
    const partMap: Record<string, string> = {};
    parts.forEach(p => {
      partMap[p.type] = p.value;
    });
    
    const year = parseInt(partMap.year, 10);
    const month = parseInt(partMap.month, 10);
    const day = parseInt(partMap.day, 10);

    const getUTCOffsetInMinutes = (tz: string, date: Date): number => {
      const formatterUTC = new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      });
      const formatterTZ = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      });

      const getVal = (partsArr: Intl.DateTimeFormatPart[]) => {
        const m: Record<string, number> = {};
        partsArr.forEach(p => {
          if (p.type !== 'literal') m[p.type] = parseInt(p.value, 10);
        });
        return Date.UTC(m.year, m.month - 1, m.day, m.hour, m.minute, m.second);
      };

      const utcTime = getVal(formatterUTC.formatToParts(date));
      const tzTime = getVal(formatterTZ.formatToParts(date));
      return Math.round((tzTime - utcTime) / 60000);
    };

    const targetLocalMidnightUTC = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
    const approxStart = new Date(targetLocalMidnightUTC);
    const offsetMins = getUTCOffsetInMinutes(timezone, approxStart);
    const startOfToday = new Date(targetLocalMidnightUTC - offsetMins * 60000);

    const targetNextLocalMidnightUTC = Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0);
    const nextOffsetMins = getUTCOffsetInMinutes(timezone, new Date(targetNextLocalMidnightUTC));
    const startOfNextDay = new Date(targetNextLocalMidnightUTC - nextOffsetMins * 60000);

    return { startOfToday, startOfNextDay };
  } catch (err) {
    console.error('Error calculating timezone boundaries, falling back to local time:', err);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfNextDay = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    return { startOfToday, startOfNextDay };
  }
};

export const OperationalOverviewPage: React.FC = () => {
  const { userProfile } = useAuth();
  const { tenantId, siteId, site } = useSiteContext();
  const navigate = useNavigate();
  const { onboarding, canComplete, isComplete, canModifyConfig } = useSiteOnboarding();
  const { handleOpenOnboardingWizard } = useOutletContext<{ handleOpenOnboardingWizard: () => void }>() || {};

  const role = userProfile?.role || 'VIEWER';
  const isSuperOrAdmin = role === 'PLATFORM_SUPERUSER' || role === 'TENANT_ADMIN';
  const isPlanner = role === 'PLANNER' || isSuperOrAdmin;
  const isWarehouse = role === 'WAREHOUSE_OPERATOR';
  const isDisplay = role === 'DISPLAY';

  // Data states
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [exceptions, setExceptions] = useState<OperationalException[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [latestImport, setLatestImport] = useState<ProductionPlanImport | null>(null);
  const [productionEntries, setProductionEntries] = useState<ProductionPlanEntry[]>([]);
  const [productionEvents, setProductionEvents] = useState<ProductionEvent[]>([]);
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);
  const [activePromotionsCount, setActivePromotionsCount] = useState<number>(0);
  const [activeSessionsCount, setActiveSessionsCount] = useState<number>(0);

  // Reference/Configuration states
  const [products, setProducts] = useState<Product[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [actionTypes, setActionTypes] = useState<ActionType[]>([]);
  const [priorityLevels, setPriorityLevels] = useState<PriorityLevel[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [panelErrors, setPanelErrors] = useState<{
    priorities?: string;
    recommendations?: string;
    production?: string;
    exceptions?: string;
    freshness?: string;
    announcements?: string;
    promotions?: string;
    sessions?: string;
  }>({});

  // Time formatting helper in site timezone
  const formatSiteTime = (ts: any) => {
    if (!ts) return 'N/A';
    try {
      const date = ts.toDate ? ts.toDate() : new Date(ts);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleString('en-GB', {
        timeZone: siteSettings?.timezone || 'Europe/London',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'N/A';
    }
  };

  // Age helper
  const getAgeString = (ts: any) => {
    if (!ts) return '';
    try {
      const date = ts.toDate ? ts.toDate() : new Date(ts);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return '';
    }
  };

  // Main Data Loading & Listeners
  useEffect(() => {
    // Clear old overview data immediately on site switch
    setPriorities([]);
    setExceptions([]);
    setAnnouncements([]);
    setRecommendations([]);
    setLatestImport(null);
    setProductionEntries([]);
    setProductionEvents([]);
    setSiteSettings(null);
    setActivePromotionsCount(0);
    setActiveSessionsCount(0);
    setProducts([]);
    setDestinations([]);
    setActionTypes([]);
    setPriorityLevels([]);
    setPanelErrors({});

    if (!tenantId || !siteId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // 1. Real-time priorities listener (limited to active/open statuses)
    let unsubPriorities = () => {};
    try {
      const prioritiesQuery = query(
        collection(db, 'priorities'),
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('priorityStatus', 'in', ['ACTIVE', 'SCHEDULED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'PARTIALLY_COMPLETE'])
      );

      unsubPriorities = onSnapshot(
        prioritiesQuery,
        (snap) => {
          const fetched = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Priority));
          fetched.sort((a, b) => {
            const tA = (a.createdDate as any)?.toMillis?.() || 0;
            const tB = (b.createdDate as any)?.toMillis?.() || 0;
            return tB - tA;
          });
          setPriorities(fetched);
          setPanelErrors((prev) => ({ ...prev, priorities: undefined }));
        },
        (err) => {
          console.error('Error listening to priorities:', err);
          setPanelErrors((prev) => ({ ...prev, priorities: 'Failed to load operational priorities' }));
        }
      );
    } catch (err: any) {
      console.error('Failed to setup priorities listener:', err);
      setPanelErrors((prev) => ({ ...prev, priorities: 'Failed to initialize priorities' }));
    }

    // 2. Real-time exceptions listener (limited to active/open statuses)
    let unsubExceptions = () => {};
    try {
      const exceptionsQuery = query(
        collection(db, 'exceptions'),
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('exceptionStatus', 'in', ['OPEN', 'ACKNOWLEDGED'])
      );

      unsubExceptions = onSnapshot(
        exceptionsQuery,
        (snap) => {
          const fetched = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as OperationalException));
          setExceptions(fetched);
          setPanelErrors((prev) => ({ ...prev, exceptions: undefined }));
        },
        (err) => {
          console.error('Error listening to exceptions:', err);
          setPanelErrors((prev) => ({ ...prev, exceptions: 'Failed to load exceptions' }));
        }
      );
    } catch (err: any) {
      console.error('Failed to setup exceptions listener:', err);
      setPanelErrors((prev) => ({ ...prev, exceptions: 'Failed to initialize exceptions' }));
    }

    // 3. Real-time announcements listener (limited to active/open statuses)
    let unsubAnnouncements = () => {};
    try {
      const announcementsQuery = query(
        collection(db, 'announcements'),
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('active', '==', true)
      );

      unsubAnnouncements = onSnapshot(
        announcementsQuery,
        (snap) => {
          const fetched = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Announcement));
          setAnnouncements(fetched);
          setPanelErrors((prev) => ({ ...prev, announcements: undefined }));
        },
        (err) => {
          console.error('Error listening to announcements:', err);
          setPanelErrors((prev) => ({ ...prev, announcements: 'Failed to load announcements' }));
        }
      );
    } catch (err: any) {
      console.error('Failed to setup announcements listener:', err);
      setPanelErrors((prev) => ({ ...prev, announcements: 'Failed to initialize announcements' }));
    }

    // 4. One-time query for recommendations, imports, production plan entries, promotions, sessions, settings
    const fetchOneTimeData = async () => {
      let activeTimezone = 'Europe/London';
      
      // 4a. Site Settings
      try {
        const settingsQuery = query(
          collection(db, 'siteSettings'),
          where('tenantId', '==', tenantId),
          where('siteId', '==', siteId),
          limit(1)
        );
        const settingsSnap = await getDocs(settingsQuery);
        if (!settingsSnap.empty) {
          const settingsObj = { id: settingsSnap.docs[0].id, ...settingsSnap.docs[0].data() } as SiteSettings;
          setSiteSettings(settingsObj);
          if (settingsObj.timezone) {
            activeTimezone = settingsObj.timezone;
          }
        }
      } catch (err: any) {
        console.error('Error fetching site settings:', err);
      }

      // 4b. Recommendations
      try {
        const recsQuery = query(
          collection(db, 'recommendations'),
          where('tenantId', '==', tenantId),
          where('siteId', '==', siteId),
          limit(100)
        );
        const recsSnap = await getDocs(recsQuery);
        const recs = recsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Recommendation));
        recs.sort((a, b) => {
          const tA = a.generatedAt ? (typeof a.generatedAt === 'string' ? new Date(a.generatedAt).getTime() : ((a.generatedAt as any).toMillis ? (a.generatedAt as any).toMillis() : new Date(a.generatedAt as any).getTime())) : 0;
          const tB = b.generatedAt ? (typeof b.generatedAt === 'string' ? new Date(b.generatedAt).getTime() : ((b.generatedAt as any).toMillis ? (b.generatedAt as any).toMillis() : new Date(b.generatedAt as any).getTime())) : 0;
          return tB - tA;
        });
        setRecommendations(recs.slice(0, 50));
        setPanelErrors((prev) => ({ ...prev, recommendations: undefined }));
      } catch (err: any) {
        console.error('Error fetching recommendations:', err);
        setPanelErrors((prev) => ({ ...prev, recommendations: 'Failed to load recommended actions' }));
      }

      // 4c. Latest SAP Plan Import
      try {
        const importsQuery = query(
          collection(db, 'productionPlanImports'),
          where('tenantId', '==', tenantId),
          where('siteId', '==', siteId),
          limit(20)
        );
        const importSnap = await getDocs(importsQuery);
        if (!importSnap.empty) {
          const imports = importSnap.docs.map(d => ({ id: d.id, ...d.data() } as ProductionPlanImport));
          imports.sort((a, b) => {
            const tA = a.uploadedAt ? (typeof a.uploadedAt === 'string' ? new Date(a.uploadedAt).getTime() : ((a.uploadedAt as any).toMillis ? (a.uploadedAt as any).toMillis() : new Date(a.uploadedAt as any).getTime())) : 0;
            const tB = b.uploadedAt ? (typeof b.uploadedAt === 'string' ? new Date(b.uploadedAt).getTime() : ((b.uploadedAt as any).toMillis ? (b.uploadedAt as any).toMillis() : new Date(b.uploadedAt as any).getTime())) : 0;
            return tB - tA;
          });
          setLatestImport(imports[0]);
        } else {
          setLatestImport(null);
        }
        setPanelErrors((prev) => ({ ...prev, freshness: undefined }));
      } catch (err: any) {
        console.error('Error fetching latest import:', err);
        setPanelErrors((prev) => ({ ...prev, freshness: 'Failed to load sync status' }));
      }

      // 4d. Today's Production Plan Entries
      try {
        const { startOfToday, startOfNextDay } = getSiteTimezoneBoundaries(activeTimezone);

        const prodEntriesQuery = query(
          collection(db, 'productionPlanEntries'),
          where('tenantId', '==', tenantId),
          where('siteId', '==', siteId),
          limit(1000)
        );
        const entriesSnap = await getDocs(prodEntriesQuery);
        const allEntries = entriesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as unknown as ProductionPlanEntry));
        const filteredEntries = allEntries.filter((e) => {
          if (!e.productionDate) return false;
          let ms = 0;
          if (typeof e.productionDate === 'string') {
            ms = new Date(e.productionDate).getTime();
          } else if (typeof (e.productionDate as any).toMillis === 'function') {
            ms = (e.productionDate as any).toMillis();
          } else if (typeof (e.productionDate as any).seconds === 'number') {
            ms = (e.productionDate as any).seconds * 1000;
          } else if (e.productionDate instanceof Date) {
            ms = e.productionDate.getTime();
          }
          return ms >= startOfToday.getTime() && ms < startOfNextDay.getTime();
        });
        setProductionEntries(filteredEntries);
        setPanelErrors((prev) => ({ ...prev, production: undefined }));
      } catch (err: any) {
        console.error('Error fetching production entries:', err);
        setPanelErrors((prev) => ({ ...prev, production: 'Failed to load today’s production data' }));
      }

      // 4e. Production Events
      try {
        const prodEventsQuery = query(
          collection(db, 'productionEvents'),
          where('tenantId', '==', tenantId),
          where('siteId', '==', siteId)
        );
        const eventsSnap = await getDocs(prodEventsQuery);
        setProductionEvents(eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionEvent)));
      } catch (err: any) {
        console.error('Error fetching production events:', err);
      }

      // 4f. Active Promotions
      try {
        const promosQuery = query(
          collection(db, 'promotions'),
          where('tenantId', '==', tenantId),
          where('siteId', '==', siteId),
          where('promotionStatus', '==', 'ACTIVE')
        );
        const promosSnap = await getDocs(promosQuery);
        const promosList = promosSnap.docs.map((doc) => doc.data());
        const now = new Date();
        const activePromos = promosList.filter((p: any) => {
          if (p.status === 'archived' || p.status === 'inactive') return false;
          const startDate = p.startDate || p.startAt;
          const endDate = p.endDate || p.endAt;
          if (!startDate || !endDate) return false;

          const startMs = startDate.toDate ? startDate.toDate().getTime() : new Date(startDate).getTime();
          const endMs = endDate.toDate ? endDate.toDate().getTime() : new Date(endDate).getTime();
          
          const preBuildStart = p.preBuildStartDate || p.preBuildStartAt;
          const preBuildMs = preBuildStart ? (preBuildStart.toDate ? preBuildStart.toDate().getTime() : new Date(preBuildStart).getTime()) : startMs;

          const nowMs = now.getTime();
          return nowMs >= preBuildMs && nowMs <= endMs;
        });
        setActivePromotionsCount(activePromos.length);
        setPanelErrors((prev) => ({ ...prev, promotions: undefined }));
      } catch (err: any) {
        console.error('Error fetching promotions:', err);
        setPanelErrors((prev) => ({ ...prev, promotions: 'Failed to load active promotions' }));
      }

      // 4g. Active Sessions (for Admin)
      if (isSuperOrAdmin) {
        try {
          const sessionsQuery = query(
            collection(db, 'sessions'),
            where('tenantId', '==', tenantId),
            where('status', '==', 'ACTIVE'),
            limit(50)
          );
          const sessionsSnap = await getDocs(sessionsQuery);
          setActiveSessionsCount(sessionsSnap.size);
          setPanelErrors((prev) => ({ ...prev, sessions: undefined }));
        } catch (err: any) {
          console.error('Error fetching active sessions:', err);
          setPanelErrors((prev) => ({ ...prev, sessions: 'Failed to load active sessions' }));
        }
      } else {
        setActiveSessionsCount(0);
      }

      setLoading(false);
    };

    // Reference / Configuration collections subscriptions
    let unsubDest = () => {};
    let unsubActions = () => {};
    let unsubLevels = () => {};
    let unsubProd = () => {};

    try {
      unsubDest = subscribeToCollection<Destination>(
        collections.DESTINATIONS,
        [where('tenantId', '==', tenantId)],
        setDestinations,
        console.error
      );
    } catch (e) {
      console.error('Error subscribing to destinations:', e);
    }

    try {
      unsubActions = subscribeToCollection<ActionType>(
        collections.ACTION_TYPES,
        [where('tenantId', '==', tenantId)],
        setActionTypes,
        console.error
      );
    } catch (e) {
      console.error('Error subscribing to action types:', e);
    }

    try {
      unsubLevels = subscribeToCollection<PriorityLevel>(
        collections.PRIORITY_LEVELS,
        [where('tenantId', '==', tenantId)],
        setPriorityLevels,
        console.error
      );
    } catch (e) {
      console.error('Error subscribing to priority levels:', e);
    }

    try {
      unsubProd = subscribeToProducts(tenantId, siteId, setProducts, console.error);
    } catch (e) {
      console.error('Error subscribing to products:', e);
    }

    fetchOneTimeData();

    return () => {
      unsubPriorities();
      unsubExceptions();
      unsubAnnouncements();
      unsubDest();
      unsubActions();
      unsubLevels();
      unsubProd();
    };
  }, [tenantId, siteId, role, isSuperOrAdmin]);

  // Derived Summary Counts
  const counts = useMemo(() => {
    const awaitingRecs = recommendations.filter((r) => r.recommendationStatus === 'AWAITING_REVIEW').length;
    
    const activePris = priorities.filter((p) =>
      ['ACTIVE', 'SCHEDULED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'PARTIALLY_COMPLETE'].includes(p.priorityStatus)
    );

    const urgentPris = activePris.filter(
      (p) =>
        p.priorityLevelId?.toUpperCase().includes('URGENT') ||
        p.priorityLevelId?.toUpperCase().includes('HIGH') ||
        p.priorityLevelId === 'prio_urgent'
    ).length;

    const blockedWork = priorities.filter((p) => p.priorityStatus === 'BLOCKED').length;

    const completedToday = priorities.filter((p) => {
      if (p.priorityStatus !== 'COMPLETED') return false;
      if (!p.completedAt) return false;
      const d = p.completedAt.toDate ? p.completedAt.toDate() : new Date(p.completedAt as any);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length;

    const inventoryExceptions = exceptions.filter(
      (e) =>
        e.exceptionStatus === 'OPEN' &&
        (e.entityType === 'INVENTORY' ||
          ['BELOW_RETENTION', 'ABOVE_MAXIMUM', 'INVENTORY_STALE'].includes(e.exceptionType))
    ).length;

    const totalOpenExceptions = exceptions.filter((e) => e.exceptionStatus === 'OPEN').length;

    // Production today calculations
    const todayStr = new Date().toISOString().split('T')[0];
    const todayEntries = productionEntries.filter((e) => {
      if (!e || !e.productionDate) return false;
      let d: Date;
      if (typeof (e.productionDate as any)?.toDate === 'function') {
        d = (e.productionDate as any).toDate();
      } else if (e.productionDate instanceof Date) {
        d = e.productionDate;
      } else {
        d = new Date(e.productionDate as any);
      }
      if (!d || isNaN(d.getTime())) return false;
      return d.toISOString().split('T')[0] === todayStr;
    });

    const plannedCasesToday = todayEntries.reduce((sum, e) => sum + (e.plannedCases || 0), 0);
    const plannedPalletsToday = todayEntries.reduce((sum, e) => sum + (e.plannedPallets || 0), 0);

    // Freshness issues
    let freshnessIssues = 0;
    if (!latestImport || latestImport.status !== 'COMMITTED') freshnessIssues++;
    if (inventoryExceptions > 0) freshnessIssues++;

    return {
      awaitingRecs,
      urgentPris,
      activePris: activePris.length,
      blockedWork,
      completedToday,
      inventoryExceptions,
      totalOpenExceptions,
      plannedCasesToday,
      plannedPalletsToday,
      plannedLinesToday: new Set(todayEntries.map((e) => e.productionLineId)).size,
      freshnessIssues
    };
  }, [recommendations, priorities, exceptions, productionEntries, latestImport]);

  // Active Announcements Filtered (not expired, active flag = true)
  const activeAnnouncements = useMemo(() => {
    const now = new Date();
    return announcements.filter((a) => {
      if (!a.active) return false;
      if (a.expireAt) {
        const exp = a.expireAt.toDate ? a.expireAt.toDate() : new Date(a.expireAt as any);
        if (exp < now) return false;
      }
      return true;
    });
  }, [announcements]);

  // Data Freshness Indicators
  const freshnessData = useMemo(() => {
    const sapImportTime = latestImport?.uploadedAt ? formatSiteTime(latestImport.uploadedAt) : 'No Import';
    const sapStatus: BadgeVariant = !latestImport
      ? 'blocked'
      : latestImport.status === 'COMMITTED'
      ? 'completed'
      : 'warning';

    const latestRecTime = recommendations[0]?.generatedAt
      ? formatSiteTime(recommendations[0].generatedAt)
      : 'N/A';

    return [
      {
        name: 'SAP Production Plan',
        lastUpdated: sapImportTime,
        statusLabel: latestImport?.status === 'COMMITTED' ? 'Current' : !latestImport ? 'Missing' : 'Stale',
        variant: sapStatus
      },
      {
        name: 'Decision Engine Recommendations',
        lastUpdated: latestRecTime,
        statusLabel: recommendations.length > 0 ? 'Current' : 'Missing',
        variant: recommendations.length > 0 ? 'completed' : 'warning'
      },
      {
        name: 'Inventory Balances',
        lastUpdated: 'Real-time',
        statusLabel: 'Current',
        variant: 'completed' as BadgeVariant
      },
      {
        name: 'Warehouse Progress',
        lastUpdated: 'Real-time',
        statusLabel: 'Current',
        variant: 'completed' as BadgeVariant
      },
      {
        name: 'Promotions Look-Ahead',
        lastUpdated: `${activePromotionsCount} active`,
        statusLabel: activePromotionsCount > 0 ? 'Active' : 'None',
        variant: activePromotionsCount > 0 ? 'completed' : 'hold' as BadgeVariant
      }
    ];
  }, [latestImport, recommendations, activePromotionsCount, siteSettings]);

  if (isDisplay) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 space-y-6 shadow-lg">
          <Tv className="w-16 h-16 text-amber-400 mx-auto animate-pulse" />
          <h2 className="text-2xl font-bold text-slate-100">Display / TV Mode Detected</h2>
          <p className="text-slate-400 max-w-lg mx-auto">
            This operational overview is optimized for desktop and operator interaction. Dedicated TV Displays should use the TV Dashboard layout.
          </p>
          <button
            onClick={() => navigate('/tv-dashboard')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold rounded-lg transition-colors"
          >
            Launch TV Dashboard <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <PageHeader
        title="Operational Overview"
        description={`Real-time operational summary for ${site?.siteName || 'Current Site'} (${site?.tenantId || 'Tenant'})`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Actions (Role-gated) */}
            {isPlanner && (
              <>
                <button
                  onClick={() => navigate('/planning/recommendations')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-medium text-xs rounded-md transition-colors"
                >
                  <Sliders className="w-3.5 h-3.5" /> Review Recs
                </button>

                <button
                  onClick={() => navigate('/planning/production-plan')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-xs rounded-md transition-colors"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-blue-400" /> Import SAP Plan
                </button>

                <button
                  onClick={() => navigate('/operations/priorities/new')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-xs rounded-md transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-400" /> Create Priority
                </button>

                <button
                  onClick={() => navigate('/operations/announcements')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-xs rounded-md transition-colors"
                >
                  <Megaphone className="w-3.5 h-3.5 text-purple-400" /> Announcement
                </button>
              </>
            )}

            {isWarehouse && (
              <button
                onClick={() => navigate('/operations/warehouse')}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-md transition-colors shadow-sm"
              >
                <Package className="w-4 h-4" /> Open Warehouse Execution
              </button>
            )}
          </div>
        }
      />

      {/* Error state alert */}
      {error && (
        <div className="bg-red-950/80 border border-red-800 rounded-lg p-4 text-red-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertOctagon className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1 bg-red-900 hover:bg-red-800 text-red-100 text-xs font-medium rounded transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {onboarding && !isComplete && (
        <div className="bg-slate-950/45 border border-amber-500/15 rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-lg shrink-0">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-200">Site Setup in Progress</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  The setup of operational site <strong className="text-slate-300 font-medium">{site?.siteName || siteId}</strong> is guided by the Onboarding Checklist. Complete the configurations to activate all modules.
                </p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {canComplete && handleOpenOnboardingWizard && (
                <button
                  onClick={handleOpenOnboardingWizard}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  Resume Setup
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
              {canModifyConfig && (
                <button
                  onClick={async () => {
                    if (window.confirm('Are you absolutely sure you want to reset all onboarding progress? This will reset the setup wizard.')) {
                      await resetSiteOnboarding(tenantId, siteId, userProfile?.uid || 'system');
                    }
                  }}
                  className="px-3.5 py-1.5 border border-slate-800 hover:bg-slate-850 hover:border-slate-750 text-slate-400 hover:text-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Progress
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium text-slate-500">
              <span>Onboarding Progress Checklist</span>
              <span className="text-amber-500">{onboarding.completedSteps?.length || 0} of 10 steps completed</span>
            </div>
            <div className="h-1.5 bg-slate-800/60 rounded-full overflow-hidden">
              <div 
                className="h-full bg-amber-500 transition-all duration-500" 
                style={{ width: `${((onboarding.completedSteps?.length || 0) / 10) * 100}%` }}
              />
            </div>
            
            {/* Horizontal inline checklist markers */}
            <div className="hidden md:flex justify-between gap-1 pt-1.5">
              {[
                'Site Details', 'Resources', 'Destinations', 'Actions', 'Priorities', 
                'Settings', 'Decision', 'Products', 'Rules', 'Review'
              ].map((name, idx) => {
                const isStepDone = onboarding.completedSteps?.includes(idx);
                const isStepSkipped = onboarding.skippedOptionalSteps?.includes(idx);
                return (
                  <div key={idx} className="flex-1 text-center">
                    <div className={`h-1.5 rounded-full mb-1 ${isStepDone ? 'bg-green-500' : isStepSkipped ? 'bg-slate-600' : 'bg-slate-800'}`} />
                    <span className={`text-[9px] block whitespace-nowrap truncate font-medium ${isStepDone ? 'text-green-500' : 'text-slate-500'}`}>{name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Role Banner / Context */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 text-slate-200 border border-slate-700 font-medium">
            <Users className="w-3.5 h-3.5 text-amber-400" /> Role: {role}
          </span>
          <span className="hidden sm:inline text-slate-600">|</span>
          <span>Timezone: <strong className="text-slate-300">{siteSettings?.timezone || 'Europe/London'}</strong></span>
        </div>

        {/* Admin specific site health indicator */}
        {isSuperOrAdmin && (
          <div className="flex items-center gap-4 text-slate-300">
            <span className="flex items-center gap-1">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" /> Active Sessions: <strong>{activeSessionsCount}</strong>
            </span>
            <span className="flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" /> Total Open Exceptions: <strong>{counts.totalOpenExceptions}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Recommendations Awaiting Review */}
        <div
          onClick={() => navigate('/planning/recommendations?filter=requires-review')}
          className="bg-slate-900 border border-slate-800 rounded-lg p-5 cursor-pointer hover:border-amber-500/50 hover:bg-slate-800/80 transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Recommendations
            </span>
            <Sliders className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-bold text-slate-100">{counts.awaitingRecs}</span>
            <span className="text-xs text-amber-400 font-medium">Awaiting Review</span>
          </div>
          <div className="mt-3 text-xs text-slate-500 flex items-center justify-between">
            <span>Decision Engine</span>
            <span className="text-amber-400 group-hover:underline flex items-center gap-1">
              View <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Card 2: Urgent Priorities */}
        <div
          onClick={() => navigate('/operations/priorities?filter=urgent')}
          className="bg-slate-900 border border-slate-800 rounded-lg p-5 cursor-pointer hover:border-red-500/50 hover:bg-slate-800/80 transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Urgent Priorities
            </span>
            <AlertTriangle className="w-4 h-4 text-red-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-bold text-slate-100">{counts.urgentPris}</span>
            <span className="text-xs text-red-400 font-medium">High / Urgent</span>
          </div>
          <div className="mt-3 text-xs text-slate-500 flex items-center justify-between">
            <span>Operational Floor</span>
            <span className="text-red-400 group-hover:underline flex items-center gap-1">
              View <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Card 3: Active Priorities */}
        <div
          onClick={() => navigate('/operations/priorities?filter=active')}
          className="bg-slate-900 border border-slate-800 rounded-lg p-5 cursor-pointer hover:border-blue-500/50 hover:bg-slate-800/80 transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Active Priorities
            </span>
            <Activity className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-bold text-slate-100">{counts.activePris}</span>
            <span className="text-xs text-blue-400 font-medium">In Progress / Scheduled</span>
          </div>
          <div className="mt-3 text-xs text-slate-500 flex items-center justify-between">
            <span>Warehouse Dispatch</span>
            <span className="text-blue-400 group-hover:underline flex items-center gap-1">
              View <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Card 4: Blocked Work */}
        <div
          onClick={() => navigate('/operations/priorities?filter=blocked')}
          className="bg-slate-900 border border-slate-800 rounded-lg p-5 cursor-pointer hover:border-rose-500/50 hover:bg-slate-800/80 transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Blocked Work
            </span>
            <XCircle className="w-4 h-4 text-rose-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-bold text-slate-100">{counts.blockedWork}</span>
            <span className="text-xs text-rose-400 font-medium">Requires Attention</span>
          </div>
          <div className="mt-3 text-xs text-slate-500 flex items-center justify-between">
            <span>Execution Blockers</span>
            <span className="text-rose-400 group-hover:underline flex items-center gap-1">
              View <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Card 5: Production Today */}
        <div
          onClick={() => navigate('/planning/production')}
          className="bg-slate-900 border border-slate-800 rounded-lg p-5 cursor-pointer hover:border-emerald-500/50 hover:bg-slate-800/80 transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Planned Production
            </span>
            <CalendarDays className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-bold text-slate-100">
              {counts.plannedCasesToday ? counts.plannedCasesToday.toLocaleString() : '0'}
            </span>
            <span className="text-xs text-emerald-400 font-medium">
              {counts.plannedPalletsToday ? `${counts.plannedPalletsToday} pallets` : 'Cases Today'}
            </span>
          </div>
          <div className="mt-3 text-xs text-slate-500 flex items-center justify-between">
            <span>{counts.plannedLinesToday} Lines Active Today</span>
            <span className="text-emerald-400 group-hover:underline flex items-center gap-1">
              View Plan <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Card 6: Active Promotions */}
        <div
          onClick={() => navigate('/planning/promotions')}
          className="bg-slate-900 border border-slate-800 rounded-lg p-5 cursor-pointer hover:border-purple-500/50 hover:bg-slate-800/80 transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Active Promotions
            </span>
            <TrendingUp className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-bold text-slate-100">{activePromotionsCount}</span>
            <span className="text-xs text-purple-400 font-medium">In Look-Ahead</span>
          </div>
          <div className="mt-3 text-xs text-slate-500 flex items-center justify-between">
            <span>Commercial Lift</span>
            <span className="text-purple-400 group-hover:underline flex items-center gap-1">
              View <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Card 7: Inventory Exceptions */}
        <div
          onClick={() => navigate('/operations/exceptions')}
          className="bg-slate-900 border border-slate-800 rounded-lg p-5 cursor-pointer hover:border-amber-500/50 hover:bg-slate-800/80 transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Inventory Exceptions
            </span>
            <ShieldAlert className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-bold text-slate-100">{counts.inventoryExceptions}</span>
            <span className="text-xs text-amber-400 font-medium">Open Exceptions</span>
          </div>
          <div className="mt-3 text-xs text-slate-500 flex items-center justify-between">
            <span>Retention & Over-Max</span>
            <span className="text-amber-400 group-hover:underline flex items-center gap-1">
              View <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Card 8: Data Freshness */}
        <div
          onClick={() => navigate('/admin/data-freshness')}
          className="bg-slate-900 border border-slate-800 rounded-lg p-5 cursor-pointer hover:border-cyan-500/50 hover:bg-slate-800/80 transition-all group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Data Freshness
            </span>
            <RefreshCw className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-bold text-slate-100">
              {latestImport?.status === 'COMMITTED' ? 'Fresh' : 'Check'}
            </span>
            <span className="text-xs text-cyan-400 font-medium">
              {latestImport ? getAgeString(latestImport.uploadedAt) : 'No Import'}
            </span>
          </div>
          <div className="mt-3 text-xs text-slate-500 flex items-center justify-between">
            <span>SAP Sync</span>
            <span className="text-cyan-400 group-hover:underline flex items-center gap-1">
              Settings <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Priority Panel + Recommendation Panel + Production Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Panel 1: Operational Priority Panel */}
          <SectionCard
            title="Active Operational Priorities"
            description="Highest-impact active priorities requiring floor action"
            actions={
              !panelErrors.priorities && (
                <button
                  onClick={() => navigate('/operations/priorities')}
                  className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1"
                >
                  View all ({priorities.length}) <ArrowRight className="w-3 h-3" />
                </button>
              )
            }
          >
            {panelErrors.priorities ? (
              <div className="bg-red-950/40 border border-red-900/60 rounded-lg p-3 text-xs text-red-300/95 flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-red-400 shrink-0" />
                <span>{panelErrors.priorities}</span>
              </div>
            ) : priorities.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                <CheckCircle className="w-8 h-8 text-emerald-500/40 mx-auto mb-2" />
                No active or blocked priorities for this site.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="text-slate-400 border-b border-slate-800 bg-slate-900/50">
                    <tr>
                      <th className="py-2.5 px-3">Product</th>
                      <th className="py-2.5 px-3">Action</th>
                      <th className="py-2.5 px-3">Quantity</th>
                      <th className="py-2.5 px-3">Level</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Progress</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {priorities.slice(0, 5).map((p) => {
                      const variant: BadgeVariant =
                        p.priorityStatus === 'BLOCKED'
                          ? 'blocked'
                          : p.priorityStatus === 'IN_PROGRESS' || p.priorityStatus === 'ACTIVE'
                          ? 'release'
                          : 'hold';

                      const productMatch = products.find(prod => 
                        (p.productId && prod.id === p.productId) || 
                        (prod.productCode === p.productCodeSnapshot)
                      );
                      const cpp = productMatch?.casesPerPallet || 
                        productMatch?.configurations?.[0]?.casesPerPallet || 
                        100;

                      const levelLabel = getPriorityLevelLabel(p.priorityLevelId, priorityLevels, p.priorityLevelLabel);
                      const actionLabel = getActionTypeLabel(p.actionTypeId, actionTypes, p.actionTypeLabel);
                      const destLabel = getDestinationLabel(p.destinationId, destinations, p.destinationLabel);

                      const isUrgent = levelLabel.toUpperCase().includes('URGENT') || levelLabel.toUpperCase().includes('HIGH');

                      return (
                        <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-3">
                            <div className="font-semibold text-slate-200">{p.productCodeSnapshot}</div>
                            <div className="text-[11px] text-slate-500 truncate max-w-[150px]">
                              {p.descriptionSnapshot}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-mono text-amber-400">{actionLabel}</span>
                            {p.destinationId && (
                              <div className="text-[10px] text-slate-500">→ {destLabel}</div>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-medium text-slate-200">
                              {p.requestedQuantity ? `${p.requestedQuantity} cases` : 'N/A'}
                            </div>
                            {p.requestedQuantity && (
                              <div className="text-[10px] text-amber-500 font-medium">
                                {formatQuantityInPallets(p.requestedQuantity, cpp)}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                isUrgent
                                  ? 'bg-red-950 text-red-300 border border-red-800'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {levelLabel}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <StatusBadge variant={variant} label={p.priorityStatus} />
                          </td>
                          <td className="py-3 px-3 min-w-[120px]">
                            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                              <span>{p.progressPercent || 0}%</span>
                              <span>{p.progressQuantity || 0}/{p.requestedQuantity || 0}</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-amber-500 transition-all"
                                style={{ width: `${Math.min(100, p.progressPercent || 0)}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* Panel 2: Recommendations Awaiting Review */}
          {isPlanner && (
            <SectionCard
              title="Recommendations Awaiting Review"
              description="Automated Decision Engine outputs requiring planner sign-off"
              actions={
                !panelErrors.recommendations && (
                  <button
                    onClick={() => navigate('/planning/recommendations')}
                    className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1"
                  >
                    Workspace ({counts.awaitingRecs}) <ArrowRight className="w-3 h-3" />
                  </button>
                )
              }
            >
              {panelErrors.recommendations ? (
                <div className="bg-red-950/40 border border-red-900/60 rounded-lg p-3 text-xs text-red-300/95 flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{panelErrors.recommendations}</span>
                </div>
              ) : counts.awaitingRecs === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  <CheckCircle className="w-8 h-8 text-emerald-500/40 mx-auto mb-2" />
                  No recommendations awaiting review. All clear!
                </div>
              ) : (
                <div className="space-y-3">
                  {recommendations
                    .filter((r) => r.recommendationStatus === 'AWAITING_REVIEW')
                    .slice(0, 4)
                    .map((r) => (
                      <div
                        key={r.id}
                        onClick={() => navigate(`/planning/recommendations/${r.id}`)}
                        className="bg-slate-900/80 border border-slate-800 rounded-lg p-3.5 hover:border-amber-500/40 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-200 text-sm">
                              {r.productCodeSnapshot}
                            </span>
                            <span className="text-xs text-slate-400">• {r.descriptionSnapshot}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                            <span>
                              Stock: <strong className="text-slate-200">{r.sourceSnapshot?.inventoryTotal ?? 'N/A'}</strong>
                            </span>
                            <span>•</span>
                            <span>
                              Action:{' '}
                              <strong className="text-amber-400">
                                {r.decisionOutput?.actionTypeId || 'RELEASE'} ({r.decisionOutput?.recommendedQuantity || 0} cases)
                              </strong>
                            </span>
                            <span>•</span>
                            <span className="text-slate-500">{getAgeString(r.generatedAt)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {r.decisionOutput?.dataQualityIssues?.length ? (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-amber-950 text-amber-300 border border-amber-800">
                              Warning
                            </span>
                          ) : null}
                          <button className="px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-xs font-medium transition-colors">
                            Review
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </SectionCard>
          )}

          {/* Panel 3: Production Today & Scheduling */}
          <SectionCard
            title="Production Today"
            description="Active line status and planned SAP production schedule"
            actions={
              !panelErrors.production && (
                <button
                  onClick={() => navigate('/planning/production')}
                  className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1"
                >
                  Full Schedule <ArrowRight className="w-3 h-3" />
                </button>
              )
            }
          >
            {/* Notice constraint: Planned production is NOT inventory */}
            <div className="bg-slate-900/90 border border-amber-500/30 rounded p-3 mb-4 text-xs text-amber-300/90 flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Operational Note:</strong> Planned production runs represent upcoming manufacturing schedule and are strictly separate from physical inventory balances.
              </span>
            </div>

            {panelErrors.production ? (
              <div className="bg-red-950/40 border border-red-900/60 rounded-lg p-3 text-xs text-red-300/95 flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-red-400 shrink-0" />
                <span>{panelErrors.production}</span>
              </div>
            ) : !latestImport ? (
              <div className="text-center py-6 text-slate-500 text-sm">
                <FileSpreadsheet className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                SAP production plan has not been imported for this site.
                {isPlanner && (
                  <div className="mt-3">
                    <button
                      onClick={() => navigate('/planning/production-plan')}
                      className="px-4 py-2 bg-amber-500 text-slate-950 rounded text-xs font-semibold hover:bg-amber-600 transition-colors"
                    >
                      Import MPPS7 Plan
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 space-y-2">
                  <span className="text-xs font-medium text-slate-400 uppercase">Latest SAP Workbook</span>
                  <div className="text-sm font-semibold text-slate-200 truncate">{latestImport.fileName}</div>
                  <div className="text-xs text-slate-500 flex items-center justify-between">
                    <span>Imported: {formatSiteTime(latestImport.uploadedAt)}</span>
                    <StatusBadge variant={latestImport.status === 'COMMITTED' ? 'completed' : 'warning'} label={latestImport.status} />
                  </div>
                </div>

                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 space-y-2">
                  <span className="text-xs font-medium text-slate-400 uppercase">Today's Planned Output</span>
                  <div className="text-2xl font-bold text-emerald-400">
                    {counts.plannedCasesToday.toLocaleString()} <span className="text-xs font-normal text-slate-400">cases</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    Across {counts.plannedLinesToday} active production lines ({counts.plannedPalletsToday} pallets)
                  </div>
                </div>
              </div>
            )}
          </SectionCard>
        </div>

        {/* Right 1 Column: Exception Panel + Data Freshness + Announcements */}
        <div className="space-y-6">
          {/* Panel 4: Exception Panel */}
          <SectionCard
            title="Open Operational Exceptions"
            description="Active alerts grouped by severity"
            actions={
              !panelErrors.exceptions && (
                <button
                  onClick={() => navigate('/operations/exceptions')}
                  className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1"
                >
                  Centre ({exceptions.filter((e) => e.exceptionStatus === 'OPEN').length}) <ArrowRight className="w-3 h-3" />
                </button>
              )
            }
          >
            {panelErrors.exceptions ? (
              <div className="bg-red-950/40 border border-red-900/60 rounded-lg p-3 text-xs text-red-300/95 flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-red-400 shrink-0" />
                <span>{panelErrors.exceptions}</span>
              </div>
            ) : exceptions.filter((e) => e.exceptionStatus === 'OPEN').length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                <CheckCircle className="w-6 h-6 text-emerald-500/40 mx-auto mb-1" />
                No open operational exceptions.
              </div>
            ) : (
              <div className="space-y-2.5">
                {exceptions
                  .filter((e) => e.exceptionStatus === 'OPEN')
                  .slice(0, 5)
                  .map((ex) => {
                    const badgeVariant: BadgeVariant =
                      ex.severity === 'CRITICAL' ? 'urgent' : ex.severity === 'WARNING' ? 'warning' : 'information';

                    return (
                      <div
                        key={ex.id}
                        onClick={() => navigate('/operations/exceptions')}
                        className="p-3 bg-slate-900 border border-slate-800 rounded-lg hover:border-slate-700 transition-colors cursor-pointer space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-200 truncate">{ex.title}</span>
                          <StatusBadge variant={badgeVariant} label={ex.severity} />
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-2">{ex.message}</p>
                        <div className="text-[10px] text-slate-500 flex items-center justify-between pt-1">
                          <span>Category: {ex.entityType}</span>
                          <span>{getAgeString(ex.firstDetectedAt)}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </SectionCard>

          {/* Panel 5: Data Freshness Status */}
          <SectionCard title="Data Freshness" description="Source sync and timestamp status">
            {panelErrors.freshness ? (
              <div className="bg-red-950/40 border border-red-900/60 rounded-lg p-3 text-xs text-red-300/95 flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-red-400 shrink-0" />
                <span>{panelErrors.freshness}</span>
              </div>
            ) : (
              <div className="space-y-3">
                {freshnessData.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-800/60 last:border-0">
                    <div>
                      <div className="font-medium text-slate-200">{item.name}</div>
                      <div className="text-[11px] text-slate-500">{item.lastUpdated}</div>
                    </div>
                    <StatusBadge variant={item.variant} label={item.statusLabel} />
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Panel 6: Active Site Announcements */}
          <SectionCard
            title="Site Announcements"
            description="Active messages for current shift"
            actions={
              isPlanner && !panelErrors.announcements ? (
                <button
                  onClick={() => navigate('/operations/announcements')}
                  className="text-xs text-amber-400 hover:text-amber-300 font-medium"
                >
                  Manage
                </button>
              ) : undefined
            }
          >
            {panelErrors.announcements ? (
              <div className="bg-red-950/40 border border-red-900/60 rounded-lg p-3 text-xs text-red-300/95 flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-red-400 shrink-0" />
                <span>{panelErrors.announcements}</span>
              </div>
            ) : activeAnnouncements.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                <Megaphone className="w-6 h-6 text-slate-600 mx-auto mb-1" />
                No active site announcements.
              </div>
            ) : (
              <div className="space-y-3">
                {activeAnnouncements.slice(0, 3).map((a) => (
                  <div
                    key={a.id}
                    className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200">{a.title}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                          a.severity === 'CRITICAL'
                            ? 'bg-red-950 text-red-300 border border-red-800'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {a.severity}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{a.message}</p>
                    <div className="text-[10px] text-slate-500 pt-1">
                      Posted: {formatSiteTime(a.createdDate)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
};

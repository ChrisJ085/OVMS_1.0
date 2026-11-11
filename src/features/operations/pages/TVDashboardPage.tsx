import React, { useState, useEffect, useMemo } from 'react';
import { DisplayPriority } from '../../../types/priority';
import { Announcement } from '../../../types/announcement';
import { OperationalException } from '../../../types/exception';
import { Product } from '../../../types/product';
import { useSiteContext } from '../../../contexts/SiteContext';
import { useSiteOnboarding } from '../../../hooks/useSiteOnboarding';
import { getSiteSettings } from '../../administration/services/settingsService';
import { SiteSettings } from '../../../types/settings';
import { subscribeToProducts } from '../../inventory/services/productService';
import { collections } from '../../configuration/services/configurationService';
import { Destination, ActionType, PriorityLevel } from '../../../types/configuration';
import { 
  getActionTypeLabel, 
  getDestinationLabel,
  getDestinationCodeLabel, 
  getPriorityLevelLabel, 
  formatQuantityInPallets, 
  isManualInstruction 
} from '../utils/priorityFormatters';
import { subscribeToCollection } from '../../../services/dbService';
import { supabase } from '../../../config/supabase';
import { toCamelCase } from '../../../utils/caseTransformers';
import { 
  AlertTriangle, Clock, CheckCircle, Ban, Play, Pause, List, Pin, ArrowUpDown,
  LayoutGrid, AlertCircle, TrendingDown,
  Wifi, WifiOff, Settings, Package, Info, Calendar, Layers
} from 'lucide-react';
import { subscribeToBalances } from '../../inventory/services/inventoryService';
import { InventoryBalance } from '../../../types/inventory';
import { useSnp87Planning } from '../../planning/hooks/useSnp87Planning';
import { computeWeeklyForecastPlan } from '../../planning/services/snp87ImportService';
import { areProductCodesEqual, normalizeProductCode } from '../../../utils/productCodeNormalizer';

// Constants
const PAGE_ROTATION_MS = 15000;
const COMPLETED_RETENTION_MS = 10 * 60 * 1000; // 10 minutes

const PRIORITY_WEIGHTS: Record<string, number> = {
  CRITICAL: 5,
  URGENT: 4,
  HIGH: 3,
  NORMAL: 2,
  LOW: 1
};

const getShortReason = (p: DisplayPriority, hasForecast = false): string => {
  const text = (p.selectionLogicSummary || p.instruction || '').toLowerCase();
  const act = (p.actionTypeId || p.actionTypeLabel || '').toLowerCase();
  
  if (act.includes('prod') || text.includes('production')) return 'Replenish Stock';
  
  const isHoldAction = /\bhold\b/i.test(act) || p.actionTypeId === 'ACTION_HOLD';
  if (isHoldAction) {
    if (hasForecast) return 'Hold - Protect Forecast';
    return 'Clearance - No Forecast';
  }
  
  if (hasForecast) {
    return 'Surplus Clearance';
  }

  if (text.includes('congestion') || text.includes('pressure') || text.includes('space')) {
    return 'Floor Space Relief';
  }
  
  if (text.includes('surplus') || text.includes('exceeds')) {
    return 'Surplus Clearance';
  }
  
  if (p.priorityLevelId?.toLowerCase().includes('high') || text.includes('high')) {
    return 'Urgent Despatch';
  }
  
  return 'Surplus Clearance';
};

const getPriorityDisplayLabel = (
  levelId: string, 
  priorityLevels: PriorityLevel[], 
  snapshot?: string
): string => {
  const rawLabel = getPriorityLevelLabel(levelId, priorityLevels, snapshot).toUpperCase();
  if (rawLabel.includes('CRITICAL')) return 'CRITICAL';
  if (rawLabel.includes('URGENT')) return 'URGENT';
  if (rawLabel.includes('HIGH')) return 'HIGH';
  if (rawLabel.includes('NORMAL') || rawLabel.includes('MEDIUM')) return 'STANDARD';
  if (rawLabel.includes('LOW')) return 'LOW PRIORITY';
  return rawLabel;
};

interface TileTheme {
  border: string;
  bg: string;
  badgeBg: string;
  actionBg: string;
  productCodeText: string;
  accentText: string;
  iconContainer: string;
  statusBadge: string;
}

const getTileTheme = (
  levelLabel: string, 
  priorityStatus: string
): TileTheme => {
  const isBlocked = priorityStatus === 'BLOCKED';
  const isCompleted = priorityStatus === 'COMPLETED';

  if (isBlocked) {
    return {
      border: 'border-red-500/90',
      bg: 'bg-red-950/40',
      badgeBg: 'bg-red-600 text-white',
      actionBg: 'bg-red-600 text-white',
      productCodeText: 'text-red-300',
      accentText: 'text-red-400',
      iconContainer: 'bg-red-900/50 text-red-300 border-red-700/60',
      statusBadge: 'bg-red-900/80 text-red-200'
    };
  }

  if (isCompleted) {
    return {
      border: 'border-emerald-500/70',
      bg: 'bg-emerald-950/30',
      badgeBg: 'bg-emerald-600 text-white',
      actionBg: 'bg-emerald-600 text-white',
      productCodeText: 'text-emerald-400',
      accentText: 'text-emerald-400',
      iconContainer: 'bg-emerald-900/50 text-emerald-300 border-emerald-700/60',
      statusBadge: 'bg-emerald-900/80 text-emerald-200'
    };
  }

  const normalized = levelLabel.toUpperCase();
  if (normalized.includes('CRITICAL') || normalized.includes('URGENT')) {
    return {
      border: 'border-red-500/80',
      bg: 'bg-red-950/30',
      badgeBg: 'bg-red-600 text-white',
      actionBg: 'bg-red-600 text-white',
      productCodeText: 'text-red-400',
      accentText: 'text-red-400',
      iconContainer: 'bg-red-900/50 text-red-300 border-red-700/60',
      statusBadge: 'bg-red-900/80 text-red-200'
    };
  }

  if (normalized.includes('HIGH')) {
    return {
      border: 'border-amber-500/70',
      bg: 'bg-amber-950/30',
      badgeBg: 'bg-amber-600 text-white',
      actionBg: 'bg-amber-600 text-white',
      productCodeText: 'text-amber-400',
      accentText: 'text-amber-400',
      iconContainer: 'bg-amber-900/50 text-amber-300 border-amber-700/60',
      statusBadge: 'bg-amber-900/80 text-amber-200'
    };
  }

  if (normalized.includes('LOW')) {
    return {
      border: 'border-slate-700',
      bg: 'bg-slate-900/80',
      badgeBg: 'bg-slate-700 text-slate-200',
      actionBg: 'bg-slate-700 text-slate-100',
      productCodeText: 'text-slate-200',
      accentText: 'text-slate-400',
      iconContainer: 'bg-slate-800 text-slate-400 border-slate-700',
      statusBadge: 'bg-slate-800 text-slate-300'
    };
  }

  // NORMAL / STANDARD default
  return {
    border: 'border-blue-500/60',
    bg: 'bg-blue-950/25',
    badgeBg: 'bg-blue-600 text-white',
    actionBg: 'bg-blue-600 text-white',
    productCodeText: 'text-blue-400',
    accentText: 'text-blue-400',
    iconContainer: 'bg-blue-900/50 text-blue-300 border-blue-700/60',
    statusBadge: 'bg-blue-900/80 text-blue-200'
  };
};

export const TVDashboardPage: React.FC = () => {
  const { tenantId, siteId, siteName, site, siteLoading } = useSiteContext();
  const { onboarding, isComplete, loading: onboardingLoading } = useSiteOnboarding();
  const [priorities, setPriorities] = useState<DisplayPriority[]>([]);
  const [exceptions, setExceptions] = useState<OperationalException[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isConnected, setIsConnected] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [demandViewMode, setDemandViewMode] = useState<'horizon' | 'horizon7d' | 'full'>('horizon');
  const [displayLayoutMode, setDisplayLayoutMode] = useState<'grid' | 'flightBoard'>(() => {
    try {
      return (localStorage.getItem('tv_display_layout_mode') as 'grid' | 'flightBoard') || 'grid';
    } catch {
      return 'grid';
    }
  });
  const [isFlightBoardAutoScrollEnabled, setIsFlightBoardAutoScrollEnabled] = useState(true);
  const [isFlightBoardHovered, setIsFlightBoardHovered] = useState(false);
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);

  useEffect(() => {
    if (!tenantId || !siteId || tenantId === 'GLOBAL' || siteId === 'GLOBAL') return;
    getSiteSettings(tenantId, siteId).then(data => {
      if (data) {
        setSiteSettings(data);
        if (data.defaultDashboardLayout) {
          setDisplayLayoutMode(data.defaultDashboardLayout);
        }
      }
    }).catch(console.error);
  }, [tenantId, siteId]);

  const flightBoardScrollRef = React.useRef<HTMLDivElement>(null);

  const toggleDisplayLayoutMode = (mode: 'grid' | 'flightBoard') => {
    setDisplayLayoutMode(mode);
    try {
      localStorage.setItem('tv_display_layout_mode', mode);
    } catch {}
  };

  const isFlightBoardFeatureEnabled = siteSettings?.flightBoardEnabled !== false;
  const activeLayoutMode = isFlightBoardFeatureEnabled ? displayLayoutMode : 'grid';

  // SNP87 Planning data hook for active snapshot & forecast demand
  const { activeSnapshot, activeRows, snapshotLoading } = useSnp87Planning(tenantId, siteId);

  // Dynamic config collections
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [actionTypes, setActionTypes] = useState<ActionType[]>([]);
  const [priorityLevels, setPriorityLevels] = useState<PriorityLevel[]>([]);

  useEffect(() => {
    if (!tenantId) return;

    const unsubDest = subscribeToCollection<Destination>(
      collections.DESTINATIONS,
      [{ field: 'tenantId', op: '==', value: tenantId }],
      setDestinations,
      console.error
    );

    const unsubActions = subscribeToCollection<ActionType>(
      collections.ACTION_TYPES,
      [{ field: 'tenantId', op: '==', value: tenantId }],
      setActionTypes,
      console.error
    );

    const unsubPriorities = subscribeToCollection<PriorityLevel>(
      collections.PRIORITY_LEVELS,
      [{ field: 'tenantId', op: '==', value: tenantId }],
      setPriorityLevels,
      console.error
    );

    return () => {
      unsubDest();
      unsubActions();
      unsubPriorities();
    };
  }, [tenantId]);

  // Subscribe to Products for pallet calculation
  useEffect(() => {
    if (!tenantId || !siteId || tenantId === 'GLOBAL' || siteId === 'GLOBAL') return;
    const unsubProd = subscribeToProducts(tenantId, siteId, setProducts, console.error);
    return () => unsubProd();
  }, [tenantId, siteId]);

  // Subscribe to Inventory Balances for on-hand pallet calculation
  useEffect(() => {
    if (!tenantId || !siteId || tenantId === 'GLOBAL' || siteId === 'GLOBAL') return;
    const unsubBal = subscribeToBalances(
      tenantId,
      siteId,
      (items) => setBalances(items),
      (err) => console.warn('TV Dashboard inventory balance subscription error:', err)
    );
    return () => unsubBal();
  }, [tenantId, siteId]);

  // Clock tick
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Data Fetching for displayPriorities
  useEffect(() => {
    if (!tenantId || !siteId || tenantId === 'GLOBAL' || siteId === 'GLOBAL') return;

    const fetchPriorities = async () => {
      try {
        const { data, error } = await supabase
          .from('display_priorities')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('site_id', siteId);

        if (error) throw error;

        const now = new Date();
        const fetched = (data || []).map(row => toCamelCase<DisplayPriority>(row));
        
        const activePriorities = fetched.filter(p => {
          if (['DRAFT', 'SCHEDULED', 'ARCHIVED', 'CANCELLED', 'EXPIRED'].includes(p.priorityStatus)) {
            if (p.priorityStatus === 'SCHEDULED' && p.startAt) {
               try {
                 const start = new Date(p.startAt);
                 if (start && start.getTime && !isNaN(start.getTime()) && start <= now) return true;
               } catch (e) {
                 console.warn('Failed to parse startAt for scheduled item', p.id);
               }
            }
            return false;
          }
          
          if (p.priorityStatus === 'COMPLETED') {
            try {
              const compDate = p.completedAt 
                ? new Date(p.completedAt) 
                : ((p as any).modifiedDate 
                    ? new Date((p as any).modifiedDate)
                    : new Date());
              
              if (compDate && compDate.getTime && !isNaN(compDate.getTime())) {
                if (now.getTime() - compDate.getTime() > COMPLETED_RETENTION_MS) {
                  return false;
                }
              }
            } catch (e) {
              console.warn('Failed to parse completedAt for item', p.id);
            }
          }
          
          if (p.expireAt && !p.untilSwitchedOff) {
            try {
              const exp = new Date(p.expireAt);
              if (exp && exp.getTime && !isNaN(exp.getTime()) && exp < now) return false;
            } catch (e) {
              console.warn('Failed to parse expireAt for item', p.id);
            }
          }

          return true;
        });

        // Sort
        activePriorities.sort((a, b) => {
          const labelA = getPriorityLevelLabel(a.priorityLevelId, priorityLevels, a.priorityLevelLabel).toUpperCase();
          const labelB = getPriorityLevelLabel(b.priorityLevelId, priorityLevels, b.priorityLevelLabel).toUpperCase();
          const getWeight = (l: string) => {
            if (l.includes('CRITICAL')) return 5;
            if (l.includes('URGENT')) return 4;
            if (l.includes('HIGH')) return 3;
            if (l.includes('LOW')) return 1;
            return 2;
          };
          const weightA = getWeight(labelA);
          const weightB = getWeight(labelB);
          if (weightA !== weightB) return weightB - weightA;
          
          try {
            const dateA = a.startAt ? new Date(a.startAt as any) : (a.createdDate ? new Date(a.createdDate as any) : new Date(0));
            const dateB = b.startAt ? new Date(b.startAt as any) : (b.createdDate ? new Date(b.createdDate as any) : new Date(0));
            
            const timeA = dateA && dateA.getTime && !isNaN(dateA.getTime()) ? dateA.getTime() : 0;
            const timeB = dateB && dateB.getTime && !isNaN(dateB.getTime()) ? dateB.getTime() : 0;
            
            return timeA - timeB;
          } catch (e) {
            return 0;
          }
        });

        setPriorities(activePriorities);
        setLastUpdate(new Date());
        setIsConnected(true);
      } catch (err) {
        console.error(err);
        setIsConnected(false);
      }
    };

    const fetchExceptions = async () => {
      try {
        const { data, error } = await supabase
          .from('exceptions')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('site_id', siteId)
          .in('exception_status', ['OPEN', 'ACKNOWLEDGED']);

        if (error) throw error;
        setExceptions((data || []).map(row => toCamelCase<OperationalException>(row)));
      } catch (err) {
        console.error(err);
      }
    };

    const fetchAnnouncements = async () => {
      try {
        const { data, error } = await supabase
          .from('announcements')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('site_id', siteId)
          .eq('active', true)
          .eq('display_on_tv', true);

        if (error) throw error;
        const fetched = (data || []).map(row => toCamelCase<Announcement>(row));
        
        const now = new Date();
        const activeAnnouncements = fetched.filter(a => {
          const start = a.startAt ? new Date(a.startAt as any) : null;
          if (start && start > now) return false;
          
          if (a.expireAt) {
            const exp = new Date(a.expireAt as any);
            if (exp < now) return false;
          }
          return true;
        });
        
        setAnnouncements(activeAnnouncements);
      } catch (err) {
        console.error(err);
      }
    };

    fetchPriorities();
    fetchExceptions();
    fetchAnnouncements();

    const prioritiesChannel = supabase
      .channel(`tv_priorities_realtime_${siteId}_${Math.random().toString(36).substring(2, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'display_priorities', filter: `tenant_id=eq.${tenantId}` },
        () => fetchPriorities()
      )
      .subscribe();

    const exceptionsChannel = supabase
      .channel(`tv_exceptions_realtime_${siteId}_${Math.random().toString(36).substring(2, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'exceptions', filter: `tenant_id=eq.${tenantId}` },
        () => fetchExceptions()
      )
      .subscribe();

    const announcementsChannel = supabase
      .channel(`tv_announcements_realtime_${siteId}_${Math.random().toString(36).substring(2, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'announcements', filter: `tenant_id=eq.${tenantId}` },
        () => fetchAnnouncements()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(prioritiesChannel);
      supabase.removeChannel(exceptionsChannel);
      supabase.removeChannel(announcementsChannel);
    };
  }, [tenantId, siteId]);

  // Offline detection fallback
  useEffect(() => {
    const handleOnline = () => setIsConnected(true);
    const handleOffline = () => setIsConnected(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Dynamic grid layout calculation to fit cards on one screen
  const gridConfig = useMemo(() => {
    const count = priorities.length;
    if (count <= 2) return { cols: 2, rows: 1, itemsPerPage: 2 };
    if (count <= 4) return { cols: 2, rows: 2, itemsPerPage: 4 };
    if (count <= 6) return { cols: 3, rows: 2, itemsPerPage: 6 };
    if (count <= 9) return { cols: 3, rows: 3, itemsPerPage: 9 };
    if (count <= 12) return { cols: 4, rows: 3, itemsPerPage: 12 };
    if (count <= 16) return { cols: 4, rows: 4, itemsPerPage: 16 };
    return { cols: 4, rows: 4, itemsPerPage: 16 };
  }, [priorities.length]);

  const totalPages = Math.ceil(priorities.length / gridConfig.itemsPerPage) || 1;

  useEffect(() => {
    if (totalPages <= 1) {
      setCurrentPage(0);
      return;
    }
    const timer = setInterval(() => {
      setCurrentPage(prev => (prev + 1) % totalPages);
    }, PAGE_ROTATION_MS);
    return () => clearInterval(timer);
  }, [totalPages]);

  const visiblePriorities = priorities.slice(
    currentPage * gridConfig.itemsPerPage, 
    (currentPage + 1) * gridConfig.itemsPerPage
  );

  const compactMode = gridConfig.cols >= 4 || gridConfig.rows >= 3;

  // Flight Board Auto-Scroll Animation Loop
  useEffect(() => {
    if (displayLayoutMode !== 'flightBoard' || !isFlightBoardAutoScrollEnabled || isFlightBoardHovered) return;

    const scrollContainer = flightBoardScrollRef.current;
    if (!scrollContainer) return;

    let animationFrameId: number;
    let pauseTimeoutId: NodeJS.Timeout | null = null;
    let isHolding = false;

    const scrollStep = () => {
      if (isHolding || !scrollContainer) return;

      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;

      if (scrollTop + clientHeight >= scrollHeight - 4) {
        isHolding = true;
        pauseTimeoutId = setTimeout(() => {
          if (scrollContainer) {
            scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
            setTimeout(() => {
              isHolding = false;
              animationFrameId = requestAnimationFrame(scrollStep);
            }, 1200);
          }
        }, 3500);
        return;
      }

      scrollContainer.scrollTop += 0.7; // Smooth 0.7px per frame step
      animationFrameId = requestAnimationFrame(scrollStep);
    };

    animationFrameId = requestAnimationFrame(scrollStep);

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (pauseTimeoutId) clearTimeout(pauseTimeoutId);
    };
  }, [displayLayoutMode, isFlightBoardAutoScrollEnabled, isFlightBoardHovered, priorities]);

  // Pinned Urgent Priorities (CRITICAL, URGENT, HIGH, BLOCKED)
  const pinnedPriorities = useMemo(() => {
    return priorities.filter(p => {
      const label = getPriorityLevelLabel(p.priorityLevelId, priorityLevels, p.priorityLevelLabel).toUpperCase();
      return label.includes('CRITICAL') || label.includes('URGENT') || label.includes('HIGH') || p.priorityStatus === 'BLOCKED';
    });
  }, [priorities, priorityLevels]);

  // Derived metrics
  const stats = useMemo(() => {
    return {
      active: priorities.length,
      urgent: priorities.filter(p => p.priorityLevelId === 'CRITICAL' || p.priorityLevelId === 'HIGH').length,
      blocked: priorities.filter(p => p.priorityStatus === 'BLOCKED').length,
      belowRetention: exceptions.filter(e => e.exceptionType === 'BELOW_RETENTION').length,
      aboveMax: exceptions.filter(e => e.exceptionType === 'ABOVE_MAXIMUM').length,
      promotionAffected: exceptions.filter(e => e.exceptionType === 'PROMOTION_CONFLICT').length,
      staleInventory: exceptions.filter(e => e.exceptionType === 'INVENTORY_STALE').length
    };
  }, [priorities, exceptions]);

  // Helper to format horizon date label
  const formatHorizonDateLabel = (dateStr: string): string => {
    if (!dateStr) return 'ACTIVE HORIZON';
    try {
      const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
      const parts = clean.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const d = new Date(year, month, day);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        }
      }
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      }
    } catch (e) {
      // fallback
    }
    return dateStr;
  };

  // Map inventory balances by productId and productCode (ignoring leading zeros and case)
  const inventoryStockMap = useMemo(() => {
    const byId = new Map<string, number>();
    const byCode = new Map<string, number>();
    balances.forEach(b => {
      const qty = Number(b.quantity) || 0;
      if (b.productId) {
        byId.set(b.productId, (byId.get(b.productId) || 0) + qty);
      }
      if (b.productCodeSnapshot) {
        const codeUpper = b.productCodeSnapshot.trim().toUpperCase();
        byCode.set(codeUpper, (byCode.get(codeUpper) || 0) + qty);
        const normCode = normalizeProductCode(b.productCodeSnapshot);
        if (normCode) {
          byCode.set(normCode, (byCode.get(normCode) || 0) + qty);
        }
      }
    });
    return { byId, byCode };
  }, [balances]);

  // Aggregate weekly forecast plan from active SNP87 snapshot
  const weeklyPlans = useMemo(() => {
    return computeWeeklyForecastPlan(activeRows, products);
  }, [activeRows, products]);

  // Target Horizon Date
  const targetHorizonDate = useMemo(() => {
    if (weeklyPlans.length > 0 && weeklyPlans[0].horizonDate) {
      return weeklyPlans[0].horizonDate;
    }
    if (activeSnapshot?.importPeriod?.startDate) {
      return activeSnapshot.importPeriod.startDate;
    }
    return '';
  }, [weeklyPlans, activeSnapshot]);

  // Calculate detailed stock in pallets vs demand in pallets for each forecast product
  // Rounding rule from user: "If the demand quantity is less than a full pallet, round it up to a full pallet, example: 0.6=1 , 2.4=3"
  const forecastStockItems = useMemo(() => {
    return weeklyPlans.map(plan => {
      const matchedProduct = products.find(p => 
        (plan.productId && p.id === plan.productId) ||
        areProductCodesEqual(p.productCode, plan.productCode)
      );

      const cpp = matchedProduct?.casesPerPallet || 
        matchedProduct?.configurations?.[0]?.casesPerPallet || 
        plan.casesPerPallet || 
        40;

      // On-Hand Cases and Pallets (ignoring leading zeros)
      const onHandCases = (plan.productId ? inventoryStockMap.byId.get(plan.productId) : undefined) ?? 
        inventoryStockMap.byCode.get(plan.productCode.toUpperCase()) ?? 
        inventoryStockMap.byCode.get(normalizeProductCode(plan.productCode)) ?? 0;

      const rawOnHandPallets = cpp > 0 ? onHandCases / cpp : 0;
      const onHandPallets = rawOnHandPallets % 1 === 0 
        ? rawOnHandPallets 
        : Number(rawOnHandPallets.toFixed(1));

      // Requirements across different horizons
      const horizonRequiredPallets = plan.horizonRequiredPallets ?? (cpp > 0 ? Math.ceil((plan.horizonDemandCases || 0) / cpp) : 0);
      const next7DaysRequiredPallets = plan.next7DaysRequiredPallets ?? (cpp > 0 ? Math.ceil((plan.next7DaysCases || 0) / cpp) : 0);
      const horizonPlus7DaysRequiredPallets = plan.horizonPlus7DaysRequiredPallets ?? (horizonRequiredPallets + next7DaysRequiredPallets);
      const totalRequiredPallets = plan.totalRequiredPallets ?? (cpp > 0 ? Math.ceil(plan.totalForecastCases / cpp) : 0);

      // Active required pallets based on view mode
      let activeRequiredPallets = horizonRequiredPallets;
      if (demandViewMode === 'horizon7d') {
        activeRequiredPallets = horizonPlus7DaysRequiredPallets;
      } else if (demandViewMode === 'full') {
        activeRequiredPallets = totalRequiredPallets;
      }

      const isShortfall = onHandPallets < activeRequiredPallets;
      const deficitPallets = isShortfall ? Math.max(0, activeRequiredPallets - Math.floor(rawOnHandPallets)) : 0;
      const surplusPallets = !isShortfall ? Math.max(0, Math.floor(rawOnHandPallets) - activeRequiredPallets) : 0;

      // Confirmed production in snapshot
      const confirmedProductionPallets = plan.confirmedProductionPallets || 0;
      const productionBeforeHorizonPallets = plan.productionBeforeHorizonPallets || 0;

      return {
        productId: plan.productId,
        productCode: plan.productCode,
        productDescription: plan.productDescription || matchedProduct?.description || 'Forecast Product',
        casesPerPallet: cpp,
        horizonDate: plan.horizonDate,
        totalForecastCases: plan.totalForecastCases,

        horizonDemandCases: plan.horizonDemandCases || 0,
        horizonDemandPallets: plan.horizonDemandPallets || 0,
        horizonRequiredPallets,

        next7DaysCases: plan.next7DaysCases || 0,
        next7DaysPallets: plan.next7DaysPallets || 0,
        next7DaysRequiredPallets,
        next7DaysWindow: plan.next7DaysWindow,

        horizonPlus7DaysRequiredPallets,
        totalRequiredPallets,

        confirmedProductionPallets,
        productionBeforeHorizonPallets,

        activeRequiredPallets,
        onHandCases,
        rawOnHandPallets,
        onHandPallets,
        isShortfall,
        deficitPallets,
        surplusPallets
      };
    }).sort((a, b) => {
      // Prioritize items where on hand is short of active demand (so warehouse knows what must stay on site!)
      if (a.isShortfall && !b.isShortfall) return -1;
      if (!a.isShortfall && b.isShortfall) return 1;
      return b.activeRequiredPallets - a.activeRequiredPallets;
    });
  }, [weeklyPlans, products, inventoryStockMap, demandViewMode]);

  const totalRequiredPallets = useMemo(() => {
    return forecastStockItems.reduce((sum, item) => sum + item.activeRequiredPallets, 0);
  }, [forecastStockItems]);

  const totalOnHandPallets = useMemo(() => {
    return forecastStockItems.reduce((sum, item) => sum + Math.floor(item.rawOnHandPallets), 0);
  }, [forecastStockItems]);

  const shortfallCount = useMemo(() => {
    return forecastStockItems.filter(item => item.isShortfall).length;
  }, [forecastStockItems]);

  // Active Displayed Site Label (Never raw ID)
  const displaySiteLabel = useMemo(() => {
    if (siteName) return siteName;
    if (site?.siteName) return site.siteName;
    return 'Active Site';
  }, [siteName, site]);

  if (siteLoading || onboardingLoading) {
    return (
      <div className="h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center space-y-6 font-sans">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-100">Syncing Dashboard Data</h2>
          <p className="text-slate-400 text-sm">Please wait while we prepare the operational display...</p>
        </div>
      </div>
    );
  }

  if (!tenantId || !siteId) {
    return (
      <div className="h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center space-y-6 font-sans">
        <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 text-red-500 rounded-full flex items-center justify-center">
          <AlertCircle className="w-10 h-10" />
        </div>
        <div className="space-y-2 max-w-md">
          <h2 className="text-2xl font-extrabold text-slate-100 tracking-tight">No Site Selected</h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            This display terminal requires an active site assignment to load data. 
            Please use the control menu to select a site or contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  if (onboarding && !isComplete) {
    return (
      <div className="h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center space-y-6 select-none font-sans">
        <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 text-amber-500 rounded-full flex items-center justify-center animate-pulse">
          <Settings className="w-10 h-10 animate-spin" />
        </div>
        
        <div className="space-y-2 max-w-md">
          <h2 className="text-2xl font-extrabold text-slate-100 tracking-tight">Site Configuration In Progress</h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            This display terminal will activate automatically once the guided site onboarding setup for <strong className="text-slate-300">{displaySiteLabel}</strong> has been fully completed by an administrator.
          </p>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg text-left w-full max-w-sm space-y-2">
          <div className="flex justify-between text-xs text-slate-500 font-medium">
            <span>Onboarding Status:</span>
            <span className="text-amber-500 uppercase font-bold">{onboarding.status}</span>
          </div>
          <div className="flex justify-between text-xs text-slate-500 font-medium">
            <span>Steps Configured:</span>
            <span className="text-slate-300 font-mono">{onboarding.completedSteps?.length || 0} / 10</span>
          </div>
          <div className="h-1 bg-slate-800 rounded-full overflow-hidden mt-1.5">
            <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${((onboarding.completedSteps?.length || 0) / 10) * 100}%` }} />
          </div>
        </div>
      </div>
    );
  }

  // Flight Board Row Renderer
  const renderFlightBoardRow = (p: DisplayPriority, isPinned = false) => {
    const levelLabel = getPriorityLevelLabel(p.priorityLevelId, priorityLevels, p.priorityLevelLabel);
    const displayLevelLabel = getPriorityDisplayLabel(p.priorityLevelId, priorityLevels, p.priorityLevelLabel);
    const theme = getTileTheme(levelLabel, p.priorityStatus);

    const isBlocked = p.priorityStatus === 'BLOCKED';
    const isCompleted = p.priorityStatus === 'COMPLETED';

    const productMatch = products.find(prod => 
      (p.productId && prod.id === p.productId) || 
      (p.productCodeSnapshot && areProductCodesEqual(prod.productCode, p.productCodeSnapshot))
    );
    const cpp = productMatch?.casesPerPallet || 
      productMatch?.configurations?.[0]?.casesPerPallet || 
      null;

    const forecastItem = forecastStockItems.find(f =>
      (p.productId && f.productId === p.productId) ||
      (p.productCodeSnapshot && areProductCodesEqual(f.productCode, p.productCodeSnapshot))
    );
    const hasForecastDemand = Boolean(forecastItem && (forecastItem.requiredPallets > 0 || forecastItem.totalForecastCases > 0));

    let qtyValue = '0';
    let unitLabel = 'PLTS';

    const rawActionLabel = getActionTypeLabel(p.actionTypeId, actionTypes, p.actionTypeLabel).toUpperCase();
    const actionText = rawActionLabel.includes('RELEASE') ? 'RELEASE' : rawActionLabel;

    if (rawActionLabel.includes('RELEASE') && forecastItem && forecastItem.requiredPallets > 0) {
      const pallets = forecastItem.surplusPallets;
      qtyValue = pallets.toLocaleString();
      unitLabel = pallets === 1 ? 'PLT' : 'PLTS';
    } else if (p.requestedQuantity && p.requestedQuantity > 0) {
      if (cpp && cpp > 0) {
        const pallets = Math.round(p.requestedQuantity / cpp);
        qtyValue = pallets.toLocaleString();
        unitLabel = pallets === 1 ? 'PLT' : 'PLTS';
      } else {
        qtyValue = p.requestedQuantity.toLocaleString();
        unitLabel = 'CS';
      }
    }

    const destLabel = p.destinationId
      ? getDestinationCodeLabel(p.destinationId, destinations, p.destinationLabel)
      : 'NO DEST';

    const shortReason = getShortReason(p, hasForecastDemand);

    return (
      <div 
        key={`${p.id}-${isPinned ? 'pinned' : 'scroll'}`} 
        className={`grid grid-cols-[115px_1.2fr_110px_110px_90px_140px_1.4fr] items-center gap-2 px-4 py-2.5 transition-all text-xs font-medium hover:bg-slate-800/80 ${
          isPinned 
            ? 'bg-amber-950/25 border-l-4 border-amber-500 font-semibold text-slate-100' 
            : 'bg-slate-900/60 border-l-2 border-slate-800'
        }`}
      >
        {/* 1. PIN / PRIORITY */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isPinned ? (
            <span className="p-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm" title="Pinned Urgent / High Priority">
              <Pin className="w-3 h-3" />
            </span>
          ) : (
            <span className={`w-2 h-2 rounded-full shrink-0 ${isBlocked ? 'bg-red-500' : isCompleted ? 'bg-emerald-500' : 'bg-brand-400'}`} />
          )}
          <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded tracking-wider shadow-sm ${theme.badgeBg}`}>
            {p.priorityStatus === 'COMPLETED' ? 'READY' : isBlocked ? 'BLOCKED' : displayLevelLabel}
          </span>
        </div>

        {/* 2. SKU / PRODUCT */}
        <div className="min-w-0 pr-2">
          <div className={`font-mono font-black tracking-tight text-sm truncate ${theme.productCodeText}`}>
            {normalizeProductCode(p.productCodeSnapshot) || 'SKU'}
          </div>
          <div className="text-[11px] text-slate-300 truncate leading-tight mt-0.5" title={p.descriptionSnapshot}>
            {p.descriptionSnapshot || 'Product Description'}
          </div>
        </div>

        {/* 3. ACTION */}
        <div className="text-center shrink-0">
          <span className={`inline-block font-extrabold uppercase px-2.5 py-0.5 text-[10px] rounded tracking-wider shadow-sm ${theme.actionBg}`}>
            {isBlocked ? 'BLOCKED' : actionText}
          </span>
        </div>

        {/* 4. QUANTITY */}
        <div className="text-center font-mono font-black text-amber-400 flex items-center justify-center gap-1 shrink-0">
          <span className="text-base font-bold text-slate-100">{qtyValue}</span>
          <span className="text-[9px] font-bold text-slate-400 uppercase">{unitLabel}</span>
        </div>

        {/* 5. DESTINATION */}
        <div className="text-center font-mono font-bold text-slate-200 text-xs shrink-0 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
          <span className="text-brand-400 font-black mr-1">→</span>
          <span>{destLabel}</span>
        </div>

        {/* 6. REASON / STATUS */}
        <div className="shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 bg-slate-950/80 border border-slate-800 px-2 py-0.5 rounded truncate block text-center">
            {shortReason}
          </span>
        </div>

        {/* 7. INSTRUCTION / NOTES */}
        <div className="text-[11px] text-slate-300 truncate leading-tight pr-1 font-mono">
          {p.instruction ? (
            <span title={p.instruction}>
              {p.instruction}
            </span>
          ) : (
            <span className="text-slate-600 italic">No special notes</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-200 overflow-hidden flex flex-col font-sans select-none">
      {/* Header */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <h1 className="text-lg font-bold text-slate-100 uppercase tracking-wider">Operations Dashboard</h1>
            <span className="text-brand-400 font-semibold text-xs tracking-widest">{displaySiteLabel}</span>
          </div>

          {/* View Mode Switcher - Only rendered if Flight Board feature is enabled in Dashboard Settings */}
          {isFlightBoardFeatureEnabled && (
            <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-medium ml-2">
              <button
                type="button"
                onClick={() => toggleDisplayLayoutMode('grid')}
                className={`px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors ${
                  activeLayoutMode === 'grid'
                    ? 'bg-brand-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
                title="Switch to 4x4 Tiled Grid view"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tile Grid</span>
              </button>
              <button
                type="button"
                onClick={() => toggleDisplayLayoutMode('flightBoard')}
                className={`px-2.5 py-1 rounded flex items-center gap-1.5 transition-colors ${
                  activeLayoutMode === 'flightBoard'
                    ? 'bg-brand-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
                title="Switch to Airport Flight Board scrolling table view"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Flight Board</span>
              </button>
            </div>
          )}

          {!isConnected && (
            <div className="flex items-center gap-2 px-3 py-1 bg-red-900/40 border border-red-500/50 rounded-full text-red-400 text-xs font-bold animate-pulse">
              <WifiOff className="w-4 h-4" />
              <span>OFFLINE - STALE DATA</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-6 text-right">
          <div className="flex flex-col text-slate-400 text-[11px]">
            <div className="flex items-center gap-1 justify-end">
              {isConnected ? <Wifi className="w-3 h-3 text-green-500" /> : <WifiOff className="w-3 h-3 text-red-500" />}
              <span>Last Update</span>
            </div>
            <span className="font-mono text-slate-300">
              {lastUpdate ? lastUpdate.toLocaleTimeString([], { hour12: false }) : 'Waiting...'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-mono font-bold text-slate-100 tracking-tight">
              {currentTime.toLocaleTimeString([], { hour12: false })}
            </span>
            <span className="text-slate-400 text-xs font-medium">
              {currentTime.toLocaleDateString([], { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Priorities Section: Grid or Flight Board */}
        {activeLayoutMode === 'grid' ? (
          /* Tiled Grid View */
          <div className="flex-1 p-3 sm:p-4 flex flex-col overflow-hidden">
            <div 
              className="flex-1 grid gap-3 overflow-hidden"
              style={{
                gridTemplateColumns: `repeat(${gridConfig.cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${gridConfig.rows}, minmax(0, 1fr))`
              }}
            >
              {visiblePriorities.map(p => {
                const levelLabel = getPriorityLevelLabel(p.priorityLevelId, priorityLevels, p.priorityLevelLabel);
                const displayLevelLabel = getPriorityDisplayLabel(p.priorityLevelId, priorityLevels, p.priorityLevelLabel);
                const theme = getTileTheme(levelLabel, p.priorityStatus);

                const isBlocked = p.priorityStatus === 'BLOCKED';
                const isCompleted = p.priorityStatus === 'COMPLETED';

                // Product CPP matching for pallet calculation - CRITICAL: No fallback to 100!
                const productMatch = products.find(prod => 
                  (p.productId && prod.id === p.productId) || 
                  (p.productCodeSnapshot && areProductCodesEqual(prod.productCode, p.productCodeSnapshot))
                );
                const cpp = productMatch?.casesPerPallet || 
                  productMatch?.configurations?.[0]?.casesPerPallet || 
                  null;

                // Check if product has active forecast demand in the weekly planning horizon
                const forecastItem = forecastStockItems.find(f =>
                  (p.productId && f.productId === p.productId) ||
                  (p.productCodeSnapshot && areProductCodesEqual(f.productCode, p.productCodeSnapshot))
                );
                const hasForecastDemand = Boolean(forecastItem && (forecastItem.requiredPallets > 0 || forecastItem.totalForecastCases > 0));

                let qtyValue = '0';
                let unitLabel = 'PALLETS';
                let isCases = false;

                const rawActionLabel = getActionTypeLabel(p.actionTypeId, actionTypes, p.actionTypeLabel).toUpperCase();
                const actionText = rawActionLabel.includes('RELEASE') ? 'RELEASE' : rawActionLabel;

                // Pallet calculation: if releasing surplus for a product with forecast demand, protect forecast stock!
                if (rawActionLabel.includes('RELEASE') && forecastItem && forecastItem.requiredPallets > 0) {
                  const pallets = forecastItem.surplusPallets;
                  qtyValue = pallets.toLocaleString();
                  unitLabel = pallets === 1 ? 'PALLET' : 'PALLETS';
                } else if (p.requestedQuantity && p.requestedQuantity > 0) {
                  if (cpp && cpp > 0) {
                    const pallets = Math.round(p.requestedQuantity / cpp);
                    qtyValue = pallets.toLocaleString();
                    unitLabel = pallets === 1 ? 'PALLET' : 'PALLETS';
                  } else {
                    qtyValue = p.requestedQuantity.toLocaleString();
                    unitLabel = 'CASES';
                    isCases = true;
                  }
                }

                const destLabel = p.destinationId
                  ? getDestinationCodeLabel(p.destinationId, destinations, p.destinationLabel)
                  : 'NO DESTINATION';

                const hasManualNote = isManualInstruction(p.instruction);

                return (
                  <div 
                    key={p.id} 
                    className={`
                      relative rounded-xl border-2 px-3 py-2 sm:px-4 sm:py-2.5 flex flex-col justify-between overflow-hidden transition-all shadow-md
                      ${theme.border} ${theme.bg}
                    `}
                  >
                    {/* Card Header: Top Right Priority Badge */}
                    <div className="flex items-center justify-between gap-2 mb-1 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 bg-slate-900/70 border border-slate-700/70 px-2 py-0.5 rounded shadow-sm">
                          {getShortReason(p, hasForecastDemand)}
                        </span>
                        {/* Optional status badge for secondary status */}
                        {p.priorityStatus !== 'ACTIVE' && p.priorityStatus !== 'COMPLETED' && p.priorityStatus !== 'BLOCKED' && (
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${theme.statusBadge}`}>
                            {p.priorityStatus.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-auto">
                        <span className={`text-xs font-extrabold uppercase px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-md tracking-wider shadow-sm ${theme.badgeBg}`}>
                          {p.priorityStatus === 'COMPLETED' ? 'READY' : isBlocked ? 'BLOCKED' : displayLevelLabel}
                        </span>
                      </div>
                    </div>

                    {/* Card Main Body: Left (Product & Action) | Center (Quantity) | Right (Destination) */}
                    <div className="grid grid-cols-1 md:grid-cols-[1.3fr_auto_1fr_1.3fr] items-center gap-2 sm:gap-3 my-auto min-h-0">
                      
                      {/* LEFT: Product Identity & Action */}
                      <div className="flex flex-col justify-between space-y-1.5 min-w-0">
                        <div className="min-w-0 flex-1">
                          <div className={`font-mono font-black tracking-tight whitespace-nowrap overflow-visible ${compactMode ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl lg:text-4xl'} ${theme.productCodeText}`}>
                            {normalizeProductCode(p.productCodeSnapshot) || 'SKU'}
                          </div>
                          <div className={`text-slate-300 font-medium leading-tight line-clamp-2 mt-0.5 ${compactMode ? 'text-xs' : 'text-xs sm:text-sm'}`}>
                            {p.descriptionSnapshot || 'Product Description'}
                          </div>
                        </div>

                        <div className="pt-0.5">
                          <span className={`inline-block font-extrabold uppercase ${compactMode ? 'px-2.5 py-0.5 text-xs' : 'px-3.5 py-1 text-xs sm:text-sm'} rounded-lg text-center tracking-wider shadow-sm select-none ${theme.actionBg}`}>
                            {isBlocked ? 'BLOCKED' : actionText}
                          </span>
                        </div>
                      </div>

                      {/* Vertical Separator Line */}
                      <div className="hidden md:block w-px bg-slate-700/60 self-stretch my-0.5 shrink-0" />

                      {/* CENTER: Quantity */}
                      <div className="flex flex-col items-center justify-center text-center px-1">
                        <div className={`font-mono font-black tracking-tight text-slate-100 leading-none ${compactMode ? 'text-3xl sm:text-4xl' : 'text-5xl sm:text-6xl'}`}>
                          {qtyValue}
                        </div>
                        <div className={`font-extrabold uppercase tracking-widest mt-1 ${compactMode ? 'text-[10px]' : 'text-xs sm:text-sm'} ${theme.accentText}`}>
                          {unitLabel}
                        </div>
                        {isCases && (
                          <span className="text-[10px] text-slate-400 font-normal mt-0.5">CPP unavailable</span>
                        )}
                      </div>

                      {/* RIGHT: Destination */}
                      <div className="flex items-center justify-start md:justify-center gap-2 sm:gap-3 min-w-0">
                        <span className={`font-black shrink-0 ${compactMode ? 'text-2xl' : 'text-3xl sm:text-4xl'} ${theme.accentText}`}>
                          →
                        </span>
                        <span className={`font-black uppercase tracking-tight text-slate-100 truncate ${compactMode ? 'text-xl sm:text-2xl' : 'text-3xl sm:text-4xl lg:text-5xl'}`}>
                          {destLabel}
                        </span>
                      </div>

                    </div>

                    {/* Manual Instruction Strip - Only rendered if manual note exists */}
                    {hasManualNote && (
                      <div className="mt-1.5 pt-1.5 border-t border-slate-700/60 text-xs font-medium text-slate-200 flex items-center gap-2 bg-slate-950/60 rounded-lg p-1.5 px-2.5 shrink-0">
                        <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="truncate">
                          <strong className="text-amber-300 font-bold uppercase mr-1">NOTE:</strong>
                          {p.instruction}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
              
              {visiblePriorities.length === 0 && (
                <div className="col-span-full row-span-full flex flex-col items-center justify-center text-slate-500 space-y-4">
                  <CheckCircle className="w-20 h-20 text-slate-800" />
                  <div className="text-xl font-medium text-slate-400">No Active Recommendations</div>
                  <div className="text-xs text-slate-600">The execution queue is currently empty for this site.</div>
                </div>
              )}
            </div>

            {/* Pagination Indicators */}
            {totalPages > 1 && (
              <div className="mt-3 flex justify-center items-center gap-2 shrink-0">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <div 
                    key={i} 
                    className={`h-2 rounded-full transition-all duration-500 ${i === currentPage ? 'w-8 bg-brand-500' : 'w-2 bg-slate-700'}`}
                  />
                ))}
                <span className="text-slate-500 text-xs ml-3 font-mono font-medium">PAGE {currentPage + 1} OF {totalPages}</span>
              </div>
            )}
          </div>
        ) : (
          /* Flight Board Airport Departure Table View */
          <div className="flex-1 p-3 sm:p-4 flex flex-col overflow-hidden bg-slate-950">
            {/* Flight Board Controls Sub-Header */}
            <div className="flex items-center justify-between gap-3 mb-2.5 px-1 shrink-0">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-950/80 border border-amber-800/80 text-amber-300 font-mono text-xs font-bold shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  <span>FLIGHT BOARD DEPARTURES</span>
                </span>

                {pinnedPriorities.length > 0 && (
                  <span className="px-2.5 py-1 rounded bg-red-950/80 border border-red-800/80 text-red-300 font-mono text-xs font-bold flex items-center gap-1.5 shadow-sm">
                    <Pin className="w-3 h-3 text-red-400" />
                    <span>{pinnedPriorities.length} URGENT PINNED TOP</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                {/* Auto-scroll toggle button */}
                <button
                  type="button"
                  onClick={() => setIsFlightBoardAutoScrollEnabled(!isFlightBoardAutoScrollEnabled)}
                  className={`px-3 py-1 rounded text-xs font-bold flex items-center gap-1.5 border transition-all shadow-sm ${
                    isFlightBoardAutoScrollEnabled
                      ? 'bg-emerald-950/80 border-emerald-700/80 text-emerald-300 hover:bg-emerald-900/80'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {isFlightBoardAutoScrollEnabled ? <Pause className="w-3.5 h-3.5 text-emerald-400" /> : <Play className="w-3.5 h-3.5 text-slate-400" />}
                  <span>{isFlightBoardAutoScrollEnabled ? (isFlightBoardHovered ? 'PAUSED (HOVER)' : 'AUTO-SCROLLING') : 'SCROLL PAUSED'}</span>
                </button>

                <span className="text-slate-400 text-xs font-mono font-bold">TOTAL ITEMS: {priorities.length}</span>
              </div>
            </div>

            {/* Flight Board Table Container */}
            <div 
              className="flex-1 border border-slate-800 rounded-xl bg-slate-900/90 overflow-hidden flex flex-col shadow-2xl"
              onMouseEnter={() => setIsFlightBoardHovered(true)}
              onMouseLeave={() => setIsFlightBoardHovered(false)}
            >
              {/* Flight Board Table Column Header */}
              <div className="grid grid-cols-[115px_1.2fr_110px_110px_90px_140px_1.4fr] items-center gap-2 px-4 py-2.5 bg-slate-950 border-b border-slate-800 text-[11px] font-black uppercase tracking-wider text-slate-400 font-mono shrink-0 shadow-sm">
                <div className="flex items-center gap-1">
                  <Pin className="w-3 h-3 text-amber-400" />
                  <span>PRIORITY</span>
                </div>
                <div>SKU / PRODUCT ITEM</div>
                <div className="text-center">ACTION</div>
                <div className="text-center">QTY</div>
                <div className="text-center">DEST</div>
                <div>REASON / STATUS</div>
                <div>INSTRUCTION / NOTES</div>
              </div>

              {/* Flight Board Table Body (Auto-scrolling container) */}
              <div 
                ref={flightBoardScrollRef}
                className="flex-1 overflow-y-auto min-h-0 divide-y divide-slate-800/80 scroll-smooth"
              >
                {/* SECTION 1: PINNED URGENT PRIORITIES (Sticky Top Block) */}
                {pinnedPriorities.length > 0 && (
                  <div className="bg-slate-950/95 border-b-2 border-amber-500/60 shrink-0">
                    <div className="px-4 py-1 bg-amber-950/70 border-b border-amber-800/50 text-[10px] font-bold text-amber-300 uppercase tracking-widest flex items-center gap-1.5 font-mono shadow-inner">
                      <Pin className="w-3 h-3 text-amber-400" />
                      <span>URGENT & HIGH PRIORITIES — PINNED TO TOP</span>
                    </div>
                    {pinnedPriorities.map(p => renderFlightBoardRow(p, true))}
                  </div>
                )}

                {/* SECTION 2: ALL / STANDARD PRIORITIES SCROLLING QUEUE */}
                {priorities.map(p => renderFlightBoardRow(p, false))}

                {priorities.length === 0 && (
                  <div className="p-12 text-center text-slate-500 space-y-3">
                    <CheckCircle className="w-12 h-12 text-slate-700 mx-auto" />
                    <div className="text-base font-semibold text-slate-400">No Active Recommendations</div>
                    <div className="text-xs text-slate-600">The operations queue is currently empty.</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Side Panel - Forecast Stock vs Demand in Pallets */}
        <div className="w-80 sm:w-96 lg:w-[460px] xl:w-[500px] 2xl:w-[540px] bg-slate-900 border-l border-slate-800 p-3 sm:p-3.5 flex flex-col gap-2.5 shrink-0 z-10 overflow-hidden shadow-2xl">
          {/* Header with Horizon Date */}
          <div className="border-b border-slate-800 pb-2.5 shrink-0">
            <div className="flex items-center justify-between gap-1 mb-1.5">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-brand-400" />
                <span>Demand Horizon</span>
              </h2>
              {/* Target Horizon Date Pill */}
              <span className="px-2 py-0.5 rounded bg-brand-950/80 border border-brand-800/80 text-brand-300 font-mono text-xs font-bold whitespace-nowrap shadow-sm">
                {targetHorizonDate ? formatHorizonDateLabel(targetHorizonDate) : 'WEEKLY PLAN'}
              </span>
            </div>

            {/* Demand Mode Switcher Tabs */}
            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[10px] font-medium mt-1">
              <button
                type="button"
                onClick={() => setDemandViewMode('horizon')}
                className={`px-1.5 py-1 rounded transition-colors text-center truncate ${
                  demandViewMode === 'horizon'
                    ? 'bg-brand-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
                title="Target Horizon Date requirement only"
              >
                Horizon Date
              </button>
              <button
                type="button"
                onClick={() => setDemandViewMode('horizon7d')}
                className={`px-1.5 py-1 rounded transition-colors text-center truncate ${
                  demandViewMode === 'horizon7d'
                    ? 'bg-brand-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
                title="Horizon Date plus next 7 days lookahead demand"
              >
                +7d Lookahead
              </button>
              <button
                type="button"
                onClick={() => setDemandViewMode('full')}
                className={`px-1.5 py-1 rounded transition-colors text-center truncate ${
                  demandViewMode === 'full'
                    ? 'bg-brand-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
                title="Full multi-week snapshot requirement"
              >
                Full Snapshot
              </button>
            </div>

            {/* Quick KPI stats strip */}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="bg-slate-950 border border-slate-800 p-1.5 sm:p-2 rounded-lg flex flex-col items-center justify-center text-center">
                <span className="text-lg sm:text-xl font-bold text-brand-400 font-mono leading-none">{totalRequiredPallets}</span>
                <span className="text-[10px] text-slate-400 font-medium uppercase mt-0.5">
                  {demandViewMode === 'horizon' ? 'Req (Horizon)' : demandViewMode === 'horizon7d' ? 'Req (+7 Days)' : 'Req (Full Total)'}
                </span>
              </div>
              <div className={`p-1.5 sm:p-2 rounded-lg flex flex-col items-center justify-center text-center border ${
                shortfallCount > 0 
                  ? 'bg-amber-950/30 border-amber-800/60' 
                  : 'bg-emerald-950/30 border-emerald-800/60'
              }`}>
                <span className={`text-lg sm:text-xl font-bold font-mono leading-none ${shortfallCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {totalOnHandPallets}
                </span>
                <span className={`text-[10px] font-medium uppercase mt-0.5 ${shortfallCount > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {shortfallCount > 0 ? `${shortfallCount} Deficit` : 'On Hand Plts'}
                </span>
              </div>
            </div>

            {/* Sub-label explaining active view & rounding */}
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium mt-1.5 px-0.5">
              <span>Pallets: On Hand vs Req</span>
              <span className="text-slate-400 font-mono">Demand Ceil ↑</span>
            </div>
          </div>

          {/* List of products - Auto-switches to 2 columns if > 3 products to ensure all fit without scrolling */}
          <div className="flex-1 overflow-y-auto pr-0.5 min-h-0">
            {snapshotLoading ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-500 gap-2">
                <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Loading forecast stock...</span>
              </div>
            ) : forecastStockItems.length === 0 ? (
              <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800/80 text-center space-y-1.5 my-auto">
                <Package className="w-6 h-6 text-slate-600 mx-auto" />
                <div className="text-xs font-semibold text-slate-300">No Forecast Demand</div>
                <div className="text-[10px] text-slate-500 leading-tight">
                  No active forecast demand rows found in snapshot for this site.
                </div>
              </div>
            ) : (
              <div className={`grid gap-2 ${forecastStockItems.length > 3 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                {forecastStockItems.map(item => {
                  const percentCovered = item.activeRequiredPallets > 0 
                    ? Math.min(100, Math.round((item.onHandPallets / item.activeRequiredPallets) * 100))
                    : 100;
                  const isMultiCol = forecastStockItems.length > 3;
                  const reqBadgeText = demandViewMode === 'horizon' 
                    ? 'REQ (SET):' 
                    : demandViewMode === 'horizon7d' 
                    ? 'REQ (+7D):' 
                    : 'REQ (TOT):';

                  return (
                    <div 
                      key={item.productCode}
                      className={`p-2 sm:p-2.5 rounded-lg border transition-all flex flex-col justify-between ${
                        item.isShortfall 
                          ? 'bg-amber-950/20 border-amber-800/60 shadow-sm' 
                          : 'bg-slate-950 border-slate-800/90'
                      }`}
                    >
                      {/* Top Row: Product Code, Scheduled Production & Status Badge */}
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <div 
                          className={`font-mono font-black text-slate-100 tracking-tight leading-none whitespace-nowrap overflow-visible ${
                            isMultiCol ? 'text-base sm:text-lg' : 'text-lg sm:text-xl'
                          }`}
                          title={normalizeProductCode(item.productCode)}
                        >
                          {normalizeProductCode(item.productCode)}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {item.confirmedProductionPallets > 0 && (
                            <span 
                              className="px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase tracking-wider bg-cyan-950/80 border border-cyan-700/60 text-cyan-300 whitespace-nowrap"
                              title={`Scheduled Confirmed Production in snapshot: +${item.confirmedProductionPallets} plts`}
                            >
                              Prod +{Math.round(item.confirmedProductionPallets)}
                            </span>
                          )}
                          {item.isShortfall ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 border border-amber-500/40 text-amber-300 shrink-0 whitespace-nowrap">
                              Short ({item.deficitPallets})
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 shrink-0 whitespace-nowrap">
                              Covered
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Product Description */}
                      <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate mb-1.5 leading-tight" title={item.productDescription}>
                        {item.productDescription}
                      </div>

                      {/* Stock Numbers: On Hand vs Required */}
                      <div className="flex items-center justify-between text-xs mb-1.5 bg-slate-900/90 px-2 py-1 rounded border border-slate-800/90">
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-slate-400 font-bold uppercase">OH:</span>
                          <span className={`font-mono font-black text-sm ${item.isShortfall ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {item.onHandPallets}
                          </span>
                          <span className="text-[8px] text-slate-400 font-bold uppercase">PLT</span>
                        </div>

                        <div className="text-slate-600 font-mono text-xs">/</div>

                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-slate-400 font-bold uppercase">{reqBadgeText}</span>
                          <span className="font-mono font-black text-sm text-slate-200">
                            {item.activeRequiredPallets}
                          </span>
                          <span className="text-[8px] text-slate-400 font-bold uppercase">PLT</span>
                        </div>
                      </div>

                      {/* Coverage Visual Progress Bar */}
                      <div className="w-full bg-slate-800/80 rounded-full h-1 overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-300 ${
                            item.isShortfall ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${percentCovered}%` }}
                        />
                      </div>

                      {/* Secondary Smart Line: Horizon lookahead + next few days demand & scheduled production */}
                      <div className="mt-1.5 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[9px] leading-tight text-slate-400">
                        <div className="flex items-center gap-1 font-mono">
                          <span className="text-slate-500 uppercase font-sans font-medium">Next 7d:</span>
                          <span className="font-bold text-slate-300">+{item.next7DaysRequiredPallets} plt</span>
                          <span className="text-slate-600">({item.totalRequiredPallets} tot)</span>
                        </div>
                        {item.confirmedProductionPallets > 0 ? (
                          <div className="flex items-center gap-1 font-mono text-cyan-400" title="Confirmed production scheduled in snapshot">
                            <span className="text-cyan-500/80 font-sans font-medium text-[8px]">PROD:</span>
                            <span className="font-bold">+{Math.round(item.confirmedProductionPallets)}</span>
                          </div>
                        ) : (
                          <span className="text-[8px] text-slate-600 font-mono">No sched prod</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ticker */}
      <footer className="h-10 bg-brand-600 text-slate-900 flex items-center px-4 overflow-hidden shrink-0 relative">
        <div className="font-bold uppercase tracking-widest text-xs bg-brand-600 z-10 pr-4 h-full flex items-center shrink-0">
          ANNOUNCEMENTS
        </div>
        <div className="flex-1 overflow-hidden h-full flex items-center relative">
           <div className="whitespace-nowrap animate-[ticker_20s_linear_infinite] font-medium text-base flex gap-12">
             {announcements.length > 0 ? (
               announcements.map(a => (
                 <span key={a.id} className="flex items-center gap-2">
                   {a.severity === 'CRITICAL' && <AlertTriangle className="w-4 h-4 text-red-900" />}
                   {a.title && <strong className="uppercase">{a.title}:</strong>}
                   {a.message}
                   <span className="w-8"></span>
                 </span>
               ))
             ) : (
               <span>No active announcements at this time.</span>
             )}
           </div>
        </div>
      </footer>
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes ticker {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
      `}} />
    </div>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import { DisplayPriority } from '../../../types/priority';
import { Announcement } from '../../../types/announcement';
import { OperationalException } from '../../../types/exception';
import { Product } from '../../../types/product';
import { useSiteContext } from '../../../contexts/SiteContext';
import { useSiteOnboarding } from '../../../hooks/useSiteOnboarding';
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
  AlertTriangle, Clock, CheckCircle, Ban, Play,
  LayoutGrid, AlertCircle, TrendingDown,
  Wifi, WifiOff, Settings, Package, Info
} from 'lucide-react';

// Constants
const PAGE_ROTATION_MS = 15000;
const COMPLETED_RETENTION_MS = 10 * 60 * 1000; // 10 minutes

const PRIORITY_WEIGHTS: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  NORMAL: 2,
  LOW: 1
};

const getPriorityDisplayLabel = (
  levelId: string, 
  priorityLevels: PriorityLevel[], 
  snapshot?: string
): string => {
  const rawLabel = getPriorityLevelLabel(levelId, priorityLevels, snapshot).toUpperCase();
  if (rawLabel.includes('CRITICAL')) return 'CRITICAL';
  if (rawLabel.includes('HIGH') || rawLabel.includes('URGENT')) return 'URGENT';
  if (rawLabel.includes('NORMAL')) return 'STANDARD';
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
  if (normalized.includes('CRITICAL')) {
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

  if (normalized.includes('HIGH') || normalized.includes('URGENT')) {
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
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isConnected, setIsConnected] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);

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
          const weightA = PRIORITY_WEIGHTS[a.priorityLevelId] || 0;
          const weightB = PRIORITY_WEIGHTS[b.priorityLevelId] || 0;
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

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-200 overflow-hidden flex flex-col font-sans select-none">
      {/* Header */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <h1 className="text-lg font-bold text-slate-100 uppercase tracking-wider">Operations Dashboard</h1>
            <span className="text-brand-400 font-semibold text-xs tracking-widest">{displaySiteLabel}</span>
          </div>
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
        {/* Priorities Grid */}
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

              // Icon resolution based on priority and status
              const IconComponent = isBlocked 
                ? Ban 
                : isCompleted 
                ? CheckCircle 
                : (levelLabel.toUpperCase().includes('CRITICAL') || levelLabel.toUpperCase().includes('HIGH')) 
                ? AlertTriangle 
                : Package;

              // Product CPP matching for pallet calculation - CRITICAL: No fallback to 100!
              const productMatch = products.find(prod => 
                (p.productId && prod.id === p.productId) || 
                (p.productCodeSnapshot && prod.productCode === p.productCodeSnapshot)
              );
              const cpp = productMatch?.casesPerPallet || 
                productMatch?.configurations?.[0]?.casesPerPallet || 
                null;

              let qtyValue = '0';
              let unitLabel = 'PALLETS';
              let isCases = false;

              if (p.requestedQuantity && p.requestedQuantity > 0) {
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

              const rawActionLabel = getActionTypeLabel(p.actionTypeId, actionTypes, p.actionTypeLabel).toUpperCase();
              const actionText = rawActionLabel.includes('RELEASE') ? 'RELEASE' : rawActionLabel;

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
                        <div className={`font-mono font-black tracking-tight truncate ${compactMode ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl lg:text-5xl'} ${theme.productCodeText}`}>
                          {p.productCodeSnapshot || 'SKU'}
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

        {/* Side Panel - Execution Summary */}
        <div className="w-48 lg:w-52 bg-slate-900 border-l border-slate-800 p-4 flex flex-col gap-4 shrink-0 z-10 overflow-y-auto">
          <div>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <LayoutGrid className="w-3.5 h-3.5" />
              Execution Summary
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-bold text-brand-400 font-mono">{stats.active}</span>
                <span className="text-[10px] text-slate-500 font-medium uppercase mt-0.5">Active</span>
              </div>
              <div className="bg-red-950/20 border border-red-900/50 p-3 rounded-lg flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-bold text-red-500 font-mono">{stats.blocked}</span>
                <span className="text-[10px] text-red-400 font-medium uppercase mt-0.5">Blocked</span>
              </div>
            </div>
          </div>

          <div className="flex-1">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              Network Exceptions
            </h2>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-slate-300 font-medium">Urgent Priorities</span>
                <span className={`font-bold font-mono text-sm ${stats.urgent > 0 ? 'text-orange-400' : 'text-slate-600'}`}>{stats.urgent}</span>
              </div>
              <div className="flex justify-between items-center p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-slate-300 font-medium">Below Retention</span>
                <span className={`font-bold font-mono text-sm ${stats.belowRetention > 0 ? 'text-amber-400' : 'text-slate-600'}`}>{stats.belowRetention}</span>
              </div>
              <div className="flex justify-between items-center p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-slate-300 font-medium">Above Maximum</span>
                <span className={`font-bold font-mono text-sm ${stats.aboveMax > 0 ? 'text-blue-400' : 'text-slate-600'}`}>{stats.aboveMax}</span>
              </div>
              <div className="flex justify-between items-center p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-slate-300 font-medium">Promo Affected</span>
                <span className={`font-bold font-mono text-sm ${stats.promotionAffected > 0 ? 'text-fuchsia-400' : 'text-slate-600'}`}>{stats.promotionAffected}</span>
              </div>
              <div className="flex justify-between items-center p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-slate-300 font-medium">Stale Inventory</span>
                <span className={`font-bold font-mono text-sm ${stats.staleInventory > 0 ? 'text-slate-400' : 'text-slate-600'}`}>{stats.staleInventory}</span>
              </div>
            </div>
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

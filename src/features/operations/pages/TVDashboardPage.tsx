import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { DisplayPriority } from '../../../types/priority';
import { Announcement } from '../../../types/announcement';
import { OperationalException } from '../../../types/exception';
import { Product } from '../../../types/product';
import { useSiteContext } from '../../../contexts/SiteContext';
import { useSiteOnboarding } from '../../../hooks/useSiteOnboarding';
import { subscribeToCollection } from '../../../services/firestoreBase';
import { subscribeToProducts } from '../../inventory/services/productService';
import { collections } from '../../configuration/services/configurationService';
import { Destination, ActionType, PriorityLevel } from '../../../types/configuration';
import { 
  getActionTypeLabel, 
  getDestinationLabel, 
  getPriorityLevelLabel, 
  formatQuantityInPallets, 
  isManualInstruction 
} from '../utils/priorityFormatters';
import { 
  AlertTriangle, Clock, CheckCircle, Ban, Play, 
  LayoutGrid, AlertCircle, TrendingDown,
  Wifi, WifiOff, Settings
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

const PRIORITY_COLORS: Record<string, { border: string, bg: string, text: string }> = {
  CRITICAL: { border: 'border-red-500/50', bg: 'bg-red-500/10', text: 'text-red-400' },
  HIGH: { border: 'border-orange-500/50', bg: 'bg-orange-500/10', text: 'text-orange-400' },
  NORMAL: { border: 'border-blue-500/30', bg: 'bg-blue-500/10', text: 'text-blue-400' },
  LOW: { border: 'border-slate-600', bg: 'bg-slate-800/50', text: 'text-slate-400' },
};

const STATUS_ICONS: Record<string, any> = {
  ACTIVE: AlertCircle,
  ACKNOWLEDGED: CheckCircle,
  IN_PROGRESS: Play,
  WAITING: Clock,
  BLOCKED: Ban,
  PARTIALLY_COMPLETE: TrendingDown,
  COMPLETED: CheckCircle
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
      [where('tenantId', '==', tenantId)],
      setDestinations,
      console.error
    );

    const unsubActions = subscribeToCollection<ActionType>(
      collections.ACTION_TYPES,
      [where('tenantId', '==', tenantId)],
      setActionTypes,
      console.error
    );

    const unsubPriorities = subscribeToCollection<PriorityLevel>(
      collections.PRIORITY_LEVELS,
      [where('tenantId', '==', tenantId)],
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
    if (!tenantId || !siteId) return;
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
    if (!tenantId || !siteId) return;

    const prioritiesQuery = query(
      collection(db, 'displayPriorities'),
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId)
    );

    const unsubPriorities = onSnapshot(prioritiesQuery, (snap) => {
      const now = new Date();
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as DisplayPriority));
      
      const activePriorities = fetched.filter(p => {
        if (['DRAFT', 'SCHEDULED', 'ARCHIVED', 'CANCELLED', 'EXPIRED'].includes(p.priorityStatus)) {
          if (p.priorityStatus === 'SCHEDULED' && p.startAt) {
             try {
               const start = (p.startAt as any)?.toDate?.() || new Date(p.startAt as any);
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
              ? ((p.completedAt as any)?.toDate?.() || new Date(p.completedAt as any)) 
              : ((p as any).modifiedDate 
                  ? ((p as any).modifiedDate as any)?.toDate?.() || new Date((p as any).modifiedDate as any)
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
            const exp = (p.expireAt as any)?.toDate?.() || new Date(p.expireAt as any);
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
          const dateA = (a.startAt as any)?.toDate?.() || (a.createdDate ? ((a.createdDate as any)?.toDate?.() || new Date(a.createdDate as any)) : new Date(0));
          const dateB = (b.startAt as any)?.toDate?.() || (b.createdDate ? ((b.createdDate as any)?.toDate?.() || new Date(b.createdDate as any)) : new Date(0));
          
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
    }, (err) => {
      console.error(err);
      setIsConnected(false);
    });

    const exceptionsQuery = query(
      collection(db, 'exceptions'),
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId),
      where('exceptionStatus', 'in', ['OPEN', 'ACKNOWLEDGED'])
    );

    const unsubExceptions = onSnapshot(exceptionsQuery, (snap) => {
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as OperationalException));
      setExceptions(fetched);
    }, (err) => {
      console.error(err);
    });

    const announcementsQuery = query(
      collection(db, 'announcements'),
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId),
      where('active', '==', true),
      where('displayOnTv', '==', true)
    );

    const unsubAnnouncements = onSnapshot(announcementsQuery, (snap) => {
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement));
      
      const now = new Date();
      const activeAnnouncements = fetched.filter(a => {
        const start = a.startAt ? ((a.startAt as any)?.toDate?.() || new Date(a.startAt as any)) : null;
        if (start && start > now) return false;
        
        if (a.expireAt) {
          const exp = (a.expireAt as any)?.toDate?.() || new Date(a.expireAt as any);
          if (exp < now) return false;
        }
        return true;
      });
      
      setAnnouncements(activeAnnouncements);
    }, (err) => {
      console.error(err);
    });

    return () => {
      unsubPriorities();
      unsubExceptions();
      unsubAnnouncements();
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
    if (count <= 8) return { cols: 4, rows: 2, itemsPerPage: 8 };
    if (count <= 12) return { cols: 4, rows: 3, itemsPerPage: 12 };
    if (count <= 16) return { cols: 4, rows: 4, itemsPerPage: 16 };
    if (count <= 20) return { cols: 5, rows: 4, itemsPerPage: 20 };
    return { cols: 5, rows: 5, itemsPerPage: 25 };
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
      <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-slate-100 uppercase tracking-wider">Operations Dashboard</h1>
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
        <div className="flex-1 p-4 flex flex-col overflow-hidden">
          <div 
            className="flex-1 grid gap-3 overflow-hidden"
            style={{
              gridTemplateColumns: `repeat(${gridConfig.cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${gridConfig.rows}, minmax(0, 1fr))`
            }}
          >
            {visiblePriorities.map(p => {
              const levelLabel = getPriorityLevelLabel(p.priorityLevelId, priorityLevels, p.priorityLevelLabel);
              const pColor = PRIORITY_COLORS[levelLabel] || PRIORITY_COLORS[p.priorityLevelId] || PRIORITY_COLORS.NORMAL;
              const StatusIcon = STATUS_ICONS[p.priorityStatus] || AlertCircle;
              const isBlocked = p.priorityStatus === 'BLOCKED';
              const isCompleted = p.priorityStatus === 'COMPLETED';

              // Product CPP matching for pallet calculation
              const productMatch = products.find(prod => 
                (p.productId && prod.id === p.productId) || 
                (prod.productCode === p.productCodeSnapshot)
              );
              const cpp = productMatch?.casesPerPallet || 
                productMatch?.configurations?.[0]?.casesPerPallet || 
                100;
              
              const palletQuantityText = formatQuantityInPallets(p.requestedQuantity, cpp);
              const hasManualInstruction = isManualInstruction(p.instruction);

              return (
                <div 
                  key={p.id} 
                  className={`
                    rounded-lg border-2 p-3 flex flex-col justify-between overflow-hidden transition-all
                    ${isBlocked ? 'border-red-500 bg-red-950/30' : isCompleted ? 'border-green-500/30 bg-green-950/20' : `bg-slate-900 ${pColor.border}`}
                  `}
                >
                  {/* Card Header: Product & Priority Level */}
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`p-1.5 rounded-lg shrink-0 ${isBlocked ? 'bg-red-500 text-white animate-pulse' : isCompleted ? 'bg-green-500/20 text-green-400' : pColor.bg} ${isBlocked ? '' : pColor.text}`}>
                        <StatusIcon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-mono font-bold text-lg text-slate-100 leading-tight truncate">
                          {p.productCodeSnapshot}
                        </div>
                        <div className="text-xs text-slate-400 font-medium truncate">
                          {p.descriptionSnapshot}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-xs font-extrabold tracking-wider ${pColor.text}`}>
                        {levelLabel}
                      </div>
                      <div className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded mt-0.5 inline-block
                        ${isBlocked ? 'bg-red-500 text-white' : isCompleted ? 'bg-green-500 text-slate-900' : 'bg-slate-800 text-slate-300'}
                      `}>
                        {p.priorityStatus.replace(/_/g, ' ')}
                      </div>
                    </div>
                  </div>

                  {/* Card Core Details: Action, Quantity (in Pallets) & Destination */}
                  <div className="grid grid-cols-2 gap-2 my-1 items-center">
                    <div>
                      <div className="text-slate-500 text-[9px] uppercase tracking-widest font-bold">Action</div>
                      <div className="text-base font-semibold text-brand-300 truncate">
                        {getActionTypeLabel(p.actionTypeId, actionTypes, p.actionTypeLabel)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-slate-500 text-[9px] uppercase tracking-widest font-bold">Quantity & Dest</div>
                      <div className="text-base font-mono font-bold text-slate-100 truncate" title={`${p.requestedQuantity || 0} cases`}>
                        {palletQuantityText} {p.destinationId && (
                          <span className="text-slate-300 text-xs ml-1 font-sans font-normal">
                            → {getDestinationLabel(p.destinationId, destinations, p.destinationLabel)}
                            {p.overflowDestinationId && (
                              <span className="text-amber-400/80 text-[10px] ml-1" title="Overflow Destination">
                                (OF: {getDestinationLabel(p.overflowDestinationId, destinations, p.overflowDestinationLabel)})
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Manual Instruction Box - Only rendered if manually added by user */}
                  {hasManualInstruction && (
                    <div className="bg-slate-950/70 p-2 rounded border border-slate-800/80 mt-1 shrink-0">
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="text-slate-400 text-[9px] uppercase font-bold tracking-wider">Instruction</span>
                        {p.requestedQuantity && p.progressQuantity > 0 && (
                          <span className="text-[10px] font-mono font-bold text-brand-400">
                            {p.progressPercent}% ({p.progressQuantity}/{p.requestedQuantity})
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-200 font-medium leading-snug line-clamp-2">
                        {isBlocked ? (
                          <span className="text-red-400 flex items-center gap-1.5">
                            <Ban className="w-3.5 h-3.5 shrink-0" />
                            Blocked
                          </span>
                        ) : (
                          p.instruction
                        )}
                      </div>
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

        {/* Side Panel - Execution Summary (Compact Width) */}
        <div className="w-56 lg:w-60 bg-slate-900 border-l border-slate-800 p-4 flex flex-col gap-4 shrink-0 z-10 overflow-y-auto">
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

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { Priority, PriorityStatus } from '../../../types/priority';
import { Announcement } from '../../../types/announcement';
import { OperationalException } from '../../../types/exception';
import { useSiteContext } from '../../../../features/configuration/context/SiteContext';
import { 
  AlertTriangle, Clock, CheckCircle, Ban, Play, 
  Package, LayoutGrid, AlertCircle, TrendingDown,
  Wifi, WifiOff
} from 'lucide-react';

// Constants
const ITEMS_PER_PAGE = 8;
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
  const { tenantId, siteId } = useSiteContext();
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [exceptions, setExceptions] = useState<OperationalException[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isConnected, setIsConnected] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);

  // Clock tick
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Data Fetching
  useEffect(() => {
    if (!tenantId || !siteId) return;

    // Listen to priorities
    const prioritiesQuery = query(
      collection(db, 'priorities'),
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId)
    );

    const unsubPriorities = onSnapshot(prioritiesQuery, (snap) => {
      const now = new Date();
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as Priority));
      
      const activePriorities = fetched.filter(p => {
        // Exclude completely inactive statuses
        if (['DRAFT', 'SCHEDULED', 'ARCHIVED', 'CANCELLED', 'EXPIRED'].includes(p.priorityStatus)) {
          // Exception: Scheduled items that have started
          if (p.priorityStatus === 'SCHEDULED' && p.startAt) {
             const start = (p.startAt as any)?.toDate?.() || new Date(p.startAt as any);
             if (start <= now) return true;
          }
          return false;
        }
        
        // Filter out old completed items
        if (p.priorityStatus === 'COMPLETED') {
          const compDate = p.completedAt ? ((p.completedAt as any)?.toDate?.() || new Date(p.completedAt as any)) : ((p as any).modifiedDate ? ((p as any).modifiedDate as any)?.toDate?.() : new Date());
          if (now.getTime() - compDate.getTime() > COMPLETED_RETENTION_MS) {
            return false;
          }
        }
        
        // Ensure not expired
        if (p.expireAt) {
          const exp = (p.expireAt as any)?.toDate?.() || new Date(p.expireAt as any);
          if (exp < now) return false;
        }

        return true;
      });

      // Sort
      activePriorities.sort((a, b) => {
        const weightA = PRIORITY_WEIGHTS[a.priorityLevelId] || 0;
        const weightB = PRIORITY_WEIGHTS[b.priorityLevelId] || 0;
        if (weightA !== weightB) return weightB - weightA;
        
        const dateA = (a.startAt as any)?.toDate?.() || new Date(a.createdDate as any);
        const dateB = (b.startAt as any)?.toDate?.() || new Date(b.createdDate as any);
        return dateA.getTime() - dateB.getTime();
      });

      setPriorities(activePriorities);
      setLastUpdate(new Date());
      setIsConnected(true);
    }, (err) => {
      console.error(err);
      setIsConnected(false);
    });

    // Listen to exceptions for the side panel exception metrics
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

    // Listen to announcements
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

  // Pagination Rotation
  const totalPages = Math.ceil(priorities.length / ITEMS_PER_PAGE) || 1;
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

  const visiblePriorities = priorities.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);

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

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-200 overflow-hidden flex flex-col font-sans select-none">
      {/* Header */}
      <header className="h-20 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-8 shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold text-slate-100 uppercase tracking-wider">Operations Dashboard</h1>
            <span className="text-brand-400 font-medium text-sm tracking-widest">{siteId || 'SITE_UNKNOWN'}</span>
          </div>
          {!isConnected && (
            <div className="flex items-center gap-2 px-4 py-1.5 bg-red-900/40 border border-red-500/50 rounded-full text-red-400 font-bold animate-pulse">
              <WifiOff className="w-5 h-5" />
              <span>OFFLINE - STALE DATA</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-8 text-right">
          <div className="flex flex-col text-slate-400 text-xs">
            <div className="flex items-center gap-1 justify-end">
              {isConnected ? <Wifi className="w-3 h-3 text-green-500" /> : <WifiOff className="w-3 h-3 text-red-500" />}
              <span>Last Update</span>
            </div>
            <span className="font-mono text-slate-300">
              {lastUpdate ? lastUpdate.toLocaleTimeString([], { hour12: false }) : 'Waiting...'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-3xl font-mono font-bold text-slate-100 tracking-tight">
              {currentTime.toLocaleTimeString([], { hour12: false })}
            </span>
            <span className="text-slate-400 text-sm font-medium">
              {currentTime.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Priorities Grid */}
        <div className="flex-1 p-6 flex flex-col">
          <div className="flex-1 grid grid-cols-2 grid-rows-4 gap-4">
            {visiblePriorities.map(p => {
              const pColor = PRIORITY_COLORS[p.priorityLevelId] || PRIORITY_COLORS.NORMAL;
              const StatusIcon = STATUS_ICONS[p.priorityStatus] || AlertCircle;
              const isBlocked = p.priorityStatus === 'BLOCKED';
              const isCompleted = p.priorityStatus === 'COMPLETED';

              return (
                <div 
                  key={p.id} 
                  className={`
                    rounded-lg border-2 p-4 flex flex-col justify-between
                    ${isBlocked ? 'border-red-500 bg-red-950/30' : isCompleted ? 'border-green-500/30 bg-green-950/20' : `bg-slate-900 ${pColor.border}`}
                  `}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isBlocked ? 'bg-red-500 text-white animate-pulse' : isCompleted ? 'bg-green-500/20 text-green-400' : pColor.bg} ${isBlocked ? '' : pColor.text}`}>
                        <StatusIcon className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="font-mono font-bold text-xl text-slate-100 leading-tight">
                          {p.productCodeSnapshot}
                        </div>
                        <div className="text-sm text-slate-400 font-medium truncate max-w-sm">
                          {p.descriptionSnapshot}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold tracking-wider ${pColor.text}`}>
                        {p.priorityLevelId}
                      </div>
                      <div className={`text-xs font-bold uppercase px-2 py-0.5 rounded mt-1 inline-block
                        ${isBlocked ? 'bg-red-500 text-white' : isCompleted ? 'bg-green-500 text-slate-900' : 'bg-slate-800 text-slate-300'}
                      `}>
                        {p.priorityStatus.replace(/_/g, ' ')}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 grid grid-cols-2 gap-4 my-2 items-center">
                    <div>
                      <div className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">Action</div>
                      <div className="text-lg font-medium text-brand-300 truncate">{p.actionTypeId}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">Quantity & Dest</div>
                      <div className="text-lg font-mono text-slate-200">
                        {p.requestedQuantity || 'N/A'} {p.destinationId && <span className="text-slate-400 text-sm ml-1">→ {p.destinationId}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-950/50 p-3 rounded-md border border-slate-800 flex-1 flex flex-col justify-center">
                    <div className="flex justify-between items-end mb-1">
                      <span className="text-slate-400 text-sm font-medium">Instruction</span>
                      {p.requestedQuantity && p.progressQuantity > 0 && (
                        <span className="text-xs font-mono font-bold text-brand-400">
                          {p.progressPercent}% ({p.progressQuantity}/{p.requestedQuantity})
                        </span>
                      )}
                    </div>
                    <div className="text-lg text-slate-200 font-medium leading-snug line-clamp-2">
                      {isBlocked ? (
                        <span className="text-red-400 flex items-center gap-2">
                          <Ban className="w-5 h-5 shrink-0" />
                          {p.latestProgressNote || 'Blocked without reason'}
                        </span>
                      ) : (
                        p.instruction
                      )}
                    </div>
                    
                    {/* Compact Planning Indicators */}
                    {(p.planningContextSnapshot?.qoh !== undefined || p.planningContextSnapshot?.activePromotions?.length > 0) && (
                      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-800/50 flex-wrap">
                        {p.planningContextSnapshot?.qoh !== undefined && (
                          <div className="text-xs flex items-center gap-1.5 text-slate-400 bg-slate-900 px-2 py-1 rounded">
                            <Package className="w-3.5 h-3.5" />
                            <span className="font-mono">{p.planningContextSnapshot.qoh} QOH</span>
                          </div>
                        )}
                        {p.planningContextSnapshot?.activePromotions?.length > 0 && (
                          <div className="text-xs font-bold text-fuchsia-400 bg-fuchsia-900/20 px-2 py-1 rounded">
                            PROMOTION ACTIVE
                          </div>
                        )}
                        {p.planningContextSnapshot?.planningBand && (
                          <div className="text-xs text-slate-400 bg-slate-900 px-2 py-1 rounded">
                            BAND: {p.planningContextSnapshot.planningBand}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            
            {visiblePriorities.length === 0 && (
              <div className="col-span-2 row-span-4 flex flex-col items-center justify-center text-slate-500 space-y-4">
                <CheckCircle className="w-24 h-24 text-slate-800" />
                <div className="text-2xl font-medium">No Active Priorities</div>
                <div className="text-slate-600">The execution queue is currently empty.</div>
              </div>
            )}
          </div>

          {/* Pagination Indicators */}
          {totalPages > 1 && (
            <div className="mt-6 flex justify-center items-center gap-2">
              {Array.from({ length: totalPages }).map((_, i) => (
                <div 
                  key={i} 
                  className={`h-2 rounded-full transition-all duration-500 ${i === currentPage ? 'w-8 bg-brand-500' : 'w-2 bg-slate-700'}`}
                />
              ))}
              <span className="text-slate-500 text-sm ml-4 font-mono font-medium">PAGE {currentPage + 1} OF {totalPages}</span>
            </div>
          )}
        </div>

        {/* Side Panel - Exceptions / Summary */}
        <div className="w-80 bg-slate-900 border-l border-slate-800 p-6 flex flex-col gap-6 shrink-0 z-10">
          <div>
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <LayoutGrid className="w-4 h-4" />
              Execution Summary
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg flex flex-col items-center justify-center text-center">
                <span className="text-3xl font-bold text-brand-400 font-mono">{stats.active}</span>
                <span className="text-xs text-slate-500 font-medium uppercase mt-1">Active</span>
              </div>
              <div className="bg-red-950/20 border border-red-900/50 p-4 rounded-lg flex flex-col items-center justify-center text-center">
                <span className="text-3xl font-bold text-red-500 font-mono">{stats.blocked}</span>
                <span className="text-xs text-red-400 font-medium uppercase mt-1">Blocked</span>
              </div>
            </div>
          </div>

          <div className="flex-1">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Network Exceptions
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-sm text-slate-300 font-medium">Urgent Priorities</span>
                <span className={`text-lg font-bold font-mono ${stats.urgent > 0 ? 'text-orange-400' : 'text-slate-600'}`}>{stats.urgent}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-sm text-slate-300 font-medium">Below Retention</span>
                <span className={`text-lg font-bold font-mono ${stats.belowRetention > 0 ? 'text-amber-400' : 'text-slate-600'}`}>{stats.belowRetention}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-sm text-slate-300 font-medium">Above Maximum</span>
                <span className={`text-lg font-bold font-mono ${stats.aboveMax > 0 ? 'text-blue-400' : 'text-slate-600'}`}>{stats.aboveMax}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-sm text-slate-300 font-medium">Promo Affected</span>
                <span className={`text-lg font-bold font-mono ${stats.promotionAffected > 0 ? 'text-fuchsia-400' : 'text-slate-600'}`}>{stats.promotionAffected}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-sm text-slate-300 font-medium">Stale Inventory</span>
                <span className={`text-lg font-bold font-mono ${stats.staleInventory > 0 ? 'text-slate-400' : 'text-slate-600'}`}>{stats.staleInventory}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Ticker */}
      <footer className="h-12 bg-brand-600 text-slate-900 flex items-center px-4 overflow-hidden shrink-0 relative">
        <div className="font-bold uppercase tracking-widest text-sm bg-brand-600 z-10 pr-4 h-full flex items-center shrink-0">
          ANNOUNCEMENTS
        </div>
        <div className="flex-1 overflow-hidden h-full flex items-center relative">
           <div className="whitespace-nowrap animate-[ticker_20s_linear_infinite] font-medium text-lg flex gap-12">
             {announcements.length > 0 ? (
               announcements.map(a => (
                 <span key={a.id} className="flex items-center gap-2">
                   {a.severity === 'CRITICAL' && <AlertTriangle className="w-5 h-5 text-red-900" />}
                   {a.title && <strong className="uppercase">{a.title}:</strong>}
                   {a.message}
                   <span className="w-8"></span> {/* Spacer */}
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

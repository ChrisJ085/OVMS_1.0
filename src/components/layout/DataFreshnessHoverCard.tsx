import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Boxes, 
  Truck, 
  CalendarDays, 
  Sparkles, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  RefreshCw, 
  ExternalLink,
  ChevronRight,
  Info,
  Layers
} from 'lucide-react';
import { useDataFreshness } from '../../features/planning/context/DataFreshnessContext';
import { DataFreshnessItem, FreshnessStatus } from '../../features/planning/services/dataFreshnessService';

interface DataFreshnessHoverCardProps {
  className?: string;
  variant?: 'header-pill' | 'button' | 'compact';
}

export const DataFreshnessHoverCard: React.FC<DataFreshnessHoverCardProps> = ({ 
  className = '',
  variant = 'header-pill'
}) => {
  const navigate = useNavigate();
  const { summary, loading, isRefreshing, refresh } = useDataFreshness();
  
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Handle clicking outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 250); // Grace period for moving between trigger and card
  };

  const handleToggle = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsOpen(prev => !prev);
  };

  const handleNavigate = (route: string) => {
    setIsOpen(false);
    navigate(route);
  };

  // Helper icons and styles for freshness status
  const getStatusDisplay = (status: FreshnessStatus) => {
    switch (status) {
      case 'FRESH':
        return {
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
          dotColor: 'bg-emerald-500',
          badgeClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
          indicatorColor: 'text-emerald-400'
        };
      case 'AGING':
        return {
          icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
          dotColor: 'bg-amber-500',
          badgeClass: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
          indicatorColor: 'text-amber-400'
        };
      case 'STALE':
        return {
          icon: <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />,
          dotColor: 'bg-rose-500',
          badgeClass: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
          indicatorColor: 'text-rose-400'
        };
      case 'MISSING':
      default:
        return {
          icon: <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />,
          dotColor: 'bg-slate-500',
          badgeClass: 'bg-slate-800 text-slate-400 border-slate-700',
          indicatorColor: 'text-slate-400'
        };
    }
  };

  const overallStatus = summary?.overallStatus || 'FRESH';
  const overallDisplay = getStatusDisplay(overallStatus);

  const items = summary?.items;
  const dataList: { item: DataFreshnessItem | undefined; icon: React.ReactNode; iconBg: string }[] = [
    {
      item: items?.inventory,
      icon: <Boxes className="w-4 h-4 text-sky-400" />,
      iconBg: 'bg-sky-500/10 border-sky-500/20'
    },
    {
      item: items?.sto,
      icon: <Truck className="w-4 h-4 text-indigo-400" />,
      iconBg: 'bg-indigo-500/10 border-indigo-500/20'
    },
    {
      item: items?.productionPlan,
      icon: <CalendarDays className="w-4 h-4 text-emerald-400" />,
      iconBg: 'bg-emerald-500/10 border-emerald-500/20'
    },
    {
      item: items?.recommendations,
      icon: <Sparkles className="w-4 h-4 text-amber-400" />,
      iconBg: 'bg-amber-500/10 border-amber-500/20'
    }
  ];

  return (
    <div 
      ref={containerRef}
      className={`relative inline-block ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Interactive Trigger Button */}
      <button
        type="button"
        id="data-freshness-trigger"
        onClick={handleToggle}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title="View data update times for Inventory, STO, Production Plan, and Recommendations"
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all text-xs font-medium cursor-pointer shadow-sm group ${
          isOpen 
            ? 'bg-slate-800 border-slate-600 text-white' 
            : 'bg-slate-900/90 hover:bg-slate-800/90 border-slate-800 hover:border-slate-700 text-slate-300'
        }`}
      >
        <span className="relative flex h-2 w-2">
          {overallStatus !== 'FRESH' && (
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${overallDisplay.dotColor}`} />
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${overallDisplay.dotColor}`} />
        </span>
        
        <Layers className="w-3.5 h-3.5 text-slate-400 group-hover:text-brand-400 transition-colors shrink-0" />
        
        <span className="hidden md:inline font-medium">Data Updates</span>
        <span className="md:hidden font-medium">Updates</span>

        {summary && (
          <span className="hidden xl:inline text-[11px] font-mono text-slate-400">
            {summary.overallScore}/4 Fresh
          </span>
        )}
      </button>

      {/* Popover Floating Container */}
      {isOpen && (
        <div
          id="data-freshness-hover-popover"
          className="absolute right-0 top-full mt-2 w-80 sm:w-96 md:w-[420px] max-w-[calc(100vw-24px)] bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-4 z-50 animate-in fade-in zoom-in-95 duration-150 text-slate-200"
          role="dialog"
          aria-label="System Data Freshness Information"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-brand-400" />
                <h3 className="text-sm font-semibold text-white tracking-tight">System Data Updates</h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Timestamp of when each data source was supplied to the system
              </p>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                refresh();
              }}
              disabled={isRefreshing}
              title="Refresh freshness checks"
              className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-brand-400' : ''}`} />
            </button>
          </div>

          {/* Decision Advice Callout */}
          {summary && (
            <div className={`my-3 p-2.5 rounded-lg border text-xs flex items-start gap-2.5 leading-relaxed ${
              overallStatus === 'FRESH'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'
                : overallStatus === 'AGING'
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-200'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-200'
            }`}>
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{summary.recommendationDecisionAdvice}</p>
              </div>
            </div>
          )}

          {/* List of 4 Data Sources */}
          <div className="space-y-2.5 my-3">
            {loading && !summary ? (
              <div className="py-8 text-center text-xs text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-brand-400" />
                Checking data update timestamps...
              </div>
            ) : (
              dataList.map(({ item, icon, iconBg }) => {
                if (!item) return null;
                const statusInfo = getStatusDisplay(item.status);

                return (
                  <div
                    key={item.key}
                    id={`freshness-item-${item.key}`}
                    onClick={() => handleNavigate(item.route)}
                    className="group flex flex-col gap-1.5 p-2.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-slate-600 transition-all cursor-pointer"
                  >
                    {/* Top Row: Icon + Title + Status Badge */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`p-1.5 rounded-md border shrink-0 ${iconBg}`}>
                          {icon}
                        </div>
                        <span className="text-xs font-semibold text-slate-100 group-hover:text-brand-300 transition-colors truncate">
                          {item.title}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${statusInfo.badgeClass}`}>
                          {statusInfo.icon}
                          <span>{item.statusLabel}</span>
                        </span>
                      </div>
                    </div>

                    {/* Middle Row: Date/Time + Relative Time */}
                    <div className="flex items-center justify-between text-xs text-slate-300 pl-8 pr-1">
                      <div className="flex items-center gap-1.5 truncate">
                        <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="font-mono text-[11px] text-slate-200 truncate">
                          {item.updatedAtMillis ? item.updatedAtFormatted : 'Not yet provided'}
                        </span>
                      </div>
                      <span className="text-[11px] text-brand-300/90 font-medium shrink-0">
                        {item.relativeTime}
                      </span>
                    </div>

                    {/* Bottom Row: Source & User Attribution + Action Link */}
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pl-8 pr-1 pt-0.5 border-t border-slate-750/40">
                      <span className="truncate max-w-[200px] sm:max-w-[240px]">
                        {item.updatedBy ? `By ${item.updatedBy}` : item.sourceSummary}
                      </span>

                      <span className="inline-flex items-center gap-0.5 text-brand-400 group-hover:text-brand-300 font-medium text-[11px] shrink-0">
                        <span>{item.actionLabel}</span>
                        <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="pt-2.5 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
            <span>Click any item to review or update</span>
            <button
              onClick={() => handleNavigate('/admin/data-freshness')}
              className="text-slate-400 hover:text-slate-200 transition-colors inline-flex items-center gap-1"
            >
              <span>Freshness Thresholds</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

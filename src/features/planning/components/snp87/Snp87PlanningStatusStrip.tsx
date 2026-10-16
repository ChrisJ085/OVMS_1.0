import React, { useEffect } from 'react';
import { 
  Info,
  X,
  FileCheck, 
  AlertTriangle, 
  AlertCircle, 
  Clock, 
  User, 
  Calendar, 
  TrendingDown, 
  Factory, 
  ShieldAlert, 
  Upload, 
  CheckCircle2,
  FileSpreadsheet
} from 'lucide-react';
import { Snp87PlanningImport } from '../../../../types/snp87';

export interface Snp87PlanningStatusStripProps {
  activeSnapshot: Snp87PlanningImport | null;
  loading: boolean;
  onNavigateToImport: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export const Snp87PlanningStatusStrip: React.FC<Snp87PlanningStatusStripProps> = ({
  activeSnapshot,
  loading,
  onNavigateToImport,
  isOpen = false,
  onClose
}) => {
  // Close on Escape key when drawer is open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Determine freshness: Check if snapshot was imported > 7 days ago or after its horizon
  let isStale = false;
  let stalenessReason = '';

  if (activeSnapshot) {
    const importDate = new Date(activeSnapshot.importedAt);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - importDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays > 7) {
      isStale = true;
      stalenessReason = `Imported ${diffDays} days ago (> 7-day cycle)`;
    } else if (activeSnapshot.importPeriod?.endDate) {
      const endDate = new Date(activeSnapshot.importPeriod.endDate);
      if (now.getTime() > endDate.getTime() + 24 * 60 * 60 * 1000) {
        isStale = true;
        stalenessReason = 'Planning horizon has elapsed';
      }
    }
  }

  const exceptionCount = activeSnapshot
    ? (activeSnapshot.errorCount || 0) + 
      (activeSnapshot.warningCount || 0) + 
      (activeSnapshot.unknownProductCount || 0)
    : 0;

  return (
    <div
      id="snp87-baseline-slideover"
      className="fixed inset-0 z-50 overflow-hidden pointer-events-none"
      aria-labelledby="snp87-slideover-title"
      role="dialog"
      aria-modal="true"
    >
      {/* Background Backdrop */}
      <div
        className={`fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-in Container from Right to Left */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-lg md:max-w-xl bg-slate-950 border-l border-slate-800 shadow-2xl flex flex-col z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none'
        }`}
      >
        {/* Drawer Header Bar */}
        <div className="h-16 px-5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/90 border border-cyan-600/40 flex items-center justify-center text-cyan-400">
              <Info className="w-4 h-4" />
            </div>
            <div>
              <h2 id="snp87-slideover-title" className="text-sm font-bold text-slate-100 tracking-tight flex items-center gap-2">
                <span>Planning Baseline Information</span>
                {activeSnapshot && (
                  <span className="text-[10px] bg-cyan-500/15 text-cyan-300 font-semibold px-2 py-0.5 rounded-full border border-cyan-500/30">
                    SNP87
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-slate-400">
                Weekly SAP SNP87 Baseline & Status Overview
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                title="Close Panel (Esc)"
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                aria-label="Close Panel"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Drawer Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {loading ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 animate-pulse space-y-3">
              <div className="h-4 bg-slate-800 rounded w-1/3 mb-3" />
              <div className="grid grid-cols-2 gap-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 bg-slate-800/60 rounded" />
                ))}
              </div>
            </div>
          ) : !activeSnapshot ? (
            /* Missing State */
            <div className="bg-amber-950/20 border border-amber-900/50 rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-lg bg-amber-900/30 border border-amber-700/50 text-amber-400 shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-amber-300">
                      Planning Status: MISSING BASELINE
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      Action Required
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                    No active weekly SAP SNP87 dataset is currently committed. The decision engine will fail safe and retain stock. Import the latest SNP87 report to establish demand forecast and confirmed production baseline.
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => {
                    if (onClose) onClose();
                    onNavigateToImport();
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs transition-colors shadow"
                >
                  <Upload className="w-4 h-4" />
                  Import SNP87 Now
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Top Baseline File Information Banner */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-400">Baseline File:</span>
                    <span className="text-sm font-bold text-slate-100 font-mono">{activeSnapshot.sourceReportName}</span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                      Active Snapshot
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                      isStale
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    }`}>
                      {isStale ? 'STALE BASELINE' : 'ACTIVE / CURRENT'}
                    </span>
                  </div>
                </div>

                {/* Staleness Alert if applicable */}
                {isStale && (
                  <div className="p-3 bg-amber-950/40 border border-amber-900/60 rounded-lg flex items-start gap-2 text-amber-300">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span className="text-xs leading-relaxed">
                      <strong>Warning:</strong> {stalenessReason}. Please import the latest weekly SNP87 report.
                    </span>
                  </div>
                )}

                {/* Import Timestamp & User */}
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-1">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    Imported {new Date(activeSnapshot.importedAt).toLocaleDateString()} {new Date(activeSnapshot.importedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-500" />
                    {activeSnapshot.importedBy}
                  </span>
                </div>
              </div>

              {/* Metric Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Planning Horizon */}
                <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-xl space-y-1">
                  <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                    Planning Horizon
                  </div>
                  <div className="text-xs font-bold text-slate-200 font-mono">
                    {activeSnapshot.importPeriod 
                      ? `${activeSnapshot.importPeriod.startDate} → ${activeSnapshot.importPeriod.endDate}`
                      : 'Rolling 7-day'}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Active ingestion baseline window
                  </div>
                </div>

                {/* 2. Horizon Demand */}
                <div className="p-3 bg-slate-900/70 border border-sky-900/40 rounded-xl space-y-1">
                  <div className="text-[11px] text-sky-400 font-medium flex items-center gap-1.5">
                    <TrendingDown className="w-3.5 h-3.5 text-sky-400" />
                    Horizon Demand
                  </div>
                  <div className="text-sm font-bold text-sky-300 flex items-center gap-1">
                    <span>Forecast:</span>
                    <span>{activeSnapshot.totalForecastQuantity.toLocaleString()}</span>
                    <span className="text-xs font-normal text-slate-400">CS</span>
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    {activeSnapshot.forecastRowCount} forecast rows
                  </span>
                </div>

                {/* 3. Horizon Supply */}
                <div className="p-3 bg-slate-900/70 border border-emerald-900/40 rounded-xl space-y-1">
                  <div className="text-[11px] text-emerald-400 font-medium flex items-center gap-1.5">
                    <Factory className="w-3.5 h-3.5 text-emerald-400" />
                    Horizon Supply
                  </div>
                  <div className="text-sm font-bold text-emerald-300 flex items-center gap-1">
                    <span>Confirmed:</span>
                    <span>{activeSnapshot.totalConfirmedProductionQuantity.toLocaleString()}</span>
                    <span className="text-xs font-normal text-slate-400">CS</span>
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    {activeSnapshot.confirmedProductionRowCount} prod rows
                  </span>
                </div>

                {/* 4. Recognised Rows */}
                <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-xl space-y-1">
                  <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
                    <FileCheck className="w-3.5 h-3.5 text-slate-400" />
                    Recognised Rows
                  </div>
                  <div className="text-sm font-bold text-slate-200">
                    {activeSnapshot.recognisedRowCount} <span className="text-[11px] font-normal text-slate-400">of {activeSnapshot.sourceRowCount}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    {activeSnapshot.ignoredRowCount || 0} ignored
                  </span>
                </div>

                {/* 5. Data Quality / Exceptions */}
                <div className={`p-3 bg-slate-900/70 border rounded-xl space-y-1 sm:col-span-2 ${
                  exceptionCount > 0 
                    ? 'border-amber-900/50 bg-amber-950/10' 
                    : 'border-slate-800'
                }`}>
                  <div className={`text-[11px] font-medium flex items-center gap-1.5 ${
                    exceptionCount > 0 ? 'text-amber-400' : 'text-slate-400'
                  }`}>
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Data Quality
                  </div>
                  <div className={`text-sm font-bold ${
                    exceptionCount > 0 ? 'text-amber-300' : 'text-emerald-400'
                  }`}>
                    {exceptionCount === 0 ? 'No Exceptions' : `${exceptionCount} Issue${exceptionCount > 1 ? 's' : ''}`}
                  </div>
                  <span className="text-[10px] text-slate-500 block">
                    {activeSnapshot.unknownProductCount ? `${activeSnapshot.unknownProductCount} unknown SKUs` : 'All SKUs matched'}
                  </span>
                </div>
              </div>

              {/* Bottom Actions inside Drawer */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (onClose) onClose();
                    onNavigateToImport();
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs transition-colors shadow-sm"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import New SNP87 Report
                </button>

                {onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                  >
                    Close
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

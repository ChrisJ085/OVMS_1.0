import React, { useState, useMemo } from 'react';
import { RefreshCw, Upload, AlertCircle, Info } from 'lucide-react';
import { useAuth } from '../../auth/context/AuthContext';
import { useSiteContext } from '../../../contexts/SiteContext';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ProductionPlanTabs, TabId } from '../components/production-plan/ProductionPlanTabs';
import { Snp87PlanningStatusStrip } from '../components/snp87/Snp87PlanningStatusStrip';
import { Snp87CurrentSnapshotView } from '../components/snp87/Snp87CurrentSnapshotView';
import { Snp87ImportWorkflowView } from '../components/snp87/Snp87ImportWorkflowView';
import { Snp87ImportHistoryView } from '../components/snp87/Snp87ImportHistoryView';
import { PlannerNotesView } from '../components/production-plan/PlannerNotesView';
import { useProductionMasterData } from '../hooks/useProductionMasterData';
import { useSnp87Planning } from '../hooks/useSnp87Planning';
import { useProductionLineNotes } from '../hooks/useProductionLineNotes';
import { useCurrentProductionPlan } from '../hooks/useCurrentProductionPlan';
import { CurrentPlanView } from '../components/production-plan/CurrentPlanView';

export const ProductionPlanPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('current-plan');
  const [viewMode, setViewMode] = useState<'SNP87' | 'LEGACY_LINE_GRID'>('SNP87');

  const { userProfile } = useAuth();
  const { tenantId, siteId } = useSiteContext();

  const userFullName = userProfile?.fullName || 'Production Planner';

  // Products and master data for SNP87 validation
  const { 
    products, 
    productionLines, 
    categories, 
    units,
    destinations,
    loading: masterLoading,
    revalidate: revalidateMaster
  } = useProductionMasterData(tenantId, siteId);

  // SNP87 Planning Snapshot & History Hook
  const {
    activeSnapshot,
    activeRows,
    snapshotLoading,
    historyImports,
    historyLoading,
    refreshActiveSnapshot,
    refreshHistory
  } = useSnp87Planning(tenantId, siteId);

  // Planner Notes hook (preserved)
  const {
    notesList,
    noteForm,
    submittingNote,
    setNoteForm,
    handleNoteSubmit,
    handleDeactivateNote
  } = useProductionLineNotes(tenantId, siteId, userFullName, activeTab === 'planner-notes');

  // Legacy line plan data (maintained for fallback during migration)
  const {
    currentWeekStart,
    gridDates,
    activeEntries,
    gridNotes,
    nextWeek,
    prevWeek,
    resetToCurrentWeek,
    refreshPlan
  } = useCurrentProductionPlan(tenantId, siteId, activeTab === 'current-plan' && viewMode === 'LEGACY_LINE_GRID');

  const [isInfoDrawerOpen, setIsInfoDrawerOpen] = useState(false);

  // Determine if snapshot is stale to display alert dot on (i) button
  const isStaleSnapshot = useMemo(() => {
    if (!activeSnapshot) return false;
    const importDate = new Date(activeSnapshot.importedAt);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - importDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 7) return true;
    if (activeSnapshot.importPeriod?.endDate) {
      const endDate = new Date(activeSnapshot.importPeriod.endDate);
      if (now.getTime() > endDate.getTime() + 24 * 60 * 60 * 1000) return true;
    }
    return false;
  }, [activeSnapshot]);

  return (
    <div className="flex flex-col gap-6 p-6 min-h-[calc(100vh-4rem)] bg-slate-950 text-slate-100">
      <PageHeader 
        title="SAP Planning" 
        description="SNP87 forecast and confirmed production planning – Weekly SAP SNP87 Planning Ingestion, Validation & Planning Baseline" 
        actions={
          <div className="flex items-center gap-2">
            {/* Action (i) button to toggle slide-in right to left panel */}
            <button
              onClick={() => setIsInfoDrawerOpen(prev => !prev)}
              className={`p-2 rounded-lg border text-xs transition-colors flex items-center gap-1.5 cursor-pointer relative ${
                isInfoDrawerOpen
                  ? 'bg-cyan-950/90 border-cyan-500 text-cyan-300 shadow-sm'
                  : 'bg-slate-900 border-slate-800 hover:bg-slate-800 hover:border-slate-700 text-slate-300'
              }`}
              title={isInfoDrawerOpen ? 'Close Baseline Information (i)' : 'Show Baseline Information (i)'}
              aria-label="Planning Baseline Info"
            >
              <Info className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-medium hidden sm:inline">Baseline Info</span>
              {isStaleSnapshot && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
            </button>

            <button
              onClick={() => {
                refreshActiveSnapshot();
                refreshHistory();
              }}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs transition-colors cursor-pointer"
              title="Refresh Planning Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setActiveTab('import-sap')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs transition-colors shadow-sm cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Import SNP87
            </button>
          </div>
        }
      />

      {/* Slide-in Right-to-Left Planning Baseline Info Panel (Hidden by default, toggled via (i) button) */}
      <Snp87PlanningStatusStrip
        activeSnapshot={activeSnapshot}
        loading={snapshotLoading}
        onNavigateToImport={() => setActiveTab('import-sap')}
        isOpen={isInfoDrawerOpen}
        onClose={() => setIsInfoDrawerOpen(false)}
      />

      {/* Tabs Menu Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800">
        <ProductionPlanTabs
          activeTab={activeTab}
          onSelectTab={setActiveTab}
        />

        {activeTab === 'current-plan' && (
          <div className="flex items-center gap-1.5 pb-2">
            <span className="text-[11px] text-slate-400 font-medium">View:</span>
            <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
              <button
                onClick={() => setViewMode('SNP87')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  viewMode === 'SNP87'
                    ? 'bg-cyan-950 text-cyan-300 border border-cyan-800 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                SNP87 Snapshot
              </button>
              <button
                onClick={() => setViewMode('LEGACY_LINE_GRID')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  viewMode === 'LEGACY_LINE_GRID'
                    ? 'bg-slate-800 text-slate-200 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Historical Line Schedule (MPPS7)
              </button>
            </div>
          </div>
        )}
      </div>

      {masterLoading && !activeSnapshot && (
        <div className="flex flex-col items-center justify-center p-12">
          <RefreshCw className="w-8 h-8 text-cyan-500 animate-spin mb-3" />
          <p className="text-sm text-slate-400">Loading catalog and planning master data...</p>
        </div>
      )}

      {/* TAB 1: CURRENT SNP87 SNAPSHOT VIEW */}
      {activeTab === 'current-plan' && (
        viewMode === 'SNP87' ? (
          <Snp87CurrentSnapshotView
            activeSnapshot={activeSnapshot}
            rows={activeRows}
            loading={snapshotLoading}
            onNavigateToImport={() => setActiveTab('import-sap')}
            onRefresh={refreshActiveSnapshot}
            products={products}
          />
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-slate-900/90 border border-amber-900/40 rounded-xl flex items-center gap-2.5 text-xs text-amber-300">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Historical / Legacy Reference:</strong> The production line schedule below is from the retired MPPS7 workflow and is preserved for historical reference only. Active decision engine recommendations are driven by the SAP SNP87 planning baseline.
              </span>
            </div>
            <CurrentPlanView
              currentWeekStart={currentWeekStart}
              gridDates={gridDates}
              productionLines={productionLines}
              activeEntries={activeEntries}
              gridNotes={gridNotes}
              products={products}
              categories={categories}
              onPrevWeek={prevWeek}
              onNextWeek={nextWeek}
              onResetWeek={resetToCurrentWeek}
              onRefreshPlan={refreshPlan}
            />
          </div>
        )
      )}

      {/* TAB 2: IMPORT SNP87 REPORT WORKFLOW */}
      {activeTab === 'import-sap' && (
        <Snp87ImportWorkflowView
          tenantId={tenantId}
          siteId={siteId}
          userFullName={userFullName}
          existingProducts={products}
          activeSnapshot={activeSnapshot}
          categories={categories}
          units={units}
          destinations={destinations}
          onProductCreated={() => {
            revalidateMaster();
          }}
          onCommitSuccess={() => {
            refreshActiveSnapshot();
            refreshHistory();
          }}
          onViewCurrentSnapshot={() => {
            setActiveTab('current-plan');
            setViewMode('SNP87');
            refreshActiveSnapshot();
          }}
          onViewHistory={() => {
            setActiveTab('import-history');
            refreshHistory();
          }}
        />
      )}

      {/* TAB 3: IMPORT HISTORY AUDIT TRAIL */}
      {activeTab === 'import-history' && (
        <Snp87ImportHistoryView
          imports={historyImports}
          loading={historyLoading}
          onRefresh={refreshHistory}
        />
      )}

      {/* TAB 4: PLANNER NOTES MANAGEMENT */}
      {activeTab === 'planner-notes' && (
        <PlannerNotesView
          notesList={notesList}
          productionLines={productionLines}
          noteForm={noteForm}
          submittingNote={submittingNote}
          onFormChange={setNoteForm}
          onSubmitNote={handleNoteSubmit}
          onDeactivateNote={handleDeactivateNote}
        />
      )}
    </div>
  );
};

export default ProductionPlanPage;

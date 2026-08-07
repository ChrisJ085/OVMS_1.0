import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../../auth/context/AuthContext';
import { useSiteContext } from '../../../contexts/SiteContext';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ProductionPlanTabs, TabId } from '../components/production-plan/ProductionPlanTabs';
import { CurrentPlanView } from '../components/production-plan/CurrentPlanView';
import { ImportSapPlanView } from '../components/production-plan/ImportSapPlanView';
import { ImportHistoryView } from '../components/production-plan/ImportHistoryView';
import { PlannerNotesView } from '../components/production-plan/PlannerNotesView';
import { useProductionMasterData } from '../hooks/useProductionMasterData';
import { useCurrentProductionPlan } from '../hooks/useCurrentProductionPlan';
import { useProductionImport } from '../hooks/useProductionImport';
import { useProductionImportHistory } from '../hooks/useProductionImportHistory';
import { useProductionLineNotes } from '../hooks/useProductionLineNotes';

export const ProductionPlanPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('current-plan');

  const { userProfile } = useAuth();
  const { tenantId, siteId } = useSiteContext();

  const userFullName = userProfile?.fullName || 'Production Planner';

  // Master Data hook
  const { productionLines, products, units, categories, loading: masterLoading, revalidate: revalidateMasterData } = useProductionMasterData(
    tenantId,
    siteId
  );

  // Current Plan hook
  const {
    currentWeekStart,
    gridDates,
    activeEntries,
    gridNotes,
    nextWeek,
    prevWeek,
    resetToCurrentWeek,
    refreshPlan
  } = useCurrentProductionPlan(tenantId, siteId, activeTab === 'current-plan');

  // Import hook
  const importHook = useProductionImport(
    tenantId,
    siteId,
    userFullName,
    refreshPlan
  );

  // Import History hook
  const {
    historyImports,
    selectedHistoryImport,
    historyRows,
    loadingHistoryDetails,
    setSelectedHistoryImport
  } = useProductionImportHistory(tenantId, siteId, activeTab === 'import-history');

  // Planner Notes hook
  const {
    notesList,
    noteForm,
    submittingNote,
    setNoteForm,
    handleNoteSubmit,
    handleDeactivateNote
  } = useProductionLineNotes(tenantId, siteId, userFullName, activeTab === 'planner-notes');

  return (
    <div className="flex flex-col gap-6 p-6 min-h-[calc(100vh-4rem)] bg-slate-950 text-slate-100">
      <PageHeader 
        title="Operations Visual Management System" 
        subtitle="Visual Management Plan and SAP Production Ingestion" 
      />

      {/* Tabs Menu Navigation */}
      <ProductionPlanTabs
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />

      {masterLoading && (
        <div className="flex flex-col items-center justify-center p-12">
          <RefreshCw className="w-8 h-8 text-brand-500 animate-spin mb-3" />
          <p className="text-sm text-slate-400">Synchronizing database catalog...</p>
        </div>
      )}

      {/* TAB 1: CURRENT PLAN GRID VIEW */}
      {activeTab === 'current-plan' && !masterLoading && (
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
        />
      )}

      {/* TAB 2: IMPORT SAP PLAN WORKFLOW */}
      {activeTab === 'import-sap' && (
        <ImportSapPlanView
          importStep={importHook.importStep}
          selectedFile={importHook.selectedFile}
          previewData={importHook.previewData}
          fileLoading={importHook.fileLoading}
          error={importHook.error}
          fileInputRef={importHook.fileInputRef}
          products={products}
          units={units}
          productionLines={productionLines}
          tenantId={tenantId}
          siteId={siteId}
          userFullName={userFullName}
          confirmedYear={importHook.confirmedYear}
          duplicateCheckAcknowledged={importHook.duplicateCheckAcknowledged}
          confirmReviewed={importHook.confirmReviewed}
          confirmSupersede={importHook.confirmSupersede}
          importNotesText={importHook.importNotesText}
          committedImportId={importHook.committedImportId}
          reviewFilter={importHook.reviewFilter}
          reviewSearch={importHook.reviewSearch}
          reviewLineFilter={importHook.reviewLineFilter}
          onFileSelect={importHook.handleSelectFile as any}
          onRemoveFile={importHook.removeSelectedFile}
          onStartValidation={importHook.startValidation}
          onConfirmYear={importHook.setConfirmedYear}
          onAcknowledgeDuplicate={importHook.setDuplicateCheckAcknowledged}
          onRevalidateMasterData={() => {
            revalidateMasterData();
            importHook.startValidation();
          }}
          onFilterChange={importHook.setReviewFilter}
          onSearchChange={importHook.setReviewSearch}
          onLineFilterChange={importHook.setReviewLineFilter}
          onConfirmReviewedChange={importHook.setConfirmReviewed}
          onConfirmSupersedeChange={importHook.setConfirmSupersede}
          onNotesTextChange={importHook.setImportNotesText}
          onCommitImport={importHook.handleCommitImport}
          onViewPlanGrid={() => {
            setActiveTab('current-plan');
            importHook.removeSelectedFile();
          }}
          onViewImportHistory={() => {
            setActiveTab('import-history');
            importHook.removeSelectedFile();
          }}
        />
      )}

      {/* TAB 3: IMPORT HISTORY AUDIT TRAIL */}
      {activeTab === 'import-history' && (
        <ImportHistoryView
          historyImports={historyImports}
          selectedHistoryImport={selectedHistoryImport}
          historyRows={historyRows}
          loadingHistoryDetails={loadingHistoryDetails}
          onSelectHistoryImport={setSelectedHistoryImport}
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

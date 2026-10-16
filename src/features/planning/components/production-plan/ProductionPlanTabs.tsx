import React from 'react';

export type TabId = 'current-plan' | 'import-sap' | 'import-history' | 'planner-notes';

interface ProductionPlanTabsProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
}

export const ProductionPlanTabs: React.FC<ProductionPlanTabsProps> = ({ activeTab, onSelectTab }) => {
  return (
    <div className="flex border-b border-slate-800 gap-2 overflow-x-auto">
      <button
        onClick={() => onSelectTab('current-plan')}
        className={`px-5 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
          activeTab === 'current-plan'
            ? 'border-cyan-500 text-cyan-400 bg-slate-900/40'
            : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/20'
        }`}
      >
        Current Planning Snapshot
      </button>
      <button
        onClick={() => onSelectTab('import-sap')}
        className={`px-5 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
          activeTab === 'import-sap'
            ? 'border-cyan-500 text-cyan-400 bg-slate-900/40'
            : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/20'
        }`}
      >
        Import SNP87 Report
      </button>
      <button
        onClick={() => onSelectTab('import-history')}
        className={`px-5 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
          activeTab === 'import-history'
            ? 'border-cyan-500 text-cyan-400 bg-slate-900/40'
            : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/20'
        }`}
      >
        Import History
      </button>
      <button
        onClick={() => onSelectTab('planner-notes')}
        className={`px-5 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
          activeTab === 'planner-notes'
            ? 'border-cyan-500 text-cyan-400 bg-slate-900/40'
            : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/20'
        }`}
      >
        Planner Notes
      </button>
    </div>
  );
};

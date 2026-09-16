import React from 'react';
import { HelpCircle, BookOpen } from 'lucide-react';
import { useLearning } from '../context/LearningContext';

export const HelpButton: React.FC = () => {
  const { toggleHelpDrawer, isHelpDrawerOpen } = useLearning();

  return (
    <button
      id="ovms-global-help-btn"
      type="button"
      onClick={toggleHelpDrawer}
      title="Open OVMS Help & SOP Centre (Shortcut: ? or F1)"
      className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer select-none ${
        isHelpDrawerOpen
          ? 'bg-brand-500/20 text-brand-300 border-brand-500/50 shadow-sm'
          : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800 hover:border-slate-700'
      }`}
    >
      <HelpCircle className={`w-4 h-4 ${isHelpDrawerOpen ? 'text-brand-400' : 'text-slate-400'}`} />
      <span className="hidden sm:inline">Help & SOPs</span>
      <kbd className="hidden md:inline-block px-1.5 py-0.2 bg-slate-950/80 border border-slate-700 rounded text-[10px] font-mono text-slate-400">
        ?
      </kbd>
    </button>
  );
};

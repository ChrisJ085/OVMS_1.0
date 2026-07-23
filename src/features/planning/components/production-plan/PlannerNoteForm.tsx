import React from 'react';
import { ProductionLine } from '../../../../types/configuration';
import { NoteFormState } from '../../hooks/useProductionLineNotes';

interface PlannerNoteFormProps {
  noteForm: NoteFormState;
  productionLines: ProductionLine[];
  submitting: boolean;
  onFormChange: React.Dispatch<React.SetStateAction<NoteFormState>>;
  onSubmit: (e: React.FormEvent) => void;
}

export const PlannerNoteForm: React.FC<PlannerNoteFormProps> = ({
  noteForm,
  productionLines,
  submitting,
  onFormChange,
  onSubmit
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
      <h3 className="font-bold text-slate-200 text-sm mb-4">Create Planning Note Overlay</h3>
      
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-300">Production Line *</label>
          <select
            value={noteForm.productionLineId}
            onChange={(e) => onFormChange(prev => ({ ...prev, productionLineId: e.target.value }))}
            className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded p-2.5 focus:outline-none focus:border-slate-700"
            required
          >
            <option value="">Select Production Line</option>
            {productionLines.map(line => (
              <option key={line.id} value={line.lineCode}>{line.lineName} ({line.lineCode})</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-300">Target Production Date *</label>
          <input
            type="date"
            value={noteForm.noteDate}
            onChange={(e) => onFormChange(prev => ({ ...prev, noteDate: e.target.value }))}
            className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded p-2.5 focus:outline-none focus:border-slate-700"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300">Note Type *</label>
            <select
              value={noteForm.noteType}
              onChange={(e) => onFormChange(prev => ({ ...prev, noteType: e.target.value as any }))}
              className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded p-2.5 focus:outline-none focus:border-slate-700"
              required
            >
              <option value="GENERAL">General</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="CLEANING">Cleaning</option>
              <option value="GRADE_CHANGE">Grade Change</option>
              <option value="FORMAT_CHANGE">Format Change</option>
              <option value="TRIAL">Trial Run</option>
              <option value="DELAY">Expected Delay</option>
              <option value="SHUTDOWN">Shutdown</option>
              <option value="PRODUCT_RESTRICTION">SKU Restrict</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300">Severity *</label>
            <select
              value={noteForm.severity}
              onChange={(e) => onFormChange(prev => ({ ...prev, severity: e.target.value as any }))}
              className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded p-2.5 focus:outline-none focus:border-slate-700"
              required
            >
              <option value="INFORMATION">Info</option>
              <option value="WARNING">Warning</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-300">Overlay Title *</label>
          <input
            type="text"
            placeholder="e.g. Line Cleaning Window, Core PM"
            value={noteForm.title}
            onChange={(e) => onFormChange(prev => ({ ...prev, title: e.target.value }))}
            className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded p-2.5 focus:outline-none focus:border-slate-700"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-300">Note Description *</label>
          <textarea
            placeholder="Provide details on maintenance times, product limitations, or staffing adjustments..."
            value={noteForm.note}
            onChange={(e) => onFormChange(prev => ({ ...prev, note: e.target.value }))}
            className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded p-2.5 focus:outline-none focus:border-slate-700 min-h-[80px]"
            required
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2 bg-brand-500 text-slate-950 font-bold text-xs rounded hover:bg-brand-400 transition-colors"
        >
          {submitting ? 'Saving Override...' : 'Overlay Planner Note'}
        </button>
      </form>
    </div>
  );
};

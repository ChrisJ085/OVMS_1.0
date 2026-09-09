import React from 'react';
import { Calendar, Trash2 } from 'lucide-react';
import { SectionCard } from '../../../../components/ui/SectionCard';
import { PlannerNoteForm } from './PlannerNoteForm';
import { ProductionLine } from '../../../../types/configuration';
import { ProductionLinePlanNote } from '../../../../types/production';
import { NoteFormState } from '../../hooks/useProductionLineNotes';

export const formatUTCFull = (d: Date) => {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

interface PlannerNotesViewProps {
  notesList: ProductionLinePlanNote[];
  productionLines: ProductionLine[];
  noteForm: NoteFormState;
  submittingNote: boolean;
  onFormChange: React.Dispatch<React.SetStateAction<NoteFormState>>;
  onSubmitNote: (e: React.FormEvent) => void;
  onDeactivateNote: (noteId: string) => void;
}

export const PlannerNotesView: React.FC<PlannerNotesViewProps> = ({
  notesList,
  productionLines,
  noteForm,
  submittingNote,
  onFormChange,
  onSubmitNote,
  onDeactivateNote
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <SectionCard title="Active Planner Overrides" description="Review operational notes and restrictions overlaid on top of production schedule intervals.">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-850 bg-slate-900/50">
                  <th className="p-3 font-semibold text-slate-400">Line & Date</th>
                  <th className="p-3 font-semibold text-slate-400">Type / Title</th>
                  <th className="p-3 font-semibold text-slate-400">Details</th>
                  <th className="p-3 font-semibold text-slate-400">Severity</th>
                  <th className="p-3 font-semibold text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {notesList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500 italic">No planner notes registered.</td>
                  </tr>
                ) : (
                  notesList.map(note => (
                    <tr key={note.id} className={`border-b border-slate-850/50 hover:bg-slate-900/10 transition-colors ${
                      !note.active ? 'opacity-50 bg-slate-900/5' : ''
                    }`}>
                      <td className="p-3">
                        <strong className="text-slate-300 font-semibold block">{note.productionLineId}</strong>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3 text-slate-500" />
                          {formatUTCFull(note.noteDate.toDate())}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-850 text-slate-400">
                          {note.noteType}
                        </span>
                        <div className="font-semibold text-slate-200 mt-1">{note.title}</div>
                      </td>
                      <td className="p-3 max-w-[200px] text-slate-400 break-words" title={note.note}>
                        {note.note}
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          note.severity === 'CRITICAL' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                          note.severity === 'WARNING' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                          'bg-slate-850 text-slate-400 border border-slate-700/50'
                        }`}>
                          {note.severity}
                        </span>
                      </td>
                      <td className="p-3">
                        {note.active ? (
                          <button
                            onClick={() => onDeactivateNote(note.id)}
                            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Archive</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-500 italic">Archived</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      <div className="space-y-6">
        <PlannerNoteForm
          noteForm={noteForm}
          productionLines={productionLines}
          submitting={submittingNote}
          onFormChange={onFormChange}
          onSubmit={onSubmitNote}
        />
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { StickyNote, Sparkles, AlertTriangle, X, Trash2, Plus, Loader2, Pencil } from 'lucide-react';
import { ProductionLine, ProductCategory } from '../../../../types/configuration';
import { Product } from '../../../../types/product';
import { ProductionPlanEntry, ProductionLinePlanNote } from '../../../../types/production';
import {
  calculateDayEventSummary,
  PRODUCTION_EVENT_COLOURS,
  ChangeoverEventType,
} from '../../services/changeoverEngine';
import { LineDayHeaderCell } from './LineDayHeaderCell';
import { useSiteContext } from '../../../../contexts/SiteContext';
import { useAuth } from '../../../auth/context/AuthContext';
import { productionNotesRepository } from '../../repositories/productionNotesRepository';
import { toEpochMillis } from '../../../../utils/timeFormatters';

export const formatUTCDate = (d: Date) => {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
};

const titleMap: Record<string, string> = {
  FORMAT_CHANGE: 'Format Change',
  GRADE_CHANGE: 'Grade Change',
  CLEANING: 'Scheduled Clean',
  MAINTENANCE: 'Maintenance Shutdown',
  TRIAL: 'RSR Trial',
};

const severityMap: Record<string, 'INFORMATION' | 'WARNING' | 'CRITICAL'> = {
  FORMAT_CHANGE: 'INFORMATION',
  GRADE_CHANGE: 'INFORMATION',
  CLEANING: 'INFORMATION',
  MAINTENANCE: 'CRITICAL',
  TRIAL: 'WARNING',
};

interface ProductionPlanGridProps {
  productionLines: ProductionLine[];
  activeEntries?: ProductionPlanEntry[];
  fullActiveEntries?: ProductionPlanEntry[];
  displayEntries?: ProductionPlanEntry[];
  gridNotes: ProductionLinePlanNote[];
  gridDates: Date[];
  products?: Product[];
  categories?: ProductCategory[];
  isFiltered?: boolean;
  onRefreshPlan?: () => void;
}

export const ProductionPlanGrid: React.FC<ProductionPlanGridProps> = ({
  productionLines,
  activeEntries = [],
  fullActiveEntries,
  displayEntries,
  gridNotes,
  gridDates,
  products = [],
  categories = [],
  isFiltered = false,
  onRefreshPlan,
}) => {
  const completeEntries = fullActiveEntries || activeEntries;
  const visibleEntries = displayEntries || activeEntries;

  // Manual event editor modal states
  const { tenantId, siteId } = useSiteContext();
  const { userProfile } = useAuth();
  const userFullName = userProfile?.fullName || 'Production Planner';

  const [selectedLine, setSelectedLine] = useState<ProductionLine | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  
  // Form states for new manual event
  const [newEventType, setNewEventType] = useState<'FORMAT_CHANGE' | 'GRADE_CHANGE' | 'CLEANING' | 'MAINTENANCE' | 'TRIAL'>('FORMAT_CHANGE');
  const [newEventNote, setNewEventNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Production Line Notes Modal States
  const [selectedLineForNotes, setSelectedLineForNotes] = useState<ProductionLine | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [newLineNoteTitle, setNewLineNoteTitle] = useState<string>('');
  const [newLineNoteText, setNewLineNoteText] = useState<string>('');
  const [newLineNoteExpiry, setNewLineNoteExpiry] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [isSubmittingLineNote, setIsSubmittingLineNote] = useState<boolean>(false);
  const [lineNoteErrorMsg, setLineNoteErrorMsg] = useState<string | null>(null);

  const handleLineClick = (line: ProductionLine) => {
    setSelectedLineForNotes(line);
    setEditingNoteId(null);
    setNewLineNoteTitle('Note');
    setNewLineNoteText('');
    setLineNoteErrorMsg(null);
    const d = new Date();
    d.setDate(d.getDate() + 7);
    setNewLineNoteExpiry(d.toISOString().split('T')[0]);
  };

  const handleEditLineNoteClick = (note: ProductionLinePlanNote) => {
    setEditingNoteId(note.id);
    setNewLineNoteTitle(note.title);
    setNewLineNoteText(note.note);
    
    // Parse expiry date
    const expiryMs = toEpochMillis(note.endAt);
    const expiryDate = expiryMs ? new Date(expiryMs) : null;
    if (expiryDate) {
      const year = expiryDate.getFullYear();
      const month = String(expiryDate.getMonth() + 1).padStart(2, '0');
      const day = String(expiryDate.getDate()).padStart(2, '0');
      setNewLineNoteExpiry(`${year}-${month}-${day}`);
    } else {
      setNewLineNoteExpiry('');
    }
    setLineNoteErrorMsg(null);
  };

  const handleCancelLineEdit = () => {
    setEditingNoteId(null);
    setNewLineNoteTitle('Note');
    setNewLineNoteText('');
    const d = new Date();
    d.setDate(d.getDate() + 7);
    setNewLineNoteExpiry(d.toISOString().split('T')[0]);
    setLineNoteErrorMsg(null);
  };

  const handleEditNoteFromGrid = (note: ProductionLinePlanNote, line: ProductionLine) => {
    setSelectedLineForNotes(line);
    handleEditLineNoteClick(note);
  };

  const handleAddLineNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLineForNotes) return;
    if (!newLineNoteText.trim()) {
      setLineNoteErrorMsg('Please enter note text');
      return;
    }

    setIsSubmittingLineNote(true);
    setLineNoteErrorMsg(null);

    try {
      let expiryTimestamp: string | null = null;
      if (newLineNoteExpiry) {
        const expiryDate = new Date(newLineNoteExpiry);
        expiryDate.setHours(23, 59, 59, 999);
        expiryTimestamp = expiryDate.toISOString();
      }

      if (editingNoteId) {
        // Edit mode
        const updates: Partial<Omit<ProductionLinePlanNote, 'id'>> = {
          title: newLineNoteTitle.trim() || 'Line Note',
          note: newLineNoteText.trim(),
          endAt: expiryTimestamp,
          modifiedBy: userFullName,
          modifiedDate: new Date().toISOString(),
        };
        await productionNotesRepository.updateNote(editingNoteId, updates);
        setEditingNoteId(null);
      } else {
        // Add mode
        const docData: Omit<ProductionLinePlanNote, 'id'> = {
          tenantId: tenantId || 'default-tenant',
          siteId: siteId || 'default-site',
          productionLineId: selectedLineForNotes.id,
          noteDate: new Date().toISOString(),
          noteType: 'LINE_NOTE',
          title: newLineNoteTitle.trim() || 'Line Note',
          note: newLineNoteText.trim(),
          severity: 'INFORMATION',
          source: 'PLANNER',
          active: true,
          createdBy: userFullName,
          createdDate: new Date().toISOString(),
          modifiedBy: userFullName,
          modifiedDate: new Date().toISOString(),
          startAt: null,
          endAt: expiryTimestamp,
        };

        await productionNotesRepository.addNote(docData);
      }

      setNewLineNoteText('');
      setNewLineNoteTitle('Note');
      setSelectedLineForNotes(null); // Close modal on success
      if (onRefreshPlan) {
        onRefreshPlan();
      }
    } catch (err: any) {
      console.error(err);
      setLineNoteErrorMsg(err.message || 'Failed to save line note. Please try again.');
    } finally {
      setIsSubmittingLineNote(false);
    }
  };

  const today = new Date();
  const isTodayColumn = (date: Date) => {
    return date.getUTCFullYear() === today.getUTCFullYear() &&
           date.getUTCMonth() === today.getUTCMonth() &&
           date.getUTCDate() === today.getUTCDate();
  };

  if (productionLines.length === 0) {
    return (
      <div className="p-12 text-center text-slate-500">
        No active production lines configured. Go to site master database to seed.
      </div>
    );
  }

  // Check if any matching entries exist overall across all lines when filtering
  const totalMatchingSKUs = productionLines.reduce((acc, line) => {
    const lineEntries = visibleEntries.filter(e => e.productionLineId.toUpperCase() === line.lineCode.toUpperCase());
    return acc + new Set(lineEntries.map(e => e.productCodeSnapshot)).size;
  }, 0);

  if (isFiltered && totalMatchingSKUs === 0) {
    return (
      <div className="p-12 text-center text-slate-400 space-y-2 bg-slate-900/40 rounded-lg border border-slate-800">
        <div className="text-base font-semibold text-slate-200">No Production Entries Match Your Filter</div>
        <p className="text-xs text-slate-400">Try adjusting or clearing your Production Line, SKU search, or Today's SKUs filter.</p>
      </div>
    );
  }

  const handleDayCellClick = (line: ProductionLine, date: Date) => {
    setSelectedLine(line);
    setSelectedDate(date);
    setIsModalOpen(true);
    setNewEventNote('');
    setNewEventType('FORMAT_CHANGE');
    setErrorMsg(null);
  };

  const handleAddEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLine || !selectedDate) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const docData: Omit<ProductionLinePlanNote, 'id'> = {
        tenantId: tenantId || 'default-tenant',
        siteId: siteId || 'default-site',
        productionLineId: selectedLine.id,
        noteDate: selectedDate.toISOString(),
        noteType: newEventType,
        title: titleMap[newEventType],
        note: newEventNote.trim(),
        severity: severityMap[newEventType] || 'INFORMATION',
        source: 'PLANNER',
        active: true,
        createdBy: userFullName,
        createdDate: new Date().toISOString(),
        modifiedBy: userFullName,
        modifiedDate: new Date().toISOString(),
        startAt: null,
        endAt: null,
      };

      await productionNotesRepository.addNote(docData);
      setNewEventNote('');
      if (onRefreshPlan) {
        onRefreshPlan();
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to schedule event. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEvent = async (noteId: string) => {
    const note = gridNotes.find(n => n.id === noteId);
    const isLineNote = note?.noteType === 'LINE_NOTE';
    const confirmMsg = isLineNote 
      ? 'Are you sure you want to delete this production line note?' 
      : 'Are you sure you want to remove this planning event?';
      
    if (!window.confirm(confirmMsg)) return;
    try {
      await productionNotesRepository.deactivateNote(noteId, userFullName);
      if (onRefreshPlan) {
        onRefreshPlan();
      }
    } catch (err: any) {
      console.error(err);
      alert('Failed to delete note: ' + err.message);
    }
  };

  // Filter notes active on the selected line and date
  const activeDayNotes = selectedLine && selectedDate
    ? gridNotes.filter(n =>
        n.active !== false &&
        (n.productionLineId?.toUpperCase() === selectedLine.lineCode?.toUpperCase() ||
         n.productionLineId === selectedLine.id) &&
        formatDateKey(n.noteDate?.toDate ? n.noteDate.toDate() : new Date(n.noteDate as any)) === formatDateKey(selectedDate)
      )
    : [];

  function formatDateKey(d: Date): string {
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const getFullDateDisplay = (d: Date) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${days[d.getUTCDay()]}, ${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  };

  return (
    <div className="overflow-x-auto relative">
      <table className="w-full text-left border-collapse min-w-[1000px]">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-900/80">
            <th className="p-4 text-xs font-bold text-slate-300 uppercase tracking-wider w-64">
              Production Line / SKU
            </th>
            {gridDates.map((date, idx) => {
              const isToday = isTodayColumn(date);
              return (
                <th 
                  key={idx} 
                  className={`p-3 text-xs font-semibold uppercase tracking-wider text-center border-l border-slate-850 transition-colors ${
                    isToday ? 'bg-brand-500/10 text-brand-300 border-b-2 border-b-brand-500' : 'text-slate-400'
                  }`}
                >
                  {isToday && (
                    <div className="inline-block px-1.5 py-0.5 mb-1 rounded text-[9px] font-bold bg-brand-500 text-slate-950 uppercase tracking-wider">
                      Today
                    </div>
                  )}
                  <div>{['SUN','MON','TUE','WED','THU','FRI','SAT'][date.getUTCDay()]}</div>
                  <div className={isToday ? 'text-brand-300 font-semibold' : 'text-slate-500 font-normal'}>
                    {String(date.getUTCDate()).padStart(2, '0')}/{String(date.getUTCMonth() + 1).padStart(2, '0')}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {productionLines.map(line => {
            const fullLineEntries = completeEntries.filter(e => e.productionLineId.toUpperCase() === line.lineCode.toUpperCase());
            const dispLineEntries = visibleEntries.filter(e => e.productionLineId.toUpperCase() === line.lineCode.toUpperCase());

            const scheduledSKUs = Array.from(new Set(dispLineEntries.map(e => e.productCodeSnapshot)));

            // Calculate day summaries using complete line entries and gridNotes
            const daySummaries = gridDates.map(date =>
              calculateDayEventSummary(line, date, fullLineEntries, products, categories, gridNotes)
            );

            const hasAnyEventsOnLine = daySummaries.some(s => s.events.length > 0 || s.missingCategoryWarning);

            if (scheduledSKUs.length === 0) {
              if (isFiltered) return null; // Hide non-matching lines when filtering
              return (
                <React.Fragment key={line.id}>
                  {/* Line Title Bar */}
                  <tr className="border-b border-slate-850 bg-slate-900/40">
                    <td colSpan={8} className="p-3 text-xs font-semibold text-slate-300">
                      <div className="flex items-center justify-between">
                        <div 
                          onClick={() => handleLineClick(line)}
                          className="inline-flex items-center gap-2 cursor-pointer group hover:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-transparent hover:border-slate-700/50 transition-all"
                          title="Click to manage production line notes"
                        >
                          <span className="text-sm font-bold text-slate-200 group-hover:text-brand-400 transition-colors">{line.lineName}</span>
                          <span className="text-slate-500 font-mono ml-2">({line.sapResourceCode || line.lineCode})</span>
                          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[11px] text-brand-400 transition-opacity ml-2">
                            <Plus className="w-3 h-3" />
                            <span>Add Note</span>
                          </div>
                        </div>
                        {line.scheduledCleanDay && line.scheduledCleanDay !== 'None' && (
                          <span className="text-[10px] px-2 py-0.5 bg-pink-950 text-pink-300 border border-pink-800 rounded font-medium">
                            Scheduled Clean: {line.scheduledCleanDay}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Line Specific Date Header Row */}
                  <tr className="border-b border-slate-800 bg-slate-950/60">
                    <td className="p-2 pl-4 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Operational Schedule
                    </td>
                    {gridDates.map((date, idx) => (
                      <td key={idx} className="p-1.5 border-l border-slate-850">
                        <LineDayHeaderCell
                          date={date}
                          summary={daySummaries[idx]}
                          isToday={isTodayColumn(date)}
                          onClick={() => handleDayCellClick(line, date)}
                        />
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="p-4 font-medium text-slate-300">
                      <div className="text-xs text-slate-500 font-mono">No Active SKUs</div>
                    </td>
                    <td colSpan={7} className="p-4 text-center text-slate-500 italic text-xs">
                      No production scheduled for this line within this period.
                    </td>
                  </tr>
                </React.Fragment>
              );
            }

            return (
              <React.Fragment key={line.id}>
                {/* Line Title Header Bar */}
                <tr className="border-b border-slate-800 bg-slate-900/60">
                  <td colSpan={8} className="p-3 bg-slate-900/80 text-xs font-semibold text-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div 
                        onClick={() => handleLineClick(line)}
                        className="inline-flex items-center gap-2 cursor-pointer group hover:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-transparent hover:border-slate-700/50 transition-all"
                        title="Click to manage production line notes"
                      >
                        <span className="text-sm font-bold text-slate-100 group-hover:text-brand-400 transition-colors">{line.lineName}</span>
                        <span className="text-slate-400 font-mono text-xs bg-slate-950 px-2 py-0.5 rounded border border-slate-800 group-hover:border-slate-700 transition-colors">
                          {line.sapResourceCode || line.lineCode}
                        </span>
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[11px] text-brand-400 transition-opacity ml-2">
                          <Plus className="w-3 h-3" />
                          <span>Add Note</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {line.scheduledCleanDay && line.scheduledCleanDay !== 'None' && (
                          <span className="text-[11px] px-2 py-0.5 bg-pink-950/80 text-pink-300 border border-pink-800/80 rounded font-medium flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PRODUCTION_EVENT_COLOURS.CLEAN }} />
                            Clean Day: {line.scheduledCleanDay}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>

                {/* Per-Line Day / Date Header Row */}
                <tr className="border-b border-slate-800 bg-slate-950/80">
                  <td className="p-2 pl-4 text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                    {line.lineCode} Schedule Events
                  </td>
                  {gridDates.map((date, idx) => (
                    <td key={idx} className="p-1.5 border-l border-slate-850">
                      <LineDayHeaderCell
                        date={date}
                        summary={daySummaries[idx]}
                        isToday={isTodayColumn(date)}
                        onClick={() => handleDayCellClick(line, date)}
                      />
                    </td>
                  ))}
                </tr>

                {/* Scheduled SKUs Rows */}
                {scheduledSKUs.map(sku => {
                  const sampleEntry = fullLineEntries.find(e => e.productCodeSnapshot === sku);
                  const desc = sampleEntry?.descriptionSnapshot || 'Unknown Product';

                  return (
                    <tr key={sku} className="border-b border-slate-850/50 hover:bg-slate-900/20 transition-colors">
                      <td className="p-3 pl-6">
                        <div className="font-semibold text-slate-200 text-xs font-mono">{sku}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[220px]" title={desc}>
                          {desc}
                        </div>
                      </td>
                      {gridDates.map((date, idx) => {
                        const isToday = isTodayColumn(date);
                        const entry = dispLineEntries.find(e => {
                          const entryDate = e.productionDate.toDate ? e.productionDate.toDate() : new Date(e.productionDate as any);
                          return entryDate.getUTCFullYear() === date.getUTCFullYear() &&
                                 entryDate.getUTCMonth() === date.getUTCMonth() &&
                                 entryDate.getUTCDate() === date.getUTCDate() &&
                                 e.productCodeSnapshot === sku;
                        });

                        return (
                          <td 
                            key={idx} 
                            className={`p-3 text-center border-l border-slate-900 min-w-[120px] ${
                              isToday ? 'bg-brand-500/5' : 'bg-slate-900/5'
                            }`}
                          >
                            {entry ? (
                              <div className="flex flex-col gap-1 items-center">
                                <div className="text-xs font-bold text-brand-400">
                                  {Number(entry.plannedCases).toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">CS</span>
                                </div>
                                <div className="text-[10px] text-slate-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 font-mono">
                                  {entry.plannedPallets !== null && entry.plannedPallets !== undefined ? (
                                    `${entry.plannedPallets} Pallets`
                                  ) : (
                                    <span className="text-amber-400 italic">Not calculated</span>
                                  )}
                                </div>
                                {entry.status !== 'PLANNED' && (
                                  <span className="text-[9px] px-1 bg-amber-500/10 text-amber-400 rounded">
                                    {entry.status}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-700 text-xs">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {/* Line Totals row */}
                <tr className="border-b border-slate-800 bg-slate-900/30 font-medium">
                  <td className="p-3 pl-6 text-xs text-slate-400 uppercase tracking-wider font-semibold">
                    {line.lineName} Totals
                  </td>
                  {gridDates.map((date, idx) => {
                    const isToday = isTodayColumn(date);
                    const dayEntries = dispLineEntries.filter(e => {
                      const entryDate = e.productionDate.toDate ? e.productionDate.toDate() : new Date(e.productionDate as any);
                      return entryDate.getUTCFullYear() === date.getUTCFullYear() &&
                             entryDate.getUTCMonth() === date.getUTCMonth() &&
                             entryDate.getUTCDate() === date.getUTCDate();
                    });

                    const sumCases = dayEntries.reduce((acc, curr) => acc + curr.plannedCases, 0);
                    const sumPallets = Math.round(
                      dayEntries.reduce((acc, curr) => acc + (curr.plannedPallets || 0), 0) * 100
                    ) / 100;

                    return (
                      <td key={idx} className={`p-3 text-center border-l border-slate-850 text-xs ${isToday ? 'bg-brand-500/5' : ''}`}>
                        {sumCases > 0 ? (
                          <div className="font-semibold text-slate-200">
                            <div>{sumCases.toLocaleString()} cs</div>
                            <div className="text-[10px] text-slate-400 font-mono">{sumPallets} pal</div>
                          </div>
                        ) : (
                          <span className="text-slate-700">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>

                {/* Planning Events & Notes Row */}
                {hasAnyEventsOnLine && (
                  <tr className="border-b border-slate-800 bg-slate-950/70">
                    <td className="p-3 pl-6 text-xs text-slate-300 font-semibold align-top">
                      <div className="flex items-center gap-1.5 text-amber-400">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>Planning Events & Notes</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-normal mt-0.5">
                        Manually registered events & notes
                      </p>
                    </td>
                    {gridDates.map((date, idx) => {
                      const summary = daySummaries[idx];
                      const isToday = isTodayColumn(date);

                      if (summary.events.length === 0 && !summary.missingCategoryWarning) {
                        return (
                          <td key={idx} className={`p-2 border-l border-slate-850 text-center text-[10px] text-slate-600 ${isToday ? 'bg-brand-500/5' : ''}`}>
                            -
                          </td>
                        );
                      }

                      const labelMap: Record<ChangeoverEventType, string> = {
                        FORMAT_CHANGE: 'Format Change',
                        GRADE_CHANGE: 'Grade Change',
                        CLEAN: 'Scheduled Clean',
                        MAINT_SHUT: 'Maintenance Shutdown',
                        RSR_TRIAL: 'RSR Trial',
                      };

                      return (
                        <td key={idx} className={`p-2 border-l border-slate-850 align-top text-left ${isToday ? 'bg-brand-500/5' : ''}`}>
                          <div className="space-y-1">
                            {summary.events.map(event => (
                              <div
                                key={event}
                                className="px-2 py-1 rounded text-[10px] font-bold tracking-tight text-slate-950 shadow-sm"
                                style={{ backgroundColor: PRODUCTION_EVENT_COLOURS[event] }}
                              >
                                {labelMap[event]}
                              </div>
                            ))}

                            {/* Transition reasons */}
                            {summary.transitions.map((trans, i) => (
                              <div
                                key={i}
                                className="text-[10px] font-mono bg-slate-900/90 p-1 rounded border border-slate-800 text-slate-200 whitespace-pre-line animate-in fade-in duration-200"
                              >
                                {trans.reason}
                              </div>
                            ))}

                            {/* Missing category warning */}
                            {summary.missingCategoryWarning && (
                              <div className="p-1 bg-amber-950/80 border border-amber-700/80 rounded text-[9px] text-amber-300 flex items-center gap-1" title="Missing Product Category">
                                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                                <span>Cat Missing</span>
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                )}

                {/* Production Line General Notes (replacing the old date-specific Registered Notes list) */}
                {gridNotes.filter(n =>
                  n.active !== false &&
                  n.noteType === 'LINE_NOTE' &&
                  (n.productionLineId?.toUpperCase() === line.lineCode.toUpperCase() ||
                   n.productionLineId === line.id)
                ).length > 0 && (
                  <tr className="bg-slate-900/10 border-b border-slate-800/60">
                    <td colSpan={8} className="p-3 pl-6">
                      <div className="text-[11px] font-bold text-slate-400 mb-1.5 flex items-center gap-1.5">
                        <StickyNote className="w-3.5 h-3.5 text-brand-400" />
                        <span>Line Notes</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                        {gridNotes
                          .filter(n =>
                            n.active !== false &&
                            n.noteType === 'LINE_NOTE' &&
                            (n.productionLineId?.toUpperCase() === line.lineCode.toUpperCase() ||
                             n.productionLineId === line.id)
                          )
                          .map(note => {
                            const expiryDate = note.endAt?.toDate ? note.endAt.toDate() : (note.endAt ? new Date(note.endAt as any) : null);
                            const formattedExpiry = expiryDate ? formatUTCDate(expiryDate) : 'No Expiry';
                            return (
                              <div key={note.id} className="p-2.5 bg-slate-900/90 border border-slate-850 rounded flex flex-col gap-1 relative group/item">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-slate-100">{note.title}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                      Expires: {formattedExpiry}
                                    </span>
                                    <button
                                      onClick={() => handleEditNoteFromGrid(note, line)}
                                      className="p-1 hover:text-brand-400 text-slate-500 rounded transition-colors"
                                      title="Edit note"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteEvent(note.id)}
                                      className="p-1 hover:text-red-400 text-slate-500 rounded transition-colors"
                                      title="Delete note"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                                <p className="text-xs text-slate-300 font-sans pr-6 leading-relaxed whitespace-pre-wrap">{note.note}</p>
                                <div className="flex justify-between items-center mt-1.5 border-t border-slate-800/40 pt-1.5">
                                  <span className="text-[9px] text-slate-500">
                                    By {note.createdBy || 'Planner'}
                                  </span>
                                  <span className="text-[9px] text-slate-500">
                                    Created {formatUTCDate(note.createdDate?.toDate ? note.createdDate.toDate() : new Date(note.createdDate as any))}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      {/* Manual Planning Event Manager Modal */}
      {isModalOpen && selectedLine && selectedDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-850 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/40">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <StickyNote className="w-4 h-4 text-brand-400" />
                  <span>Planning Events & Notes</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Line: <span className="text-slate-200 font-semibold">{selectedLine.lineName}</span> ({selectedLine.lineCode}) • Date: <span className="text-slate-200 font-semibold">{getFullDateDisplay(selectedDate)}</span>
                </p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-colors"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto space-y-6 flex-1">
              
              {/* Active Events List */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                  Scheduled Events on this Date ({activeDayNotes.length})
                </h4>
                {activeDayNotes.length === 0 ? (
                  <div className="p-4 text-center rounded-lg border border-slate-800/80 bg-slate-950/20 text-slate-500 text-xs italic">
                    No manual planning events scheduled for this day on this line.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeDayNotes.map(note => (
                      <div 
                        key={note.id} 
                        className="p-3 bg-slate-950 border border-slate-850 rounded-lg flex items-start justify-between gap-4 animate-in slide-in-from-top-1 duration-150"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span 
                              className="w-2.5 h-2.5 rounded-full" 
                              style={{ 
                                backgroundColor: 
                                  note.noteType === 'FORMAT_CHANGE' ? PRODUCTION_EVENT_COLOURS.FORMAT_CHANGE :
                                  note.noteType === 'GRADE_CHANGE' ? PRODUCTION_EVENT_COLOURS.GRADE_CHANGE :
                                  note.noteType === 'CLEANING' ? PRODUCTION_EVENT_COLOURS.CLEAN :
                                  note.noteType === 'MAINTENANCE' ? PRODUCTION_EVENT_COLOURS.MAINT_SHUT :
                                  PRODUCTION_EVENT_COLOURS.RSR_TRIAL
                              }} 
                            />
                            <span className="text-xs font-bold text-slate-200">{note.title}</span>
                            <span className="text-[9px] text-slate-500 font-mono">By {note.createdBy || 'Planner'}</span>
                          </div>
                          {note.note ? (
                            <p className="text-xs text-slate-300 font-mono pl-4 whitespace-pre-wrap">{note.note}</p>
                          ) : (
                            <p className="text-xs text-slate-500 italic pl-4">No text note attached.</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteEvent(note.id)}
                          className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors shrink-0"
                          title="Remove event"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add New Event Form */}
              <form onSubmit={handleAddEventSubmit} className="border-t border-slate-800 pt-5 space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Add New Event / Note
                </h4>

                {errorMsg && (
                  <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-lg text-xs text-red-300 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    Event Type
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {(['FORMAT_CHANGE', 'GRADE_CHANGE', 'CLEANING', 'MAINTENANCE', 'TRIAL'] as const).map(type => {
                      const label = titleMap[type];
                      const isSelected = newEventType === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setNewEventType(type)}
                          className={`p-2 rounded-lg text-[11px] font-bold border transition-all text-center flex flex-col items-center justify-center gap-1 ${
                            isSelected
                              ? 'bg-slate-800 text-slate-100 border-slate-600 ring-2 ring-brand-500/40'
                              : 'bg-slate-950 text-slate-400 border-slate-850 hover:bg-slate-850 hover:text-slate-300'
                          }`}
                        >
                          <span 
                            className="w-2.5 h-2.5 rounded-full shrink-0" 
                            style={{ 
                              backgroundColor: 
                                type === 'FORMAT_CHANGE' ? PRODUCTION_EVENT_COLOURS.FORMAT_CHANGE :
                                type === 'GRADE_CHANGE' ? PRODUCTION_EVENT_COLOURS.GRADE_CHANGE :
                                type === 'CLEANING' ? PRODUCTION_EVENT_COLOURS.CLEAN :
                                type === 'MAINTENANCE' ? PRODUCTION_EVENT_COLOURS.MAINT_SHUT :
                                PRODUCTION_EVENT_COLOURS.RSR_TRIAL
                            }} 
                          />
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="event-note-input" className="block text-xs font-semibold text-slate-300">
                    Text Note / Description
                  </label>
                  <textarea
                    id="event-note-input"
                    rows={3}
                    value={newEventNote}
                    onChange={(e) => setNewEventNote(e.target.value)}
                    placeholder="Enter details, description or reasons (optional)..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-brand-500 hover:bg-brand-400 disabled:bg-slate-800 text-slate-950 disabled:text-slate-600 font-bold text-xs rounded-lg flex items-center gap-1.5 shadow-lg shadow-brand-500/10 transition-all active:scale-[0.98]"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        <span>Add Event</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-950/40 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 font-semibold text-xs rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Production Line Notes Manager Modal */}
      {selectedLineForNotes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-850 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/40">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <StickyNote className="w-4 h-4 text-brand-400" />
                  <span>Production Line Notes</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Line: <span className="text-slate-200 font-semibold">{selectedLineForNotes.lineName}</span> ({selectedLineForNotes.lineCode})
                </p>
              </div>
              <button 
                onClick={() => setSelectedLineForNotes(null)}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-colors"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto space-y-6 flex-1">
              
              {/* Active General Notes List */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                  Active Line Notes
                </h4>
                {gridNotes.filter(n =>
                  n.noteType === 'LINE_NOTE' &&
                  (n.productionLineId?.toUpperCase() === selectedLineForNotes.lineCode?.toUpperCase() ||
                   n.productionLineId === selectedLineForNotes.id)
                ).length === 0 ? (
                  <div className="p-4 text-center rounded-lg border border-slate-800/80 bg-slate-950/20 text-slate-500 text-xs italic">
                    No active notes recorded for this production line.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {gridNotes
                      .filter(n =>
                        n.noteType === 'LINE_NOTE' &&
                        (n.productionLineId?.toUpperCase() === selectedLineForNotes.lineCode?.toUpperCase() ||
                         n.productionLineId === selectedLineForNotes.id)
                      )
                      .map(note => {
                        const expiryDate = note.endAt?.toDate ? note.endAt.toDate() : (note.endAt ? new Date(note.endAt as any) : null);
                        const formattedExpiry = expiryDate ? formatUTCDate(expiryDate) : 'No Expiry';
                        return (
                          <div 
                            key={note.id} 
                            className={`p-3 border rounded-lg flex items-start justify-between gap-4 animate-in slide-in-from-top-1 duration-150 transition-colors ${
                              note.id === editingNoteId
                                ? 'bg-brand-500/5 border-brand-500/30 ring-1 ring-brand-500/10'
                                : 'bg-slate-950 border-slate-850'
                            }`}
                          >
                            <div className="space-y-1 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-slate-200">{note.title}</span>
                                <span className="text-[9px] text-slate-500 font-mono">By {note.createdBy || 'Planner'}</span>
                                {note.id === editingNoteId && (
                                  <span className="text-[9px] bg-brand-500/10 text-brand-400 px-1.5 py-0.2 rounded font-semibold border border-brand-500/20">
                                    Currently Editing
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-300 font-mono whitespace-pre-wrap">{note.note}</p>
                              <div className="text-[9px] text-slate-500 pt-1">
                                Expires: <span className="text-slate-400">{formattedExpiry}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => handleEditLineNoteClick(note)}
                                className={`p-1.5 rounded-md transition-colors ${
                                  note.id === editingNoteId
                                    ? 'text-brand-400 bg-brand-500/20'
                                    : 'text-slate-500 hover:text-brand-400 hover:bg-slate-800'
                                }`}
                                title="Edit note"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteEvent(note.id)}
                                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                                title="Delete note"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Add/Edit Line Note Form */}
              <form onSubmit={handleAddLineNoteSubmit} className="border-t border-slate-800 pt-5 space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>{editingNoteId ? 'Edit Line Note' : 'Add New Line Note'}</span>
                  {editingNoteId && (
                    <button
                      type="button"
                      onClick={handleCancelLineEdit}
                      className="text-[10px] text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-750 px-2 py-0.5 rounded transition-colors normal-case"
                    >
                      Cancel Editing
                    </button>
                  )}
                </h4>

                {lineNoteErrorMsg && (
                  <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-lg text-xs text-red-300 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span>{lineNoteErrorMsg}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="line-note-title" className="block text-xs font-semibold text-slate-300">
                      Note Title
                    </label>
                    <input
                      id="line-note-title"
                      type="text"
                      value={newLineNoteTitle}
                      onChange={(e) => setNewLineNoteTitle(e.target.value)}
                      placeholder="e.g. Speed restrictions, Maintenance info..."
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="line-note-expiry" className="block text-xs font-semibold text-slate-300">
                      Expiry Date
                    </label>
                    <input
                      id="line-note-expiry"
                      type="date"
                      value={newLineNoteExpiry}
                      onChange={(e) => setNewLineNoteExpiry(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="line-note-textarea" className="block text-xs font-semibold text-slate-300">
                    Note Details / Description
                  </label>
                  <textarea
                    id="line-note-textarea"
                    rows={3}
                    value={newLineNoteText}
                    onChange={(e) => setNewLineNoteText(e.target.value)}
                    placeholder="Enter notes relating to this production line..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  {editingNoteId && (
                    <button
                      type="button"
                      onClick={handleCancelLineEdit}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 font-semibold text-xs rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isSubmittingLineNote}
                    className="px-4 py-2 bg-brand-500 hover:bg-brand-400 disabled:bg-slate-800 text-slate-950 disabled:text-slate-600 font-bold text-xs rounded-lg flex items-center gap-1.5 shadow-lg shadow-brand-500/10 transition-all active:scale-[0.98]"
                  >
                    {isSubmittingLineNote ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        {editingNoteId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        <span>{editingNoteId ? 'Save Changes' : 'Add Note'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-950/40 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLineForNotes(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 font-semibold text-xs rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

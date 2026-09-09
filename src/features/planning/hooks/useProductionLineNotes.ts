import React, { useState, useEffect, useCallback } from 'react';
import { ProductionLinePlanNote, ProductionLinePlanNoteType, ProductionLinePlanNoteSeverity } from '../../../types/production';
import { productionNotesRepository } from '../repositories/productionNotesRepository';
import { Timestamp } from '../../../services/supabaseBase';

export interface NoteFormState {
  productionLineId: string;
  noteDate: string;
  noteType: ProductionLinePlanNoteType;
  title: string;
  note: string;
  severity: ProductionLinePlanNoteSeverity;
}

export function useProductionLineNotes(
  tenantId: string, 
  siteId: string, 
  userFullName: string, 
  enabled = true
) {
  const [notesList, setNotesList] = useState<ProductionLinePlanNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState<boolean>(false);
  const [submittingNote, setSubmittingNote] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [noteForm, setNoteForm] = useState<NoteFormState>({
    productionLineId: '',
    noteDate: new Date().toISOString().split('T')[0],
    noteType: 'GENERAL',
    title: '',
    note: '',
    severity: 'INFORMATION'
  });

  const fetchNotes = useCallback(async () => {
    if (!enabled || !tenantId || !siteId) return;
    setLoadingNotes(true);
    setError(null);
    try {
      const fetched = await productionNotesRepository.fetchNotesList(tenantId, siteId);
      setNotesList(fetched);
      setLoadingNotes(false);
    } catch (err: any) {
      console.error('Failed to load notes list:', err);
      setError(err.message || 'Failed to load notes');
      setLoadingNotes(false);
    }
  }, [tenantId, siteId, enabled]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteForm.productionLineId || !noteForm.title || !noteForm.note) {
      alert('Please fill out all required fields.');
      return;
    }
    setSubmittingNote(true);
    try {
      const targetDate = new Date(noteForm.noteDate);
      targetDate.setHours(0, 0, 0, 0);

      const newNote: Omit<ProductionLinePlanNote, 'id'> = {
        tenantId,
        siteId,
        productionLineId: noteForm.productionLineId,
        noteDate: Timestamp.fromDate(targetDate),
        noteType: noteForm.noteType,
        title: noteForm.title,
        note: noteForm.note,
        startAt: null,
        endAt: null,
        severity: noteForm.severity,
        source: 'PLANNER',
        active: true,
        createdBy: userFullName || 'Planner',
        createdDate: Timestamp.fromDate(new Date()),
        modifiedBy: userFullName || 'Planner',
        modifiedDate: Timestamp.fromDate(new Date())
      };

      await productionNotesRepository.addNote(newNote);
      setNoteForm({
        productionLineId: '',
        noteDate: new Date().toISOString().split('T')[0],
        noteType: 'GENERAL',
        title: '',
        note: '',
        severity: 'INFORMATION'
      });
      await fetchNotes();
      setSubmittingNote(false);
      alert('Planner note registered successfully.');
    } catch (err: any) {
      alert('Failed to register note: ' + err.message);
      setSubmittingNote(false);
    }
  };

  const handleDeactivateNote = async (noteId: string) => {
    if (!window.confirm('Are you sure you want to archive this note?')) return;
    try {
      await productionNotesRepository.deactivateNote(noteId, userFullName);
      setNotesList(prev => prev.map(n => n.id === noteId ? { ...n, active: false } : n));
    } catch (err: any) {
      alert('Failed to archive note: ' + err.message);
    }
  };

  return {
    notesList,
    noteForm,
    loadingNotes,
    submittingNote,
    error,
    setNoteForm,
    handleNoteSubmit,
    handleDeactivateNote,
    refreshNotes: fetchNotes
  };
}
